do $$ begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception 'ABORTADO: la prueba requiere el banco desechable.';
  end if;
end $$;

-- M1 (0049): los definers que reciben la clinica como argumento solo
-- responden por la clinica de la peticion, y los que no son predicado de
-- una policy publica ya no se exponen a anon ni a authenticated.

do $$ declare t text; begin
  foreach t in array array['appointments','consents','orders'] loop
    if not has_table_privilege('authenticated','public.'||t,'INSERT') then
      raise exception 'PRUEBA VACIA: sin grants de Supabase (authenticated no tiene INSERT en %)', t;
    end if;
  end loop;
end $$;

insert into public.tenants(id,name) values ('t_def_a','DEF A'),('t_def_b','DEF B');
insert into auth.users(id,email) values
  ('36000000-0000-0000-0000-000000000001','admin.defb@ex.mx'),
  ('36000000-0000-0000-0000-000000000009','sinmembresia.def@ex.mx');
insert into public.tenant_members(tenant_id,user_id,role) values
  ('t_def_b','36000000-0000-0000-0000-000000000001','admin_consultorio');
insert into public.therapy_services(tenant_id,id,name,duration_minutes,price) values
  ('t_def_a','sv','Consulta',50,700),('t_def_b','sv','Consulta',50,700);
insert into public.therapists(tenant_id,id,name,minimum_notice_minutes) values
  ('t_def_a','tt','Especialista A',0),('t_def_b','tt','Especialista B',0);
delete from public.therapist_schedules where tenant_id in ('t_def_a','t_def_b');
insert into public.therapist_schedules(tenant_id,therapist_id,weekday,start_time,end_time,active)
select t,'tt',d,'09:00','19:00',true from unnest(array['t_def_a','t_def_b']) t, generate_series(0,6) d;
insert into public.appointments(tenant_id,id,service_id,therapist_id,appointment_date,appointment_time,
  customer_name,customer_email,customer_phone,duration_minutes,status) values
  ('t_def_b','def-old','sv','tt',current_date+20,'10:00','Vieja','vieja@ex.mx','5500000001',50,'requested'),
  ('t_def_b','def-vic-1','sv','tt',current_date+21,'10:00','Victima','victima@ex.mx','5500000002',50,'requested'),
  ('t_def_b','def-vic-2','sv','tt',current_date+22,'10:00','Victima','victima@ex.mx','5500000002',50,'requested'),
  ('t_def_b','def-conf','sv','tt',current_date+23,'10:00','Paciente','p@ex.mx','5500000003',50,'confirmed');
update public.appointments set created_at = now() - interval '26 hours' where tenant_id='t_def_b' and id='def-old';
insert into public.orders(tenant_id,id,customer_name,customer_phone,status,order_source,subtotal,combo_savings,total)
values ('t_def_b','def-o-seed','Cliente','8111111111','received','public_menu',0,0,0);

create or replace function pg_temp.como(p_role text, p_sub text, p_members jsonb, p_header text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_sub is null then '' else
    jsonb_build_object('sub',p_sub,'role',p_role,'app_metadata',jsonb_build_object('memberships',p_members))::text end, true);
  perform set_config('request.headers', case when p_header is null then '' else
    jsonb_build_object('x-tenant-id',p_header)::text end, true);
  perform set_config('role', p_role, true);
end $$;
-- Devuelve el valor de la consulta, o 'ERR <sqlstate>'.
create or replace function pg_temp.q(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, '(null)');
exception when others then
  return 'ERR ' || sqlstate;
end $$;
create or replace function pg_temp.estado_old() returns text language sql as $$
  select status from public.appointments where tenant_id='t_def_b' and id='def-old';
$$;

-- M1a: vencer solicitudes de otra clinica.
do $$ declare r text; begin
  perform pg_temp.como('anon', null, null, null);
  r := pg_temp.q($q$select public.expire_stale_booking_requests('t_def_b')::text$q$);
  if r <> 'ERR 42501' then raise exception 'FUGA M1a: anon sin header llama expire_stale_booking_requests (%)', r; end if;
  reset role;
  if pg_temp.estado_old() <> 'requested' then raise exception 'FUGA M1a: anon vencio una solicitud de B'; end if;

  perform pg_temp.como('authenticated','36000000-0000-0000-0000-000000000009','{}'::jsonb,'t_def_b');
  r := pg_temp.q($q$select 'ok' from public.expire_stale_booking_requests('t_def_b')$q$);
  if r <> 'ok' then raise exception 'FALLO M1a: authenticated ajeno debe recibir no-op, no %', r; end if;
  reset role;
  if pg_temp.estado_old() <> 'requested' then raise exception 'FUGA M1a: authenticated sin membresia vencio una solicitud de B'; end if;
  raise notice 'ok · nadie fuera de la clinica vence sus solicitudes';
end $$;

-- M1a (control): el admin de B y la RPC publica de B si la vencen.
do $$ declare r text; begin
  perform pg_temp.como('authenticated','36000000-0000-0000-0000-000000000001','{"t_def_b":"admin_consultorio"}'::jsonb,'t_def_b');
  r := pg_temp.q($q$select 'ok' from public.expire_stale_booking_requests('t_def_b')$q$);
  if r <> 'ok' then raise exception 'FALLO control M1a: el admin de B no pudo vencer (%)', r; end if;
  reset role;
  if pg_temp.estado_old() <> 'cancelled' then raise exception 'FALLO control M1a: el admin de B no vencio la solicitud vieja'; end if;

  update public.appointments set status='requested', created_at = now() - interval '26 hours'
   where tenant_id='t_def_b' and id='def-old';
  perform pg_temp.como('anon', null, null, 't_def_b');
  r := pg_temp.q($q$select coalesce(public.create_public_booking(jsonb_build_array(jsonb_build_object(
    'id','def-rpc','service_id','sv','therapist_id','tt','appointment_date',current_date+24,'appointment_time','11:00',
    'customer_name','Persona Real','customer_email','real.def@ex.mx','customer_phone','8188000000','duration_minutes',50)),true,
    '2026-10-borrador-2','3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188',null)::text,'ok')$q$);
  if r like 'ERR%' then raise exception 'FALLO control M1a: la RPC anon dio %', r; end if;
  reset role;
  if pg_temp.estado_old() <> 'cancelled' then raise exception 'FALLO control M1a: la RPC de B no vencio la solicitud vieja'; end if;
  raise notice 'ok · el admin de la clinica y su RPC publica vencen sus solicitudes';
end $$;

-- M1b: los topes no son un oraculo de correos de otra clinica.
do $$ declare r text; actor text; begin
  foreach actor in array array['anon','authenticated'] loop
    if actor = 'anon' then
      perform pg_temp.como('anon', null, null, 't_def_b');
    else
      perform pg_temp.como('authenticated','36000000-0000-0000-0000-000000000009','{}'::jsonb,'t_def_b');
    end if;
    r := pg_temp.q($q$select coalesce(public.check_booking_request_limits('t_def_b','victima@ex.mx','')::text,'ok')$q$);
    if r <> 'ERR 42501' then raise exception 'FUGA M1b: % consulta los topes de B (%)', actor, r; end if;
    reset role;
  end loop;
  raise notice 'ok · anon y authenticated no consultan los topes de reserva';
end $$;

-- M1c: los predicados de las policies publicas solo responden por la
-- clinica del header.
do $$
declare
  r text; f text; hdr text;
  preds text[] := array[
    $q$select public.fits_in_schedule('t_def_b','tt',current_date+5,'13:00',50,null)::text$q$,
    $q$select public.within_booking_window('t_def_b','tt',current_date+5,'13:00')::text$q$,
    $q$select public.appointment_can_receive_order('t_def_b','def-conf')::text$q$,
    $q$select public.order_can_receive_public_items('t_def_b','def-o-seed')::text$q$];
begin
  foreach hdr in array array['t_def_a', null] loop
    perform pg_temp.como('anon', null, null, hdr);
    foreach f in array preds loop
      r := pg_temp.q(f);
      if r <> 'false' then raise exception 'FUGA M1c: anon con header % obtuvo % de: %', coalesce(hdr,'(ninguno)'), r, f; end if;
    end loop;
    reset role;
  end loop;

  perform pg_temp.como('anon', null, null, 't_def_b');
  foreach f in array preds loop
    r := pg_temp.q(f);
    if r <> 'true' then raise exception 'FALLO control M1c: anon con header B obtuvo % de: %', r, f; end if;
  end loop;
  reset role;

  perform pg_temp.como('authenticated','36000000-0000-0000-0000-000000000009','{}'::jsonb,'t_def_b');
  foreach f in array preds loop
    r := pg_temp.q(f);
    if r <> 'ERR 42501' then raise exception 'FUGA M1c: authenticated obtuvo % de: %', r, f; end if;
  end loop;
  reset role;

  foreach hdr in array array['anon','authenticated'] loop
    perform pg_temp.como(hdr, null, null, 't_def_b');
    r := pg_temp.q($q$select public.fits_in_schedule('t_def_b','tt',current_date+5,'13:00',50)::text$q$);
    if r <> 'ERR 42501' then raise exception 'FUGA M1c: % llama fits_in_schedule de 5 argumentos (%)', hdr, r; end if;
    reset role;
  end loop;
  raise notice 'ok · los predicados publicos solo responden por la clinica del header';
end $$;

-- ACL: la superficie expuesta queda escrita.
do $$
declare
  expira text := 'public.expire_stale_booking_requests(text)';
  topes  text := 'public.check_booking_request_limits(text,text,text)';
  f text;
begin
  if has_function_privilege('anon', expira, 'EXECUTE') then raise exception 'FUGA ACL: anon ejecuta %', expira; end if;
  if has_function_privilege('anon', topes, 'EXECUTE') then raise exception 'FUGA ACL: anon ejecuta %', topes; end if;
  if has_function_privilege('authenticated', topes, 'EXECUTE') then raise exception 'FUGA ACL: authenticated ejecuta %', topes; end if;
  foreach f in array array[
    'public.fits_in_schedule(text,text,date,time,integer,text)',
    'public.within_booking_window(text,text,date,time)',
    'public.appointment_can_receive_order(text,text)',
    'public.order_can_receive_public_items(text,text)'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') then raise exception 'FUGA ACL: authenticated ejecuta %', f; end if;
  end loop;
  if not has_function_privilege('bpc_booking_writer', expira, 'EXECUTE')
     or not has_function_privilege('bpc_booking_writer', topes, 'EXECUTE') then
    raise exception 'FALLO ACL: la RPC publica perdio sus funciones de vencimiento o topes';
  end if;
  raise notice 'ok · ACL de los definers con clinica por argumento';
end $$;
