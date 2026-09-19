-- ============================================================
-- 0030 · La bitacora vuelve a decir DE QUIEN es cada movimiento
--
-- La pregunta que se le hace a una bitacora clinica no es "¿se
-- registro el cambio?" sino "¿quien toco el expediente del paciente
-- X?". Esa se responde con:
--
--   select * from public.audit_log where patient_id = X;
--
-- Hoy esa consulta MIENTE POR OMISION en dos tablas. Las filas estan,
-- pero con patient_id en null: existen y no se encuentran, que es peor
-- que no tenerlas, porque la bitacora parece completa.
--
-- 1 · patients. El esquema base resolvia este caso:
--
--       if v_patient_id is null and tg_table_name = 'patients' then
--         v_patient_id := v_record_id::uuid;
--       end if;
--
--     La fila de patients ES el paciente: su identidad esta en id, no
--     en una columna patient_id que esa tabla no tiene. El
--     'create or replace' de 0022 reescribio la funcion entera y ese
--     bloque no sobrevivio. Es una REGRESION que introdujo la
--     migracion cuyo proposito era arreglar la auditoria.
--
--     Efecto medido contra el desechable con el esquema hasta 0029:
--     un update de telefono sobre patients deja su entrada con
--     changed_fields='phone' y patient_id=NULL. Todo cambio al padron
--     -nombre, correo, telefono, baja- queda fuera de la consulta del
--     auditor.
--
-- 2 · note_addenda. Este no es regresion: nunca lo tuvo. Una adenda
--     es parte del expediente -0013 la hizo append-only justo por
--     eso- y no trae patient_id: cuelga de note_id. Se resuelve
--     mirando la nota, por su PK (tenant_id, id).
--
-- Lo que esta migracion NO hace, a proposito: NO rellena hacia atras
-- las filas ya huerfanas de audit_log. Reparar el historico exigiria
-- un UPDATE sobre el registro de auditoria, que es precisamente lo
-- que un registro de auditoria no debe admitir. Las entradas
-- anteriores a 0030 siguen ahi y se encuentran buscando tambien por
--   record_id = X::text and table_name = 'patients'
-- Un hueco documentado es mas honesto que una bitacora retocada.
--
-- Solo redefine una funcion. No toca esquema, ni RLS, ni datos.
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
  v_tenant := coalesce(v_row ->> 'tenant_id', public.current_tenant_id());

  -- El paciente al que pertenece el movimiento. Es lo que permite
  -- responder "quien toco el expediente de X", que es la pregunta que
  -- se le hace a una bitacora clinica.
  --
  -- Tres formas de saberlo, en orden: la fila lo dice, la fila LO ES,
  -- o lo sabe la nota de la que cuelga.
  begin
    v_patient := nullif(v_row ->> 'patient_id', '')::uuid;
  exception when others then
    v_patient := null;
  end;

  -- La fila de patients es el paciente: su identidad esta en id.
  if v_patient is null and tg_table_name = 'patients' then
    begin
      v_patient := nullif(v_row ->> 'id', '')::uuid;
    exception when others then
      v_patient := null;
    end;
  end if;

  -- Una adenda no dice de quien es; la nota de la que cuelga, si.
  -- Acotado por tenant y resuelto por la PK (tenant_id, id).
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

  -- El contenido solo se copia si la tabla NO es clinica. Ver 0022: la
  -- bitacora la lee el dueño, y el dueño no tiene acceso a la nota.
  --
  -- patients NO entra aqui, y es deliberado: is_clinic_staff() =
  -- is_super_admin() or is_clinic_admin(), y la policy "Clinic staff
  -- can read patients" ya le da al dueño el padron por la puerta de
  -- enfrente. Copiarlo a la bitacora no le entrega nada nuevo.
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
  'Bitacora de cambios. Resuelve el paciente de tres formas: la fila trae patient_id, la fila ES el paciente (patients), o lo sabe la nota de la que cuelga (note_addenda). Para tablas clinicas guarda que campos cambiaron, no su contenido.';
