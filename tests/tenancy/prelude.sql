-- ===========================================================================
-- GUARD: esto es una PRUEBA. No se corre contra una base real.
-- ===========================================================================
-- Falla CERRADO: aborta salvo que pueda demostrar que esta en el Postgres
-- desechable. Enumerar señales de produccion fallaria ABIERTO en cuanto la
-- lista se quedara corta; exigir una marca que solo existe en el
-- desechable no tiene esa fuga.
--
-- La marca la crea tests/tenancy/run.sh en el contenedor que el mismo
-- acaba de levantar, asi que no puede existir en ningun otro lado.
do $guard$
begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception using
      message = 'ABORTADO: archivo de PRUEBA ejecutado fuera del banco desechable.',
      detail  = 'No existe la marca public.__banco_desechable, que solo crea tests/tenancy/run.sh en el contenedor que levanta.',
      hint    = 'Corre ./tests/tenancy/run.sh. Si estas viendo esto en el editor de Supabase: PARA, estas en una base real. El 2026-09-18 se ejecutaron 0013 y 0014 contra produccion y dejaron cuatro tenants y cuatro cuentas fantasma.';
  end if;
end
$guard$;

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
-- GoTrue impone correo unico. El stub tambien debe hacerlo: sin esta
-- restriccion las pruebas pueden crear dos usuarios con el mismo correo
-- —un estado imposible en Supabase— y tapar errores reales.
create unique index if not exists users_email_unique
  on auth.users (lower(email)) where email is not null;

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
