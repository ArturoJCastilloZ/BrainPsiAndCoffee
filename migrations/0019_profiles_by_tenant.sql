-- ============================================================
-- 0019 · profiles deja de ser una puerta entre clinicas
--
-- 0005 redefinio is_super_admin() de "operador global de la plataforma"
-- (app_metadata.role = 'super_admin') a current_tenant_role() = 'owner'.
-- El cambio era correcto para el modelo nuevo, pero arrastro una policy
-- que quedo escrita para el significado viejo:
--
--   create policy "Super admins can manage profiles" on public.profiles
--     for all using (public.is_super_admin());
--
-- profiles no tiene tenant_id a proposito (0002: "es la identidad global
-- del usuario"), asi que el predicado no acota por clinica. Lo que antes
-- era "una sola persona operando la plataforma" paso a ser "el dueño de
-- CUALQUIER clinica", sobre una tabla con filas de todos los usuarios de
-- todos los clientes. Y es for all: cubria select, update y delete.
--
-- En la practica: un cliente de pago podia enumerar el padron de personal
-- de los demas consultorios, y borrarles las filas.
--
-- Que la aplicacion ya no consulte profiles no cerraba nada. La frontera
-- es RLS, y PostgREST expone la tabla igual. "El front no la usa" no es
-- un control de acceso.
--
-- Se acota por MEMBRESIA en vez de por tenant_id, porque la tabla no
-- puede tener tenant_id sin dejar de ser la identidad global: un mismo
-- usuario trabaja en dos consultorios y tiene UNA identidad.
-- ============================================================

-- ------------------------------------------------------------
-- "¿este usuario pertenece a la clinica activa?"
--
-- is_active_member() ya existia pero responde por el usuario de la
-- sesion; aqui hace falta preguntarlo de un tercero.
--
-- security definer a proposito: si la subconsulta leyera tenant_members
-- bajo RLS, el acceso a profiles dependeria de que las policies de
-- tenant_members esten bien escritas. Se prefiere una sola fuente.
-- ------------------------------------------------------------
create or replace function public.user_belongs_to_current_tenant(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tenant_members m
    where m.user_id = p_user_id
      and m.tenant_id = public.current_tenant_id()
      and m.active
  );
$$;

revoke all on function public.user_belongs_to_current_tenant(uuid) from public;
grant execute on function public.user_belongs_to_current_tenant(uuid) to authenticated;

comment on function public.user_belongs_to_current_tenant(uuid) is
  'Si el usuario dado es miembro activo de la clinica activa. Devuelve false cuando no hay clinica resuelta.';

-- ------------------------------------------------------------
-- La policy, ya acotada.
--
-- current_tenant_id() devuelve null si el header no corresponde a una
-- membresia real del JWT, y entonces la funcion da false y la policy
-- cero filas: el tenant falsificado no abre nada, igual que en 0006.
-- ------------------------------------------------------------
drop policy if exists "Super admins can manage profiles" on public.profiles;
drop policy if exists "Owners manage profiles of their clinic" on public.profiles;
create policy "Owners manage profiles of their clinic" on public.profiles
  for all
  using (
    public.is_super_admin()
    and public.user_belongs_to_current_tenant(profiles.user_id)
  )
  with check (
    public.is_super_admin()
    and public.user_belongs_to_current_tenant(profiles.user_id)
  );

-- "Users can read own profile" (0005) se conserva tal cual: un usuario
-- lee su propia ficha aunque no sea dueño de nada.
