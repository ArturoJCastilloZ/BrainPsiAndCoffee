-- ============================================================
-- 0017 · El motor respeta horario y buffer
--
-- Dos cosas que hasta ahora la base no sabia:
--
--   · el EXCLUDE de la Fase 1 solo cubre duracion, asi que dos citas
--     pegadas sin descanso pasaban aunque la interfaz no las ofreciera.
--     Un constraint que no cubre el buffer deja el descanso a merced de
--     que nadie escriba por API directa;
--   · la policy de alta publica comparaba contra '09:00', '19:00' e
--     isodow 2-6 fijos, asi que habria rechazado lo que un consultorio
--     con otro horario ofreciera en su propia pagina.
-- ============================================================

-- ------------------------------------------------------------
-- El buffer se copia A LA CITA al crearla.
--
-- Se denormaliza a proposito: una columna generada no puede leer otra
-- tabla, y el EXCLUDE necesita el rango completo. Ademas congela el
-- acuerdo del momento — cambiar el buffer del terapeuta manana no debe
-- mover las citas ya agendadas ni volverlas invalidas.
-- ------------------------------------------------------------
alter table public.appointments
  add column if not exists buffer_before_minutes integer not null default 0,
  add column if not exists buffer_after_minutes  integer not null default 0;

comment on column public.appointments.buffer_after_minutes is
  'Copiado del terapeuta al crear la cita. Las citas anteriores a 0017 quedan en 0: aplicar el buffer retroactivamente las volveria conflictivas entre si.';

create or replace function public.apply_therapist_buffers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_antes integer;
  v_despues integer;
begin
  -- Solo al crear: en un update se respeta lo que ya quedo pactado.
  if tg_op = 'INSERT' and new.therapist_id is not null then
    select t.buffer_before_minutes, t.buffer_after_minutes
      into v_antes, v_despues
    from public.therapists t
    where t.tenant_id = new.tenant_id and t.id = new.therapist_id;

    new.buffer_before_minutes := coalesce(v_antes, 0);
    new.buffer_after_minutes  := coalesce(v_despues, 0);
  end if;
  return new;
end $$;

drop trigger if exists apply_therapist_buffers on public.appointments;
create trigger apply_therapist_buffers
  before insert on public.appointments
  for each row execute function public.apply_therapist_buffers();

-- ------------------------------------------------------------
-- El rango ocupado pasa a incluir el buffer.
--
-- Hay que soltar el EXCLUDE para poder redefinir la columna generada, y
-- volver a crearlo despues.
-- ------------------------------------------------------------
alter table public.appointments drop constraint if exists appointments_no_overlap;
alter table public.appointments drop column if exists slot;

alter table public.appointments
  add column slot tsrange generated always as (
    tsrange(
      (appointment_date + appointment_time) - make_interval(mins => buffer_before_minutes),
      (appointment_date + appointment_time)
        + make_interval(mins => coalesce(duration_minutes, 50) + buffer_after_minutes),
      '[)'
    )
  ) stored;

comment on column public.appointments.slot is
  'Rango que la cita OCUPA de verdad: duracion mas los buffers. Es lo que el EXCLUDE compara.';

do $$
declare
  v_conflictos integer;
  v_detalle text;
begin
  -- Como en la Fase 1: si el nuevo rango deja citas encimadas, se nombran
  -- y se detiene, en vez de dejar la tabla sin proteccion en silencio.
  select count(*), string_agg(
      format('%s vs %s (tenant %s, terapeuta %s, %s)',
             a.id, b.id, a.tenant_id, a.therapist_id, a.appointment_date),
      E'\n  ' order by a.appointment_date)
    into v_conflictos, v_detalle
  from public.appointments a
  join public.appointments b
    on a.tenant_id = b.tenant_id
   and a.therapist_id = b.therapist_id
   and a.id < b.id
   and a.slot && b.slot
  where a.status <> 'cancelled' and b.status <> 'cancelled'
    and a.therapist_id is not null;

  if v_conflictos > 0 then
    raise exception E'Con el buffer incluido quedan % citas encimadas. Recalendarizalas antes de aplicar:\n  %',
      v_conflictos, v_detalle;
  end if;

  alter table public.appointments
    add constraint appointments_no_overlap
    exclude using gist (
      tenant_id with =,
      therapist_id with =,
      slot with &&
    ) where (status <> 'cancelled' and therapist_id is not null);
end $$;

-- ------------------------------------------------------------
-- ¿Cae esta cita dentro del horario del terapeuta?
--
-- Va en security definer para que la policy publica pueda preguntarlo sin
-- que el visitante lea therapist_schedules: cuando trabaja alguien es
-- informacion sobre su vida, no solo sobre el negocio. La funcion
-- responde si/no y no revela la agenda.
--
-- Exige que el bloque cubra la cita COMPLETA, no solo su inicio: una cita
-- de 50 minutos a las 18:40 termina a las 19:30, fuera del horario.
-- ------------------------------------------------------------
create or replace function public.fits_in_schedule(
  p_tenant_id    text,
  p_therapist_id text,
  p_date         date,
  p_time         time,
  p_duration     integer
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.therapist_schedules s
    where s.tenant_id = p_tenant_id
      and s.therapist_id = p_therapist_id
      and s.active
      and s.weekday = extract(dow from p_date)
      and p_time >= s.start_time
      and (p_time + make_interval(mins => coalesce(p_duration, 50))) <= s.end_time
  );
$$;

revoke all on function public.fits_in_schedule(text, text, date, time, integer) from public;
grant execute on function public.fits_in_schedule(text, text, date, time, integer) to anon, authenticated;

-- Ventana de reserva y anticipacion minima del terapeuta, tambien como
-- funcion para no publicar la tabla.
create or replace function public.within_booking_window(
  p_tenant_id    text,
  p_therapist_id text,
  p_date         date,
  p_time         time
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.therapists t
    where t.tenant_id = p_tenant_id
      and t.id = p_therapist_id
      and p_date <= current_date + t.booking_window_days
      and ((p_date + p_time) at time zone t.timezone)
            >= now() + make_interval(mins => t.minimum_notice_minutes)
  );
$$;

revoke all on function public.within_booking_window(text, text, date, time) from public;
grant execute on function public.within_booking_window(text, text, date, time) to anon, authenticated;

-- ------------------------------------------------------------
-- La policy publica deja de tener el horario escrito adentro.
-- ------------------------------------------------------------
drop policy if exists "Public can create appointments" on public.appointments;
create policy "Public can create appointments" on public.appointments
  for insert with check (
    tenant_id = public.current_request_tenant()
    and status = 'confirmed'
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
    -- El terapeuta deja de ser opcional en el alta publica: sin el no hay
    -- horario contra que validar, y "cualquiera" tendria que resolverse
    -- antes de insertar, no despues.
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
