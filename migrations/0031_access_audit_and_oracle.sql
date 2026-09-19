-- ============================================================
-- 0031 · Quien da acceso a una clinica deja rastro, y el alta
--        de personal deja de ser un directorio de la plataforma
--
-- Dos huecos en set_tenant_member_role y su entorno. El hallazgo C.
--
-- ------------------------------------------------------------
-- 1 · OTORGAR ACCESO NO SE AUDITABA
--
-- Medido: de las 11 tablas con trigger de auditoria, ni tenant_members
-- ni tenants estaban. Ni el alta, ni el cambio de rol, ni la baja
-- dejaban una sola fila en audit_log. En un sistema donde la bitacora
-- existe para NOM-024, el registro de QUIEN LE DIO ACCESO AL EXPEDIENTE
-- A QUIEN sencillamente no existia. Pesa mas que el oraculo de abajo: el
-- oraculo filtra correos, esto hace indetectable el acceso.
--
-- tenants necesita ademas resolver su propio tenant: la tabla no tiene
-- columna tenant_id porque la fila ES el tenant, igual que patients en
-- 0030. Sin eso la entrada quedaria con tenant_id null, y la policy de
-- lectura es (tenant_id = current_tenant_id() and is_super_admin()):
-- una fila con tenant nulo no la ve NADIE. Seria un agujero negro de
-- solo escritura, que es peor que no auditar, porque parece que si.
--
-- ------------------------------------------------------------
-- 2 · EL ALTA DE PERSONAL ERA UN ORACULO SILENCIOSO
--
-- set_tenant_member_role resolvia el usuario ANTES de validar lo demas,
-- asi que respondia distinto segun el correo existiera o no en la
-- plataforma entera:
--
--   'no.existe@ninguna.com' , 'doctor'  -> "No existe ningun usuario..."
--   'alguien@real.com'      , 'doctor'  -> "Un doctor necesita una ficha..."
--
-- Ninguna de las dos escribe una fila. Verificado: el sondeo deja CERO
-- rastro. Es enumeracion sin efecto y repetible de cualquier correo,
-- disponible para el dueño de cualquier clinica.
--
-- Y contradice un invariante que el propio repo declara. 0011:50, sobre
-- list_tenant_members: "Solo devuelve miembros del tenant activo, asi
-- que un owner nunca alcanza usuarios de otra clinica."
--
-- EL ARREGLO es de ORDEN, no de mensaje. El usuario se resuelve sin
-- levantar error; se corren primero todas las validaciones que no
-- dependen de quien sea; y el "no existe" se levanta AL FINAL, cuando ya
-- es lo unico que puede fallar. Asi un sondeo choca siempre contra la
-- misma pared, exista el correo o no.
--
-- Queda un oraculo residual: pedir rol 'barista' de un correo que existe
-- SI escribe. Pero eso ya no es silencioso -la pieza 1 lo registra- y un
-- oraculo ruidoso y trazable es otra categoria. Cerrarlo del todo pide
-- consentimiento del invitado, que es cambio de flujo y va aparte.
--
-- Lo que SIGUE distinguiendo son las validaciones sobre miembros de TU
-- PROPIA clinica ("es el unico dueño", "no puedes cambiar tu rol"). Es
-- deliberado: esos correos ya los conoces por list_tenant_members, asi
-- que no filtran nada que no tuvieras.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La bitacora aprende a ubicar una fila de tenants.
--
-- Reemplaza la funcion ENTERA, que es como 0022 perdio el caso de
-- patients y creo el hueco que 0030 tuvo que arreglar. Lo de 0030 va
-- reproducido aqui integro, y tests/tenancy/0021 lo vigila.
-- ------------------------------------------------------------
create or replace function public.record_audit_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new     jsonb;
  v_old     jsonb;
  v_row     jsonb;
  v_tenant  text;
  v_patient uuid;
  v_campos  text[];
  v_clinica boolean;
begin
  v_new := case when new is null then null else to_jsonb(new) end;
  v_old := case when old is null then null else to_jsonb(old) end;
  v_row := coalesce(v_new, v_old);

  -- De que clinica es el movimiento. La fila lo dice, o la fila LO ES
  -- (tenants), o lo dice la sesion.
  v_tenant := coalesce(
    v_row ->> 'tenant_id',
    case when tg_table_name = 'tenants' then v_row ->> 'id' end,
    public.current_tenant_id());

  -- El paciente al que pertenece el movimiento. Tres formas, en orden:
  -- la fila lo dice, la fila LO ES, o lo sabe la nota de la que cuelga.
  begin
    v_patient := nullif(v_row ->> 'patient_id', '')::uuid;
  exception when others then
    v_patient := null;
  end;

  if v_patient is null and tg_table_name = 'patients' then
    begin
      v_patient := nullif(v_row ->> 'id', '')::uuid;
    exception when others then
      v_patient := null;
    end;
  end if;

  if v_patient is null and tg_table_name = 'note_addenda' then
    begin
      select n.patient_id into v_patient
      from public.clinical_notes n
      where n.tenant_id = v_tenant
        and n.id = nullif(v_row ->> 'note_id', '')::uuid;
    exception when others then
      v_patient := null;
    end;
  end if;

  if v_new is not null and v_old is not null then
    select array_agg(clave order by clave) into v_campos
    from jsonb_object_keys(v_new) as clave
    where v_new -> clave is distinct from v_old -> clave
      and clave <> 'updated_at';
  elsif v_new is not null then
    select array_agg(clave order by clave) into v_campos
    from jsonb_object_keys(v_new) as clave
    where v_new -> clave <> 'null'::jsonb;
  end if;

  v_clinica := tg_table_name in ('clinical_notes', 'note_addenda');

  insert into public.audit_log (
    tenant_id, actor_user_id, actor_role, action, table_name, record_id,
    patient_id, changed_fields, old_data, new_data
  ) values (
    v_tenant,
    auth.uid(),
    coalesce(public.current_tenant_role(), 'anon'),
    tg_op,
    tg_table_name,
    v_row ->> 'id',
    v_patient,
    v_campos,
    case when v_clinica then null else v_old end,
    case when v_clinica then null else v_new end
  );
  return coalesce(new, old);
end $$;

comment on function public.record_audit_entry() is
  'Bitacora de cambios. Ubica la clinica por la columna tenant_id, o por id cuando la fila ES el tenant. Resuelve el paciente de tres formas: la fila trae patient_id, la fila ES el paciente (patients), o lo sabe la nota de la que cuelga (note_addenda). Para tablas clinicas guarda que campos cambiaron, no su contenido.';

drop trigger if exists audit_tenant_members on public.tenant_members;
create trigger audit_tenant_members
  after insert or update or delete on public.tenant_members
  for each row execute function public.record_audit_entry();

drop trigger if exists audit_tenants on public.tenants;
create trigger audit_tenants
  after insert or update or delete on public.tenants
  for each row execute function public.record_audit_entry();

-- ------------------------------------------------------------
-- 2 · El alta de personal deja de distinguir por existencia.
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
begin
  if p_role not in ('owner','admin_consultorio','admin_cafe','doctor','barista') then
    raise exception 'Rol no valido: %.', p_role;
  end if;

  -- El usuario se resuelve pero NO se reclama todavia. Antes esto
  -- levantaba la excepcion aqui mismo, y ese era el oraculo: el correo
  -- decidia cual de los dos mensajes veias. Ahora v_user_id puede quedar
  -- en null y el codigo de abajo esta escrito para tolerarlo.
  select id into v_user_id
    from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  select count(*) into v_cuentas
    from auth.users where lower(email) = lower(trim(p_email));

  v_therapist := case when p_role = 'doctor' then nullif(trim(p_therapist_id), '') else null end;

  -- Validaciones que NO dependen de quien sea el usuario. Van primero a
  -- proposito: son las que hacen que un sondeo choque siempre contra la
  -- misma pared.
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
    --
    -- El 'v_user_id is null or' es lo que evita un segundo oraculo: sin
    -- el, una ficha ya ocupada respondia "ya esta asignada" para un
    -- correo real y "no existe" para uno inventado. Con null se trata
    -- como "otro usuario", que es lo que es.
    if exists (select 1 from public.tenant_members m
               where m.tenant_id = v_tenant and m.therapist_id = v_therapist
                 and (v_user_id is null or m.user_id <> v_user_id)) then
      raise exception 'Esa ficha de terapeuta ya esta asignada a otro usuario.';
    end if;
  end if;

  -- Recien aqui se reclama la identidad: cuando ya es lo unico que puede
  -- fallar, asi que saberlo no distingue nada que no se supiera.
  if v_cuentas > 1 then
    raise exception 'Hay mas de una cuenta con el correo %. Resuelvelo antes de asignar permisos.', p_email;
  end if;
  if v_user_id is null then
    raise exception 'No existe ningun usuario con el correo %. Tiene que registrarse primero.', p_email;
  end if;

  -- Las dos de abajo SI distinguen, y se deja asi: hablan de miembros de
  -- tu propia clinica, cuyos correos ya te da list_tenant_members.
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

comment on function public.set_tenant_member_role(text, text, text) is
  'Asigna rol en la clinica activa. Las validaciones van ordenadas para que un correo que no existe y uno que si choquen contra el mismo error: el "no existe" se levanta al final. Sigue sin pedir consentimiento al invitado; eso es cambio de flujo y va aparte.';
