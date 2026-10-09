-- 0035 · Los permisos salen de la TABLA, no de la cache del JWT; una ficha
-- con expediente no cambia de dueño; la firma la fecha el servidor; la
-- bitacora no guarda contenido clinico.
--
-- Auditoria del 2026-10-09, hallazgos S2, S7, S8 y S11. Cada bloque lo
-- prueba tests/tenancy/0026_access_hardening.sql.

-- ============================================================
-- 1 · Membresia, rol y ficha desde tenant_members (S8)
--
-- current_tenant_id(), current_tenant_role() y current_therapist_id() son
-- el punto por el que pasan las ~40 policies. Las tres leian el CLAIM del
-- JWT, que es la cache de tenant_members y vive hasta que el token expira
-- (1 h). Consecuencias medidas:
--
--   · revocar a un especialista no le cortaba el acceso: con el token aun
--     vigente seguia leyendo notas clinicas;
--   · degradar a un dueño no le quitaba nada hasta renovar sesion;
--   · la ficha clinica que un usuario "es" la decidia el claim, que
--     escriben las Edge Functions con service role — no la tabla que
--     vigilan los triggers.
--
-- Ahora el claim sigue siendo condicion (el tenant tiene que estar en
-- memberships) pero ya no es suficiente: la fila de tenant_members tiene
-- que existir y estar ACTIVA, y de ella salen el rol y la ficha. Es la
-- misma doctrina que el codigo de las Edge Functions ya aplica: "la
-- tabla es la fuente de verdad, el claim su cache".
-- ============================================================

-- Rol y ficha del usuario de la sesion en una clinica. Definer porque las
-- policies de tenant_members llaman a current_tenant_role(): leer la
-- tabla con los permisos del usuario seria recursivo. Solo responden por
-- auth.uid(): nadie puede preguntar por otro.
create or replace function public.active_member_role(p_tenant_id text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role from public.tenant_members m
  where m.tenant_id = p_tenant_id and m.user_id = auth.uid() and m.active;
$$;

create or replace function public.active_member_therapist(p_tenant_id text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.therapist_id from public.tenant_members m
  where m.tenant_id = p_tenant_id and m.user_id = auth.uid() and m.active;
$$;

-- anon tambien: current_tenant_role() se evalua en contextos publicos, y
-- sin sesion auth.uid() es null y la respuesta es null. No revela nada.
revoke all on function public.active_member_role(text) from public;
revoke all on function public.active_member_therapist(text) from public;
grant execute on function public.active_member_role(text) to anon, authenticated;
grant execute on function public.active_member_therapist(text) to anon, authenticated;
grant execute on function public.is_active_member(text) to anon;

create or replace function public.current_tenant_id()
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    -- Mientras deba cambiar la contraseña temporal no hay clinica activa,
    -- y sin clinica activa no hay rol, y sin rol las policies niegan todo.
    when coalesce((auth.jwt() -> 'app_metadata' ->> 'must_change_password')::boolean, false)
      then null
    -- CASE anidado y no AND: SQL no garantiza el orden de un AND, y asi
    -- is_active_member solo se consulta cuando el claim ya lo nombra.
    when auth.jwt() -> 'app_metadata' -> 'memberships' ? public.requested_tenant()
      then case when public.is_active_member(public.requested_tenant())
                then public.requested_tenant() end
    else null
  end;
$$;
comment on function public.current_tenant_id() is
  'La clinica activa de la peticion, o null. Exige que el claim la nombre Y que la membresia este activa en tenant_members: revocar corta el acceso al instante, no cuando expira el token. Null mientras deba cambiar la contraseña temporal.';

create or replace function public.current_tenant_role()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(public.active_member_role(public.current_tenant_id()), '');
$$;
comment on function public.current_tenant_role() is
  'Rol en la clinica activa, leido de tenant_members (no del claim). Cambiar el rol surte efecto en la siguiente peticion.';

create or replace function public.current_therapist_id()
returns text
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(public.active_member_therapist(public.current_tenant_id()), '');
$$;
comment on function public.current_therapist_id() is
  'Ficha clinica del usuario en la clinica activa, leida de tenant_members. La vigilan los triggers de 0035: una ficha con expediente no cambia de dueño.';

-- ============================================================
-- 2 · Una ficha con expediente no cambia de dueño (S2)
--
-- Las notas clinicas cuelgan de la FICHA (encounters.therapist_id), no de
-- la persona. Quien administraba podia revocar al especialista y ligar la
-- misma ficha a otra cuenta —por sync-doctor-access o por invite-staff—,
-- y esa cuenta heredaba lectura y firma sobre todo el historial: un rol
-- que por diseño no alcanza lo clinico se fabricaba el acceso.
--
-- La regla: una ficha que tiene notas escritas por alguien solo puede
-- ligarse a ESA persona. Reincorporar al mismo especialista funciona;
-- darle su expediente a otro, no. Para que alguien nuevo atienda a esos
-- pacientes se le crea su propia ficha: lo anterior queda con su autor.
--
-- Sin excepcion para service_role a proposito: las Edge Functions usan
-- service role, asi que una excepcion ahi seria la puerta.
-- ============================================================
create or replace function public.ficha_tiene_expediente_ajeno(
  p_tenant_id text, p_therapist_id text, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.clinical_notes n
    join public.encounters e on e.tenant_id = n.tenant_id and e.id = n.encounter_id
    where e.tenant_id = p_tenant_id
      and e.therapist_id = p_therapist_id
      and n.author_id is distinct from p_user_id
  );
$$;
revoke all on function public.ficha_tiene_expediente_ajeno(text, text, uuid) from public, anon, authenticated;

create or replace function public.guard_therapist_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ficha text;
  v_user  uuid;
  v_liga  boolean;
begin
  if tg_table_name = 'tenant_members' then
    v_ficha := new.therapist_id;
    v_user  := new.user_id;
    -- Una invitacion pendiente (active=false) todavia no da acceso: se
    -- revisa cuando se ACTIVA, que es cuando lo daria.
    v_liga := new.active and v_ficha is not null and (
      tg_op = 'INSERT'
      or old.therapist_id is distinct from new.therapist_id
      or old.user_id is distinct from new.user_id
      or not old.active);
  else
    v_ficha := new.id;
    v_user  := new.user_id;
    v_liga  := v_user is not null and old.user_id is distinct from new.user_id;
  end if;

  if v_liga and public.ficha_tiene_expediente_ajeno(new.tenant_id, v_ficha, v_user) then
    raise exception using
      message = format('La ficha %s tiene notas clinicas de otra persona: no puede pasar a otro usuario.', v_ficha),
      hint    = 'Para que alguien nuevo atienda a esos pacientes, crea una ficha nueva para esa persona. El expediente anterior se queda con su autor.';
  end if;
  return new;
end $$;

drop trigger if exists guard_therapist_link on public.tenant_members;
create trigger guard_therapist_link
  before insert or update on public.tenant_members
  for each row execute function public.guard_therapist_link();

drop trigger if exists guard_therapist_link on public.therapists;
create trigger guard_therapist_link
  before update of user_id on public.therapists
  for each row execute function public.guard_therapist_link();

-- ============================================================
-- 3 · Las fechas de la nota las pone el servidor (S7)
--
-- signClinicalNote mandaba signed_at desde el navegador, y la policy de
-- INSERT aceptaba una nota YA firmada con created_at y signed_at
-- arbitrarios: se podia fabricar una nota "firmada en 2024". NOM-004 pide
-- que la fecha del expediente sea la del acto, no la que alguien escriba.
--
--   · Al crear: created_at = ahora, y no se admite nacer firmada desde una
--     sesion de la app (los datos historicos y las pruebas, sin sesion, si).
--   · Al firmar: signed_at = ahora, diga lo que diga el cliente.
--   · created_at no cambia nunca.
-- Lo mismo para la fecha de un addendum.
-- ============================================================
create or replace function public.stamp_clinical_times()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'note_addenda' then
    new.created_at := now();
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and (new.signed_at is not null or new.signed_by is not null) then
      raise exception 'Una nota se crea como borrador y se firma despues: no puede nacer firmada.';
    end if;
    new.created_at := now();
    new.updated_at := now();
  else
    new.created_at := old.created_at;
    if old.signed_at is null and new.signed_at is not null then
      new.signed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists stamp_clinical_times on public.clinical_notes;
create trigger stamp_clinical_times
  before insert or update on public.clinical_notes
  for each row execute function public.stamp_clinical_times();

drop trigger if exists stamp_clinical_times on public.note_addenda;
create trigger stamp_clinical_times
  before insert on public.note_addenda
  for each row execute function public.stamp_clinical_times();

-- ============================================================
-- 4 · La bitacora no guarda contenido clinico (S11)
--
-- 0024 habia puesto encounters entre las tablas clinicas; 0030 y 0031
-- reescribieron la funcion entera y lo perdieron, asi que el dueño volvio
-- a leer en audit_log el contenido completo de cada encuentro. Tambien se
-- agrega appointment_notes, la tabla legada de notas: sus filas viejas en
-- la bitacora traen texto clinico.
--
-- Funcion ENTERA otra vez (es como se pierden casos): lo de 0031 va
-- integro, y solo cambia la lista.
-- ============================================================
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

  v_tenant := coalesce(
    v_row ->> 'tenant_id',
    case when tg_table_name = 'tenants' then v_row ->> 'id' end,
    public.current_tenant_id());

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

  v_clinica := tg_table_name in ('clinical_notes', 'note_addenda', 'encounters', 'appointment_notes');

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
  'Bitacora de cambios. Ubica la clinica por la columna tenant_id, o por id cuando la fila ES el tenant. Resuelve el paciente de tres formas: la fila trae patient_id, la fila ES el paciente (patients), o lo sabe la nota de la que cuelga (note_addenda). Para tablas clinicas (notas, addenda, encuentros, notas legadas) guarda que campos cambiaron, no su contenido.';

-- Lo que ya se habia guardado con contenido. Se conserva el QUE (tabla,
-- registro, campos, quien, cuando) y se borra el texto.
update public.audit_log
set old_data = null, new_data = null
where table_name in ('encounters', 'appointment_notes', 'clinical_notes', 'note_addenda')
  and (old_data is not null or new_data is not null);

-- ============================================================
-- 5 · La lista de miembros dice a quien se le puede regenerar la temporal
--
-- invite-staff ya solo regenera la contraseña temporal de quien ESTA
-- clinica creo y nunca ha entrado (auditoria S1). La pantalla de Accesos
-- ofrecia el boton en las invitaciones PENDIENTES, que es justo el caso
-- que ahora se niega. Con esta columna el boton aparece donde sirve, y
-- con la misma regla que aplica la Edge Function.
--
-- Cambia el tipo de retorno, asi que hay que soltarla y crearla.
-- ============================================================
drop function if exists public.list_tenant_members();
create function public.list_tenant_members()
returns table (
  user_id                  uuid,
  email                    text,
  role                     text,
  therapist_id             text,
  active                   boolean,
  is_self                  boolean,
  created_at               timestamptz,
  invited_at               timestamptz,
  expira_el                timestamptz,
  puede_regenerar_temporal boolean
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
              else m.invited_at + interval '7 days' end,
         -- coalesce: sin marca de origen la comparacion da null, y null
         -- no es "no" para quien lo lee. Tiene que ser false.
         coalesce(m.user_id <> auth.uid()
           and u.raw_app_meta_data ->> 'created_by_tenant' = v_tenant
           and u.last_sign_in_at is null
           and not exists (select 1 from public.tenant_members o
                            where o.user_id = m.user_id and o.tenant_id <> v_tenant), false)
    from public.tenant_members m
    join auth.users u on u.id = m.user_id
   where m.tenant_id = v_tenant
   order by (m.role = 'owner') desc, u.email;
end $$;

revoke all on function public.list_tenant_members() from public, anon;
grant execute on function public.list_tenant_members() to authenticated;
