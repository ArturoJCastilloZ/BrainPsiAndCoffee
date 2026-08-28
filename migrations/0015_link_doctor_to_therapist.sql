-- ============================================================
-- 0015 · Vincular al doctor con su ficha de terapeuta
--
-- La pantalla de Accesos podia nombrar a alguien 'doctor' pero no
-- vincularlo con su ficha en therapists. Ni grant_tenant_role (0009) ni
-- set_tenant_member_role (0011) escribian therapist_id: ni en
-- tenant_members ni en el claim app_metadata.therapist_ids. Solo lo hacia
-- la Edge Function de alta de doctores.
--
-- El efecto es un rol que no puede hacer NADA, y sin decir por que:
-- current_therapist_id() devuelve vacio, y como todas las policies
-- clinicas comparan therapist_id contra ese valor, el doctor no puede
-- crear citas, no ve pacientes y no ve notas. El mensaje que llega a la
-- pantalla es 'new row violates row-level security policy', que no apunta
-- a la causa.
--
-- Aqui las dos funciones reciben la ficha y la escriben en los dos
-- lugares. Y como un doctor sin ficha es un rol inservible, se exige al
-- asignarlo en vez de dejar que falle despues.
-- ============================================================

create or replace function public.set_tenant_member_role(
  p_email        text,
  p_role         text,
  p_therapist_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant    text := public.assert_tenant_owner();
  v_user_id   uuid;
  v_therapist text;
begin
  if p_role not in ('owner','admin_consultorio','admin_cafe','doctor','barista') then
    raise exception 'Rol no valido: %.', p_role;
  end if;

  -- Quien es el usuario se resuelve PRIMERO: es el sujeto de la
  -- operacion, y decirle "falta la ficha" a alguien cuyo correo ni existe
  -- manda a revisar lo que no es.
  begin
    select id into strict v_user_id from auth.users
    where lower(email) = lower(trim(p_email));
  exception
    when no_data_found then
      raise exception 'No existe ningun usuario con el correo %. Tiene que registrarse primero.', p_email;
    when too_many_rows then
      raise exception 'Hay mas de una cuenta con el correo %. Resuelvelo antes de asignar permisos.', p_email;
  end;

  -- La ficha solo tiene sentido para un doctor: a los demas se les limpia
  -- para no dejar un vinculo colgando que nadie lee.
  v_therapist := case when p_role = 'doctor' then nullif(trim(p_therapist_id), '') else null end;

  if p_role = 'doctor' then
    if v_therapist is null then
      raise exception 'Un doctor necesita una ficha de terapeuta: sin ella no puede crear citas ni ver a sus pacientes.';
    end if;
    if not exists (select 1 from public.therapists t
                   where t.tenant_id = v_tenant and t.id = v_therapist) then
      raise exception 'No existe la ficha de terapeuta "%" en esta clinica.', v_therapist;
    end if;
    -- Dos usuarios sobre la misma ficha se verian las citas y las notas
    -- entre si, porque las policies comparan por therapist_id.
    if exists (select 1 from public.tenant_members m
               where m.tenant_id = v_tenant and m.therapist_id = v_therapist
                 and m.user_id <> v_user_id) then
      raise exception 'Esa ficha de terapeuta ya esta asignada a otro usuario.';
    end if;
  end if;

  if v_user_id = auth.uid() then
    raise exception 'No puedes cambiar tu propio rol. Pideselo a otro dueño de la clinica.';
  end if;

  if p_role <> 'owner'
     and exists (select 1 from public.tenant_members
                 where tenant_id = v_tenant and user_id = v_user_id
                   and role = 'owner' and active)
     and (select count(*) from public.tenant_members
          where tenant_id = v_tenant and role = 'owner' and active) <= 1 then
    raise exception 'Es el unico dueño de la clinica: nombra a otro antes de cambiarle el rol.';
  end if;

  insert into public.tenant_members (tenant_id, user_id, role, therapist_id, active)
  values (v_tenant, v_user_id, p_role, v_therapist, true)
  on conflict (tenant_id, user_id)
  do update set role = excluded.role,
                therapist_id = excluded.therapist_id,
                active = true,
                updated_at = now();

  -- El claim lleva las dos cosas. therapist_ids se fusiona igual que
  -- memberships: un psiquiatra en dos clinicas tiene una ficha en cada
  -- una, y pisarlo lo dejaria sin la otra.
  update auth.users
  set raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object(
             'memberships',
             coalesce(raw_app_meta_data -> 'memberships', '{}'::jsonb)
               || jsonb_build_object(v_tenant, p_role))
        || jsonb_build_object(
             'therapist_ids',
             case when v_therapist is null
               then coalesce(raw_app_meta_data -> 'therapist_ids', '{}'::jsonb) - v_tenant
               else coalesce(raw_app_meta_data -> 'therapist_ids', '{}'::jsonb)
                      || jsonb_build_object(v_tenant, v_therapist)
             end)
  where id = v_user_id;

  return v_user_id;
end $$;

revoke all on function public.set_tenant_member_role(text, text, text) from public, anon;
grant execute on function public.set_tenant_member_role(text, text, text) to authenticated;
-- La firma de dos argumentos se retira: dejarla permitiria seguir creando
-- doctores sin ficha, que es justo lo que esto corrige.
drop function if exists public.set_tenant_member_role(text, text);

-- grant_tenant_role tenia el mismo hueco. Es la via del primer acceso y
-- de la linea de comandos.
create or replace function public.grant_tenant_role(
  p_email        text,
  p_tenant       text,
  p_role         text,
  p_therapist_id text default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid;
  v_therapist text;
begin
  if p_role not in ('owner','admin_consultorio','admin_cafe','doctor','barista','user') then
    raise exception 'Rol no valido: %.', p_role;
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'No existe la clinica %.', p_tenant;
  end if;

  v_therapist := case when p_role = 'doctor' then nullif(trim(p_therapist_id), '') else null end;
  if p_role = 'doctor' then
    if v_therapist is null then
      raise exception 'Un doctor necesita una ficha de terapeuta. Pasa el id como cuarto argumento.';
    end if;
    if not exists (select 1 from public.therapists t
                   where t.tenant_id = p_tenant and t.id = v_therapist) then
      raise exception 'No existe la ficha de terapeuta "%" en la clinica %.', v_therapist, p_tenant;
    end if;
  end if;

  begin
    select id into strict v_user_id from auth.users
    where lower(email) = lower(trim(p_email));
  exception
    when no_data_found then
      raise exception 'No hay ningun usuario con el correo %. Crea ese usuario primero en el panel de Supabase (Authentication > Users) y vuelve a correr esto.', p_email;
    when too_many_rows then
      raise exception 'Hay mas de una cuenta con el correo %.', p_email;
  end;

  insert into public.tenant_members (tenant_id, user_id, role, therapist_id, active)
  values (p_tenant, v_user_id, p_role, v_therapist, true)
  on conflict (tenant_id, user_id)
  do update set role = excluded.role,
                therapist_id = excluded.therapist_id,
                active = true,
                updated_at = now();

  update auth.users
  set raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object(
             'memberships',
             coalesce(raw_app_meta_data -> 'memberships', '{}'::jsonb)
               || jsonb_build_object(p_tenant, p_role))
        || jsonb_build_object(
             'therapist_ids',
             case when v_therapist is null
               then coalesce(raw_app_meta_data -> 'therapist_ids', '{}'::jsonb) - p_tenant
               else coalesce(raw_app_meta_data -> 'therapist_ids', '{}'::jsonb)
                      || jsonb_build_object(p_tenant, v_therapist)
             end)
  where id = v_user_id;

  raise notice 'Listo: % es ahora % en la clinica %. Tiene que cerrar sesion y volver a entrar para que su token traiga el rol nuevo.',
    p_email, p_role, p_tenant;
  return v_user_id;
end $$;

revoke all on function public.grant_tenant_role(text, text, text, text) from public, anon, authenticated;
drop function if exists public.grant_tenant_role(text, text, text);

-- Quien ya quedo como doctor sin ficha no puede trabajar y no lo sabe.
-- Se reporta al aplicar en vez de dejar que lo descubra al primer error.
do $$
declare v_lista text;
begin
  select string_agg(u.email || ' (clinica ' || m.tenant_id || ')', ', ')
    into v_lista
  from public.tenant_members m
  join auth.users u on u.id = m.user_id
  where m.role = 'doctor' and m.active and m.therapist_id is null;

  if v_lista is not null then
    raise notice
      E'ATENCION · hay doctores SIN ficha de terapeuta: %\n  No pueden crear citas ni ver pacientes. Reasignales el rol desde Accesos eligiendo su ficha.',
      v_lista;
  end if;
end $$;
