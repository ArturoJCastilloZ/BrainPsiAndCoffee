-- ============================================================
-- 0032 · A una clinica se entra aceptando, no porque te metan
--
-- La pieza 3 del hallazgo C. Hoy el dueño de cualquier clinica puede
-- meter a cualquier usuario REGISTRADO en la suya sin pedirle nada:
-- entra a tenant_members, un tercero le escribe el raw_app_meta_data a
-- su cuenta de autenticacion, y su correo pasa a verse en la pantalla
-- de Accesos de quien lo metio.
--
-- ------------------------------------------------------------
-- QUIEN OTORGA EL ACCESO, DE VERDAD
--
-- Medido antes de diseñar, porque la primera version de esta propuesta
-- se apoyaba en algo falso. La cadena es:
--
--   current_tenant_id()   -> auth.jwt() -> app_metadata -> memberships
--                            ? requested_tenant()
--   current_tenant_role() -> ...memberships ->> current_tenant_id()
--   is_super_admin() / is_doctor() / is_clinic_admin()
--                         -> comparan current_tenant_role()
--
-- Todo eso sale del CLAIM. De las 49 policies solo DOS consultan
-- tenant_members: tenants_member_read y la de profiles. Asi que
-- tenant_members.active casi no participa en el control de acceso: lo
-- que otorga es LA ESCRITURA DEL CLAIM.
--
-- Por eso una invitacion no concede nada: no porque active=false cierre
-- las policies -no lo hace-, sino porque NO se escribe el claim. El
-- active=false ademas cierra las dos policies que si miran la tabla.
-- Mismo resultado, razon distinta, y la razon decide que hay que NO
-- hacer.
--
-- ------------------------------------------------------------
-- LO QUE CAMBIA Y LO QUE NO
--
--  * Meter a alguien que NO es miembro activo -> INVITACION:
--    active=false, invited_at=now(), y el claim SIN TOCAR.
--  * Cambiarle el rol a quien YA acepto estar en la clinica sigue
--    siendo inmediato. No hace falta consentimiento para mover de
--    barista a admin a quien ya esta dentro.
--  * grant_tenant_role NO se toca. Es la via del primer acceso y de la
--    linea de comandos (ver 0015): meterle consentimiento puede dejar a
--    alguien fuera de su propia clinica sin nadie que lo rescate.
--  * El alta de un doctor NUEVO tampoco cambia: inviteUserByEmail manda
--    un correo que la persona tiene que abrir para poner contraseña, y
--    eso ya es consentimiento. Lo que cambia es el usuario YA
--    REGISTRADO que se empareja por correo, que es la misma puerta por
--    otra pantalla.
--
-- CADUCIDAD: 7 dias. Una invitacion pendiente que nadie acepta no puede
-- quedarse viva para siempre; dentro de un año alguien la acepta y
-- entra a una clinica que ya no se acuerda de el.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Cuando se invito. NULL = no es una invitacion.
--
-- Columna propia y no updated_at: updated_at lo mueve cualquier
-- escritura, asi que la caducidad se reiniciaria sola sin que nadie
-- invitara de nuevo.
-- ------------------------------------------------------------
alter table public.tenant_members
  add column if not exists invited_at timestamptz;

comment on column public.tenant_members.invited_at is
  'Cuando se envio la invitacion. NULL en una membresia aceptada. Caduca a los 7 dias, y la caducidad la comprueba accept_tenant_invitation.';

-- El indice que ya existia es parcial sobre WHERE active, asi que no
-- sirve para buscar lo PENDIENTE, que es por definicion lo inactivo.
create index if not exists tenant_members_pendientes_idx
  on public.tenant_members (user_id)
  where invited_at is not null;

-- ------------------------------------------------------------
-- 2 · Que invitaciones tengo.
--
-- Anclada a auth.uid() y SIN current_tenant_id(): quien tiene una
-- invitacion pendiente puede no tener ninguna clinica activa -puede no
-- tener ninguna clinica en absoluto-, asi que no hay contexto de tenant
-- del que colgarse. Es definer porque con active=false el invitado no
-- pasa is_active_member y no puede leer ni el nombre de la clinica.
--
-- Devuelve tambien las caducadas, marcadas: que la pantalla pueda decir
-- "caduco, pide que te vuelvan a invitar" es mejor que no mostrar nada
-- y dejar a la persona esperando un correo que ya no sirve.
-- ------------------------------------------------------------
create or replace function public.my_pending_invitations()
returns table (
  tenant_id   text,
  tenant_name text,
  role        text,
  invited_at  timestamptz,
  expira_el   timestamptz,
  caducada    boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.tenant_id,
         t.name,
         m.role,
         m.invited_at,
         m.invited_at + interval '7 days',
         m.invited_at + interval '7 days' < now()
    from public.tenant_members m
    join public.tenants t on t.id = m.tenant_id
   where m.user_id = auth.uid()
     and m.active = false
     and m.invited_at is not null
   order by m.invited_at desc;
$$;

revoke all on function public.my_pending_invitations() from public, anon;
grant execute on function public.my_pending_invitations() to authenticated;

-- ------------------------------------------------------------
-- 3 · Aceptar.
--
-- Es el UNICO punto donde el claim de esta persona gana esta clinica, y
-- lo ejecuta ella. Ese es todo el mecanismo del consentimiento: no hay
-- nada que un tercero pueda llamar para conseguir el mismo efecto.
-- ------------------------------------------------------------
create or replace function public.accept_tenant_invitation(p_tenant_id text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid := auth.uid();
  v_role      text;
  v_therapist text;
  v_invited   timestamptz;
begin
  if v_user_id is null then
    raise exception 'No hay sesion.';
  end if;

  select role, therapist_id, invited_at
    into v_role, v_therapist, v_invited
    from public.tenant_members
   where tenant_id = p_tenant_id
     and user_id = v_user_id
     and active = false
     and invited_at is not null;

  if v_role is null then
    raise exception 'No tienes una invitacion pendiente de esa clinica.';
  end if;

  -- La caducidad se comprueba AQUI y no al listarla: entre que se
  -- pinta la pantalla y se pulsa el boton pasa tiempo, y lo que decide
  -- es el momento de entrar.
  if v_invited + interval '7 days' < now() then
    raise exception 'La invitacion caduco. Pide que te vuelvan a invitar.';
  end if;

  update public.tenant_members
     set active = true,
         invited_at = null,
         updated_at = now()
   where tenant_id = p_tenant_id and user_id = v_user_id;

  -- Si la invitacion trae ficha, se liga AQUI y no al invitar: una
  -- invitacion no debe tocar nada fuera de tenant_members. Ligar la
  -- ficha a alguien que todavia no acepto deja el catalogo diciendo que
  -- esa doctora ya es de la casa.
  if v_therapist is not null then
    update public.therapists
       set user_id = v_user_id, updated_at = now()
     where tenant_id = p_tenant_id and id = v_therapist;
  end if;

  -- El claim se FUSIONA, nunca se reemplaza: quien atiende en dos
  -- consultorios perderia el otro.
  update auth.users
  set raw_app_meta_data =
        coalesce(raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object(
             'memberships',
             coalesce(raw_app_meta_data -> 'memberships', '{}'::jsonb)
               || jsonb_build_object(p_tenant_id, v_role))
        || jsonb_build_object(
             'therapist_ids',
             case when v_therapist is null
               then coalesce(raw_app_meta_data -> 'therapist_ids', '{}'::jsonb) - p_tenant_id
               else coalesce(raw_app_meta_data -> 'therapist_ids', '{}'::jsonb)
                      || jsonb_build_object(p_tenant_id, v_therapist)
             end)
  where id = v_user_id;

  return v_role;
end $$;

revoke all on function public.accept_tenant_invitation(text) from public, anon;
grant execute on function public.accept_tenant_invitation(text) to authenticated;

-- ------------------------------------------------------------
-- 4 · Rechazar. Borra la fila; 0031 la audita.
-- ------------------------------------------------------------
create or replace function public.decline_tenant_invitation(p_tenant_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_n integer;
begin
  if v_user_id is null then
    raise exception 'No hay sesion.';
  end if;

  delete from public.tenant_members
   where tenant_id = p_tenant_id
     and user_id = v_user_id
     and active = false
     and invited_at is not null;

  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'No tienes una invitacion pendiente de esa clinica.';
  end if;
end $$;

revoke all on function public.decline_tenant_invitation(text) from public, anon;
grant execute on function public.decline_tenant_invitation(text) to authenticated;

-- ------------------------------------------------------------
-- 5 · Otorgar pasa a INVITAR cuando la persona no esta ya dentro.
--
-- Se reproduce entera la de 0031 -incluido el orden de validaciones que
-- cierra el oraculo- y cambia solo el tramo de escritura. Es el mismo
-- 'create or replace' completo con el que 0022 perdio un caso y creo el
-- hueco que 0030 tuvo que arreglar; tests/tenancy/0022_access_oracle.sql
-- vigila que el oraculo no vuelva.
-- ------------------------------------------------------------
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
  v_cuentas   integer;
  v_therapist text;
  v_ya_dentro boolean;
begin
  if p_role not in ('owner','admin_consultorio','admin_cafe','doctor','barista') then
    raise exception 'Rol no valido: %.', p_role;
  end if;

  -- El usuario se resuelve pero NO se reclama todavia: el "no existe" se
  -- levanta al final, cuando ya es lo unico que puede fallar. Ver 0031.
  select id into v_user_id
    from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  select count(*) into v_cuentas
    from auth.users where lower(email) = lower(trim(p_email));

  v_therapist := case when p_role = 'doctor' then nullif(trim(p_therapist_id), '') else null end;

  if p_role = 'doctor' then
    if v_therapist is null then
      raise exception 'Un doctor necesita una ficha de terapeuta: sin ella no puede crear citas ni ver a sus pacientes.';
    end if;
    if not exists (select 1 from public.therapists t
                   where t.tenant_id = v_tenant and t.id = v_therapist) then
      raise exception 'No existe la ficha de terapeuta "%" en esta clinica.', v_therapist;
    end if;
    if exists (select 1 from public.tenant_members m
               where m.tenant_id = v_tenant and m.therapist_id = v_therapist
                 and (v_user_id is null or m.user_id <> v_user_id)) then
      raise exception 'Esa ficha de terapeuta ya esta asignada a otro usuario.';
    end if;
  end if;

  if v_cuentas > 1 then
    raise exception 'Hay mas de una cuenta con el correo %. Resuelvelo antes de asignar permisos.', p_email;
  end if;
  if v_user_id is null then
    raise exception 'No existe ningun usuario con el correo %. Tiene que registrarse primero.', p_email;
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

  -- AQUI esta el consentimiento. Quien ya acepto estar en la clinica
  -- cambia de rol al instante; a quien no, se le INVITA.
  v_ya_dentro := exists (
    select 1 from public.tenant_members
     where tenant_id = v_tenant and user_id = v_user_id and active);

  if v_ya_dentro then
    update public.tenant_members
       set role = p_role,
           therapist_id = v_therapist,
           updated_at = now()
     where tenant_id = v_tenant and user_id = v_user_id;

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
  end if;

  -- Invitacion. El claim NO se toca: es lo unico que otorga acceso, y
  -- escribirlo aqui seria meter a la persona sin preguntarle, que es el
  -- defecto que esta migracion cierra. Reinvitar renueva la caducidad.
  insert into public.tenant_members (tenant_id, user_id, role, therapist_id, active, invited_at)
  values (v_tenant, v_user_id, p_role, v_therapist, false, now())
  on conflict (tenant_id, user_id)
  do update set role = excluded.role,
                therapist_id = excluded.therapist_id,
                active = false,
                invited_at = now(),
                updated_at = now();

  return v_user_id;
end $$;

comment on function public.set_tenant_member_role(text, text, text) is
  'Asigna rol en la clinica activa. A quien ya acepto estar dentro le cambia el rol al instante; a quien no, lo INVITA (active=false, sin tocar el claim) y la invitacion caduca a los 7 dias. Las validaciones van ordenadas para que un correo que no existe y uno que si choquen contra el mismo error.';

-- ------------------------------------------------------------
-- 6 · La pantalla de Accesos tiene que DECIR que esta pendiente.
--
-- list_tenant_members ya devolvia las filas inactivas -no filtra por
-- active-, asi que la invitacion aparecia, pero indistinguible de una
-- membresia normal. Sin esto el dueño invita, ve a la persona en la
-- lista como si ya estuviera dentro, y no entiende por que no entra.
--
-- Se DROPEA y se recrea porque cambia el tipo de retorno, y eso
-- 'create or replace' no lo admite.
-- ------------------------------------------------------------
drop function if exists public.list_tenant_members();

create function public.list_tenant_members()
returns table (
  user_id      uuid,
  email        text,
  role         text,
  therapist_id text,
  active       boolean,
  is_self      boolean,
  created_at   timestamptz,
  invited_at   timestamptz,
  expira_el    timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_tenant text := public.assert_tenant_owner();
begin
  return query
  select m.user_id, u.email::text, m.role, m.therapist_id, m.active,
         m.user_id = auth.uid(), m.created_at,
         m.invited_at,
         case when m.invited_at is null then null
              else m.invited_at + interval '7 days' end
    from public.tenant_members m
    join auth.users u on u.id = m.user_id
   where m.tenant_id = v_tenant
   order by (m.role = 'owner') desc, u.email;
end $$;

revoke all on function public.list_tenant_members() from public, anon;
grant execute on function public.list_tenant_members() to authenticated;
