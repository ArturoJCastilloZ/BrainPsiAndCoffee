-- ============================================================
-- 0004 · Las funciones security definer, hechas tenant-aware
--
-- Estas funciones bypassean RLS por definicion: son la via natural de
-- fuga entre tenants. Con las llaves compuestas de 0003, cada una que
-- busca 'where id = X' pasa a poder tocar filas de VARIAS clinicas,
-- porque los ids ya solo son unicos dentro de su tenant.
--
-- Dos de esos casos no son teoricos y se comprobaron al probar 0003:
--
--   · sync_patient_from_appointment insertaba pacientes SIN tenant_id
--     (toda alta de cita fallaba) y deduplicaba por email GLOBAL, es
--     decir que habria fusionado al mismo paciente de dos clinicas
--     distintas en una sola ficha. Fuga de PII entre clientes.
--
--   · sync_orders_from_appointment hacia 'update ... where
--     appointment_id = new.id' sin tenant: habria modificado pedidos
--     de OTRAS clinicas que compartieran el id.
--
-- Endurecimiento que aplica a todas: search_path acotado con pg_temp, y
-- execute revocado por defecto. Ninguna funcion que bypassee RLS debe
-- ser invocable por accidente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. sync_patient_from_appointment
--    La busqueda de paciente se acota al tenant de la cita.
-- ------------------------------------------------------------
create or replace function public.sync_patient_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_patient_id uuid;
begin
  -- El tenant sale de la FILA, no del JWT: este trigger tambien corre en
  -- backfills y tareas de service_role, donde no hay tenant activo.
  select id
  into resolved_patient_id
  from public.patients
  where tenant_id = new.tenant_id
    and lower(email) = lower(new.customer_email)
  limit 1;

  if resolved_patient_id is null then
    insert into public.patients (tenant_id, full_name, email, phone)
    values (new.tenant_id, trim(new.customer_name),
            lower(trim(new.customer_email)), trim(new.customer_phone))
    returning id into resolved_patient_id;
  else
    update public.patients
    set full_name = trim(new.customer_name),
        phone = trim(new.customer_phone),
        active = true,
        updated_at = now()
    where tenant_id = new.tenant_id
      and id = resolved_patient_id;
  end if;

  new.patient_id := resolved_patient_id;
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2 y 3. Los dos predicados que reciben un id del cliente.
--
-- Estos dos los invoca el flujo PUBLICO (anon) al pedir cafe, que por
-- definicion no tiene membresia: pedirles current_tenant_id() habria
-- devuelto null y roto el pedido publico.
--
-- El tenant sale de la FILA que se esta insertando, que ya lo trae NOT
-- NULL desde 0002 y con FK a tenants. Asi el predicado responde
-- "este pedido pertenece a la misma clinica que el renglon", que es
-- justo la pregunta correcta, y sin depender del JWT.
--
-- Se reemplaza la firma de un argumento por una de dos. Las policies que
-- las usan se reescriben mas abajo, porque Postgres no deja soltar una
-- funcion de la que una policy depende.
-- ------------------------------------------------------------
create or replace function public.appointment_can_receive_order(
  p_tenant_id text, p_appointment_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.appointments a
    where a.tenant_id = p_tenant_id
      and a.id = p_appointment_id
      and a.status <> 'cancelled'
  );
$$;

create or replace function public.order_can_receive_public_items(
  p_tenant_id text, p_order_id text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1 from public.orders o
    where o.tenant_id = p_tenant_id
      and o.id = p_order_id
      and o.order_source in ('public_menu', 'appointment')
      and o.status in ('received', 'pending_appointment')
      and o.created_at >= now() - interval '15 minutes'
  );
$$;

-- Las dos policies publicas pasan a la firma de dos argumentos, y recien
-- entonces se puede soltar la version vieja. El resto de las ~40 policies
-- se reescribe en 0005.
drop policy if exists "Public can create orders" on public.orders;
create policy "Public can create orders" on public.orders
  for insert with check (
    status in ('received', 'pending_appointment')
    and (
      (appointment_id is null and order_source = 'public_menu')
      or (
        appointment_id is not null
        and order_source = 'appointment'
        and public.appointment_can_receive_order(tenant_id, appointment_id)
      )
    )
    and total >= 0
    and subtotal >= 0
    and combo_savings >= 0
    and char_length(trim(coalesce(customer_name, ''))) between 2 and 120
    and coalesce(customer_phone, '') ~ '^[0-9+(). -]{8,20}$'
    and char_length(coalesce(operational_notes, '')) <= 280
  );

drop policy if exists "Public can create order items" on public.order_items;
create policy "Public can create order items" on public.order_items
  for insert with check (
    quantity > 0
    and unit_price >= 0
    and char_length(trim(name)) between 1 and 160
    and public.order_can_receive_public_items(tenant_id, order_id)
  );

drop function if exists public.appointment_can_receive_order(text);
drop function if exists public.order_can_receive_public_items(text);

-- ------------------------------------------------------------
-- 4. prepare_order_operational_fields
--    Leia la cita por id suelto: podia tomar la fecha de la cita
--    homonima de otra clinica y calcular mal el target_ready_at.
-- ------------------------------------------------------------
create or replace function public.prepare_order_operational_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  appointment_record record;
begin
  if new.appointment_id is not null then
    select appointment_date, appointment_time, status
    into appointment_record
    from public.appointments
    where tenant_id = new.tenant_id
      and id = new.appointment_id;

    new.order_source := 'appointment';

    if new.target_ready_at is null and appointment_record.appointment_date is not null then
      new.target_ready_at := public.order_target_from_appointment(
        appointment_record.appointment_date, appointment_record.appointment_time);
    end if;

    if new.status = 'received' then
      new.status := case
        when appointment_record.status = 'cancelled' then 'cancelled'
        else 'pending_appointment'
      end;
    end if;
  elsif new.order_source is null then
    new.order_source := 'public_menu';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 5. sync_orders_from_appointment
--    El update cruzaba tenants. Es escritura, no lectura: el caso mas
--    grave de los nueve.
-- ------------------------------------------------------------
create or replace function public.sync_orders_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.orders
  set target_ready_at = public.order_target_from_appointment(
        new.appointment_date, new.appointment_time),
      status = case
        when new.status = 'cancelled' and status not in ('delivered', 'cancelled') then 'cancelled'
        when old.status = 'cancelled' and new.status <> 'cancelled' and status = 'cancelled' then 'pending_appointment'
        else status
      end,
      updated_at = now()
  where tenant_id = new.tenant_id
    and appointment_id = new.id;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- 6. queue_appointment_notification
--    Encolaba la notificacion sin tenant_id. Con 0002 eso ya falla por
--    NOT NULL, pero el riesgo de fondo es peor que un error: esta fila
--    lleva nombre, correo y telefono del paciente y termina en un envio.
--    Un tenant equivocado aqui manda los datos del paciente de una
--    clinica al destinatario de otra — una fuga que sale del sistema.
-- ------------------------------------------------------------
create or replace function public.queue_appointment_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event text;
begin
  if tg_op = 'INSERT' then
    event := 'created';
  elsif tg_op = 'UPDATE' then
    if new.status = 'cancelled' and old.status is distinct from new.status then
      event := 'cancelled';
    elsif old.appointment_date is distinct from new.appointment_date
      or old.appointment_time is distinct from new.appointment_time then
      event := 'rescheduled';
    elsif old.service_id is distinct from new.service_id
      or old.therapist_id is distinct from new.therapist_id
      or old.status is distinct from new.status
      or old.wants_coffee is distinct from new.wants_coffee then
      event := 'updated';
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.appointment_notifications (
    tenant_id, appointment_id, event_type, delivery_channel,
    recipient_email, recipient_phone, recipient_name, therapist_id, payload
  ) values (
    new.tenant_id, new.id, event, 'email',
    new.customer_email, new.customer_phone, new.customer_name, new.therapist_id,
    jsonb_build_object(
      'tenant_id', new.tenant_id,
      'appointment_id', new.id,
      'event_type', event,
      'service_id', new.service_id,
      'therapist_id', new.therapist_id,
      'appointment_date', new.appointment_date,
      'appointment_time', new.appointment_time,
      'status', new.status,
      'wants_coffee', new.wants_coffee
    )
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 7. record_audit_entry
--    Debe ESTAMPAR el tenant, no filtrarlo. Se toma de la fila auditada
--    cuando existe; si no, del tenant activo. Puede quedar null y esta
--    bien: audit_log lo acepta a proposito (0002).
-- ------------------------------------------------------------
create or replace function public.record_audit_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
  v_tenant text;
begin
  v_row := to_jsonb(coalesce(new, old));
  v_tenant := coalesce(v_row ->> 'tenant_id', public.current_tenant_id());

  insert into public.audit_log (
    tenant_id, actor_user_id, actor_role, action, table_name, record_id
  ) values (
    v_tenant,
    auth.uid(),
    coalesce(public.current_tenant_role(), 'anon'),
    tg_op,
    tg_table_name,
    v_row ->> 'id'
  );
  return coalesce(new, old);
end $$;

-- ------------------------------------------------------------
-- 8. log_clinical_note_access
--    Recibe un note_id del cliente. Debe rechazar notas de otra clinica
--    ANTES de registrar nada: si no, el propio acto de auditar confirma
--    que la nota ajena existe.
-- ------------------------------------------------------------
create or replace function public.log_clinical_note_access(note_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_patient uuid;
  v_tenant  text;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    return;
  end if;

  select patient_id into v_patient
  from public.appointment_notes
  where tenant_id = v_tenant
    and id = note_id;

  if v_patient is null then
    return;
  end if;

  insert into public.audit_log (
    tenant_id, actor_user_id, actor_role, action, table_name, record_id, patient_id
  ) values (
    v_tenant, auth.uid(), coalesce(public.current_tenant_role(), 'anon'),
    'READ', 'appointment_notes', note_id::text, v_patient
  );
end $$;

-- ------------------------------------------------------------
-- 9. resolve_login_identifier
--    Pre-autenticacion: por definicion corre sin tenant, asi que no se
--    le puede pedir current_tenant_id(). La Fase 1 ya le revoco execute
--    a anon. Aqui solo se acota el search_path; su superficie se revisa
--    de nuevo cuando exista el selector de clinica, porque no debe
--    revelar en que clinicas existe un correo.
-- ------------------------------------------------------------
alter function public.resolve_login_identifier(text) set search_path = public, pg_temp;

-- ------------------------------------------------------------
-- Execute revocado por defecto en las invocables directamente.
-- Las de trigger no se otorgan a nadie: las llama el motor.
-- ------------------------------------------------------------
revoke all on function public.appointment_can_receive_order(text, text) from public, anon;
revoke all on function public.order_can_receive_public_items(text, text) from public, anon;
revoke all on function public.log_clinical_note_access(uuid) from public, anon;

-- El flujo publico de cafe las necesita; log_clinical_note_access no.
grant execute on function public.appointment_can_receive_order(text, text) to authenticated, anon;
grant execute on function public.order_can_receive_public_items(text, text) to authenticated, anon;
grant execute on function public.log_clinical_note_access(uuid) to authenticated;
