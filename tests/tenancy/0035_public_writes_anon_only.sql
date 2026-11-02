do $$ begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception 'ABORTADO: la prueba requiere el banco desechable.';
  end if;
end $$;

-- A1 (0048): las altas publicas (cita, consentimiento, pedido y su linea)
-- son solo del visitante anonimo. Un authenticated, sea de otra clinica o
-- sin membresia, no escribe en la clinica que nombra el header.
--
-- Los ataques usan INSERT PLANO a proposito: un upsert exige ademas que la
-- fila pase la policy SELECT, que el atacante no tiene en B, y saldria
-- "rechazado" ya en main (verde falso).

-- Sin los grants de Supabase la prueba no prueba nada.
do $$ declare t text; begin
  foreach t in array array['appointments','consents','orders'] loop
    if not has_table_privilege('authenticated','public.'||t,'INSERT') then
      raise exception 'PRUEBA VACIA: sin grants de Supabase (authenticated no tiene INSERT en %)', t;
    end if;
  end loop;
end $$;

insert into public.tenants(id,name) values ('t_pw_a','PW A'),('t_pw_b','PW B');
insert into auth.users(id,email) values
  ('35000000-0000-0000-0000-000000000001','admin.pwa@ex.mx'),
  ('35000000-0000-0000-0000-000000000002','doc.pwa@ex.mx'),
  ('35000000-0000-0000-0000-000000000009','sinmembresia.pw@ex.mx');
insert into public.therapy_services(tenant_id,id,name,duration_minutes,price) values
  ('t_pw_a','sv','Consulta',50,700),('t_pw_b','sv','Consulta',50,700);
insert into public.therapists(tenant_id,id,name,minimum_notice_minutes) values
  ('t_pw_a','tt','Especialista A',0),('t_pw_b','tt','Especialista B',0);
delete from public.therapist_schedules where tenant_id in ('t_pw_a','t_pw_b');
insert into public.therapist_schedules(tenant_id,therapist_id,weekday,start_time,end_time,active)
select t,'tt',d,'09:00','19:00',true from unnest(array['t_pw_a','t_pw_b']) t, generate_series(0,6) d;
insert into public.tenant_members(tenant_id,user_id,role,therapist_id) values
  ('t_pw_a','35000000-0000-0000-0000-000000000001','admin_consultorio',null),
  ('t_pw_a','35000000-0000-0000-0000-000000000002','doctor','tt');
insert into public.products(tenant_id,id,category,name,price,sort_order,active) values
  ('t_pw_a','cafe','bebidas','Cafe',40,1,true),('t_pw_b','cafe','bebidas','Cafe',40,1,true);
insert into public.appointments(tenant_id,id,service_id,therapist_id,appointment_date,appointment_time,
  customer_name,customer_email,customer_phone,duration_minutes,status) values
  ('t_pw_b','pw-b-conf','sv','tt',current_date+30,'10:00','Paciente B','pb@ex.mx','5522222222',50,'confirmed');
-- Pedido reciente de B, sembrado por postgres: blanco del INSERT suelto de lineas.
insert into public.orders(tenant_id,id,customer_name,customer_phone,status,order_source,subtotal,combo_savings,total)
values ('t_pw_b','pw-o-seed','Cliente','8111111111','received','public_menu',0,0,0);

-- Actua como un rol de PostgREST: role, claims y header x-tenant-id.
create or replace function pg_temp.como(p_role text, p_sub text, p_members jsonb, p_header text)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', case when p_sub is null then '' else
    jsonb_build_object('sub',p_sub,'role',p_role,'app_metadata',jsonb_build_object('memberships',p_members))::text end, true);
  perform set_config('request.headers', case when p_header is null then '' else
    jsonb_build_object('x-tenant-id',p_header)::text end, true);
  perform set_config('role', p_role, true);
end $$;
-- Ejecuta una sentencia y devuelve 'ok' o el SQLSTATE con que fallo.
create or replace function pg_temp.intenta(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;

create or replace function pg_temp.sql_cita(p_tenant text, p_id text, p_days int, p_time text, p_mail text, p_status text)
returns text language sql as $$
  select format($q$insert into public.appointments(tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status)
    values (%L,%L,'sv','tt',current_date+%s,%L,'Persona Prueba',%L,'8111111111',50,%L)$q$,
    p_tenant, p_id, p_days, p_time, p_mail, p_status);
$$;
create or replace function pg_temp.sql_consent(p_tenant text, p_appointment text) returns text language sql as $$
  select format($q$insert into public.consents(tenant_id,appointment_id,subject_email,consent_type,
    document_version,document_hash,evidence)
    values (%L,%L,'x@ex.mx','privacy_notice','2026-10-borrador-2','h','{}')$q$, p_tenant, p_appointment);
$$;
create or replace function pg_temp.sql_pedido(p_tenant text, p_id text) returns text language sql as $$
  select format($q$insert into public.orders(tenant_id,id,customer_name,customer_phone,status,order_source,
    subtotal,combo_savings,total) values (%L,%L,'Cliente Cafe','8111111111','received','public_menu',0,0,0)$q$,
    p_tenant, p_id);
$$;
create or replace function pg_temp.sql_linea(p_tenant text, p_order text) returns text language sql as $$
  select format($q$insert into public.order_items(tenant_id,order_id,product_id,name,quantity,unit_price)
    values (%L,%L,'cafe','Cafe',1,40)$q$, p_tenant, p_order);
$$;
create or replace function pg_temp.sql_arco(p_tenant text, p_mail text) returns text language sql as $$
  select format($q$insert into public.arco_requests(tenant_id,id,request_type,requester_name,requester_email,
    relationship,details) values (%L,gen_random_uuid(),'acceso','Persona',%L,'titular','Quiero acceso a mis datos')$q$,
    p_tenant, p_mail);
$$;
create or replace function pg_temp.sql_rpc(p_id text, p_days int, p_time text, p_mail text) returns text language sql as $$
  select format($q$select public.create_public_booking(jsonb_build_array(jsonb_build_object(
    'id',%L,'service_id','sv','therapist_id','tt','appointment_date',current_date+%s,'appointment_time',%L,
    'customer_name','Persona Real','customer_email',%L,'customer_phone','8188000000','duration_minutes',50)),true,
    '2026-10-borrador-2','3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188',null)$q$,
    p_id, p_days, p_time, p_mail);
$$;

-- A1.1 / A1.2: admin de A y authenticated sin membresia, ambos con header B.
do $$
declare
  actor record; r text;
begin
  for actor in select * from (values
      ('admin de A','35000000-0000-0000-0000-000000000001','{"t_pw_a":"admin_consultorio"}'::jsonb,'a11'),
      ('sin membresia','35000000-0000-0000-0000-000000000009','{}'::jsonb,'a12')) v(nombre,sub,members,tag)
  loop
    perform pg_temp.como('authenticated', actor.sub, actor.members, 't_pw_b');
    r := pg_temp.intenta(pg_temp.sql_cita('t_pw_b','atk-'||actor.tag,10,'09:00','intruso@ex.mx','requested'));
    if r <> '42501' then raise exception 'FUGA A1 (%): cita en B por INSERT plano dio %', actor.nombre, r; end if;
    r := pg_temp.intenta(pg_temp.sql_consent('t_pw_b','pw-b-conf'));
    if r <> '42501' then raise exception 'FUGA A1 (%): consentimiento en B dio %', actor.nombre, r; end if;
    r := pg_temp.intenta(pg_temp.sql_pedido('t_pw_b','o-atk-'||actor.tag));
    if r <> '42501' then raise exception 'FUGA ORD (%): pedido en B dio %', actor.nombre, r; end if;
    r := pg_temp.intenta(pg_temp.sql_linea('t_pw_b','pw-o-seed'));
    if r <> '42501' then raise exception 'FUGA ORD (%): linea sobre pedido reciente de B dio %', actor.nombre, r; end if;
    reset role;
  end loop;
  if (select count(*) from public.appointments where tenant_id='t_pw_b' and id like 'atk-%') <> 0
     or (select count(*) from public.consents where tenant_id='t_pw_b') <> 0
     or (select count(*) from public.orders where tenant_id='t_pw_b' and id like 'o-atk-%') <> 0
     or (select count(*) from public.order_items where tenant_id='t_pw_b') <> 0 then
    raise exception 'FUGA A1: quedaron filas del atacante en B';
  end if;
  raise notice 'ok · authenticated ajeno o sin membresia no crea citas, consentimientos, pedidos ni lineas en otra clinica';
end $$;

-- A1.3: sin topes no hay spam; aqui ni siquiera hay alta.
do $$ declare i int; r text; begin
  perform pg_temp.como('authenticated','35000000-0000-0000-0000-000000000009','{}'::jsonb,'t_pw_b');
  for i in 1..3 loop
    r := pg_temp.intenta(pg_temp.sql_cita('t_pw_b','spam-'||i,11,(9+i)||':00','spam@ex.mx','requested'));
    if r <> '42501' then raise exception 'FUGA A1.3: cita % del mismo correo dio %', i, r; end if;
  end loop;
  reset role;
  if (select count(*) from public.appointments where tenant_id='t_pw_b' and customer_email='spam@ex.mx') <> 0 then
    raise exception 'FUGA A1.3: quedaron citas de spam en B';
  end if;
  raise notice 'ok · authenticated sin membresia no repite solicitudes con el mismo correo';
end $$;

-- ARCO sigue abierto a authenticated, pero quien no es miembro de la
-- clinica destino tiene los mismos topes que anon.
do $$ declare i int; r text; begin
  perform pg_temp.como('authenticated','35000000-0000-0000-0000-000000000009','{}'::jsonb,'t_pw_b');
  for i in 1..3 loop
    r := pg_temp.intenta(pg_temp.sql_arco('t_pw_b','arco.pw@ex.mx'));
    if r <> 'ok' then raise exception 'FALLO ARCO: la solicitud % de un titular con sesion dio %', i, r; end if;
  end loop;
  r := pg_temp.intenta(pg_temp.sql_arco('t_pw_b','arco.pw@ex.mx'));
  if r <> 'P0429' then raise exception 'FUGA ARCO: la 4a solicitud del mismo correo sin membresia dio %', r; end if;
  reset role;
  raise notice 'ok · ARCO con sesion ajena acepta 3 y topa la 4a';
end $$;

-- Controles: lo que el front publicado hace hoy sigue funcionando.
do $$ declare r text; begin
  perform pg_temp.como('anon', null, null, 't_pw_b');
  r := pg_temp.intenta(pg_temp.sql_rpc('pw-rpc-1',12,'10:00','real.pw@ex.mx'));
  if r <> 'ok' then raise exception 'FALLO control 1: RPC anon dio %', r; end if;
  r := pg_temp.intenta(pg_temp.sql_rpc('pw-rpc-2',12,'12:00','real.pw@ex.mx'));
  if r <> 'ok' then raise exception 'FALLO control 2: 2a solicitud anon dio %', r; end if;
  r := pg_temp.intenta(pg_temp.sql_rpc('pw-rpc-3',12,'14:00','real.pw@ex.mx'));
  if r <> 'P0429' then raise exception 'FALLO control 2: la 3a solicitud del mismo correo dio %', r; end if;
  r := pg_temp.intenta(pg_temp.sql_pedido('t_pw_b','pw-o-anon'));
  if r = 'ok' then r := pg_temp.intenta(pg_temp.sql_linea('t_pw_b','pw-o-anon')); end if;
  if r <> 'ok' then raise exception 'FALLO control 3: pedido anon dio %', r; end if;
  r := pg_temp.intenta(pg_temp.sql_arco('t_pw_b','anon.pw@ex.mx'));
  if r <> 'ok' then raise exception 'FALLO control 4: ARCO anon dio %', r; end if;
  reset role;
  if (select count(*) from public.appointments where tenant_id='t_pw_b' and id='pw-rpc-1') <> 1
     or (select count(*) from public.consents where tenant_id='t_pw_b' and appointment_id='pw-rpc-1') <> 1 then
    raise exception 'FALLO control 1: la RPC no dejo cita y consentimiento';
  end if;
  if (select count(*) from public.order_items where tenant_id='t_pw_b' and order_id='pw-o-anon') <> 1 then
    raise exception 'FALLO control 3: el pedido anon quedo sin linea';
  end if;
  raise notice 'ok · anon reserva por RPC (con tope), pide cafe y presenta ARCO';
end $$;

do $$ declare r text; begin
  perform pg_temp.como('authenticated','35000000-0000-0000-0000-000000000001','{"t_pw_a":"admin_consultorio"}'::jsonb,'t_pw_a');
  r := pg_temp.intenta(pg_temp.sql_cita('t_pw_a','pw-adm-1',13,'10:00','x@ex.mx','confirmed')
       || ' on conflict (tenant_id,id) do update set customer_name = excluded.customer_name');
  if r <> 'ok' then raise exception 'FALLO control 5: upsert del admin en su clinica dio %', r; end if;
  perform pg_temp.como('authenticated','35000000-0000-0000-0000-000000000002','{"t_pw_a":"doctor"}'::jsonb,'t_pw_a');
  r := pg_temp.intenta(pg_temp.sql_cita('t_pw_a','pw-doc-1',13,'12:00','y@ex.mx','confirmed'));
  if r <> 'ok' then raise exception 'FALLO control 6: cita propia del doctor dio %', r; end if;
  reset role;
  if (select count(*) from public.appointments where tenant_id='t_pw_a' and id in ('pw-adm-1','pw-doc-1')) <> 2 then
    raise exception 'FALLO controles 5-6: faltan las citas del staff';
  end if;
  raise notice 'ok · el staff sigue creando citas en su propia clinica';
end $$;
