-- ============================================================
-- 0001 · Nucleo de multitenancy
--
-- Introduce el tenant como entidad y la membresia por tenant, mas
-- las funciones que resuelven "quien soy y en que clinica estoy".
-- NO toca todavia las 16 tablas de negocio: eso es 0002.
--
-- Diseno: ~/.claude/plans/brainpsi-fase2-diseno.md
-- ============================================================

-- ------------------------------------------------------------
-- La clinica.
-- ------------------------------------------------------------
create table if not exists public.tenants (
  id            text primary key,
  name          text not null,
  rfc           text,
  regimen_fiscal text,
  timezone      text not null default 'America/Mexico_City',
  config        jsonb not null default '{}'::jsonb,
  plan          text not null default 'trial',
  status        text not null default 'active'
                check (status in ('active', 'suspended', 'cancelled')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.tenants is
  'Una clinica. El negocio actual es el tenant #1 (ver 0003, backfill).';

-- ------------------------------------------------------------
-- La membresia. Aqui vive el rol, que deja de ser global.
--
-- El mismo psiquiatra puede ser 'doctor' en una clinica y
-- 'admin_consultorio' en otra: por eso la PK es el par, no el user_id.
-- ------------------------------------------------------------
create table if not exists public.tenant_members (
  tenant_id    text not null references public.tenants(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null
               check (role in ('owner', 'admin_consultorio', 'admin_cafe',
                               'doctor', 'barista', 'user')),
  -- Ligadura al terapeuta DE ESTA clinica. Reemplaza el claim global
  -- app_metadata.therapist_id, que no admitia dos consultorios.
  therapist_id text,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

comment on table public.tenant_members is
  'Fuente de VERDAD de los permisos. El claim del JWT es solo su cache.';

create index if not exists tenant_members_user_idx
  on public.tenant_members (user_id) where active;

-- ------------------------------------------------------------
-- Resolucion del tenant activo.
--
-- La propiedad de seguridad de todo el modelo esta en esta funcion:
-- el tenant activo lo propone el CLIENTE (request.tenant, que cualquiera
-- puede fijar), pero solo surte efecto si YA existe como llave dentro de
-- app_metadata.memberships, que unicamente service_role escribe.
--
-- Falsificar el tenant activo no da acceso: da null, y toda policy
-- 'tenant_id = current_tenant_id()' devuelve cero filas.
--
-- Por eso cambiar de clinica no es una operacion privilegiada y no
-- necesita Edge Function ni re-login.
-- ------------------------------------------------------------
create or replace function public.current_tenant_id()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select case
    when auth.jwt() -> 'app_metadata' -> 'memberships'
           ? nullif(current_setting('request.tenant', true), '')
    then nullif(current_setting('request.tenant', true), '')
    else null
  end;
$$;

comment on function public.current_tenant_id() is
  'Tenant activo, solo si el usuario ya es miembro segun el claim. Si no, null.';

-- Rol DENTRO del tenant activo. Sustituye a current_app_role(), que leia
-- un rol global. Si no hay tenant activo valido no hay rol: falla cerrado.
create or replace function public.current_tenant_role()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' -> 'memberships' ->> public.current_tenant_id(),
    ''
  );
$$;

-- Terapeuta ligado al usuario en el tenant activo.
create or replace function public.current_therapist_id()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' -> 'therapist_ids' ->> public.current_tenant_id(),
    ''
  );
$$;

-- Verificacion EN VIVO contra la tabla, no contra el claim.
--
-- Revocar una membresia no invalida los tokens ya emitidos: viven hasta
-- una hora. Para expediente clinico y operaciones destructivas eso no
-- alcanza, y esas policies llaman a esta funcion ademas del claim.
-- El claim da velocidad en lectura; la tabla da la verdad donde duele.
create or replace function public.is_active_member(p_tenant_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.tenant_members m
    where m.tenant_id = p_tenant_id
      and m.user_id = auth.uid()
      and m.active
  );
$$;

-- security definer: se revoca por defecto y se otorga explicitamente.
-- Ninguna funcion que bypassee RLS debe ser invocable por accidente.
revoke all on function public.is_active_member(text) from public, anon;
grant execute on function public.is_active_member(text) to authenticated;

-- ------------------------------------------------------------
-- RLS sobre las tablas nuevas.
-- ------------------------------------------------------------
alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;

-- Un usuario ve la clinica en la que trabaja, y nada mas.
drop policy if exists tenants_member_read on public.tenants;
create policy tenants_member_read on public.tenants
  for select to authenticated
  using (public.is_active_member(id));

-- Cada quien ve sus propias membresias (las necesita el selector de
-- clinica), y los administradores ven las del tenant activo.
drop policy if exists tenant_members_self_read on public.tenant_members;
create policy tenant_members_self_read on public.tenant_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or (tenant_id = public.current_tenant_id()
        and public.current_tenant_role() in ('owner', 'admin_consultorio'))
  );

-- Escritura de membresias: NADIE por API. Cambiar permisos toca
-- app_metadata, que solo service_role escribe. Sin policy de insert /
-- update / delete, RLS niega por defecto, que es lo que se quiere.
