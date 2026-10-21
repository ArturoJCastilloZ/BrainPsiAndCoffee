-- Reserva y evidencia de privacidad en una unica llamada/transaccion.
-- INVOKER: conserva RLS, las restricciones de agenda y la prohibicion
-- de leer citas para anon. No recibe tenant ni devuelve filas privadas.
create function public.create_public_booking(
  p_appointments jsonb,
  p_privacy_accepted boolean,
  p_document_version text,
  p_document_hash text,
  p_user_agent text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_tenant text := public.current_request_tenant();
  v_booking record;
begin
  if current_user <> 'anon' or v_tenant is null then
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

revoke all on function public.create_public_booking(jsonb, boolean, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_public_booking(jsonb, boolean, text, text, text) to anon;
