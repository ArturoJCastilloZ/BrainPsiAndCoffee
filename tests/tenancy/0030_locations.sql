-- ===========================================================================
-- GUARD: esto es una PRUEBA. No se corre contra una base real.
-- ===========================================================================
do $guard$
begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception using
      message = 'ABORTADO: archivo de PRUEBA ejecutado fuera del banco desechable.',
      detail  = 'No existe la marca public.__banco_desechable, que solo crea tests/tenancy/run.sh en el contenedor que levanta.',
      hint    = 'Corre ./tests/tenancy/run.sh. Si estas viendo esto en el editor de Supabase: PARA, estas en una base real.';
  end if;
end
$guard$;

-- 0040 · Sucursales.
--
-- Clinica propia (t_loc) para no chocar con los topes de la reserva
-- publica que ya gastaron 0027 y 0028 en t_a.

insert into public.tenants (id,name) values ('t_loc','Clinica Sucursales'),('t_loc2','Otra');
insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
  ('t_loc','sv','Terapia',50,900);
insert into public.locations (tenant_id,id,name,has_cafe,active,sort_order) values
  ('t_loc','lin','Lincoln',true,true,0),
  ('t_loc','sn','San Nicolas',false,true,1),
  ('t_loc','vieja','Cerrada',false,false,2),
  ('t_loc2','x','Ajena',false,true,0);

-- El especialista nace con el horario por defecto en la PRIMERA sucursal
-- activa (seed_default_schedule).
insert into public.therapists (tenant_id,id,name,active) values ('t_loc','tt','Dra Sucursal',true);

do $$
declare v_mal integer;
begin
  select count(*) into v_mal from public.therapist_schedules
  where tenant_id='t_loc' and therapist_id='tt' and location_id is distinct from 'lin';
  if v_mal <> 0 then
    raise exception 'FALLA: el horario por defecto no quedo en la primera sucursal (% bloques)', v_mal;
  end if;
  raise notice 'ok · el horario por defecto va a la primera sucursal activa';
end $$;

-- Mañana en Lincoln, tarde en San Nicolas, el mismo dia.
create or replace function pg_temp.dia_suc() returns date language plpgsql as $$
declare v date := current_date + 11;
begin
  while extract(dow from v) in (0,1) loop v := v + 1; end loop;
  return v;
end $$;

delete from public.therapist_schedules where tenant_id='t_loc' and therapist_id='tt';
insert into public.therapist_schedules (tenant_id,therapist_id,weekday,start_time,end_time,location_id)
values
  ('t_loc','tt', extract(dow from pg_temp.dia_suc())::smallint, '07:00','12:00','lin'),
  ('t_loc','tt', extract(dow from pg_temp.dia_suc())::smallint, '15:00','20:00','sn');

create or replace function pg_temp.reserva_suc(p_id text, p_hora text, p_sucursal text, p_correo text) returns void
language plpgsql as $$
begin
  set local role anon;
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_loc', true);
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,location_id)
  values ('t_loc', p_id,'sv','tt', pg_temp.dia_suc(), p_hora::time,'Visitante Sucursal',
    p_correo, '81' || lpad((abs(hashtext(p_correo)) % 100000000)::text, 8, '0'), 50,'requested', p_sucursal);
  reset role;
end $$;

-- 1 · El visitante ve las sucursales ACTIVAS de la clinica que visita.
do $$
declare v_n integer; v_inactiva integer; v_ajena integer;
begin
  set local role anon;
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_loc', true);
  select count(*) into v_n from public.locations;
  select count(*) into v_inactiva from public.locations where id='vieja';
  select count(*) into v_ajena from public.locations where tenant_id='t_loc2';
  reset role;
  if v_n <> 2 or v_inactiva <> 0 or v_ajena <> 0 then
    raise exception 'FUGA: el visitante vio % sucursales (inactivas %, ajenas %)', v_n, v_inactiva, v_ajena;
  end if;
  raise notice 'ok · el publico ve solo las sucursales activas de su clinica';
end $$;

-- 2 · El visitante no da de alta sucursales.
do $$
begin
  set local role anon;
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_loc', true);
  begin
    insert into public.locations (tenant_id,id,name) values ('t_loc','pirata','Pirata');
    raise exception 'FUGA: el visitante creo una sucursal';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'ok · el publico no crea sucursales';
end $$;

-- 3 · La cita debe caer en el horario DE ESA sucursal.
do $$
begin
  -- 09:00 es horario de Lincoln: en Lincoln pasa.
  perform pg_temp.reserva_suc('suc-ok-lin','09:00','lin','uno@ex.mx');
  -- 16:00 es horario de San Nicolas: en San Nicolas pasa.
  perform pg_temp.reserva_suc('suc-ok-sn','16:00','sn','dos@ex.mx');

  -- 10:00 en San Nicolas: ese dia a esa hora esta en Lincoln.
  begin
    perform pg_temp.reserva_suc('suc-mal','10:30','sn','tres@ex.mx');
    raise exception 'FUGA: se agendo en San Nicolas a una hora en que esta en Lincoln';
  exception when insufficient_privilege then reset role;
  end;

  -- Sin sucursal, con sucursales activas: se rechaza.
  begin
    perform pg_temp.reserva_suc('suc-sin','17:30','','cuatro@ex.mx');
    raise exception 'FUGA: se agendo sin decir la sucursal';
  exception when insufficient_privilege or foreign_key_violation then reset role;
  end;

  -- Sucursal inactiva: se rechaza.
  begin
    perform pg_temp.reserva_suc('suc-cerrada','11:00','vieja','cinco@ex.mx');
    raise exception 'FUGA: se agendo en una sucursal inactiva';
  exception when insufficient_privilege then reset role;
  end;
  raise notice 'ok · la reserva publica respeta el horario de cada sucursal';
end $$;

-- 3b · location_id '' no es "sin sucursal" para la base: la prueba de
--      arriba mando ''. Con NULL explicito tambien se rechaza.
do $$
begin
  set local role anon;
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_loc', true);
  begin
    insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
      appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,location_id)
    values ('t_loc','suc-null','sv','tt', pg_temp.dia_suc(),'18:00','Visitante Nulo','seis@ex.mx','8166666666',50,'requested', null);
    raise exception 'FUGA: se agendo con sucursal NULL teniendo sucursales activas';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'ok · sin sucursal no se agenda si la clinica tiene sucursales';
end $$;

-- 4 · No puede estar en dos lugares a la vez: el EXCLUDE es por
--     especialista, sin importar la sucursal.
do $$
begin
  begin
    insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
      appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,location_id)
    values ('t_loc','suc-doble','sv','tt', pg_temp.dia_suc(),'09:00','Staff Doble','siete@ex.mx','8177777777',50,'confirmed','sn');
    raise exception 'FUGA: el especialista quedo en dos sucursales a la misma hora';
  exception when exclusion_violation or unique_violation then null;
  end;
  raise notice 'ok · un especialista no se agenda en dos sucursales a la vez';
end $$;

-- 5 · Sin el horario fijo de 9 a 19: a las 7:30 hay horario en Lincoln.
do $$
begin
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,location_id)
  values ('t_loc','suc-temprano','sv','tt', pg_temp.dia_suc() + 7,'07:30','Staff Temprano','ocho@ex.mx','8188888888',50,'confirmed','lin');
  raise notice 'ok · una cita a las 7:30 ya no la rechaza el horario fijo de 9 a 19';
end $$;

-- 6 · Una sucursal con horarios no se borra (se desactiva).
do $$
begin
  begin
    delete from public.locations where tenant_id='t_loc' and id='lin';
    raise exception 'FALLA: se borro una sucursal con horarios y citas';
  exception when foreign_key_violation then null;
  end;
  raise notice 'ok · una sucursal en uso no se borra';
end $$;

-- 7 · El dueño da de alta una sucursal desde el panel SIN mandar
--     tenant_id (lo pone la base, 0041). Con 0040 sola fallaba con "new
--     row violates row-level security policy". Y un barista no puede.
insert into auth.users (id,email) values
  ('c9100000-0000-0000-0000-0000000000f1','owner.loc@ex.mx'),
  ('c9100000-0000-0000-0000-0000000000b1','barista.loc@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_loc','c9100000-0000-0000-0000-0000000000f1','owner'),
  ('t_loc','c9100000-0000-0000-0000-0000000000b1','barista');

create or replace function pg_temp.sesion_loc(p_sub text, p_rol text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_sub, 'aal', 'aal1',
    'app_metadata', json_build_object('memberships', json_build_object('t_loc', p_rol))
  )::text, true);
  perform set_config('request.tenant','t_loc', true);
end $$;

do $$
declare v_tenant text;
begin
  perform pg_temp.sesion_loc('c9100000-0000-0000-0000-0000000000f1', 'owner');
  set local role authenticated;
  -- Como lo manda el panel: upsert, sin tenant_id.
  insert into public.locations (id,name,address,maps_url,has_cafe,active,sort_order)
  values ('san-nicolas','Sucursal San Nicolas','Centro','',false,true,3)
  on conflict (tenant_id, id) do update set name = excluded.name;
  reset role;
  select tenant_id into v_tenant from public.locations where id = 'san-nicolas';
  if v_tenant is distinct from 't_loc' then
    raise exception 'FALLA: la sucursal nueva quedo en la clinica "%"', v_tenant;
  end if;

  perform pg_temp.sesion_loc('c9100000-0000-0000-0000-0000000000b1', 'barista');
  set local role authenticated;
  begin
    insert into public.locations (id,name) values ('del-barista','Del barista');
    raise exception 'FUGA: un barista dio de alta una sucursal';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'ok · el dueño da de alta sucursales sin mandar la clinica; el barista no';
end $$;
