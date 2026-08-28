-- ============================================================
-- 0012 · encounters — la consulta ocurrida
--
-- Hasta ahora la nota colgaba de la CITA. Pero la cita agendada y la
-- consulta ocurrida son cosas distintas (es la separacion
-- Appointment/Encounter de FHIR R4):
--
--   · una cita puede no ocurrir — el paciente no llega;
--   · una consulta puede no haberse agendado — urgencia, o el paciente
--     llega sin cita;
--   · reprogramar una cita no debe arrastrar la nota de la consulta que
--     ya sucedio.
--
-- El expediente se construye sobre lo que PASO, no sobre lo que se
-- planeo. La nota clinica cuelga del encuentro (0013).
--
-- Diseno: ~/.claude/plans/brainpsi-fase3-diseno.md
-- ============================================================

create table if not exists public.encounters (
  tenant_id      text not null default coalesce(public.current_tenant_id(),
                                                public.current_request_tenant()),
  id             uuid not null default gen_random_uuid(),
  patient_id     uuid not null,
  therapist_id   text not null,
  -- Nullable a proposito: una consulta sin cita previa es valida.
  appointment_id text,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  status         text not null default 'in_progress'
                 check (status in ('in_progress','completed','cancelled')),
  -- NOM-004 exige conservar el expediente 5 años desde el ultimo acto
  -- medico: nada clinico se borra fisicamente.
  deleted_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint encounters_tenant_fk
    foreign key (tenant_id) references public.tenants(id) on delete restrict,
  constraint encounters_patient_fk
    foreign key (tenant_id, patient_id) references public.patients(tenant_id, id),
  constraint encounters_therapist_fk
    foreign key (tenant_id, therapist_id) references public.therapists(tenant_id, id),
  constraint encounters_appointment_fk
    foreign key (tenant_id, appointment_id) references public.appointments(tenant_id, id)
    on delete set null (appointment_id),
  -- Un encuentro que termino antes de empezar es un dato corrupto.
  constraint encounters_rango_valido check (ended_at is null or ended_at >= started_at)
);

comment on table public.encounters is
  'La consulta que ocurrio. La nota clinica cuelga de aqui, no de la cita.';

create index if not exists encounters_tenant_idx on public.encounters (tenant_id);
create index if not exists encounters_patient_idx
  on public.encounters (tenant_id, patient_id) where deleted_at is null;
create index if not exists encounters_therapist_idx
  on public.encounters (tenant_id, therapist_id) where deleted_at is null;

-- Una cita genera a lo mas un encuentro: si el mismo appointment_id
-- produjera dos, el expediente tendria dos consultas para un solo hecho.
create unique index if not exists encounters_appointment_unique
  on public.encounters (tenant_id, appointment_id)
  where appointment_id is not null and deleted_at is null;

alter table public.encounters enable row level security;

-- Nada clinico se borra por API. El borrado es logico (deleted_at) y solo
-- lo hace quien puede escribir la fila.
revoke delete on public.encounters from public, anon, authenticated;

-- El doctor ve y maneja SUS encuentros. admin_consultorio no aparece
-- aqui: la Fase 1 decidio deliberadamente que la administracion no
-- alcanza lo clinico, y eso se conserva.
drop policy if exists "Doctors manage own encounters" on public.encounters;
create policy "Doctors manage own encounters" on public.encounters
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and therapist_id = public.current_therapist_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and therapist_id = public.current_therapist_id()
  );

create trigger audit_encounters
  after insert or update or delete on public.encounters
  for each row execute function public.record_audit_entry();
