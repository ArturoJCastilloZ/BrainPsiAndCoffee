-- ============================================================
-- 0022 · La auditoria del expediente vuelve a funcionar
--
-- Dos huecos, los dos en el control que NOM-024 exige para acreditar
-- quien toco un expediente.
--
-- 1. log_clinical_note_access() consultaba public.appointment_notes, que
--    0014 elimino. Toda llamada revienta con SQLSTATE 42P01. Verificado
--    ejecutandola con un tenant resuelto:
--      relation "public.appointment_notes" does not exist
--    Ademas no la llamaba NADIE: 0013 creo clinical_notes y nunca se
--    reescribio. Postgres no tiene triggers de SELECT, asi que registrar
--    una LECTURA exige una llamada explicita; sin ella, el registro de
--    accesos al expediente sencillamente no existe.
--
-- 2. record_audit_entry() quedo, en 0004, escribiendo solo que algo
--    cambio: tenant, actor, rol, accion, tabla e id. Las columnas
--    old_data, new_data, changed_fields y patient_id existen en
--    audit_log desde el esquema base y se dejaron en null. Un registro
--    que dice "alguien actualizo la nota X" sin decir QUE cambio no
--    sostiene una auditoria.
--
-- DECISION sobre que se guarda de una nota clinica:
--
-- audit_log lo lee is_super_admin(), que en este modelo es el DUEÑO de la
-- clinica. El diseño deja deliberadamente a la administracion SIN acceso
-- a las notas clinicas (por eso appointment_notes nunca tuvo policy para
-- admin_consultorio). Guardar el cuerpo de la nota en new_data le
-- entregaria el expediente al dueño por la puerta de atras, y anularia
-- esa proteccion sin que nadie lo notara.
--
-- Por eso, para las tablas clinicas se guarda QUE CAMPOS cambiaron y no
-- su contenido. Es lo que la norma necesita —trazabilidad de quien toco
-- que y cuando— sin convertir la bitacora en una segunda copia del
-- expediente, legible por alguien a quien se le nego la primera.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La bitacora de cambios vuelve a decir QUE cambio.
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
  v_tenant := coalesce(v_row ->> 'tenant_id', public.current_tenant_id());

  -- El paciente al que pertenece el movimiento, cuando la fila lo dice.
  -- Es lo que permite responder "quien toco el expediente de X", que es
  -- la pregunta que se le hace a una bitacora clinica.
  begin
    v_patient := nullif(v_row ->> 'patient_id', '')::uuid;
  exception when others then
    v_patient := null;
  end;

  -- Que campos cambiaron. En un insert son todos los que traen valor; en
  -- un delete, ninguno (desaparece la fila entera).
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

  -- El contenido solo se copia si la tabla NO es clinica. Ver la nota de
  -- decision arriba: la bitacora la lee el dueño, y el dueño no tiene
  -- acceso a la nota.
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

-- ------------------------------------------------------------
-- 2 · El registro de LECTURA del expediente, contra la tabla que existe.
--
-- Postgres no tiene triggers de SELECT: leer una nota no deja rastro por
-- si solo. Esta funcion es esa huella, y la aplicacion tiene que
-- llamarla al abrir el expediente de un paciente.
--
-- Comprueba que la nota sea del tenant activo y que quien lee sea su
-- autor —el mismo criterio que la policy de lectura de 0013— para que
-- no sirva como oraculo: llamarla con el id de una nota ajena no debe
-- dejar una entrada que insinue que existe.
-- ------------------------------------------------------------
create or replace function public.log_clinical_note_access(note_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant  text;
  v_patient uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    return;
  end if;

  select n.patient_id into v_patient
  from public.clinical_notes n
  where n.tenant_id = v_tenant
    and n.id = note_id
    and n.author_id = auth.uid()
    and n.deleted_at is null;

  if v_patient is null then
    return;
  end if;

  insert into public.audit_log (
    tenant_id, actor_user_id, actor_role, action, table_name, record_id, patient_id
  ) values (
    v_tenant, auth.uid(), coalesce(public.current_tenant_role(), 'anon'),
    'READ', 'clinical_notes', note_id::text, v_patient
  );
end $$;

revoke all on function public.log_clinical_note_access(uuid) from public;
revoke all on function public.log_clinical_note_access(uuid) from anon;
grant execute on function public.log_clinical_note_access(uuid) to authenticated;

comment on function public.log_clinical_note_access(uuid) is
  'Deja constancia de que alguien LEYO una nota clinica. Postgres no tiene triggers de select, asi que la aplicacion la llama al abrir el expediente. Silenciosa si la nota no es del tenant activo o no es del autor.';
