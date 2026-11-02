do $$ begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception 'ABORTADO: la prueba requiere el banco desechable.';
  end if;
end $$;

-- M2 (0050): una clinica suspendida o cancelada no opera. Su staff, aun
-- con membresia activa, no lee ni escribe sus datos; solo puede leer la
-- fila de su clinica para saber que esta suspendida.

do $$ declare t text; begin
  foreach t in array array['appointments','consents','orders'] loop
    if not has_table_privilege('authenticated','public.'||t,'INSERT') then
      raise exception 'PRUEBA VACIA: sin grants de Supabase (authenticated no tiene INSERT en %)', t;
    end if;
  end loop;
end $$;

insert into public.tenants(id,name) values ('t_sus','Clinica suspendible');
insert into auth.users(id,email) values ('37000000-0000-0000-0000-000000000001','admin.sus@ex.mx');
insert into public.tenant_members(tenant_id,user_id,role) values
  ('t_sus','37000000-0000-0000-0000-000000000001','admin_consultorio');
insert into public.therapy_services(tenant_id,id,name,duration_minutes,price) values ('t_sus','sv','Consulta',50,700);
insert into public.therapists(tenant_id,id,name,minimum_notice_minutes) values ('t_sus','tt','Especialista',0);
delete from public.therapist_schedules where tenant_id='t_sus';
insert into public.therapist_schedules(tenant_id,therapist_id,weekday,start_time,end_time,active)
select 't_sus','tt',d,'09:00','19:00',true from generate_series(0,6) d;
insert into public.appointments(tenant_id,id,service_id,therapist_id,appointment_date,appointment_time,
  customer_name,customer_email,customer_phone,duration_minutes,status) values
  ('t_sus','sus-1','sv','tt',current_date+20,'10:00','Paciente','p@ex.mx','5500000001',50,'confirmed');
-- La cita ya crea su paciente (trigger del esquema): hay 1 paciente en t_sus.
do $$ begin
  if (select count(*) from public.patients where tenant_id='t_sus') <> 1 then
    raise exception 'PRUEBA VACIA: t_sus debe tener un paciente';
  end if;
end $$;

create or replace function pg_temp.como_admin() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub','37000000-0000-0000-0000-000000000001','role','authenticated',
    'app_metadata',jsonb_build_object('memberships',jsonb_build_object('t_sus','admin_consultorio')))::text, true);
  perform set_config('request.headers', jsonb_build_object('x-tenant-id','t_sus')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

do $$
declare
  estado text; n int; r text;
begin
  foreach estado in array array['suspended','cancelled'] loop
    update public.tenants set status = estado where id = 't_sus';
    perform pg_temp.como_admin();
    if public.current_tenant_id() is not null then
      raise exception 'FUGA M2 (%): current_tenant_id() = %', estado, public.current_tenant_id();
    end if;
    select count(*) into n from public.appointments;
    if n <> 0 then raise exception 'FUGA M2 (%): el staff lee % citas', estado, n; end if;
    select count(*) into n from public.patients;
    if n <> 0 then raise exception 'FUGA M2 (%): el staff lee % pacientes', estado, n; end if;
    begin
      insert into public.appointments(tenant_id,id,service_id,therapist_id,appointment_date,appointment_time,
        customer_name,customer_email,customer_phone,duration_minutes,status)
      values ('t_sus','sus-new-'||estado,'sv','tt',current_date+21,'10:00','Nuevo','n@ex.mx','5500000002',50,'confirmed');
      r := 'ok';
    exception when others then r := sqlstate;
    end;
    if r <> '42501' then raise exception 'FUGA M2 (%): INSERT de cita dio %', estado, r; end if;
    update public.appointments set customer_name = 'Editado' where id = 'sus-1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FUGA M2 (%): UPDATE toco % filas', estado, n; end if;
    delete from public.appointments where id = 'sus-1';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FUGA M2 (%): DELETE borro % filas', estado, n; end if;
    select count(*) into n from public.tenants;
    if n <> 1 then raise exception 'FALLO M2 (%): el staff debe poder leer su clinica (ve %)', estado, n; end if;
    reset role;
    if (select customer_name from public.appointments where tenant_id='t_sus' and id='sus-1') <> 'Paciente' then
      raise exception 'FUGA M2 (%): la cita cambio', estado;
    end if;
    raise notice 'ok · clinica % no opera para su staff y sigue legible su estado', estado;
  end loop;

  update public.tenants set status = 'active' where id = 't_sus';
  perform pg_temp.como_admin();
  if public.current_tenant_id() is distinct from 't_sus' then raise exception 'FALLO control M2: activa sin clinica'; end if;
  select count(*) into n from public.appointments;
  if n <> 1 then raise exception 'FALLO control M2: la clinica activa ve % citas', n; end if;
  select count(*) into n from public.patients;
  if n <> 1 then raise exception 'FALLO control M2: la clinica activa ve % pacientes', n; end if;
  reset role;
  raise notice 'ok · al reactivarla, el mismo staff vuelve a ver sus filas';
end $$;
