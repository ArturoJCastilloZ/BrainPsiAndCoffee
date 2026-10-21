-- Solo la RPC publica puede escribir reservas y evidencia.
-- Su dueño no tiene login, BYPASSRLS ni propiedad de las tablas.
-- Hereda las policies/lecturas anonimas, nunca permisos de authenticated.
create role bpc_booking_writer nologin inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant anon to bpc_booking_writer;
grant usage on schema public to bpc_booking_writer;
grant insert on public.appointments, public.consents to bpc_booking_writer;
revoke insert on public.appointments, public.consents from public, anon;

create or replace function public.booking_server_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated', 'bpc_booking_writer') then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

create or replace function public.apply_booking_request_rules()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'bpc_booking_writer') then
    -- Serializa el conteo y el INSERT de solicitudes de la misma clinica.
    -- Una segunda transaccion espera el commit/rollback de la primera.
    perform pg_advisory_xact_lock(hashtextextended(new.tenant_id, 42));
    new.status := 'requested';
  end if;
  perform public.expire_stale_booking_requests(new.tenant_id);
  if current_user in ('anon', 'bpc_booking_writer') then
    perform public.check_booking_request_limits(new.tenant_id, new.customer_email, new.customer_phone);
  end if;
  return new;
end $$;
create or replace function public.create_public_booking(
  p_appointments jsonb,
  p_privacy_accepted boolean,
  p_document_version text,
  p_document_hash text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text := public.current_request_tenant();
  v_booking record;
begin
  if current_setting('role', true) is distinct from 'anon'
     or auth.uid() is not null or v_tenant is null then
    raise exception using errcode = '42501', message = 'La reserva publica requiere una clinica activa.';
  end if;
  if p_privacy_accepted is distinct from true then
    raise exception using errcode = '23514', message = 'Acepta el aviso de privacidad antes de reservar.';
  end if;
  -- Version y hash publicados en src/legal/avisoPrivacidad.mjs.
  -- Un cambio del aviso requiere una NUEVA migracion y despliegue antes
  -- del frontend: no aceptar una version arbitraria elegida por cliente.
  if p_document_version is distinct from '2026-10-borrador-2'
     or p_document_hash is distinct from '3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188' then
    raise exception using errcode = '23514', message = 'El aviso de privacidad cambio. Recarga la pagina antes de reservar.';
  end if;
  if jsonb_typeof(p_appointments) is distinct from 'array' then
    raise exception using errcode = '23514', message = 'La solicitud de reserva no es valida.';
  end if;
  if jsonb_array_length(p_appointments) not between 1 and 2 then
    raise exception using errcode = '23514', message = 'Envia una o dos solicitudes por vez.';
  end if;

  for v_booking in
    select * from jsonb_to_recordset(p_appointments) as b(
      id text, service_id text, therapist_id text, appointment_date date,
      appointment_time time, customer_name text, customer_email text,
      customer_phone text, for_minor boolean, patient_name text,
      location_id text, wants_coffee boolean, duration_minutes integer
    )
  loop
    -- Lista explicita: no se aceptan patient_id, tenant_id, precios,
    -- estados, notas clinicas ni sellos temporales suministrados por API.
    insert into public.appointments (
      tenant_id, id, service_id, therapist_id, appointment_date,
      appointment_time, customer_name, customer_email, customer_phone,
      for_minor, patient_name, location_id, wants_coffee, duration_minutes,
      status, notes
    ) values (
      v_tenant, v_booking.id, v_booking.service_id, v_booking.therapist_id,
      v_booking.appointment_date, v_booking.appointment_time,
      btrim(v_booking.customer_name), btrim(v_booking.customer_email),
      btrim(v_booking.customer_phone), coalesce(v_booking.for_minor, false),
      v_booking.patient_name, v_booking.location_id,
      coalesce(v_booking.wants_coffee, false), v_booking.duration_minutes,
      'requested', ''
    );

    insert into public.consents (
      tenant_id, appointment_id, subject_email, consent_type,
      document_version, document_hash, user_agent, evidence
    ) values (
      v_tenant, v_booking.id, btrim(v_booking.customer_email), 'privacy_notice',
      p_document_version, p_document_hash, left(p_user_agent, 400),
      jsonb_build_object('source', 'booking_flow', 'recorded_by', 'create_public_booking')
    );
  end loop;
end $$;

-- Solo durante el cambio de propietario, dentro de la transacción del runner.
grant bpc_booking_writer to current_user;
grant create on schema public to bpc_booking_writer;
alter function public.create_public_booking(jsonb, boolean, text, text, text) owner to bpc_booking_writer;
revoke create on schema public from bpc_booking_writer;
revoke bpc_booking_writer from current_user;
revoke all on function public.create_public_booking(jsonb, boolean, text, text, text) from public, authenticated, anon;
grant execute on function public.create_public_booking(jsonb, boolean, text, text, text) to anon;
