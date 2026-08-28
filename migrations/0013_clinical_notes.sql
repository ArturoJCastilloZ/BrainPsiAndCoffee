-- ============================================================
-- 0013 · clinical_notes — la nota que, una vez firmada, nadie altera
--
-- appointment_notes era una nota suelta: texto plano, sin firma, y el
-- front la editaba y la BORRABA (supabaseData.js deleteClinicalNote).
-- Una nota que se puede borrar no es un documento clinico: es un
-- comentario.
--
-- Aqui la firma bloquea, y lo bloquea el MOTOR, con tres capas que se
-- respaldan entre si:
--   1. revoke update/delete a authenticated — no hay permiso;
--   2. una policy que solo deja tocar filas sin firmar;
--   3. un trigger que rechaza cualquier update de una fila firmada.
--
-- Tres capas y no una porque una policy se relaja por descuido en un
-- refactor; el trigger no depende de que las policies esten bien
-- escritas. Es el mismo patron de defensa en profundidad que ya usa
-- prevent_barista_order_data_changes.
--
-- Decisiones del dev: solo psiquiatria (no hay tabla aparte de
-- psicoterapia), sin residentes (no hay co-firma), solo Mexico.
-- ============================================================

create table if not exists public.clinical_notes (
  tenant_id     text not null default coalesce(public.current_tenant_id(),
                                               public.current_request_tenant()),
  id            uuid not null default gen_random_uuid(),
  encounter_id  uuid not null,
  patient_id    uuid not null,
  -- Quien la escribio. Sin residentes, es tambien quien la firma.
  author_id     uuid not null references auth.users(id),
  -- jsonb y no text: la nota tiene secciones (motivo, exploracion, plan).
  -- El tramo 2 le pone plantillas configurables encima; el formato ya las
  -- admite sin migrar de nuevo.
  content       jsonb not null default '{}'::jsonb,
  template_type text not null default 'libre',
  signed_by     uuid references auth.users(id),
  signed_at     timestamptz,
  -- Derivada, no escrita a mano: asi no puede divergir de signed_at.
  locked        boolean generated always as (signed_at is not null) stored,
  version       integer not null default 1,
  deleted_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint clinical_notes_tenant_fk
    foreign key (tenant_id) references public.tenants(id) on delete restrict,
  constraint clinical_notes_encounter_fk
    foreign key (tenant_id, encounter_id) references public.encounters(tenant_id, id),
  constraint clinical_notes_patient_fk
    foreign key (tenant_id, patient_id) references public.patients(tenant_id, id),
  -- Firmar es un acto con fecha y responsable: o estan los dos, o ninguno.
  constraint clinical_notes_firma_completa
    check ((signed_by is null) = (signed_at is null)),
  -- Sin residentes, firma quien escribio. Cuando entre la co-firma habra
  -- que relajar esto a proposito, no por accidente.
  constraint clinical_notes_firma_propia
    check (signed_by is null or signed_by = author_id),
  -- Una nota firmada vacia no documenta nada.
  constraint clinical_notes_contenido
    check (signed_at is null or content <> '{}'::jsonb)
);

comment on table public.clinical_notes is
  'Nota clinica. Una vez firmada no admite update ni delete: solo note_addenda.';

create index if not exists clinical_notes_tenant_idx on public.clinical_notes (tenant_id);
create index if not exists clinical_notes_encounter_idx
  on public.clinical_notes (tenant_id, encounter_id) where deleted_at is null;
create index if not exists clinical_notes_patient_idx
  on public.clinical_notes (tenant_id, patient_id) where deleted_at is null;

-- ------------------------------------------------------------
-- Addenda: lo unico que se puede agregar despues de firmar.
--
-- Solo-anexar, como audit_log: quien se equivoco en una nota firmada
-- escribe una correccion fechada, no reescribe la historia.
-- ------------------------------------------------------------
create table if not exists public.note_addenda (
  tenant_id  text not null default coalesce(public.current_tenant_id(),
                                            public.current_request_tenant()),
  id         uuid not null default gen_random_uuid(),
  note_id    uuid not null,
  author_id  uuid not null references auth.users(id),
  content    jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint note_addenda_tenant_fk
    foreign key (tenant_id) references public.tenants(id) on delete restrict,
  constraint note_addenda_note_fk
    foreign key (tenant_id, note_id) references public.clinical_notes(tenant_id, id)
);

comment on table public.note_addenda is
  'Correcciones fechadas a una nota firmada. Solo-anexar: no se edita ni se borra.';

create index if not exists note_addenda_note_idx on public.note_addenda (tenant_id, note_id);

-- ------------------------------------------------------------
-- Capa 1 · sin permiso.
-- ------------------------------------------------------------
revoke delete on public.clinical_notes from public, anon, authenticated;
revoke update, delete on public.note_addenda from public, anon, authenticated;

-- ------------------------------------------------------------
-- Capa 3 · el trigger. No depende de que las policies esten bien.
-- ------------------------------------------------------------
create or replace function public.enforce_signed_note_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Una nota clinica no se borra. NOM-004 exige conservar el expediente 5 años desde el ultimo acto medico.';
  end if;

  if old.signed_at is not null then
    raise exception
      'La nota se firmo el %. Una nota firmada no se modifica: agrega un addendum.',
      to_char(old.signed_at, 'DD/MM/YYYY HH24:MI');
  end if;

  -- Aun sin firmar, hay campos que no son del autor: cambiarlos moveria
  -- la nota de paciente, de encuentro o de clinica.
  if new.tenant_id    is distinct from old.tenant_id
     or new.id           is distinct from old.id
     or new.encounter_id is distinct from old.encounter_id
     or new.patient_id   is distinct from old.patient_id
     or new.author_id    is distinct from old.author_id then
    raise exception 'No se puede reasignar una nota a otro autor, paciente, encuentro o clinica.';
  end if;

  new.updated_at := now();
  new.version    := old.version + 1;
  return new;
end $$;

drop trigger if exists enforce_signed_note_immutable on public.clinical_notes;
create trigger enforce_signed_note_immutable
  before update or delete on public.clinical_notes
  for each row execute function public.enforce_signed_note_immutable();

-- El addendum tampoco se toca una vez escrito.
create or replace function public.enforce_addendum_append_only()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'Un addendum no se edita ni se borra: agrega otro.';
end $$;

drop trigger if exists enforce_addendum_append_only on public.note_addenda;
create trigger enforce_addendum_append_only
  before update or delete on public.note_addenda
  for each row execute function public.enforce_addendum_append_only();

-- ------------------------------------------------------------
-- Capa 2 · las policies.
--
-- admin_consultorio NO aparece: la Fase 1 decidio que la administracion
-- no alcanza lo clinico y eso se conserva. El owner tampoco — en la tabla
-- anterior la unica policy era la del doctor, y ampliarlo ahora seria
-- abrir un acceso que nadie pidio.
-- ------------------------------------------------------------
alter table public.clinical_notes enable row level security;
alter table public.note_addenda   enable row level security;

drop policy if exists "Doctors read own notes" on public.clinical_notes;
create policy "Doctors read own notes" on public.clinical_notes
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and exists (
      select 1 from public.encounters e
      where e.tenant_id = clinical_notes.tenant_id
        and e.id = clinical_notes.encounter_id
        and e.therapist_id = public.current_therapist_id()
    )
  );

drop policy if exists "Doctors write own notes" on public.clinical_notes;
create policy "Doctors write own notes" on public.clinical_notes
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and author_id = auth.uid()
    and exists (
      select 1 from public.encounters e
      where e.tenant_id = clinical_notes.tenant_id
        and e.id = clinical_notes.encounter_id
        and e.therapist_id = public.current_therapist_id()
    )
  );

-- La policy acota a las notas propias; quien decide si una nota firmada
-- se puede tocar es el TRIGGER.
--
-- Es deliberado no filtrar aqui por 'signed_at is null'. Si la policy
-- excluyera la fila, el update no encontraria nada que actualizar y
-- PostgREST devolveria 204: exito silencioso. Un medico que edita una
-- nota firmada creeria que guardo, y no guardo nada. En un expediente
-- clinico un fallo mudo es peor que un rechazo — asi el trigger contesta
-- con la fecha de la firma y la instruccion de usar un addendum.
drop policy if exists "Doctors edit unsigned notes" on public.clinical_notes;
create policy "Doctors edit own notes" on public.clinical_notes
  for update to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and author_id = auth.uid()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and author_id = auth.uid()
  );

drop policy if exists "Doctors read own addenda" on public.note_addenda;
create policy "Doctors read own addenda" on public.note_addenda
  for select to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and exists (
      select 1 from public.clinical_notes n
      join public.encounters e
        on e.tenant_id = n.tenant_id and e.id = n.encounter_id
      where n.tenant_id = note_addenda.tenant_id
        and n.id = note_addenda.note_id
        and e.therapist_id = public.current_therapist_id()
    )
  );

drop policy if exists "Doctors write addenda" on public.note_addenda;
create policy "Doctors write addenda" on public.note_addenda
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and author_id = auth.uid()
    and exists (
      select 1 from public.clinical_notes n
      join public.encounters e
        on e.tenant_id = n.tenant_id and e.id = n.encounter_id
      where n.tenant_id = note_addenda.tenant_id
        and n.id = note_addenda.note_id
        and e.therapist_id = public.current_therapist_id()
    )
  );

create trigger audit_clinical_notes
  after insert or update or delete on public.clinical_notes
  for each row execute function public.record_audit_entry();

create trigger audit_note_addenda
  after insert or update or delete on public.note_addenda
  for each row execute function public.record_audit_entry();
