-- 0038 · Citas para una niña o un niño, y horarios ocupados para la
--        reserva publica (auditoria 2026-10-09, seccion 5 · Reserva).
--
-- 1 · "¿Para quien es la cita?"
--
-- La mitad del catalogo es infantil y la reserva solo sabia de UNA
-- persona: quien llenaba el formulario. Una mamá que pedia cita para su
-- hijo quedaba registrada como la paciente, y el expediente (NOM-004)
-- nacia a nombre de la persona equivocada.
--
-- Y no bastaba con dejarla escribir el nombre del niño: el paciente se
-- identifica por correo (patients_email_unique) y el menor no tiene uno
-- propio. Su ficha lleva el correo y el telefono del adulto responsable,
-- que es a quien se contacta, y se distingue por ser menor y por su
-- nombre:
--
--   · adulto: unico por (clinica, correo)              — como antes;
--   · menor:  unico por (clinica, correo, nombre)      — hermanos con la
--             misma mamá son fichas distintas, y la de la mamá tambien.
--
-- La cita guarda for_minor y patient_name; customer_* sigue siendo quien
-- reserva (el adulto responsable).
--
-- 2 · Horarios ocupados
--
-- El visitante no puede leer appointments (son datos de pacientes), asi
-- que la reserva publica ofrecia como libres horarios ya tomados y el
-- choque solo aparecia al enviar. busy_slots devuelve los RANGOS ocupados
-- de la clinica que se visita — terapeuta, fecha, hora y duracion — sin
-- un solo dato de quien los ocupa. Es lo mismo que cualquier agenda en
-- linea deja ver al marcar un horario como no disponible.

-- ------------------------------------------------------------
-- 1a · El paciente menor
-- ------------------------------------------------------------
alter table public.patients
  add column if not exists is_minor boolean not null default false,
  add column if not exists guardian_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'patients_guardian_name_length') then
    alter table public.patients
      add constraint patients_guardian_name_length
      check (guardian_name is null or char_length(btrim(guardian_name)) between 2 and 120);
  end if;
end $$;

comment on column public.patients.is_minor is
  'Paciente menor de edad. Su email y phone son los del adulto responsable (guardian_name).';

-- El indice unico deja de cubrir a los menores; ellos tienen el suyo.
drop index if exists public.patients_email_unique;
create unique index patients_email_unique
  on public.patients (tenant_id, lower(email)) where not is_minor;
create unique index if not exists patients_minor_unique
  on public.patients (tenant_id, lower(email), lower(btrim(full_name))) where is_minor;

-- ------------------------------------------------------------
-- 1b · La cita sabe para quien es
-- ------------------------------------------------------------
alter table public.appointments
  add column if not exists for_minor boolean not null default false,
  add column if not exists patient_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_minor_patient_name') then
    alter table public.appointments
      add constraint appointments_minor_patient_name
      check (
        (not for_minor and patient_name is null)
        or (for_minor and char_length(btrim(patient_name)) between 2 and 120)
      );
  end if;
end $$;

comment on column public.appointments.patient_name is
  'Nombre del menor cuando for_minor. customer_name es entonces el adulto responsable.';

-- ------------------------------------------------------------
-- 1c · El trigger que liga la cita con su paciente. Funcion ENTERA otra
--      vez; la regla de 0034 se conserva: un paciente que ya existe se
--      ENLAZA y nada mas, y solo el staff administrativo propaga
--      correcciones a la ficha.
-- ------------------------------------------------------------
create or replace function public.sync_patient_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_patient_id uuid;
  v_staff boolean := public.current_tenant_role() in ('owner', 'admin_consultorio')
                     and public.current_tenant_id() = new.tenant_id;
begin
  -- El trigger corre ANTES que los check: sin esto, una cita de menor sin
  -- nombre intentaria crear una ficha con full_name nulo y el error seria
  -- un not-null criptico en patients, no la regla de la cita.
  if new.for_minor and char_length(btrim(coalesce(new.patient_name, ''))) < 2 then
    raise exception using errcode = '23514',
      message = 'Escribe el nombre de la niña o el niño para quien es la cita.';
  end if;

  if new.for_minor then
    select id into resolved_patient_id
    from public.patients
    where tenant_id = new.tenant_id
      and is_minor
      and lower(email) = lower(new.customer_email)
      and lower(btrim(full_name)) = lower(btrim(new.patient_name))
    limit 1;

    if resolved_patient_id is null then
      insert into public.patients (tenant_id, full_name, email, phone, is_minor, guardian_name)
      values (new.tenant_id, btrim(new.patient_name), lower(btrim(new.customer_email)),
              btrim(new.customer_phone), true, btrim(new.customer_name))
      returning id into resolved_patient_id;
    elsif v_staff then
      -- El nombre del menor es la llave de su ficha: no se reescribe desde
      -- una cita. Lo que si se corrige es como contactar al adulto.
      update public.patients
      set phone = btrim(new.customer_phone),
          guardian_name = btrim(new.customer_name),
          updated_at = now()
      where tenant_id = new.tenant_id and id = resolved_patient_id;
    end if;
  else
    -- Los menores comparten correo con su adulto: sin "not is_minor", la
    -- cita de la mamá se ligaria a la ficha de su hijo.
    select id into resolved_patient_id
    from public.patients
    where tenant_id = new.tenant_id
      and not is_minor
      and lower(email) = lower(new.customer_email)
    limit 1;

    if resolved_patient_id is null then
      insert into public.patients (tenant_id, full_name, email, phone)
      values (new.tenant_id, btrim(new.customer_name),
              lower(btrim(new.customer_email)), btrim(new.customer_phone))
      returning id into resolved_patient_id;
    elsif v_staff then
      update public.patients
      set full_name = btrim(new.customer_name),
          phone = btrim(new.customer_phone),
          updated_at = now()
      where tenant_id = new.tenant_id and id = resolved_patient_id;
    end if;
  end if;

  new.patient_id := resolved_patient_id;
  new.updated_at := now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- 2 · Rangos ocupados, sin datos de pacientes
-- ------------------------------------------------------------
create or replace function public.busy_slots(p_from date, p_days integer default 42)
returns table (
  therapist_id text,
  appointment_date date,
  appointment_time time,
  duration_minutes integer,
  buffer_before_minutes integer,
  buffer_after_minutes integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.therapist_id, a.appointment_date, a.appointment_time,
         coalesce(a.duration_minutes, 50), a.buffer_before_minutes, a.buffer_after_minutes
  from public.appointments a
  where a.tenant_id = coalesce(public.current_tenant_id(), public.current_request_tenant())
    and a.therapist_id is not null
    and a.status <> 'cancelled'
    -- Misma regla que expire_stale_booking_requests (0036): una
    -- solicitud de mas de 24 horas ya no aparta.
    and not (a.status = 'requested' and a.created_at < now() - interval '24 hours')
    -- Ventana acotada: nadie necesita la agenda de todo el año, y una
    -- consulta sin tope es una forma barata de cargar la base.
    and a.appointment_date >= greatest(p_from, current_date - 1)
    and a.appointment_date < greatest(p_from, current_date - 1) + least(greatest(coalesce(p_days, 42), 1), 62);
$$;

comment on function public.busy_slots(date, integer) is
  'Rangos ocupados de la clinica visitada, para la reserva publica. NUNCA agregar datos del paciente.';

revoke all on function public.busy_slots(date, integer) from public;
grant execute on function public.busy_slots(date, integer) to anon, authenticated;

-- ------------------------------------------------------------
-- 3 · Las reglas de agenda, en la vista publica
--
-- El visitante calculaba sus horarios con los valores por defecto del
-- front (aviso minimo 0, descanso 30) porque la vista no traia los del
-- especialista. La base usa los reales —aviso minimo de 24 h por
-- defecto—, asi que se le ofrecian horarios de HOY que el WITH CHECK
-- rechazaba con un error generico al enviar.
--
-- Son reglas de agenda, no datos personales. Se agregan AL FINAL: la
-- policy de alta publica depende de la vista y 'create or replace' solo
-- admite columnas nuevas al final. El contrato de 0007 (sin email,
-- cedula ni user_id) se conserva.
-- ------------------------------------------------------------
create or replace view public.therapists_public
with (security_invoker = false) as
  select tenant_id, id, name, specialty, color, session_duration_minutes,
         active, created_at,
         buffer_before_minutes, buffer_after_minutes, slot_interval_minutes,
         minimum_notice_minutes, booking_window_days
  from public.therapists
  where active = true
    and tenant_id = public.current_request_tenant();

comment on view public.therapists_public is
  'Proyeccion publica de terapeutas, acotada al tenant que se visita. NUNCA agregar email, cedula ni user_id.';
