-- ============================================================
-- 0009 · Otorgar un rol en una clinica, por correo
--
-- 0008 migra a los usuarios que YA existian, pero no sirve para el primer
-- acceso de una instalacion nueva: su guard solo se dispara si hay
-- usuarios, asi que con auth.users vacio la migracion pasa sin protestar
-- y no crea a nadie. La base queda correcta y sin puerta de entrada.
--
-- Esta funcion cierra ese hueco y ademas es la via normal para dar de
-- alta administracion en una clinica nueva.
--
-- El USUARIO se crea aparte, en el panel de Supabase (Authentication >
-- Users) o con una invitacion. Aqui solo se le da el rol: esta funcion
-- no crea cuentas ni toca contraseñas.
-- ============================================================

create or replace function public.grant_tenant_role(
  p_email  text,
  p_tenant text,
  p_role   text
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  if p_role not in ('owner','admin_consultorio','admin_cafe','doctor','barista','user') then
    raise exception 'Rol no valido: %. Usa owner, admin_consultorio, admin_cafe, doctor, barista o user.', p_role;
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'No existe la clinica %.', p_tenant;
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_user_id is null then
    raise exception
      'No hay ningun usuario con el correo %. Crea ese usuario primero en el panel de Supabase (Authentication > Users) y vuelve a correr esto.',
      p_email;
  end if;

  -- La tabla es la fuente de verdad; el claim es su cache. En ese orden.
  insert into public.tenant_members (tenant_id, user_id, role, active)
  values (p_tenant, v_user_id, p_role, true)
  on conflict (tenant_id, user_id)
  do update set role = excluded.role, active = true, updated_at = now();

  -- Se FUSIONA: pisar app_metadata dejaria al usuario sin sus otras
  -- clinicas.
  update auth.users
  set raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object(
             'memberships',
             coalesce(raw_app_meta_data -> 'memberships', '{}'::jsonb)
               || jsonb_build_object(p_tenant, p_role)
           )
  where id = v_user_id;

  raise notice 'Listo: % es ahora % en la clinica %. Tiene que cerrar sesion y volver a entrar para que su token traiga el rol nuevo.',
    p_email, p_role, p_tenant;

  return v_user_id;
end $$;

-- Escribe permisos: no debe poder invocarla nadie por API.
revoke all on function public.grant_tenant_role(text, text, text) from public, anon, authenticated;
