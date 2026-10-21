-- Solo el arnes desechable; nunca ejecutar en una base del consultorio.
do $$ begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception 'ABORTADO: la prueba requiere el banco desechable.';
  end if;
end $$;

insert into public.tenants (id, name) values ('t_atomic', 'Reserva atomica'), ('t_atomic_other', 'Ajena');
insert into public.therapy_services (tenant_id,id,name,duration_minutes,price)
values ('t_atomic','sv','Consulta',50,700), ('t_atomic_other','other','Ajena',50,800);
insert into public.therapists (tenant_id,id,name,minimum_notice_minutes)
values ('t_atomic','tt','Especialista',0);
delete from public.therapist_schedules where tenant_id='t_atomic';
insert into public.therapist_schedules (tenant_id,therapist_id,weekday,start_time,end_time,active)
select 't_atomic','tt', d,'09:00','19:00',true from generate_series(0,6) d;

create function pg_temp.booking(p_id text, p_email text, p_day integer default 10)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id',p_id,'service_id','sv','therapist_id','tt',
    'appointment_date',current_date+p_day,'appointment_time','11:00',
    'customer_name','Paciente Prueba','customer_email',p_email,
    'customer_phone','8199900000','duration_minutes',50
  );
$$;
create function pg_temp.submit(p_bookings jsonb, p_accepted boolean default true,
                              p_version text default '2026-10-borrador-2',
                              p_hash text default '3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims','',true);
  perform set_config('request.tenant','t_atomic',true);
  set local role anon;
  perform public.create_public_booking(p_bookings,p_accepted,p_version,p_hash,'fixture');
  reset role;
end $$;

-- Los triggers internos tampoco permiten fechas manipuladas para evadir topes.
do $$
declare i integer; v_created timestamptz;
begin
  for i in 1..2 loop
    perform set_config('request.jwt.claims','',true);
    perform set_config('request.tenant','t_atomic',true);
    set local role bpc_booking_writer;
    insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
      appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,created_at)
    values ('t_atomic','stamp-'||i,'sv','tt',current_date+5+i,'11:00','Prueba Sello',
      'stamp@ex.mx','8199911111',50,'confirmed',case when i=1 then '2000-01-01'::timestamptz else '2100-01-01'::timestamptz end);
    reset role;
    select created_at into v_created from public.appointments where tenant_id='t_atomic' and id='stamp-'||i;
    if v_created is distinct from now() then raise exception 'FUGA: fecha de creacion manipulable'; end if;
  end loop;
  set local role bpc_booking_writer;
  begin
    insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
      appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,created_at)
    values ('t_atomic','stamp-3','sv','tt',current_date+8,'11:00','Prueba Sello',
      'stamp@ex.mx','8199911111',50,'requested','2000-01-01');
    raise exception 'FUGA: la fecha pasada evadio el tope';
  exception when sqlstate 'P0429' then null;
  end;
  reset role;
  raise notice 'ok · fechas pasadas/futuras ignoradas y topes conservados';
end $$;

-- El staff por API tampoco puede cambiar el sello original.
insert into auth.users (id,email) values ('a3100000-0000-0000-0000-000000000001','owner.atomic@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role)
values ('t_atomic','a3100000-0000-0000-0000-000000000001','owner');
grant select, update on public.appointments to authenticated;
do $$
declare v_created timestamptz;
begin
  select created_at into v_created from public.appointments where tenant_id='t_atomic' and id='stamp-1';
  perform set_config('request.tenant','t_atomic',true);
  perform set_config('request.jwt.claims','{"sub":"a3100000-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_atomic":"owner"}}}',true);
  set local role authenticated;
  update public.appointments set created_at='2100-01-01',status='confirmed' where tenant_id='t_atomic' and id='stamp-1';
  reset role;
  if (select created_at from public.appointments where tenant_id='t_atomic' and id='stamp-1') is distinct from v_created then
    raise exception 'FUGA: el staff reescribio el sello';
  end if;
  raise notice 'ok · la actualizacion del staff conserva created_at';
end $$;

-- Falta de aceptacion, hash y version falsos, cuerpo invalido: ninguna escritura.
do $$
begin
  begin
    perform pg_temp.submit(jsonb_build_array(pg_temp.booking('no-consent','no@ex.mx')),false);
    raise exception 'FUGA: falta aceptacion';
  exception when check_violation then null; end;
  begin
    perform pg_temp.submit(jsonb_build_array(pg_temp.booking('bad-version','version@ex.mx')),true,'inventada');
    raise exception 'FUGA: version falsa';
  exception when check_violation then null; end;
  begin
    perform pg_temp.submit(jsonb_build_array(pg_temp.booking('bad-hash','hash@ex.mx')),true,'2026-10-borrador-2',repeat('a',64));
    raise exception 'FUGA: hash falso';
  exception when check_violation then null; end;
  begin
    perform pg_temp.submit('{}');
    raise exception 'FUGA: cuerpo no array';
  exception when check_violation then null; end;
  if exists (select 1 from public.appointments where tenant_id='t_atomic' and id in ('no-consent','bad-version','bad-hash')) then
    raise exception 'FUGA: validacion fallida dejo cita';
  end if;
  raise notice 'ok · aceptacion, version, hash y forma validados';
end $$;

-- Falla DESPUES de insertar la cita: toda la transaccion debe deshacerse.
create function pg_temp.reject_test_consent() returns trigger language plpgsql as $$
begin
  if new.appointment_id='rollback-consent' then raise exception using errcode='23514', message='fallo consent fixture'; end if;
  return new;
end $$;
create trigger test_reject_consent before insert on public.consents
  for each row execute function pg_temp.reject_test_consent();
do $$
begin
  begin
    perform pg_temp.submit(jsonb_build_array(pg_temp.booking('rollback-consent','rollback@ex.mx')));
    raise exception 'FALLA: no se inyecto el fallo de consentimiento';
  exception when check_violation then
    if sqlerrm <> 'fallo consent fixture' then raise; end if;
  end;
  if exists (select 1 from public.appointments where tenant_id='t_atomic' and id='rollback-consent')
     or exists (select 1 from public.patients where tenant_id='t_atomic' and email='rollback@ex.mx')
     or exists (select 1 from public.appointment_notifications where tenant_id='t_atomic' and appointment_id='rollback-consent')
     or exists (select 1 from public.consents where tenant_id='t_atomic' and appointment_id='rollback-consent') then
    raise exception 'FUGA: el fallo de consentimiento dejo datos parciales';
  end if;
  raise notice 'ok · fallo del consentimiento deshace cita, paciente y notificacion';
end $$;
drop trigger test_reject_consent on public.consents;

-- Un lote es atomico incluso si el segundo servicio no pasa RLS.
do $$
begin
  begin
    perform pg_temp.submit(jsonb_build_array(pg_temp.booking('batch-first','batch1@ex.mx',11),
      pg_temp.booking('batch-second','batch2@ex.mx',12)||'{"service_id":"other","tenant_id":"t_atomic_other"}'::jsonb));
    raise exception 'FUGA: se acepto el servicio de otra clinica';
  exception when insufficient_privilege or foreign_key_violation then null; end;
  if exists (select 1 from public.appointments where tenant_id='t_atomic' and id='batch-first')
     or exists (select 1 from public.consents where tenant_id='t_atomic' and appointment_id='batch-first') then
    raise exception 'FUGA: la primera cita sobrevivio al lote fallido';
  end if;
  raise notice 'ok · RLS de otra clinica rechaza y deshace el lote';
end $$;

-- Exito: los campos privilegiados no los elige el navegador.
do $$
declare v_stamp timestamptz;
begin
  perform pg_temp.submit(jsonb_build_array(pg_temp.booking('atomic-ok','ok@ex.mx') ||
    '{"tenant_id":"t_atomic_other","status":"confirmed","created_at":"2100-01-01","price":0,"notes":"no guardar"}'::jsonb));
  if not exists (select 1 from public.appointments where tenant_id='t_atomic' and id='atomic-ok'
    and status='requested' and price=700 and notes='' and created_at=now()) then
    raise exception 'FUGA: campos privilegiados suministrados por cliente';
  end if;
  if (select count(*) from public.consents where tenant_id='t_atomic' and appointment_id='atomic-ok'
    and subject_email='ok@ex.mx' and accepted_at=now()
    and document_hash='3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188') <> 1 then
    raise exception 'FALLA: falta evidencia ligada a la cita';
  end if;
  begin
    perform pg_temp.submit(jsonb_build_array(pg_temp.booking('atomic-ok','ok@ex.mx')));
    raise exception 'FUGA: id repetido aceptado';
  exception when unique_violation or exclusion_violation then null; end;
  if (select count(*) from public.consents where tenant_id='t_atomic' and appointment_id='atomic-ok')<>1 then
    raise exception 'FUGA: reintento duplico consentimiento';
  end if;
  raise notice 'ok · reserva y evidencia atomicas; sin aceptar campos privilegiados ni duplicar evidencia';
end $$;
