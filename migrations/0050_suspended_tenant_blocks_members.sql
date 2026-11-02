-- 0050 · M2: una clinica suspendida o cancelada no tiene clinica activa
-- para sus miembros. current_request_tenant() (definer, 0006) ya filtra
-- status='active'; se reusa para no leer tenants con permisos del usuario.
create or replace function public.current_tenant_id()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when coalesce((auth.jwt() -> 'app_metadata' ->> 'must_change_password')::boolean, false)
      then null
    when auth.jwt() -> 'app_metadata' -> 'memberships' ? public.requested_tenant()
      then case when public.is_active_member(public.requested_tenant())
                 and public.current_request_tenant() is not null
                then public.requested_tenant() end
    else null
  end;
$$;
comment on function public.current_tenant_id() is
  'La clinica activa de la peticion, o null. Exige que el claim la nombre, que la membresia este activa en tenant_members y que tenants.status sea active (0050). Null mientras deba cambiar la contraseña temporal.';
