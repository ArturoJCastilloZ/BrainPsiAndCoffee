-- 0036 · La reserva publica es una SOLICITUD que la clinica confirma.
--
-- Decision de producto (2026-10-09). Antes la web guardaba la cita como
-- 'confirmed' y la pantalla le decia al paciente "puedes confirmarla por
-- WhatsApp": el dato y el texto se contradecian, y cualquiera podia llenar
-- la agenda de citas "confirmadas" sin que nadie las revisara.
--
-- Ahora:
--   · Toda cita que entra SIN SESION nace 'requested' (Por confirmar), la
--     mande como la mande el cliente. Lo impone la base, no la pantalla.
--   · La solicitud aparta el horario: nadie mas puede tomarlo mientras la
--     clinica decide (el EXCLUDE de 0017 ya cuenta todo lo no cancelado).
--   · Si en 24 horas nadie la confirma, deja de apartarlo: se cancela
--     antes de que entre la siguiente reserva. Sin pg_cron: el unico
--     momento en que una solicitud vencida estorba es cuando otra cita
--     quiere su lugar, y ahi se libera.
--   · Confirmar (-> 'confirmed') o rechazar (-> 'cancelled') es del staff;
--     al cancelarse, el pedido de cafe ligado se cancela solo (0004).

-- ------------------------------------------------------------
-- 1 · El estado nuevo
-- ------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.appointments'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.appointments drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.appointments
  add constraint appointments_status_check
  check (status in ('requested', 'confirmed', 'completed', 'cancelled'));

comment on column public.appointments.status is
  'requested = solicitud de la web, por confirmar (aparta el horario 24 h); confirmed; completed; cancelled.';

-- ------------------------------------------------------------
-- 2 · Las solicitudes vencidas dejan de apartar el horario
--
-- Definer porque quien reserva es anonimo y no puede actualizar citas
-- ajenas. Solo toca solicitudes de MAS de 24 h de ESA clinica, y solo
-- para cancelarlas: no lee ni devuelve nada.
-- ------------------------------------------------------------
create or replace function public.expire_stale_booking_requests(p_tenant_id text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.appointments
     set status = 'cancelled', updated_at = now()
   where tenant_id = p_tenant_id
     and status = 'requested'
     and created_at < now() - interval '24 hours';
$$;
revoke all on function public.expire_stale_booking_requests(text) from public;
grant execute on function public.expire_stale_booking_requests(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 3 · La regla, en el alta
--
-- Invoker a proposito: current_user es el rol de la peticion, y 'anon'
-- es exactamente "sin sesion" (asi lo fija PostgREST). Un definer veria
-- al dueño de la funcion y no podria distinguirlo.
-- ------------------------------------------------------------
create or replace function public.apply_booking_request_rules()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user = 'anon' then
    new.status := 'requested';
  end if;
  perform public.expire_stale_booking_requests(new.tenant_id);
  return new;
end $$;

drop trigger if exists apply_booking_request_rules on public.appointments;
create trigger apply_booking_request_rules
  before insert on public.appointments
  for each row execute function public.apply_booking_request_rules();

-- ------------------------------------------------------------
-- 4 · La policy de alta publica pide 'requested'
--
-- La de 0017 exigia status = 'confirmed'. El trigger de arriba corre
-- ANTES de que se evalue el WITH CHECK, asi que con la policy vieja toda
-- reserva publica se rechazaria. Es la misma policy, con ese unico cambio.
-- ------------------------------------------------------------
drop policy if exists "Public can create appointments" on public.appointments;
create policy "Public can create appointments" on public.appointments
  for insert with check (
    tenant_id = public.current_request_tenant()
    and status = 'requested'
    and char_length(trim(customer_name)) between 2 and 120
    and customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and customer_phone ~ '^[0-9+(). -]{8,20}$'
    and char_length(coalesce(notes, '')) <= 280
    and exists (
      select 1 from public.therapy_services s
      where s.tenant_id = appointments.tenant_id
        and s.id = appointments.service_id
        and s.active = true
    )
    and therapist_id is not null
    and exists (
      select 1 from public.therapists_public t
      where t.tenant_id = appointments.tenant_id
        and t.id = appointments.therapist_id
    )
    and public.fits_in_schedule(tenant_id, therapist_id, appointment_date,
                                appointment_time, duration_minutes)
    and public.within_booking_window(tenant_id, therapist_id, appointment_date,
                                     appointment_time)
  );
