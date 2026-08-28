-- Agenda configurable: horario por terapeuta y buffer (0016-0017).
--
-- Antes los dias y el horario estaban fijos en codigo Y en la policy, asi
-- que toda clinica quedaba con los de esta. Y el EXCLUDE solo cubria la
-- duracion: dos citas pegadas sin descanso pasaban por API directa aunque
-- la interfaz no las ofreciera.

insert into public.tenants (id,name) values ('t_ag','Clinica Agenda');
insert into auth.users (id,email) values ('ee000000-0000-0000-0000-0000000000a1','doc.ag@ex.mx');
insert into public.therapists (tenant_id,id,name,user_id,buffer_after_minutes) values
  ('t_ag','dra-ag','Dra. Agenda','ee000000-0000-0000-0000-0000000000a1',30);
insert into public.tenant_members (tenant_id,user_id,role,therapist_id) values
  ('t_ag','ee000000-0000-0000-0000-0000000000a1','doctor','dra-ag');
insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
  ('t_ag','sv-ag','Terapia',50,900);

-- Al alta, 0016 siembra martes a sabado 9-19. Esta clinica trabaja otra
-- cosa: lunes de 13 a 19. Que se pueda es justamente el punto.
delete from public.therapist_schedules where tenant_id='t_ag';
insert into public.therapist_schedules (tenant_id,therapist_id,weekday,start_time,end_time)
values ('t_ag','dra-ag',1,'13:00','19:00');

do $$
declare v_rango text; v_buffer integer;
begin
  -- 2026-12-07 es lunes.
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
  values ('t_ag','ag1','sv-ag','dra-ag','2026-12-07','13:00','Uno','u@ex.mx','5511111111',50);

  -- El buffer se copia del terapeuta a la cita: congela el acuerdo del
  -- momento, para que cambiarlo manana no mueva lo ya agendado.
  select buffer_after_minutes into v_buffer from public.appointments where id='ag1';
  if v_buffer <> 30 then
    raise exception 'FALLA: el buffer no se copio a la cita (quedo %)', v_buffer;
  end if;

  -- El rango ocupado es duracion + buffer: 13:00 a 14:20.
  select slot::text into v_rango from public.appointments where id='ag1';
  if position('14:20:00' in v_rango) = 0 then
    raise exception 'FALLA: el rango no incluye el buffer (es %)', v_rango;
  end if;

  -- Pegada al final de la sesion, dentro del descanso: no debe entrar.
  begin
    insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
      appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
    values ('t_ag','ag2','sv-ag','dra-ag','2026-12-07','13:50','Dos','d@ex.mx','5511111111',50);
    raise exception 'FALLA: acepto una cita dentro del descanso';
  exception when exclusion_violation then null;
  end;

  -- Justo cuando libera: si entra.
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
  values ('t_ag','ag3','sv-ag','dra-ag','2026-12-07','14:20','Tres','t@ex.mx','5511111111',50);

  raise notice 'ok · el buffer se copia y el motor lo respeta';
end $$;

do $$
begin
  -- El horario ya no esta fijo: esta clinica abre lunes, no martes.
  if not public.fits_in_schedule('t_ag','dra-ag','2026-12-07','13:00',50) then
    raise exception 'FALLA: rechazo un lunes, que es dia laboral de esta clinica';
  end if;
  if public.fits_in_schedule('t_ag','dra-ag','2026-12-08','13:00',50) then
    raise exception 'FALLA: acepto un martes, que esta clinica no trabaja';
  end if;

  -- Fuera del bloque.
  if public.fits_in_schedule('t_ag','dra-ag','2026-12-07','08:00',50) then
    raise exception 'FALLA: acepto una hora anterior al bloque';
  end if;

  -- El bloque debe cubrir la cita COMPLETA: 18:40 mas 50 minutos termina
  -- a las 19:30, fuera del horario.
  if public.fits_in_schedule('t_ag','dra-ag','2026-12-07','18:40',50) then
    raise exception 'FALLA: acepto una cita que termina fuera del horario';
  end if;
  if not public.fits_in_schedule('t_ag','dra-ag','2026-12-07','18:00',50) then
    raise exception 'FALLA: rechazo una cita que si cabe completa';
  end if;

  raise notice 'ok · el horario es del terapeuta y cubre la cita completa';
end $$;

-- Agenda partida: dos bloques el mismo dia dejan la comida fuera sin
-- necesidad de un campo especial.
do $$
begin
  delete from public.therapist_schedules where tenant_id='t_ag';
  insert into public.therapist_schedules (tenant_id,therapist_id,weekday,start_time,end_time) values
    ('t_ag','dra-ag',1,'09:00','14:00'),
    ('t_ag','dra-ag',1,'15:00','19:00');

  if not public.fits_in_schedule('t_ag','dra-ag','2026-12-07','10:00',50) then
    raise exception 'FALLA: rechazo el bloque de la mañana';
  end if;
  if public.fits_in_schedule('t_ag','dra-ag','2026-12-07','14:15',50) then
    raise exception 'FALLA: acepto una cita en la hora de comida';
  end if;
  if not public.fits_in_schedule('t_ag','dra-ag','2026-12-07','15:30',50) then
    raise exception 'FALLA: rechazo el bloque de la tarde';
  end if;

  raise notice 'ok · la agenda partida deja la comida fuera sola';
end $$;

-- El horario de un terapeuta no se filtra ni se mezcla entre clinicas.
do $$
declare v_n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"ee000000-0000-0000-0000-0000000000a1","app_metadata":{"memberships":{"t_ag":"doctor"},"therapist_ids":{"t_ag":"dra-ag"}}}', true);
  perform set_config('request.tenant','t_ag', true);

  select count(*) into v_n from public.therapist_schedules where tenant_id <> 't_ag';
  if v_n <> 0 then
    raise exception 'FUGA: vio % bloques de horario de otra clinica', v_n;
  end if;

  raise notice 'ok · los horarios no cruzan clinicas';
end $$;
