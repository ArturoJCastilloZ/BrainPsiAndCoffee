-- Criterio de aceptacion de la Fase 2 (plan canonico, linea 164) y
-- flujos publicos. Usa clinicas propias para no depender de los tests
-- anteriores.

insert into public.tenants (id,name) values ('t_a','Clinica A'),('t_b','Clinica B');
insert into auth.users (id,email) values ('aaaaaaaa-0000-0000-0000-000000000001','admin.a@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_a','aaaaaaaa-0000-0000-0000-000000000001','admin_consultorio');
insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
  ('t_a','sv','Terapia',50,900),('t_b','sv','Terapia',50,900);
insert into public.therapists (tenant_id,id,name,active) values
  ('t_a','tt','Dr A',true),('t_b','tt','Dr B',true);
insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
  appointment_time,customer_name,customer_email,customer_phone,duration_minutes) values
  ('t_a','apx','sv','tt','2026-12-01','10:00','Pac A','pa@ex.mx','5511111111',50),
  ('t_b','apx','sv','tt','2026-12-01','10:00','Pac B','pb@ex.mx','5522222222',50);
insert into auth.users (id,email) values ('aaaaaaaa-0000-0000-0000-00000000000f','doc.pol@ex.mx');
insert into public.encounters (tenant_id, id, patient_id, therapist_id, appointment_id, status)
  select a.tenant_id, gen_random_uuid(), a.patient_id, a.therapist_id, a.id, 'completed'
  from public.appointments a where a.id='apx';
insert into public.clinical_notes (tenant_id, encounter_id, patient_id, author_id, content)
  select e.tenant_id, e.id, e.patient_id, 'aaaaaaaa-0000-0000-0000-00000000000f',
         '{"texto":"nota"}'::jsonb
  from public.encounters e where e.appointment_id = 'apx';

grant usage on schema public to authenticated, anon;
grant select, insert on all tables in schema public to authenticated, anon;

-- CRITERIO DE ACEPTACION: cero filas en los tres casos.
do $$
declare v_n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_a":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_a', true);

  select count(*) into v_n from public.appointments where tenant_id='t_b';
  if v_n <> 0 then raise exception 'FUGA: leyo % citas del tenant ajeno', v_n; end if;

  select count(*) into v_n from public.patients where tenant_id='t_b';
  if v_n <> 0 then raise exception 'FUGA: leyo % pacientes del tenant ajeno', v_n; end if;

  select count(*) into v_n from public.clinical_notes where tenant_id='t_b';
  if v_n <> 0 then raise exception 'FUGA: leyo % notas clinicas del tenant ajeno', v_n; end if;

  -- Falsificar el tenant activo tampoco alcanza nada.
  perform set_config('request.tenant','t_b', true);
  select count(*) into v_n from public.appointments;
  if v_n <> 0 then raise exception 'FUGA: el tenant falsificado leyo % citas', v_n; end if;

  -- Y no bloquea de mas.
  perform set_config('request.tenant','t_a', true);
  select count(*) into v_n from public.appointments;
  if v_n <> 1 then raise exception 'FALLA: no ve sus propias citas (% filas)', v_n; end if;

  raise notice 'ok · criterio de aceptacion: cero filas cruzadas en citas, pacientes y notas';
end $$;

-- Flujo publico (anon, sin membresia).
do $$
declare v_n integer; v_txt text;
begin
  set local role anon;
  perform set_config('request.jwt.claims','', true);

  perform set_config('request.tenant','t_a', true);
  select count(*) into v_n from public.therapy_services;
  if v_n <> 1 then raise exception 'FALLA: el visitante no ve el catalogo de la clinica (% filas)', v_n; end if;

  select count(*) into v_n from public.therapists_public;
  if v_n <> 1 then raise exception 'FALLA: la vista publica de terapeutas quedo vacia'; end if;

  -- El catalogo cambia con la clinica que se visita.
  perform set_config('request.tenant','t_b', true);
  select name into v_txt from public.therapists_public;
  if v_txt <> 'Dr B' then raise exception 'FUGA: visitando B se vio al terapeuta %', v_txt; end if;

  -- Sin tenant no se ve nada.
  perform set_config('request.tenant','', true);
  select count(*) into v_n from public.therapy_services;
  if v_n <> 0 then raise exception 'FUGA: sin tenant se vieron % servicios', v_n; end if;

  -- Reserva publica CON terapeuta. La Fase 1 quito la lectura publica de
  -- therapists pero dejo el with check apuntando a esa tabla, asi que el
  -- exists daba cero y toda reserva con terapeuta especifico se rechazaba:
  -- solo pasaba 'cualquiera', que manda therapist_id nulo. Ahora el check
  -- va contra therapists_public.
  perform set_config('request.tenant','t_a', true);
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
  values ('t_a','pubx','sv','tt','2026-09-01','11:00','Pedro Ruiz','np@ex.mx','5533333333',50);

  -- Pero no puede agendar en otra clinica.
  begin
    insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
      appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
    values ('t_b','fugax','sv','tt','2026-09-01','13:00','Pedro Ruiz','x@ex.mx','5544444444',50);
    raise exception 'FUGA: un visitante agendo en una clinica que no estaba visitando';
  exception when insufficient_privilege then null;
  end;

  raise notice 'ok · flujo publico por clinica y reserva con terapeuta';
end $$;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='profiles' and column_name='role') then
    raise exception 'FALLA: profiles.role sigue existiendo como segunda fuente de permisos';
  end if;
  raise notice 'ok · profiles.role retirado';
end $$;
