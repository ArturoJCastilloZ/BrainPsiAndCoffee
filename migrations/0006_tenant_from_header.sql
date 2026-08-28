-- ============================================================
-- 0006 · El tenant activo viaja en un header, no en un GUC
--
-- CORRECCION de 0001 y 0005. Ambas resolvian el tenant con
-- current_setting('request.tenant'), asumiendo que el cliente podia
-- fijar ese parametro. No puede: PostgREST solo expone un conjunto
-- cerrado de GUCs (request.headers, request.jwt.claims, request.method,
-- request.path, request.cookies) y NO deja que un cliente defina otros.
--
-- Comprobado levantando un PostgREST real contra esta base: una llamada
-- con el header x-tenant-id devuelve
--   request_tenant = null
--   headers        = {"x-tenant-id":"t_a", ...}
--
-- O sea que tal como estaban, current_tenant_id() devolvia siempre null
-- contra Supabase. Falla cerrado —nadie ve nada de nadie, no hay fuga—
-- pero la aplicacion no funciona.
--
-- El tenant pasa a leerse del header x-tenant-id. Se conserva
-- request.tenant como respaldo porque es la unica via para fijar el
-- tenant desde psql, que es como corren las pruebas y los backfills.
--
-- Esto NO cambia el modelo de seguridad: el header lo propone el cliente
-- igual que antes, y sigue sin surtir efecto si no existe como llave en
-- las membresias del JWT, que solo service_role escribe.
-- ============================================================

create or replace function public.requested_tenant()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-tenant-id', ''),
    nullif(current_setting('request.tenant', true), '')
  );
$$;

comment on function public.requested_tenant() is
  'Tenant que pide el cliente: header x-tenant-id, o request.tenant desde psql. Sin verificar: no es una frontera.';

-- El tenant activo solo surte efecto si ya es una membresia del JWT.
-- Esa propiedad no cambia: lo unico distinto es de donde sale el valor
-- propuesto.
create or replace function public.current_tenant_id()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case
    when auth.jwt() -> 'app_metadata' -> 'memberships' ? public.requested_tenant()
    then public.requested_tenant()
    else null
  end;
$$;

-- Igual para el trafico publico, que no tiene membresias.
create or replace function public.current_request_tenant()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id
  from public.tenants t
  where t.id = public.requested_tenant()
    and t.status = 'active';
$$;

revoke all on function public.requested_tenant() from public;
grant execute on function public.requested_tenant() to anon, authenticated;
