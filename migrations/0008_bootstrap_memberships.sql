-- ============================================================
-- 0008 · Bootstrap de membresias del tenant #1
--
-- Sin esto, migrar deja a TODOS fuera. Los usuarios existentes traen el
-- modelo viejo en app_metadata (un 'role' global y un 'therapist_id'
-- suelto) y ninguna membresia, asi que current_tenant_id() les devuelve
-- null y toda policy les da cero filas: el propio dueño se queda sin
-- entrar a su admin.
--
-- Esta migracion los pasa al modelo nuevo: crea su fila en
-- tenant_members y les escribe el claim memberships. Se hace desde la
-- migracion porque app_metadata solo lo escribe algo con nivel de
-- service_role, y el runner ya corre con esos permisos.
--
-- Es idempotente: se puede volver a correr sin duplicar ni pisar a quien
-- ya tenga membresias.
-- ============================================================

-- Se define como funcion, no como un bloque suelto, para poder
-- re-ejecutarla al dar de alta una clinica nueva y para que las pruebas
-- puedan invocarla. Es idempotente.
create or replace function public.bootstrap_tenant_memberships(p_tenant text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_tenant    text := p_tenant;
  v_user      record;
  v_role      text;
  v_therapist text;
  v_creados   integer := 0;
begin
  if not exists (select 1 from public.tenants where id = v_tenant) then
    raise exception 'No existe el tenant %. La migracion 0002 debio crearlo.', v_tenant;
  end if;

  for v_user in
    select u.id,
           coalesce(u.raw_app_meta_data ->> 'role', '')       as old_role,
           nullif(u.raw_app_meta_data ->> 'therapist_id', '') as old_therapist
    from auth.users u
    -- A quien ya tenga membresias no se le toca: puede venir de una
    -- corrida anterior o haber sido dado de alta en el modelo nuevo.
    where coalesce(u.raw_app_meta_data -> 'memberships', '{}'::jsonb) = '{}'::jsonb
  loop
    -- El super_admin global se vuelve owner DE SU clinica. En un SaaS no
    -- puede existir un rol que mande sobre todos los clientes.
    v_role := case v_user.old_role
      when 'admin'             then 'owner'
      when 'super_admin'       then 'owner'
      when 'admin_consultorio' then 'admin_consultorio'
      when 'admin_cafe'        then 'admin_cafe'
      when 'doctor'            then 'doctor'
      when 'barista'           then 'barista'
      else null
    end;

    -- Sin rol reconocible no se inventa uno: quien no tenia permisos
    -- sigue sin tenerlos. Otorgar por defecto seria abrir accesos que
    -- nadie pidio.
    if v_role is null then
      continue;
    end if;

    v_therapist := v_user.old_therapist;

    -- La fila en therapists tambien se busca por tenant: el id de
    -- terapeuta ya solo es unico dentro de su clinica.
    if v_therapist is not null
       and not exists (
         select 1 from public.therapists t
         where t.tenant_id = v_tenant and t.id = v_therapist
       ) then
      v_therapist := null;
    end if;

    insert into public.tenant_members (tenant_id, user_id, role, therapist_id, active)
    values (v_tenant, v_user.id, v_role, v_therapist, true)
    on conflict (tenant_id, user_id) do nothing;

    -- El claim es la cache de tenant_members, asi que la tabla —que es la
    -- fuente de verdad— se escribe primero.
    update auth.users
    set raw_app_meta_data =
          coalesce(raw_app_meta_data, '{}'::jsonb)
          || jsonb_build_object('memberships', jsonb_build_object(v_tenant, v_role))
          || case
               when v_therapist is not null
               then jsonb_build_object('therapist_ids', jsonb_build_object(v_tenant, v_therapist))
               else '{}'::jsonb
             end
    where id = v_user.id;

    v_creados := v_creados + 1;
  end loop;

  raise notice 'Membresias creadas para % usuario(s) en el tenant %.', v_creados, v_tenant;

  -- Si el sistema tiene usuarios pero ninguno quedo con acceso de
  -- administracion, migrar dejaria el admin inaccesible. Mejor detenerse
  -- aqui, con la transaccion entera intacta, que descubrirlo al intentar
  -- entrar.
  if exists (select 1 from auth.users)
     and not exists (
       select 1 from public.tenant_members
       where tenant_id = v_tenant and role in ('owner','admin_consultorio') and active
     ) then
    raise exception
      'Ningun usuario quedo como owner o admin_consultorio en %: nadie podria entrar al admin. Revisa el role en app_metadata de los usuarios existentes.',
      v_tenant;
  end if;

  -- Los claims viejos ya no los lee nadie: los helpers usan memberships y
  -- therapist_ids. Se retiran para no dejar dos fuentes de permisos que
  -- puedan discrepar — el mismo motivo por el que 0005 elimino
  -- profiles.role.
  update auth.users
  set raw_app_meta_data = (raw_app_meta_data - 'role') - 'therapist_id'
  where raw_app_meta_data ? 'role' or raw_app_meta_data ? 'therapist_id';

  return v_creados;
end;
$fn$;

-- Escribe app_metadata: no debe poder invocarla nadie por API.
revoke all on function public.bootstrap_tenant_memberships(text) from public, anon, authenticated;

select public.bootstrap_tenant_memberships('brainpsi');
