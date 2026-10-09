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

-- 0039 · ARCO, consentimiento informado y MFA para el expediente.

insert into public.tenants (id,name) values ('t_cmp','Clinica Cumplimiento');
insert into auth.users (id,email) values
  ('c9000000-0000-0000-0000-0000000000f1','owner.cmp@ex.mx'),
  ('c9000000-0000-0000-0000-0000000000d1','doc.cmp@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role,therapist_id) values
  ('t_cmp','c9000000-0000-0000-0000-0000000000f1','owner',null),
  ('t_cmp','c9000000-0000-0000-0000-0000000000d1','doctor','th-cmp');
insert into public.therapists (tenant_id,id,name,user_id) values
  ('t_cmp','th-cmp','Dra. Cumplimiento','c9000000-0000-0000-0000-0000000000d1');
insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
  ('t_cmp','sv-cmp','Consulta',50,700);
-- Horario de lunes a domingo para que la reserva publica de la prueba 8
-- entre de verdad (y no la rechace la falta de horario).
insert into public.therapist_schedules (tenant_id,therapist_id,weekday,start_time,end_time,active)
select 't_cmp','th-cmp', d, '09:00','19:00', true from generate_series(0,6) d;
insert into public.patients (tenant_id,id,full_name,email,phone) values
  ('t_cmp','c9000000-0000-0000-0000-0000000000a1','Paciente Suyo','suyo@ex.mx','8111111111'),
  ('t_cmp','c9000000-0000-0000-0000-0000000000a2','Paciente Ajeno','ajeno@ex.mx','8122222222');
-- La doctora atiende al primero (una cita suya), no al segundo.
insert into public.appointments (tenant_id,id,patient_id,service_id,therapist_id,appointment_date,
  appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status)
values ('t_cmp','cita-cmp','c9000000-0000-0000-0000-0000000000a1','sv-cmp','th-cmp','2026-12-11','10:00',
        'Paciente Suyo','suyo@ex.mx','8111111111',50,'confirmed');
insert into public.encounters (tenant_id,id,patient_id,therapist_id,status) values
  ('t_cmp','c9000000-0000-0000-0000-0000000000e1','c9000000-0000-0000-0000-0000000000a1','th-cmp','completed');
insert into public.clinical_notes (tenant_id,id,encounter_id,patient_id,author_id,content)
values ('t_cmp','c9000000-0000-0000-0000-0000000000c1','c9000000-0000-0000-0000-0000000000e1',
        'c9000000-0000-0000-0000-0000000000a1','c9000000-0000-0000-0000-0000000000d1','{"texto":"Nota"}');

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.consents to authenticated;
grant select on public.clinical_notes, public.encounters, public.patients to authenticated;

create or replace function pg_temp.sesion(p_quien text, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  if p_quien is null then
    perform set_config('request.jwt.claims', '', true);
  else
    perform set_config('request.jwt.claims', json_build_object(
      'sub', case p_quien when 'doctor' then 'c9000000-0000-0000-0000-0000000000d1'
                          else 'c9000000-0000-0000-0000-0000000000f1' end,
      'aal', p_aal,
      'app_metadata', json_build_object(
        'memberships', json_build_object('t_cmp', p_quien),
        'therapist_ids', case when p_quien = 'doctor' then json_build_object('t_cmp','th-cmp') else '{}'::json end)
    )::text, true);
  end if;
  perform set_config('request.tenant','t_cmp', true);
end $$;

create or replace function pg_temp.arco_publica(p_correo text) returns void language plpgsql as $$
begin
  perform pg_temp.sesion(null);
  set local role anon;
  insert into public.arco_requests (tenant_id, request_type, requester_name, requester_email, details,
                                    status, due_on, created_at, handled_by)
  values ('t_cmp','acceso','Titular Prueba', p_correo, 'Quiero saber qué datos míos tienen.',
          'respondida', '2000-01-01', '2000-01-01', 'c9000000-0000-0000-0000-0000000000f1');
  reset role;
end $$;

-- 1 · Dias habiles: viernes + 1 = lunes; 20 habiles son 4 semanas.
do $$
begin
  if public.add_business_days('2026-10-09', 1) <> '2026-10-12' then
    raise exception 'FALLA: viernes + 1 dia habil no da lunes (%)', public.add_business_days('2026-10-09', 1);
  end if;
  if public.add_business_days('2026-10-09', 20) <> '2026-11-06' then
    raise exception 'FALLA: 20 dias habiles desde el 9 oct no dan el 6 nov';
  end if;
  raise notice 'ok · dias habiles';
end $$;

-- 2 · El visitante deja su solicitud; la base pone estado, fecha y plazo
--     aunque el navegador mande otra cosa, y el visitante no puede leerla.
do $$
declare r record; v_n integer;
begin
  perform pg_temp.arco_publica('titular@ex.mx');
  select * into r from public.arco_requests where tenant_id='t_cmp' and requester_email='titular@ex.mx';
  if r.status <> 'recibida' or r.handled_by is not null or r.created_at < now() - interval '1 minute'
     or r.due_on <= current_date then
    raise exception 'FUGA: el navegador decidio estado/fecha/plazo de una ARCO (%, %, %)', r.status, r.created_at, r.due_on;
  end if;

  perform pg_temp.sesion(null);
  set local role anon;
  -- Sin permiso (produccion revoca SELECT) o con cero filas (RLS sin
  -- policy de lectura publica): las dos cierran. Lo que no puede pasar es
  -- VER una fila.
  begin
    select count(*) into v_n from public.arco_requests;
    if v_n > 0 then
      raise exception 'FUGA: el visitante puede LEER solicitudes ARCO (% filas)', v_n;
    end if;
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'ok · ARCO publica: la base pone estado y plazo, y nadie de fuera la lee';
end $$;

-- 3 · Tope: la cuarta del mismo correo en 30 dias se rechaza.
do $$
begin
  perform pg_temp.arco_publica('titular@ex.mx');
  perform pg_temp.arco_publica('TITULAR@ex.mx');
  begin
    perform pg_temp.arco_publica('titular@ex.mx');
    raise exception 'FUGA: un mismo correo dejo cuatro solicitudes ARCO en un mes';
  exception when sqlstate 'P0429' then null;
  end;
  raise notice 'ok · ARCO publica con tope por correo';
end $$;

-- 4 · El tramite: cerrar exige respuesta; la base sella quien y cuando;
--     lo pedido no se reescribe; cerrada no se reabre; no se borra.
do $$
declare v_id uuid; r record;
begin
  select id into v_id from public.arco_requests where tenant_id='t_cmp' order by created_at limit 1;
  perform pg_temp.sesion('owner');

  begin
    update public.arco_requests set status='respondida' where tenant_id='t_cmp' and id=v_id;
    raise exception 'FALLA: se cerro una ARCO sin decir que se respondio';
  exception when raise_exception then
    if sqlerrm like 'FALLA%' then raise; end if;
  end;

  update public.arco_requests set status='respondida', response_summary='Se envió copia de sus datos por correo.'
   where tenant_id='t_cmp' and id=v_id;
  select * into r from public.arco_requests where tenant_id='t_cmp' and id=v_id;
  if r.responded_at is null or r.handled_by <> 'c9000000-0000-0000-0000-0000000000f1' then
    raise exception 'FALLA: la base no sello quien y cuando respondio';
  end if;

  begin
    update public.arco_requests set details='Otra cosa que nunca pidio.' where tenant_id='t_cmp' and id=v_id;
    raise exception 'FUGA: se reescribio lo que la persona pidio';
  exception when raise_exception then
    if sqlerrm like 'FUGA%' then raise; end if;
  end;
  begin
    update public.arco_requests set status='en_proceso' where tenant_id='t_cmp' and id=v_id;
    raise exception 'FUGA: se reabrio una solicitud cerrada';
  exception when raise_exception then
    if sqlerrm like 'FUGA%' then raise; end if;
  end;
  begin
    delete from public.arco_requests where tenant_id='t_cmp' and id=v_id;
    raise exception 'FUGA: se borro una solicitud ARCO';
  exception when raise_exception then
    if sqlerrm like 'FUGA%' then raise; end if;
  end;
  raise notice 'ok · ARCO: cerrar exige respuesta, sellos de la base, sin reescribir ni borrar';
end $$;

-- 5 · Consentimiento informado: la doctora lo registra para SU paciente,
--     la base sella quien y cuando; para un paciente ajeno, no.
do $$
declare r record;
begin
  perform pg_temp.sesion('doctor');
  set local role authenticated;
  insert into public.consents (tenant_id, patient_id, subject_email, consent_type, document_version, accepted_at, evidence)
  values ('t_cmp','c9000000-0000-0000-0000-0000000000a1','suyo@ex.mx','clinical_treatment','ci-2026-10-v1',
          '2000-01-01', '{"modalidad":"papel","firmante":"Paciente Suyo"}');
  begin
    insert into public.consents (tenant_id, patient_id, subject_email, consent_type, document_version)
    values ('t_cmp','c9000000-0000-0000-0000-0000000000a2','ajeno@ex.mx','clinical_treatment','ci-2026-10-v1');
    raise exception 'FUGA: la doctora registro consentimiento de un paciente que no atiende';
  exception when insufficient_privilege then null;
  end;
  reset role;

  select * into r from public.consents where tenant_id='t_cmp' and patient_id='c9000000-0000-0000-0000-0000000000a1';
  if r.accepted_at < now() - interval '1 minute' then
    raise exception 'FUGA: la fecha del consentimiento la decidio el navegador (%)', r.accepted_at;
  end if;
  if r.evidence ->> 'registrado_por' <> 'c9000000-0000-0000-0000-0000000000d1' or r.evidence ->> 'firmante' <> 'Paciente Suyo' then
    raise exception 'FALLA: la evidencia no dice quien lo registro (%)', r.evidence;
  end if;
  raise notice 'ok · consentimiento: la doctora lo registra para su paciente, con sellos de la base';
end $$;

-- 6 · Revocar: una sola vez, sin mover el consentimiento de paciente.
do $$
declare v_id uuid; v_rev timestamptz;
begin
  select id into v_id from public.consents where tenant_id='t_cmp' and patient_id='c9000000-0000-0000-0000-0000000000a1';
  perform pg_temp.sesion('doctor');
  set local role authenticated;
  update public.consents set revoked_at = '2000-01-01' where id = v_id;
  reset role;
  select revoked_at into v_rev from public.consents where id = v_id;
  if v_rev < now() - interval '1 minute' then
    raise exception 'FUGA: la fecha de revocacion la decidio el navegador';
  end if;
  begin
    update public.consents set revoked_at = null where id = v_id;
    raise exception 'FUGA: se deshizo una revocacion';
  exception when raise_exception then
    if sqlerrm like 'FUGA%' then raise; end if;
  end;
  begin
    update public.consents set patient_id = 'c9000000-0000-0000-0000-0000000000a2' where id = v_id;
    raise exception 'FUGA: un consentimiento cambio de paciente';
  exception when raise_exception then
    if sqlerrm like 'FUGA%' then raise; end if;
  end;
  raise notice 'ok · revocar es de un solo sentido y no mueve el consentimiento';
end $$;

-- 7 · MFA: apagada, la doctora lee su nota con aal1. Encendida, solo con
--     aal2. Solo el dueño la enciende, y solo verificado el mismo.
do $$
declare v_n integer;
begin
  perform pg_temp.sesion('doctor', 'aal1');
  set local role authenticated;
  select count(*) into v_n from public.clinical_notes where tenant_id='t_cmp';
  reset role;
  if v_n <> 1 then raise exception 'FALLA DE LA PRUEBA: linea base, la doctora no ve su nota (%)', v_n; end if;

  perform pg_temp.sesion('doctor', 'aal2');
  begin
    perform public.set_clinical_mfa(true);
    raise exception 'FUGA: una doctora encendio la regla de MFA de la clinica';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.sesion('owner', 'aal1');
  begin
    perform public.set_clinical_mfa(true);
    raise exception 'FALLA: el dueño la encendio sin estar verificado: se dejaria fuera';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.sesion('owner', 'aal2');
  perform public.set_clinical_mfa(true);

  perform pg_temp.sesion('doctor', 'aal1');
  set local role authenticated;
  select count(*) into v_n from public.clinical_notes where tenant_id='t_cmp';
  if v_n <> 0 then raise exception 'FUGA: con MFA exigida, una sesion sin segundo factor leyo % notas', v_n; end if;
  select count(*) into v_n from public.patients where tenant_id='t_cmp';
  if v_n <> 0 then raise exception 'FUGA: con MFA exigida, una sesion sin segundo factor leyo % pacientes', v_n; end if;
  reset role;

  perform pg_temp.sesion('doctor', 'aal2');
  set local role authenticated;
  select count(*) into v_n from public.clinical_notes where tenant_id='t_cmp';
  reset role;
  if v_n <> 1 then raise exception 'FALLA: con segundo factor la doctora no ve su nota (%)', v_n; end if;
  raise notice 'ok · MFA del expediente: la exige la base, la enciende solo el dueño verificado';
end $$;

-- 8 · Con la MFA encendida, la reserva publica sigue funcionando: crea al
--     paciente por el trigger, sin sesion.
do $$
declare v_n integer;
begin
  perform pg_temp.sesion(null);
  set local role anon;
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,appointment_time,
    customer_name,customer_email,customer_phone,duration_minutes,status)
  values ('t_cmp','pub-cmp','sv-cmp','th-cmp', current_date + 30,'11:00','Visitante Nuevo','nuevo.cmp@ex.mx','8133333333',50,'requested');
  reset role;
  select count(*) into v_n from public.patients where tenant_id='t_cmp' and email='nuevo.cmp@ex.mx';
  if v_n <> 1 then raise exception 'FALLA: con MFA encendida la reserva publica ya no crea al paciente'; end if;
  raise notice 'ok · la reserva publica no depende de la MFA del personal';
end $$;
