-- ============================================================
-- 0016 · Horario y preferencias de agenda, por terapeuta
--
-- Hasta ahora los dias (martes a sabado) y el horario (9 a 19) estaban
-- FIJOS en dos lugares: el front (isBusinessDay) y la policy de alta
-- publica. Como SaaS eso obliga a toda clinica al horario de esta.
--
-- No hay normativa mexicana que fije duraciones ni horarios de consulta
-- —verificado sobre el texto completo de la NOM-004-SSA3-2012, que
-- regula el expediente y no menciona minutos— asi que el sistema no debe
-- imponer un valor "de norma": lo configura cada consultorio.
--
-- Los campos siguen el estandar de facto de Cal.com, Calendly, Acuity,
-- SimplePractice y Jane, que coinciden en el mismo nucleo. Todo en
-- minutos enteros; la ventana futura en dias.
--
-- Diseno: ~/.claude/plans/brainpsi-agenda-configurable-diseno.md
-- ============================================================

-- ------------------------------------------------------------
-- Cuando trabaja cada terapeuta.
--
-- Bloques semanales recurrentes. Varios bloques el mismo dia resuelven la
-- comida sin un campo especial: 09:00-14:00 y 15:00-19:00 dejan fuera la
-- hora de comer por construccion, y ademas permiten agendas partidas que
-- un solo par inicio/fin no puede expresar.
-- ------------------------------------------------------------
create table if not exists public.therapist_schedules (
  tenant_id    text not null default coalesce(public.current_tenant_id(),
                                              public.current_request_tenant()),
  id           uuid not null default gen_random_uuid(),
  therapist_id text not null,
  -- 0 = domingo, como getDay() en JavaScript y dow en Postgres. Se elige
  -- ese origen y no isodow para no traducir en cada lectura del front.
  weekday      smallint not null check (weekday between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint therapist_schedules_tenant_fk
    foreign key (tenant_id) references public.tenants(id) on delete restrict,
  constraint therapist_schedules_therapist_fk
    foreign key (tenant_id, therapist_id) references public.therapists(tenant_id, id)
    on delete cascade,
  constraint therapist_schedules_rango check (end_time > start_time)
);

comment on table public.therapist_schedules is
  'Bloques semanales de trabajo por terapeuta. Varios por dia expresan agendas partidas y la hora de comida.';

create index if not exists therapist_schedules_lookup_idx
  on public.therapist_schedules (tenant_id, therapist_id, weekday) where active;

-- ------------------------------------------------------------
-- Preferencias de agenda del terapeuta.
--
-- La DURACION se queda en therapy_services: es un hecho clinico del
-- servicio. El BUFFER vive aqui porque es el ritmo de trabajo de la
-- persona — es el patron de Jane, donde el tiempo posterior del
-- profesional gana sobre el del tipo de cita.
-- ------------------------------------------------------------
alter table public.therapists
  add column if not exists buffer_before_minutes  integer not null default 0,
  add column if not exists buffer_after_minutes   integer not null default 30,
  add column if not exists slot_interval_minutes  integer not null default 15,
  add column if not exists minimum_notice_minutes integer not null default 1440,
  add column if not exists booking_window_days    integer not null default 90,
  add column if not exists max_bookings_per_day   integer not null default 12,
  add column if not exists timezone               text    not null default 'America/Mexico_City';

comment on column public.therapists.buffer_after_minutes is
  'Minutos bloqueados despues de la cita. Admite negativo a proposito: es el mecanismo de solape intencional, como el padding negativo de Acuity.';
comment on column public.therapists.timezone is
  'Mexico tiene 4 husos y no aplica horario de verano desde 2022: no se asume uno solo.';

do $$
begin
  -- Los buffers admiten NEGATIVO a proposito: es el unico mecanismo limpio
  -- para modelar solape intencional. Si se restringiera a >= 0, el dia que
  -- se quiera sobreagendar habria que migrar la columna. Se acotan a un
  -- rango sensato para atajar un dedazo, no para prohibir el caso.
  if not exists (select 1 from pg_constraint where conname = 'therapists_buffers_rango') then
    alter table public.therapists add constraint therapists_buffers_rango
      check (buffer_before_minutes between -120 and 240
         and buffer_after_minutes  between -120 and 240);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'therapists_agenda_positivos') then
    alter table public.therapists add constraint therapists_agenda_positivos
      check (slot_interval_minutes  between 5 and 240
         and minimum_notice_minutes >= 0
         and booking_window_days    between 1 and 730
         and max_bookings_per_day   between 1 and 100);
  end if;
end $$;

-- ------------------------------------------------------------
-- Horario inicial para los terapeutas que ya existen.
--
-- Se siembra martes a sabado de 9 a 19, que es exactamente lo que el
-- codigo tenia fijo: migrar no debe cambiarle la agenda a nadie. A partir
-- de aqui cada consultorio lo edita.
-- ------------------------------------------------------------
insert into public.therapist_schedules (tenant_id, therapist_id, weekday, start_time, end_time)
select t.tenant_id, t.id, d.weekday, '09:00'::time, '19:00'::time
from public.therapists t
cross join (values (2),(3),(4),(5),(6)) as d(weekday)
where not exists (
  select 1 from public.therapist_schedules s
  where s.tenant_id = t.tenant_id and s.therapist_id = t.id
);

-- ------------------------------------------------------------
-- Y para los terapeutas que se den de alta DESPUES.
--
-- Sin esto, una ficha nueva nace sin horario y nadie puede agendar con
-- ella: la validacion diria "fuera de horario" sin que exista horario que
-- violar. Nace con el mismo default que se sembro arriba, y el
-- consultorio lo ajusta.
-- ------------------------------------------------------------
create or replace function public.seed_default_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.therapist_schedules (tenant_id, therapist_id, weekday, start_time, end_time)
  select new.tenant_id, new.id, d.weekday, '09:00'::time, '19:00'::time
  from (values (2),(3),(4),(5),(6)) as d(weekday);
  return new;
end $$;

drop trigger if exists seed_default_schedule on public.therapists;
create trigger seed_default_schedule
  after insert on public.therapists
  for each row execute function public.seed_default_schedule();

alter table public.therapist_schedules enable row level security;

drop policy if exists "Clinic staff manage schedules" on public.therapist_schedules;
create policy "Clinic staff manage schedules" on public.therapist_schedules
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

-- El doctor administra SU horario: es su tiempo.
drop policy if exists "Doctors manage own schedule" on public.therapist_schedules;
create policy "Doctors manage own schedule" on public.therapist_schedules
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_doctor() and therapist_id = public.current_therapist_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_doctor() and therapist_id = public.current_therapist_id()
  );

-- El publico NO lee esta tabla. La disponibilidad se consulta por funcion
-- (0017): cuando trabaja un terapeuta es informacion sobre su vida, no
-- solo sobre el negocio.

create trigger audit_therapist_schedules
  after insert or update or delete on public.therapist_schedules
  for each row execute function public.record_audit_entry();
