create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.therapy_services (
  id text primary key,
  name text not null,
  description text,
  duration_minutes integer not null default 50,
  price numeric(10, 2) not null default 0,
  icon text,
  audience text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.therapists (
  id text primary key,
  name text not null,
  email text,
  user_id uuid references auth.users(id) on delete set null,
  cedula text,
  specialty text,
  session_duration_minutes integer not null default 50,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.specialties (
  id text primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.therapist_services (
  therapist_id text not null references public.therapists(id) on delete cascade,
  service_id text not null references public.therapy_services(id) on delete cascade,
  primary key (therapist_id, service_id)
);

create table if not exists public.products (
  id text primary key,
  category text not null,
  name text not null,
  subtitle text,
  price numeric(10, 2) not null default 0,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.offers (
  id text primary key,
  name text not null,
  description text,
  price numeric(10, 2) not null default 0,
  starts_at date,
  ends_at date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_settings (
  id text primary key default 'main',
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'super_admin', 'admin_cafe', 'admin_consultorio', 'doctor', 'barista')),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id text primary key,
  patient_id uuid,
  service_id text references public.therapy_services(id),
  therapist_id text references public.therapists(id),
  appointment_date date not null,
  appointment_time time not null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  notes text,
  wants_coffee boolean not null default false,
  status text not null default 'confirmed' check (status in ('confirmed', 'completed', 'cancelled')),
  reminder_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointment_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id text not null references public.appointments(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  therapist_id text not null references public.therapists(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  content text not null,
  note_type text not null default 'clinical',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id text not null references public.appointments(id) on delete cascade,
  event_type text not null,
  delivery_channel text not null default 'email',
  recipient_email text,
  recipient_phone text,
  recipient_name text,
  therapist_id text references public.therapists(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments add column if not exists patient_id uuid;
alter table public.appointments
  drop constraint if exists appointments_patient_id_fkey;
alter table public.appointments
  add constraint appointments_patient_id_fkey
  foreign key (patient_id) references public.patients(id) on delete set null;

create table if not exists public.orders (
  id text primary key,
  appointment_id text references public.appointments(id),
  customer_name text,
  customer_phone text,
  status text not null default 'received',
  order_source text not null default 'public_menu',
  target_ready_at timestamptz,
  operational_notes text,
  subtotal numeric(10, 2) not null default 0,
  combo_savings numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists subtotal numeric(10, 2) not null default 0;
alter table public.orders add column if not exists combo_savings numeric(10, 2) not null default 0;
alter table public.orders add column if not exists order_source text not null default 'public_menu';
alter table public.orders add column if not exists target_ready_at timestamptz;
alter table public.orders add column if not exists operational_notes text;
alter table public.orders alter column status set default 'received';
update public.orders set status = 'received' where status = 'open';
update public.orders set order_source = 'appointment' where appointment_id is not null and order_source = 'public_menu';
update public.orders set order_source = 'public_menu' where order_source is null;
alter table public.products add column if not exists sort_order integer not null default 0;
alter table public.offers add column if not exists starts_at date;
alter table public.offers add column if not exists ends_at date;
alter table public.therapists add column if not exists session_duration_minutes integer not null default 50;
alter table public.therapists add column if not exists email text;
alter table public.therapists add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists therapists_email_unique on public.therapists (lower(email)) where email is not null;
create unique index if not exists therapists_user_id_unique on public.therapists (user_id) where user_id is not null;
create unique index if not exists patients_email_unique on public.patients (lower(email));
create index if not exists appointments_patient_id_idx on public.appointments (patient_id) where patient_id is not null;
create index if not exists appointment_notes_patient_id_idx on public.appointment_notes (patient_id);
create index if not exists appointment_notes_therapist_id_idx on public.appointment_notes (therapist_id);
create index if not exists appointment_notes_appointment_id_idx on public.appointment_notes (appointment_id);
create index if not exists appointment_notifications_status_created_at_idx on public.appointment_notifications (status, created_at);
create index if not exists appointment_notifications_appointment_id_idx on public.appointment_notifications (appointment_id);
create index if not exists appointment_notifications_therapist_id_idx on public.appointment_notifications (therapist_id) where therapist_id is not null;

update public.products
set sort_order = case id
  when 'h1' then 10
  when 'h2' then 20
  when 'h3' then 30
  when 'h4' then 40
  when 'h5' then 50
  when 'h6' then 60
  when 'c1' then 10
  when 'c2' then 20
  when 'c3' then 30
  when 'c4' then 40
  when 'd1' then 10
  when 'd2' then 20
  when 'd3' then 30
  when 'd4' then 40
  when 'd5' then 50
  when 'p1' then 10
  when 'p2' then 20
  else greatest(sort_order, 1000)
end
where sort_order = 0;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  product_id text references public.products(id),
  name text not null,
  quantity integer not null default 1,
  unit_price numeric(10, 2) not null default 0,
  options jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointments_customer_email_format') then
    alter table public.appointments
      add constraint appointments_customer_email_format
      check (customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appointments_customer_phone_format') then
    alter table public.appointments
      add constraint appointments_customer_phone_format
      check (customer_phone ~ '^[0-9+(). -]{8,20}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appointments_notes_length') then
    alter table public.appointments
      add constraint appointments_notes_length
      check (char_length(coalesce(notes, '')) <= 280);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appointments_business_time') then
    alter table public.appointments
      add constraint appointments_business_time
      check (appointment_time >= time '09:00' and appointment_time < time '19:00');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_customer_phone_format') then
    alter table public.orders
      add constraint orders_customer_phone_format
      check (customer_phone is null or customer_phone ~ '^[0-9+(). -]{8,20}$');
  end if;

  alter table public.orders drop constraint if exists orders_status_valid;
  alter table public.orders
    add constraint orders_status_valid
    check (status in ('received', 'pending_appointment', 'preparing', 'ready', 'delivered', 'cancelled'));

  if not exists (select 1 from pg_constraint where conname = 'orders_source_valid') then
    alter table public.orders
      add constraint orders_source_valid
      check (order_source in ('public_menu', 'appointment', 'admin', 'doctor_reception'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'orders_operational_notes_length') then
    alter table public.orders
      add constraint orders_operational_notes_length
      check (char_length(coalesce(operational_notes, '')) <= 280);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'order_items_quantity_positive') then
    alter table public.order_items
      add constraint order_items_quantity_positive
      check (quantity > 0);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offers_valid_date_window') then
    alter table public.offers
      add constraint offers_valid_date_window
      check (starts_at is null or ends_at is null or starts_at <= ends_at);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'patients_email_format') then
    alter table public.patients
      add constraint patients_email_format
      check (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'patients_phone_format') then
    alter table public.patients
      add constraint patients_phone_format
      check (phone ~ '^[0-9+(). -]{8,20}$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appointment_notes_content_length') then
    alter table public.appointment_notes
      add constraint appointment_notes_content_length
      check (char_length(trim(content)) between 1 and 5000);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appointment_notes_type_valid') then
    alter table public.appointment_notes
      add constraint appointment_notes_type_valid
      check (note_type in ('clinical'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appointment_notifications_event_valid') then
    alter table public.appointment_notifications
      add constraint appointment_notifications_event_valid
      check (event_type in ('created', 'updated', 'rescheduled', 'cancelled', 'reminder'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appointment_notifications_channel_valid') then
    alter table public.appointment_notifications
      add constraint appointment_notifications_channel_valid
      check (delivery_channel in ('email', 'whatsapp'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'appointment_notifications_status_valid') then
    alter table public.appointment_notifications
      add constraint appointment_notifications_status_valid
      check (status in ('pending', 'sent', 'failed', 'skipped'));
  end if;
end $$;

create unique index if not exists appointments_no_duplicate_confirmed_slot
  on public.appointments (therapist_id, appointment_date, appointment_time)
  where therapist_id is not null and status <> 'cancelled';

create index if not exists orders_status_created_at_idx on public.orders (status, created_at desc);
create index if not exists orders_appointment_id_idx on public.orders (appointment_id) where appointment_id is not null;
create index if not exists orders_target_ready_at_idx on public.orders (target_ready_at) where target_ready_at is not null;

create or replace function public.sync_patient_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_patient_id uuid;
begin
  select id
  into resolved_patient_id
  from public.patients
  where lower(email) = lower(new.customer_email)
  limit 1;

  if resolved_patient_id is null then
    insert into public.patients (full_name, email, phone)
    values (trim(new.customer_name), lower(trim(new.customer_email)), trim(new.customer_phone))
    returning id into resolved_patient_id;
  else
    update public.patients
    set
      full_name = trim(new.customer_name),
      phone = trim(new.customer_phone),
      active = true,
      updated_at = now()
    where id = resolved_patient_id;
  end if;

  new.patient_id := resolved_patient_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sync_patient_from_appointment on public.appointments;
create trigger sync_patient_from_appointment
  before insert or update of customer_name, customer_email, customer_phone on public.appointments
  for each row execute function public.sync_patient_from_appointment();

update public.appointments
set customer_name = customer_name
where patient_id is null;

create or replace function public.order_target_from_appointment(appointment_date date, appointment_time time)
returns timestamptz
language sql
immutable
as $$
  select ((appointment_date + appointment_time) at time zone 'America/Monterrey') - interval '10 minutes';
$$;

create or replace function public.appointment_can_receive_order(appointment_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.appointments
    where id = appointment_id
      and status <> 'cancelled'
  );
$$;

create or replace function public.order_can_receive_public_items(order_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.orders
    where id = order_id
      and order_source in ('public_menu', 'appointment')
      and status in ('received', 'pending_appointment')
      and created_at >= now() - interval '15 minutes'
  );
$$;

create or replace function public.prepare_order_operational_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  appointment_record record;
begin
  if new.appointment_id is not null then
    select appointment_date, appointment_time, status
    into appointment_record
    from public.appointments
    where id = new.appointment_id;

    new.order_source := 'appointment';

    if new.target_ready_at is null and appointment_record.appointment_date is not null then
      new.target_ready_at := public.order_target_from_appointment(appointment_record.appointment_date, appointment_record.appointment_time);
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

drop trigger if exists prepare_order_operational_fields on public.orders;
create trigger prepare_order_operational_fields
  before insert or update on public.orders
  for each row execute function public.prepare_order_operational_fields();

create or replace function public.sync_orders_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.orders
  set
    target_ready_at = public.order_target_from_appointment(new.appointment_date, new.appointment_time),
    status = case
      when new.status = 'cancelled' and status not in ('delivered', 'cancelled') then 'cancelled'
      when old.status = 'cancelled' and new.status <> 'cancelled' and status = 'cancelled' then 'pending_appointment'
      else status
    end,
    updated_at = now()
  where appointment_id = new.id;

  return new;
end;
$$;

drop trigger if exists sync_orders_from_appointment on public.appointments;
create trigger sync_orders_from_appointment
  after update of appointment_date, appointment_time, status on public.appointments
  for each row execute function public.sync_orders_from_appointment();

create or replace function public.queue_appointment_notification()
returns trigger
language plpgsql
security definer
set search_path = public
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
    appointment_id,
    event_type,
    delivery_channel,
    recipient_email,
    recipient_phone,
    recipient_name,
    therapist_id,
    payload
  )
  values (
    new.id,
    event,
    'email',
    new.customer_email,
    new.customer_phone,
    new.customer_name,
    new.therapist_id,
    jsonb_build_object(
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

drop trigger if exists queue_appointment_notification on public.appointments;
create trigger queue_appointment_notification
  after insert or update of service_id, therapist_id, appointment_date, appointment_time, status, wants_coffee on public.appointments
  for each row execute function public.queue_appointment_notification();

create or replace function public.prevent_barista_order_data_changes()
returns trigger
language plpgsql
as $$
begin
  if public.is_barista() then
    if new.id is distinct from old.id
      or new.appointment_id is distinct from old.appointment_id
      or new.customer_name is distinct from old.customer_name
      or new.customer_phone is distinct from old.customer_phone
      or new.order_source is distinct from old.order_source
      or new.target_ready_at is distinct from old.target_ready_at
      or new.operational_notes is distinct from old.operational_notes
      or new.subtotal is distinct from old.subtotal
      or new.combo_savings is distinct from old.combo_savings
      or new.total is distinct from old.total
      or new.created_at is distinct from old.created_at then
      raise exception 'Baristas can only update order status.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_barista_order_data_changes on public.orders;
create trigger prevent_barista_order_data_changes
  before update on public.orders
  for each row execute function public.prevent_barista_order_data_changes();

alter table public.therapy_services enable row level security;
alter table public.therapists enable row level security;
alter table public.specialties enable row level security;
alter table public.therapist_services enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.business_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointment_notes enable row level security;
alter table public.appointment_notifications enable row level security;
alter table public.appointments enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'super_admin');
$$;

create or replace function public.current_app_role()
returns text
language sql
stable
as $$
  select case coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
    when 'admin' then 'super_admin'
    else coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
  end;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'super_admin';
$$;

create or replace function public.is_cafe_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin_cafe';
$$;

create or replace function public.is_clinic_admin()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'admin_consultorio';
$$;

create or replace function public.is_doctor()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'doctor';
$$;

create or replace function public.is_barista()
returns boolean
language sql
stable
as $$
  select public.current_app_role() = 'barista';
$$;

create or replace function public.is_cafe_staff()
returns boolean
language sql
stable
as $$
  select public.is_super_admin() or public.is_cafe_admin() or public.is_barista();
$$;

create or replace function public.is_clinic_staff()
returns boolean
language sql
stable
as $$
  select public.is_super_admin() or public.is_clinic_admin();
$$;

create or replace function public.current_therapist_id()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'therapist_id', '');
$$;

create or replace function public.doctor_can_access_patient(patient_id uuid)
returns boolean
language sql
stable
as $$
  select public.is_doctor()
    and exists (
      select 1
      from public.appointments
      where appointments.patient_id = $1
        and appointments.therapist_id = public.current_therapist_id()
    );
$$;

create or replace function public.resolve_login_identifier(identifier text)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select email
  from public.therapists
  where active = true
    and email is not null
    and (
      lower(email) = lower(identifier)
      or lower(name) = lower(identifier)
    )
  limit 1;
$$;

drop policy if exists "Public can read active services" on public.therapy_services;
drop policy if exists "Public can read active therapists" on public.therapists;
drop policy if exists "Public can read active specialties" on public.specialties;
drop policy if exists "Public can read therapist services" on public.therapist_services;
drop policy if exists "Public can read active products" on public.products;
drop policy if exists "Public can read active offers" on public.offers;
drop policy if exists "Public can read business settings" on public.business_settings;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Super admins can manage profiles" on public.profiles;
drop policy if exists "Clinic staff can read patients" on public.patients;
drop policy if exists "Clinic staff can manage patients" on public.patients;
drop policy if exists "Doctors can read own patients" on public.patients;
drop policy if exists "Doctors can manage own clinical notes" on public.appointment_notes;
drop policy if exists "Clinic staff can manage appointment notifications" on public.appointment_notifications;
drop policy if exists "Doctors can read own appointment notifications" on public.appointment_notifications;
drop policy if exists "Public can create appointments" on public.appointments;
drop policy if exists "Public can create orders" on public.orders;
drop policy if exists "Public can create order items" on public.order_items;
drop policy if exists "Authenticated users can manage services" on public.therapy_services;
drop policy if exists "Admins can manage services" on public.therapy_services;
drop policy if exists "Authenticated users can manage therapists" on public.therapists;
drop policy if exists "Admins can manage therapists" on public.therapists;
drop policy if exists "Doctors can read own profile" on public.therapists;
drop policy if exists "Admins can manage specialties" on public.specialties;
drop policy if exists "Authenticated users can manage therapist services" on public.therapist_services;
drop policy if exists "Admins can manage therapist services" on public.therapist_services;
drop policy if exists "Authenticated users can manage products" on public.products;
drop policy if exists "Admins can manage products" on public.products;
drop policy if exists "Authenticated users can manage offers" on public.offers;
drop policy if exists "Admins can manage offers" on public.offers;
drop policy if exists "Admins can manage business settings" on public.business_settings;
drop policy if exists "Cafe staff can read orders" on public.orders;
drop policy if exists "Cafe admins can insert orders" on public.orders;
drop policy if exists "Cafe staff can update orders" on public.orders;
drop policy if exists "Cafe admins can delete orders" on public.orders;
drop policy if exists "Cafe staff can read order items" on public.order_items;
drop policy if exists "Cafe admins can manage order items" on public.order_items;
drop policy if exists "Authenticated users can manage appointments" on public.appointments;
drop policy if exists "Admins can manage appointments" on public.appointments;
drop policy if exists "Doctors can manage own appointments" on public.appointments;
drop policy if exists "Authenticated users can manage orders" on public.orders;
drop policy if exists "Admins can manage orders" on public.orders;
drop policy if exists "Authenticated users can manage order items" on public.order_items;
drop policy if exists "Admins can manage order items" on public.order_items;

create policy "Public can read active services" on public.therapy_services
  for select using (active = true);

create policy "Public can read active therapists" on public.therapists
  for select using (active = true);

create policy "Public can read active specialties" on public.specialties
  for select using (active = true);

create policy "Public can read therapist services" on public.therapist_services
  for select using (true);

create policy "Public can read active products" on public.products
  for select using (active = true);

create policy "Public can read active offers" on public.offers
  for select using (
    active = true
    and (starts_at is null or starts_at <= current_date)
    and (ends_at is null or ends_at >= current_date)
  );

create policy "Public can read business settings" on public.business_settings
  for select using (id = 'main');

create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = user_id);

create policy "Super admins can manage profiles" on public.profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Clinic staff can read patients" on public.patients
  for select using (public.is_clinic_staff());

create policy "Clinic staff can manage patients" on public.patients
  for all using (public.is_clinic_staff()) with check (public.is_clinic_staff());

create policy "Doctors can read own patients" on public.patients
  for select using (public.doctor_can_access_patient(id));

create policy "Doctors can manage own clinical notes" on public.appointment_notes
  for all using (
    public.is_doctor()
    and therapist_id = public.current_therapist_id()
    and public.doctor_can_access_patient(patient_id)
  )
  with check (
    public.is_doctor()
    and therapist_id = public.current_therapist_id()
    and author_user_id = auth.uid()
    and public.doctor_can_access_patient(patient_id)
    and exists (
      select 1
      from public.appointments
      where appointments.id = appointment_id
        and appointments.patient_id = appointment_notes.patient_id
        and appointments.therapist_id = public.current_therapist_id()
    )
  );

create policy "Clinic staff can manage appointment notifications" on public.appointment_notifications
  for all using (public.is_clinic_staff()) with check (public.is_clinic_staff());

create policy "Doctors can read own appointment notifications" on public.appointment_notifications
  for select using (public.is_doctor() and therapist_id = public.current_therapist_id());

create policy "Public can create appointments" on public.appointments
  for insert with check (
    status = 'confirmed'
    and appointment_date between current_date and (current_date + 35)
    and appointment_time >= time '09:00'
    and appointment_time < time '19:00'
    and extract(isodow from appointment_date) between 2 and 6
    and char_length(trim(customer_name)) between 2 and 120
    and customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and customer_phone ~ '^[0-9+(). -]{8,20}$'
    and char_length(coalesce(notes, '')) <= 280
    and exists (
      select 1 from public.therapy_services
      where id = service_id and active = true
    )
    and (
      therapist_id is null
      or exists (
        select 1 from public.therapists
        where id = therapist_id and active = true
      )
    )
  );

create policy "Public can create orders" on public.orders
  for insert with check (
    status in ('received', 'pending_appointment')
    and (
      (appointment_id is null and order_source = 'public_menu')
      or (
        appointment_id is not null
        and order_source = 'appointment'
        and public.appointment_can_receive_order(appointment_id)
      )
    )
    and total >= 0
    and subtotal >= 0
    and combo_savings >= 0
    and char_length(trim(coalesce(customer_name, ''))) between 2 and 120
    and coalesce(customer_phone, '') ~ '^[0-9+(). -]{8,20}$'
    and char_length(coalesce(operational_notes, '')) <= 280
  );

create policy "Public can create order items" on public.order_items
  for insert with check (
    quantity > 0
    and unit_price >= 0
    and char_length(trim(name)) between 1 and 160
    and public.order_can_receive_public_items(order_id)
  );

create policy "Admins can manage services" on public.therapy_services
  for all using (public.is_clinic_staff()) with check (public.is_clinic_staff());

create policy "Admins can manage therapists" on public.therapists
  for all using (public.is_clinic_staff()) with check (public.is_clinic_staff());

create policy "Doctors can read own profile" on public.therapists
  for select using (public.is_doctor() and id = public.current_therapist_id());

create policy "Admins can manage specialties" on public.specialties
  for all using (public.is_clinic_staff()) with check (public.is_clinic_staff());

create policy "Admins can manage therapist services" on public.therapist_services
  for all using (public.is_clinic_staff()) with check (public.is_clinic_staff());

create policy "Admins can manage products" on public.products
  for all using (public.is_super_admin() or public.is_cafe_admin()) with check (public.is_super_admin() or public.is_cafe_admin());

create policy "Admins can manage offers" on public.offers
  for all using (public.is_super_admin() or public.is_cafe_admin()) with check (public.is_super_admin() or public.is_cafe_admin());

create policy "Admins can manage business settings" on public.business_settings
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create policy "Admins can manage appointments" on public.appointments
  for all using (public.is_clinic_staff()) with check (public.is_clinic_staff());

create policy "Doctors can manage own appointments" on public.appointments
  for all using (public.is_doctor() and therapist_id = public.current_therapist_id())
  with check (public.is_doctor() and therapist_id = public.current_therapist_id());

create policy "Cafe staff can read orders" on public.orders
  for select using (public.is_cafe_staff());

create policy "Cafe admins can insert orders" on public.orders
  for insert with check (public.is_super_admin() or public.is_cafe_admin());

create policy "Cafe staff can update orders" on public.orders
  for update using (public.is_cafe_staff()) with check (public.is_cafe_staff());

create policy "Cafe admins can delete orders" on public.orders
  for delete using (public.is_super_admin() or public.is_cafe_admin());

create policy "Cafe staff can read order items" on public.order_items
  for select using (public.is_cafe_staff());

create policy "Cafe admins can manage order items" on public.order_items
  for all using (public.is_super_admin() or public.is_cafe_admin()) with check (public.is_super_admin() or public.is_cafe_admin());
