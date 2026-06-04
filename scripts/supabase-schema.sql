create extension if not exists pgcrypto;

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
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id text primary key,
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

create table if not exists public.orders (
  id text primary key,
  appointment_id text references public.appointments(id),
  customer_name text,
  customer_phone text,
  status text not null default 'open',
  subtotal numeric(10, 2) not null default 0,
  combo_savings numeric(10, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists subtotal numeric(10, 2) not null default 0;
alter table public.orders add column if not exists combo_savings numeric(10, 2) not null default 0;
alter table public.products add column if not exists sort_order integer not null default 0;
alter table public.therapists add column if not exists session_duration_minutes integer not null default 50;
alter table public.therapists add column if not exists email text;
alter table public.therapists add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists therapists_email_unique on public.therapists (lower(email)) where email is not null;
create unique index if not exists therapists_user_id_unique on public.therapists (user_id) where user_id is not null;

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

alter table public.therapy_services enable row level security;
alter table public.therapists enable row level security;
alter table public.specialties enable row level security;
alter table public.therapist_services enable row level security;
alter table public.products enable row level security;
alter table public.offers enable row level security;
alter table public.appointments enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

create or replace function public.is_doctor()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'doctor';
$$;

create or replace function public.current_therapist_id()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'therapist_id', '');
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
drop policy if exists "Public can create appointments" on public.appointments;
drop policy if exists "Public can create orders" on public.orders;
drop policy if exists "Public can create order items" on public.order_items;
drop policy if exists "Authenticated users can manage services" on public.therapy_services;
drop policy if exists "Admins can manage services" on public.therapy_services;
drop policy if exists "Authenticated users can manage therapists" on public.therapists;
drop policy if exists "Admins can manage therapists" on public.therapists;
drop policy if exists "Admins can manage specialties" on public.specialties;
drop policy if exists "Authenticated users can manage therapist services" on public.therapist_services;
drop policy if exists "Admins can manage therapist services" on public.therapist_services;
drop policy if exists "Authenticated users can manage products" on public.products;
drop policy if exists "Admins can manage products" on public.products;
drop policy if exists "Authenticated users can manage offers" on public.offers;
drop policy if exists "Admins can manage offers" on public.offers;
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
  for select using (active = true);

create policy "Public can create appointments" on public.appointments
  for insert with check (true);

create policy "Public can create orders" on public.orders
  for insert with check (true);

create policy "Public can create order items" on public.order_items
  for insert with check (true);

create policy "Admins can manage services" on public.therapy_services
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins can manage therapists" on public.therapists
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Doctors can read own profile" on public.therapists
  for select using (public.is_doctor() and id = public.current_therapist_id());

create policy "Admins can manage specialties" on public.specialties
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins can manage therapist services" on public.therapist_services
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins can manage products" on public.products
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins can manage offers" on public.offers
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins can manage appointments" on public.appointments
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Doctors can manage own appointments" on public.appointments
  for all using (public.is_doctor() and therapist_id = public.current_therapist_id())
  with check (public.is_doctor() and therapist_id = public.current_therapist_id());

create policy "Admins can manage orders" on public.orders
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Admins can manage order items" on public.order_items
  for all using (public.is_admin()) with check (public.is_admin());
