-- ============================================================
-- 0011 · Administracion de accesos desde el admin
--
-- Hasta ahora los roles se asignaban a mano: editando app_metadata en el
-- panel de Supabase, o llamando grant_tenant_role por SQL. Esta migracion
-- expone esa operacion a la aplicacion.
--
-- Es la superficie mas delicada del sistema: funciones que OTORGAN
-- PERMISOS y escriben en auth.users, asi que corren en security definer.
-- Cada una vuelve a verificar quien llama contra tenant_members EN VIVO,
-- no contra el claim: revocarle el acceso a alguien no invalida su token,
-- que vive hasta una hora, y sin esa verificacion un ex-administrador
-- podria seguir repartiendo permisos.
--
-- Reglas que impone el motor, no la interfaz:
--   · solo un owner administra accesos;
--   · nadie cambia su propio rol (ni se degrada ni se asciende);
--   · no se puede quitar al ultimo owner: dejaria la clinica sin dueño.
-- ============================================================

create or replace function public.assert_tenant_owner()
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text := public.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'No hay una clinica activa en esta sesion.';
  end if;
  if not exists (
    select 1 from public.tenant_members m
    where m.tenant_id = v_tenant
      and m.user_id = auth.uid()
      and m.role = 'owner'
      and m.active
  ) then
    raise exception 'Solo el dueño de la clinica puede administrar accesos.';
  end if;
  return v_tenant;
end $$;

revoke all on function public.assert_tenant_owner() from public, anon;
grant execute on function public.assert_tenant_owner() to authenticated;

-- El correo vive en auth.users, que la aplicacion no puede leer: por eso
-- es definer. Solo devuelve miembros del tenant activo, asi que un owner
-- nunca alcanza usuarios de otra clinica.
create or replace function public.list_tenant_members()
returns table (
  user_id      uuid,
  email        text,
  role         text,
  therapist_id text,
  active       boolean,
  is_self      boolean,
  created_at   timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text := public.assert_tenant_owner();
begin
  return query
  select m.user_id,
         u.email::text,
         m.role,
         m.therapist_id,
         m.active,
         m.user_id = auth.uid(),
         m.created_at
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  where m.tenant_id = v_tenant
  order by (m.role = 'owner') desc, u.email;
end $$;

revoke all on function public.list_tenant_members() from public, anon;
grant execute on function public.list_tenant_members() to authenticated;

-- Alta o cambio de rol, por correo. NO crea cuentas: crear usuarios exige
-- la API de administracion de auth, que no se expone al navegador.
create or replace function public.set_tenant_member_role(p_email text, p_role text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant  text := public.assert_tenant_owner();
  v_user_id uuid;
begin
  if p_role not in ('owner','admin_consultorio','admin_cafe','doctor','barista') then
    raise exception 'Rol no valido: %.', p_role;
  end if;

  -- strict: si el correo no resuelve a EXACTAMENTE un usuario, se
  -- detiene. Tomar uno arbitrario le daria permisos a la persona
  -- equivocada, y el guard de "no cambies tu propio rol" se saltaria
  -- cuando el correo es el tuyo pero la fila elegida es otra.
  begin
    select id into strict v_user_id from auth.users
    where lower(email) = lower(trim(p_email));
  exception
    when no_data_found then
      raise exception 'No existe ningun usuario con el correo %. Tiene que registrarse primero.', p_email;
    when too_many_rows then
      raise exception 'Hay mas de una cuenta con el correo %. Resuelvelo antes de asignar permisos.', p_email;
  end;

  -- Cambiarse el rol a uno mismo es la via clasica de escalada, y tambien
  -- la forma mas facil de dejarse fuera por accidente.
  if v_user_id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol. Pideselo a otro dueño de la clinica.';
  end if;

  -- Degradar al ultimo owner deja la clinica sin quien la administre, y
  -- nadie podria revertirlo desde la aplicacion.
  if p_role <> 'owner'
     and exists (select 1 from public.tenant_members
                 where tenant_id = v_tenant and user_id = v_user_id
                   and role = 'owner' and active)
     and (select count(*) from public.tenant_members
          where tenant_id = v_tenant and role = 'owner' and active) <= 1 then
    raise exception 'Es el unico dueño de la clinica: nombra a otro antes de cambiarle el rol.';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role, active)
  values (v_tenant, v_user_id, p_role, true)
  on conflict (tenant_id, user_id)
  do update set role = excluded.role, active = true, updated_at = now();

  -- Se fusiona: pisar app_metadata dejaria al usuario sin sus otras
  -- clinicas.
  update auth.users
  set raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object(
             'memberships',
             coalesce(raw_app_meta_data -> 'memberships', '{}'::jsonb)
               || jsonb_build_object(v_tenant, p_role))
  where id = v_user_id;

  return v_user_id;
end $$;

revoke all on function public.set_tenant_member_role(text, text) from public, anon;
grant execute on function public.set_tenant_member_role(text, text) to authenticated;

-- Revocar el acceso a ESTA clinica. No toca la cuenta: el usuario puede
-- seguir trabajando en otros consultorios.
create or replace function public.revoke_tenant_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text := public.assert_tenant_owner();
begin
  if p_user_id = auth.uid() then
    raise exception 'No puedes quitarte a ti mismo el acceso a la clinica.';
  end if;

  if exists (select 1 from public.tenant_members
             where tenant_id = v_tenant and user_id = p_user_id
               and role = 'owner' and active)
     and (select count(*) from public.tenant_members
          where tenant_id = v_tenant and role = 'owner' and active) <= 1 then
    raise exception 'Es el unico dueño de la clinica: nombra a otro antes de quitarle el acceso.';
  end if;

  delete from public.tenant_members
  where tenant_id = v_tenant and user_id = p_user_id;

  update auth.users
  set raw_app_meta_data =
        jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{memberships}',
                  coalesce(raw_app_meta_data -> 'memberships', '{}'::jsonb) - v_tenant)
  where id = p_user_id;
end $$;

revoke all on function public.revoke_tenant_member(uuid) from public, anon;
grant execute on function public.revoke_tenant_member(uuid) to authenticated;
