-- ============================================================
-- 0014 · Migrar las notas existentes y retirar appointment_notes
--
-- Cada nota vieja colgaba de una cita. Como ahora la nota cuelga del
-- ENCUENTRO, se crea un encuentro por cada cita que tenia notas, y las
-- notas se cuelgan de ahi.
--
-- Las notas migradas quedan SIN FIRMAR, a proposito. Nadie las firmo:
-- estamparles una firma retroactiva seria fabricar evidencia clinica, y
-- el valor de la firma es justamente que dice quien se hizo responsable
-- y cuando. Quedan como borradores para que su autor las revise y firme
-- si procede.
--
-- El contenido era texto plano y pasa a jsonb bajo la clave 'texto', que
-- es lo que el tramo 2 usara como seccion libre de las plantillas.
-- ============================================================

do $$
declare
  v_encuentros integer;
  v_notas      integer;
  v_huerfanas  integer;
begin
  if to_regclass('public.appointment_notes') is null then
    raise notice 'appointment_notes ya no existe; nada que migrar.';
    return;
  end if;

  -- Un encuentro por cada (clinica, cita) que tenga notas. La fecha del
  -- encuentro sale de la cita, no de now(): el expediente debe reflejar
  -- cuando ocurrio la consulta, no cuando se corrio la migracion.
  insert into public.encounters
    (tenant_id, patient_id, therapist_id, appointment_id, started_at, status, created_at)
  select distinct on (a.tenant_id, a.id)
         a.tenant_id,
         a.patient_id,
         a.therapist_id,
         a.id,
         (a.appointment_date + a.appointment_time) at time zone 'America/Monterrey',
         case when a.status = 'cancelled' then 'cancelled' else 'completed' end,
         a.created_at
  from public.appointments a
  where exists (select 1 from public.appointment_notes n
                where n.tenant_id = a.tenant_id and n.appointment_id = a.id)
    and a.patient_id is not null
    and a.therapist_id is not null
    and not exists (select 1 from public.encounters e
                    where e.tenant_id = a.tenant_id and e.appointment_id = a.id);
  get diagnostics v_encuentros = row_count;

  insert into public.clinical_notes
    (tenant_id, encounter_id, patient_id, author_id, content, template_type,
     created_at, updated_at)
  select n.tenant_id,
         e.id,
         n.patient_id,
         -- Si la nota no registro autor, se atribuye al usuario del
         -- terapeuta de la cita. Es la mejor evidencia disponible; si
         -- tampoco existe, la nota se queda fuera y se reporta abajo en
         -- vez de inventarle un autor.
         coalesce(n.author_user_id, t.user_id),
         jsonb_build_object('texto', n.content),
         'libre',
         n.created_at,
         n.updated_at
  from public.appointment_notes n
  join public.encounters e
    on e.tenant_id = n.tenant_id and e.appointment_id = n.appointment_id
  left join public.therapists t
    on t.tenant_id = n.tenant_id and t.id = n.therapist_id
  where coalesce(n.author_user_id, t.user_id) is not null;
  get diagnostics v_notas = row_count;

  select count(*) into v_huerfanas
  from public.appointment_notes n
  left join public.therapists t
    on t.tenant_id = n.tenant_id and t.id = n.therapist_id
  where coalesce(n.author_user_id, t.user_id) is null;

  raise notice 'Migradas % nota(s) en % encuentro(s), todas SIN FIRMAR.',
    v_notas, v_encuentros;

  -- Perder una nota clinica en silencio es inaceptable: si alguna no
  -- pudo migrarse, la migracion se detiene con la transaccion intacta.
  if v_huerfanas > 0 then
    raise exception
      'Hay % nota(s) sin autor identificable (ni author_user_id ni un terapeuta con cuenta). Resuelvelas antes de migrar: no se descartan en silencio.',
      v_huerfanas;
  end if;
end $$;

-- La tabla vieja se retira: dejarla seria mantener dos fuentes de verdad
-- para el mismo dato clinico, que es como se termina leyendo la
-- equivocada. Su rastro en audit_log se conserva.
drop table if exists public.appointment_notes;
