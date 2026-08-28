-- Llaves compuestas (0003) y funciones security definer (0004).
-- Depende de los tests anteriores: ya existen brainpsi, t_beta,
-- los pacientes 'ana@ex.mx' y los terapeutas psq-1 / psq-7.

do $$
declare v_n integer; v_status text;
begin
  -- Ids legibles, unicos solo DENTRO de su clinica.
  insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
    ('brainpsi','s80','Valoracion',80,1500),
    ('t_beta',  's80','Valoracion Beta',80,1600);
  insert into public.therapists (tenant_id,id,name) values ('t_beta','psq-9','Dra. Luz');

  -- Nota: appointments.patient_id NO sirve para probar la FK compuesta.
  -- El trigger sync_patient_from_appointment corre BEFORE y sobrescribe
  -- new.patient_id con el paciente del tenant de la fila, asi que la FK
  -- nunca llega a ver el valor ajeno. El ataque queda neutralizado, pero
  -- por el trigger, no por la llave. Se prueba donde SI es observable.

  -- Alta legitima: dispara sync_patient_from_appointment y
  -- queue_appointment_notification, las dos security definer que
  -- insertaban sin tenant_id.
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
  values ('brainpsi','x1','s80','psq-1','2026-10-15','09:00','Ana Ruiz','ana@ex.mx','5512345678',80);

  -- El paciente NO se fusiono con su homonimo de la otra clinica.
  select count(*) into v_n from public.patients where email='ana@ex.mx';
  if v_n <> 2 then
    raise exception 'FUGA: los pacientes de dos clinicas se fusionaron (% filas)', v_n;
  end if;

  select count(*) into v_n from public.appointment_notifications
    where tenant_id='brainpsi' and recipient_email='ana@ex.mx';
  if v_n <> 1 then
    raise exception 'FALLA: la notificacion no se encolo con su tenant (% filas)', v_n;
  end if;

  -- El MISMO id de cita puede existir en la otra clinica.
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
  values ('t_beta','x1','s80','psq-9','2026-10-15','09:00','Beto','beto@ex.mx','5512345679',80);

  -- sync_orders_from_appointment hacia un update SIN tenant: habria
  -- tocado el pedido de la otra clinica que comparte appointment_id.
  insert into public.orders (tenant_id,id,appointment_id,customer_name,customer_phone,total)
  values ('brainpsi','o1','x1','Ana','5512345678',100),
         ('t_beta',  'o1','x1','Beto','5512345679',200);

  update public.appointments set status='cancelled' where tenant_id='brainpsi' and id='x1';

  select status into v_status from public.orders where tenant_id='t_beta' and id='o1';
  if v_status <> 'pending_appointment' then
    raise exception 'FUGA: cancelar una cita modifico el pedido de otra clinica (status=%)', v_status;
  end if;
  select status into v_status from public.orders where tenant_id='brainpsi' and id='o1';
  if v_status <> 'cancelled' then
    raise exception 'FALLA: el pedido propio no se cancelo (status=%)', v_status;
  end if;

  -- ATAQUE sobre la FK compuesta, en la tabla mas sensible: un encuentro
  -- de una clinica apuntando al paciente de otra. Imposible a nivel del
  -- motor, no de las policies.
  insert into auth.users (id, email)
    values ('44444444-4444-4444-4444-444444444444','doc.fk@ex.mx');
  begin
    insert into public.encounters (tenant_id, patient_id, therapist_id)
    values ('brainpsi',
      (select id from public.patients where tenant_id='t_beta' and email='ana@ex.mx'),
      'psq-1');
    raise exception 'FUGA: un encuentro apunto al paciente de otra clinica';
  exception when foreign_key_violation then null;
  end;

  -- Y el mismo encuentro, dentro de su clinica, SI debe poder crearse.
  insert into public.encounters (tenant_id, patient_id, therapist_id)
  values ('brainpsi',
    (select id from public.patients where tenant_id='brainpsi' and email='ana@ex.mx'),
    'psq-1');

  raise notice 'ok · llaves compuestas y security definer por tenant';
end $$;

-- EXCLUDE de solapamiento: debe seguir bloqueando dentro de la clinica,
-- y NO bloquear entre clinicas que comparten el id de terapeuta.
do $$
begin
  begin
    insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
      appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
    values ('t_beta','x2','s80','psq-9','2026-10-15','09:30','C','c@ex.mx','5512345670',80);
    raise exception 'FALLA: acepto una cita encimada en la misma clinica';
  exception when exclusion_violation then null;
  end;

  insert into public.therapists (tenant_id,id,name) values ('brainpsi','psq-9','Dr. Otro');
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
  values ('brainpsi','x3','s80','psq-9','2026-10-15','09:30','D','d@ex.mx','5512345671',80);

  raise notice 'ok · solapamiento bloqueado por clinica, no entre clinicas';
end $$;
