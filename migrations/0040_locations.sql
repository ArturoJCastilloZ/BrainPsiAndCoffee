-- 0040 · Sucursales.
--
-- El consultorio atiende en mas de un lugar (Lincoln y San Nicolas) y un
-- especialista puede estar en uno por la mañana y en otro por la tarde.
-- Hasta ahora el sistema solo conocia UNA direccion (business_settings) y
-- los horarios eran dia + hora, sin lugar.
--
--   · locations: las sucursales de cada clinica (nombre, direccion,
--     enlace de mapa, si tiene cafeteria).
--   · therapist_schedules.location_id: cada bloque de horario dice DONDE.
--     Asi "martes 9-14 en Lincoln y 16-19 en San Nicolas" son dos bloques.
--   · appointments.location_id: donde es la cita.
--
-- Los servicios por sucursal NO se configuran aparte: un servicio esta en
-- una sucursal si algun especialista que lo da tiene horario ahi.
--
-- Un especialista no puede estar en dos lugares a la vez: el EXCLUDE de
-- 0017 ya es por terapeuta, sin importar la sucursal, y busy_slots igual.
--
-- location_id nulo en un bloque = "cualquier sucursal". Es lo que tiene
-- una clinica con un solo lugar, y lo que deja el trigger de horario por
-- defecto si la clinica aun no tiene sucursales.

-- ------------------------------------------------------------
-- 1 · Sucursales
-- ------------------------------------------------------------
create table if not exists public.locations (
  tenant_id   text not null references public.tenants(id) on delete cascade,
  id          text not null,
  name        text not null check (char_length(trim(name)) between 2 and 80),
  address     text not null default '' check (char_length(address) <= 300),
  maps_url    text not null default '' check (char_length(maps_url) <= 500),
  has_cafe    boolean not null default false,
  active      boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, id)
);

alter table public.locations enable row level security;

-- Privilegios explicitos (como 0039): RLS decide QUE filas; esto, que
-- operaciones existen para cada rol.
grant select on public.locations to anon, authenticated;
grant insert, update, delete on public.locations to authenticated;

-- Lectura publica: la reserva elige sucursal antes de iniciar sesion.
-- Igual que servicios (0005): por la clinica que se visita y solo activas.
drop policy if exists "Public can read active locations" on public.locations;
create policy "Public can read active locations" on public.locations
  for select using (tenant_id = public.current_request_tenant() and active = true);

-- El personal de la clinica las ve todas (tambien las inactivas, para
-- poder reactivarlas) y el dueño o admin del consultorio las administra.
drop policy if exists "Clinic users read locations" on public.locations;
create policy "Clinic users read locations" on public.locations
  for select to authenticated using (tenant_id = public.current_tenant_id());

drop policy if exists "Clinic staff manage locations" on public.locations;
create policy "Clinic staff manage locations" on public.locations
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop trigger if exists audit_locations on public.locations;
create trigger audit_locations
  after insert or update or delete on public.locations
  for each row execute function public.record_audit_entry();

-- Cada clinica que ya existe arranca con UNA sucursal: la direccion que
-- ya tenia en Negocio. El consultorio la renombra y agrega las demas.
insert into public.locations (tenant_id, id, name, address, maps_url, has_cafe, sort_order)
select t.id, 'principal', 'Sucursal principal',
       left(coalesce(bs.content ->> 'address', ''), 300),
       left(coalesce(bs.content ->> 'mapsUrl', ''), 500),
       true, 0
from public.tenants t
left join public.business_settings bs on bs.tenant_id = t.id
on conflict (tenant_id, id) do nothing;

-- ------------------------------------------------------------
-- 2 · Horarios y citas por sucursal
-- ------------------------------------------------------------
alter table public.therapist_schedules add column if not exists location_id text;
alter table public.appointments add column if not exists location_id text;

-- on delete restrict: una sucursal con horarios o citas no se borra, se
-- desactiva. Borrarla dejaria citas sin lugar.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'therapist_schedules_location_fk') then
    alter table public.therapist_schedules
      add constraint therapist_schedules_location_fk
      foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointments_location_fk') then
    alter table public.appointments
      add constraint appointments_location_fk
      foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete restrict;
  end if;
end $$;

-- Lo que ya existe pasa a la sucursal principal.
update public.therapist_schedules s set location_id = 'principal'
where s.location_id is null
  and exists (select 1 from public.locations l where l.tenant_id = s.tenant_id and l.id = 'principal');
update public.appointments a set location_id = 'principal'
where a.location_id is null
  and exists (select 1 from public.locations l where l.tenant_id = a.tenant_id and l.id = 'principal');

create index if not exists therapist_schedules_location_idx
  on public.therapist_schedules (tenant_id, location_id, weekday) where active;

-- El horario por defecto de un especialista nuevo va a la primera
-- sucursal activa (o a ninguna, si la clinica aun no tiene).
create or replace function public.seed_default_schedule()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_location text;
begin
  select l.id into v_location
  from public.locations l
  where l.tenant_id = new.tenant_id and l.active
  order by l.sort_order, l.name
  limit 1;

  insert into public.therapist_schedules (tenant_id, therapist_id, weekday, start_time, end_time, location_id)
  select new.tenant_id, new.id, d.weekday, '09:00'::time, '19:00'::time, v_location
  from (values (2),(3),(4),(5),(6)) as d(weekday);
  return new;
end $$;

-- ------------------------------------------------------------
-- 3 · Validar la cita contra el horario DE ESA sucursal
--
-- Misma funcion que 0017, con la sucursal. Un bloque sin sucursal sirve
-- para cualquiera; una cita sin sucursal, contra cualquier bloque (asi
-- se comportaba todo antes de esta migracion).
-- ------------------------------------------------------------
create or replace function public.fits_in_schedule(
  p_tenant_id    text,
  p_therapist_id text,
  p_date         date,
  p_time         time,
  p_duration     integer,
  p_location_id  text
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
      and (p_location_id is null or s.location_id is null or s.location_id = p_location_id)
  );
$$;

revoke all on function public.fits_in_schedule(text, text, date, time, integer, text) from public;
grant execute on function public.fits_in_schedule(text, text, date, time, integer, text) to anon, authenticated;

-- La reserva publica: igual que 0036, mas la sucursal. Si la clinica
-- tiene sucursales activas, la solicitud debe decir en cual, esa
-- sucursal debe estar activa, y el especialista debe tener horario AHI.
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
    and (
      case when location_id is null
        then not exists (select 1 from public.locations l
                         where l.tenant_id = appointments.tenant_id and l.active)
        else exists (select 1 from public.locations l
                     where l.tenant_id = appointments.tenant_id
                       and l.id = appointments.location_id and l.active)
      end
    )
    and public.fits_in_schedule(tenant_id, therapist_id, appointment_date,
                                appointment_time, duration_minutes, location_id)
    and public.within_booking_window(tenant_id, therapist_id, appointment_date,
                                     appointment_time)
  );

-- ------------------------------------------------------------
-- 4 · Fuera el horario fijo de 9 a 19
--
-- Venia del esquema original (supabase-schema.sql), de cuando el horario
-- era el mismo para todos. Desde 0016 cada especialista tiene el suyo y
-- la reserva publica se valida contra el (fits_in_schedule); este CHECK
-- rechazaba citas reales a las 7:30 o a las 19:30 que el horario si
-- permite.
-- ------------------------------------------------------------
alter table public.appointments drop constraint if exists appointments_business_time;
