-- Stub de los objetos que Supabase provee y un Postgres pelon no tiene.
-- Solo para pruebas locales; en Supabase real esto ya existe.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_app_meta_data jsonb default '{}'::jsonb
);

-- OJO: replica la forma REAL de GoTrue, que hace coalesce del claim
-- suelto y del sub dentro del JSON. El stub que se uso al verificar la
-- Fase 1 solo leia 'request.jwt.claim.sub': con el JSON completo devolvia
-- null y toda policy que dependa de auth.uid() daba un falso negativo.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

do $$ begin
  create role anon;            exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated;   exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role;    exception when duplicate_object then null; end $$;

grant usage on schema auth to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
