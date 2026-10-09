-- ===========================================================================
-- GUARD: esto es una PRUEBA. No se corre contra una base real.
-- ===========================================================================
-- Falla CERRADO: aborta salvo que pueda demostrar que esta en el Postgres
-- desechable. La marca la crea tests/tenancy/run.sh en el contenedor que
-- el mismo acaba de levantar, asi que no puede existir en ningun otro lado.
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

-- 0034 · Una cita no reescribe la identidad de un paciente que ya existe.
--
-- El defecto: sync_patient_from_appointment buscaba al paciente por correo
-- y le hacia UPDATE de nombre y telefono con lo que trajera CUALQUIER cita.
-- Una reserva publica —sin sesion— con el correo de una paciente real le
-- cambiaba el nombre y el telefono en su ficha de identificacion
-- (NOM-004), y ademas la reactivaba si estaba archivada.
--
-- El trigger corre como security definer y decide por el rol de la sesion
-- (auth.jwt()), asi que aqui basta fijar los claims: sin claims es el
-- visitante anonimo.

insert into public.tenants (id,name) values ('t_pid','Clinica Identidad');
insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
  ('t_pid','sv-pid','Consulta',50,700);
insert into public.therapists (tenant_id,id,name,active) values
  ('t_pid','psq-pid','Dra Identidad',true);

create or replace function pg_temp.como(p_rol text) returns void language plpgsql as $$
begin
  if p_rol is null then
    perform set_config('request.jwt.claims', '', false);
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub','e1000000-0000-0000-0000-0000000000aa',
        'app_metadata', json_build_object('memberships', json_build_object('t_pid', p_rol)))::text, false);
  end if;
  perform set_config('request.tenant','t_pid', false);
end $$;

create or replace function pg_temp.cita(p_id text, p_nombre text, p_tel text, p_hora text) returns void language sql as $$
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
  values ('t_pid', p_id,'sv-pid','psq-pid','2026-12-10', p_hora::time, p_nombre,'paciente.real@ex.mx', p_tel, 50);
$$;

-- 1 · LINEA BASE: el alta del staff crea al paciente con sus datos.
do $$
declare v_nombre text; v_tel text;
begin
  perform pg_temp.como('admin_consultorio');
  perform pg_temp.cita('pid-1','Paciente Real','8111111111','09:00');
  select full_name, phone into v_nombre, v_tel from public.patients
    where tenant_id='t_pid' and email='paciente.real@ex.mx';
  if v_nombre is distinct from 'Paciente Real' or v_tel is distinct from '8111111111' then
    raise exception 'FALLA DE LA PRUEBA: el paciente no se creo como se esperaba (%, %)', v_nombre, v_tel;
  end if;
  raise notice 'ok · linea base: el alta crea al paciente';
end $$;

-- 2 · Un visitante ANONIMO con el mismo correo NO reescribe la ficha.
do $$
declare v_nombre text; v_tel text; v_vinculo uuid; v_pac uuid;
begin
  perform pg_temp.como(null);
  perform pg_temp.cita('pid-2','Impostor','8199999999','11:00');
  select id, full_name, phone into v_pac, v_nombre, v_tel from public.patients
    where tenant_id='t_pid' and email='paciente.real@ex.mx';
  if v_nombre <> 'Paciente Real' or v_tel <> '8111111111' then
    raise exception 'FUGA: una reserva anonima reescribio la ficha del paciente (nombre=%, tel=%)', v_nombre, v_tel;
  end if;
  -- La cita conserva lo que escribio quien reservo: ese es su lugar.
  select patient_id into v_vinculo from public.appointments where tenant_id='t_pid' and id='pid-2';
  if v_vinculo is distinct from v_pac then
    raise exception 'FALLA: la cita no quedo enlazada al paciente existente';
  end if;
  raise notice 'ok · una reserva anonima enlaza pero no reescribe la ficha';
end $$;

-- 3 · Tampoco la reactiva si estaba archivada.
do $$
declare v_activo boolean;
begin
  update public.patients set active = false where tenant_id='t_pid' and email='paciente.real@ex.mx';
  perform pg_temp.como(null);
  perform pg_temp.cita('pid-3','Otro','8100000000','13:00');
  select active into v_activo from public.patients where tenant_id='t_pid' and email='paciente.real@ex.mx';
  if v_activo then
    raise exception 'FUGA: una reserva anonima reactivo un paciente archivado';
  end if;
  update public.patients set active = true where tenant_id='t_pid' and email='paciente.real@ex.mx';
  raise notice 'ok · una reserva anonima no reactiva pacientes archivados';
end $$;

-- 4 · Un especialista tampoco: crear una cita con el correo de un paciente
--     no le da poder sobre su ficha.
do $$
declare v_nombre text;
begin
  perform pg_temp.como('doctor');
  perform pg_temp.cita('pid-4','Nombre Del Doctor','8122222222','15:00');
  select full_name into v_nombre from public.patients where tenant_id='t_pid' and email='paciente.real@ex.mx';
  if v_nombre <> 'Paciente Real' then
    raise exception 'FUGA: una cita del especialista reescribio la ficha (nombre=%)', v_nombre;
  end if;
  raise notice 'ok · la cita de un especialista no reescribe la ficha';
end $$;

-- 5 · La correccion LEGITIMA sigue funcionando: recepcion (admin del
--     consultorio) corrige el telefono en la cita y la ficha se actualiza.
--     Hoy no hay otra pantalla para editar al paciente.
do $$
declare v_tel text;
begin
  perform pg_temp.como('admin_consultorio');
  update public.appointments set customer_phone = '8133333333' where tenant_id='t_pid' and id='pid-1';
  select phone into v_tel from public.patients where tenant_id='t_pid' and email='paciente.real@ex.mx';
  if v_tel <> '8133333333' then
    raise exception 'REGRESION: la correccion de recepcion ya no llega a la ficha (tel=%)', v_tel;
  end if;
  raise notice 'ok · la correccion del staff administrativo si actualiza la ficha';
end $$;

select set_config('request.jwt.claims', '', false);
