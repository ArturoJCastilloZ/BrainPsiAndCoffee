-- 0039 · Cumplimiento: derechos ARCO, consentimiento informado y
--        verificacion en dos pasos para el expediente.
--
-- La parte de PRODUCTO de la seccion "Cumplimiento" de la auditoria
-- 2026-10-09. No sustituye la revision legal: el texto del aviso, el
-- formato de consentimiento y los plazos los confirma el abogado. Lo que
-- hace es que la plataforma pueda cumplir y dejar evidencia.
--
-- 1 · Solicitudes ARCO (acceso, rectificacion, cancelacion, oposicion y
--     revocacion del consentimiento). Antes la unica via era "escribe a
--     este correo": nada quedaba registrado, nadie veia el plazo correr y
--     no habia forma de demostrar que se respondio.
--
-- 2 · Consentimiento informado para el tratamiento. La tabla consents ya
--     existia (inmutable: se revoca, nunca se borra) y aceptaba el tipo
--     'clinical_treatment', pero solo el staff administrativo podia
--     escribirla: quien obtiene el consentimiento en consulta —el
--     especialista— no tenia como registrarlo.
--
-- 3 · Verificacion en dos pasos (MFA) para quien toca el expediente. Se
--     impone en la BASE con policies RESTRICTIVAS, que se suman con AND a
--     las existentes sin reescribirlas. Solo rige cuando la clinica la
--     activa: encenderla el dia del despliegue dejaria fuera a todo el
--     personal que aun no la configuro.

-- ============================================================
-- 1 · ARCO
-- ============================================================

-- Dias habiles: lunes a viernes. Los feriados oficiales no se descuentan
-- (pendiente: calendario de feriados); el plazo que se muestra es, si
-- acaso, MAS corto que el legal, nunca mas largo.
create or replace function public.add_business_days(p_from date, p_days integer)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v date := p_from;
  n integer := 0;
begin
  while n < p_days loop
    v := v + 1;
    if extract(isodow from v) < 6 then n := n + 1; end if;
  end loop;
  return v;
end $$;

create table if not exists public.arco_requests (
  tenant_id text not null default coalesce(public.current_tenant_id(), public.current_request_tenant())
            references public.tenants(id),
  id uuid not null default gen_random_uuid(),
  request_type text not null
    check (request_type in ('acceso', 'rectificacion', 'cancelacion', 'oposicion', 'revocacion')),
  requester_name text not null check (char_length(btrim(requester_name)) between 2 and 120),
  requester_email text not null
    check (requester_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  requester_phone text check (requester_phone is null or requester_phone ~ '^[0-9+(). -]{8,20}$'),
  -- Quien pide frente al titular de los datos: una mamá pide por su hijo.
  relationship text not null default 'titular'
    check (relationship in ('titular', 'madre_padre_tutor', 'representante')),
  on_behalf_of text check (on_behalf_of is null or char_length(btrim(on_behalf_of)) between 2 and 120),
  details text not null check (char_length(btrim(details)) between 10 and 1500),
  status text not null default 'recibida'
    check (status in ('recibida', 'verificando_identidad', 'en_proceso', 'respondida', 'improcedente')),
  created_at timestamptz not null default now(),
  -- Plazo para responder: 20 dias habiles (referencia LFPDPPP; confirmar
  -- con el abogado). Lo calcula la base, no el navegador.
  due_on date not null default public.add_business_days(current_date, 20),
  responded_at timestamptz,
  response_summary text check (response_summary is null or char_length(response_summary) <= 1500),
  handled_by uuid,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, id),
  check (relationship = 'titular' or on_behalf_of is not null)
);

comment on table public.arco_requests is
  'Solicitudes de derechos ARCO. Se responden dentro de due_on y NO se borran: son evidencia de cumplimiento.';

create index if not exists arco_requests_pending_idx
  on public.arco_requests (tenant_id, due_on) where status not in ('respondida', 'improcedente');

alter table public.arco_requests enable row level security;

-- Alta: lo que manda el navegador no decide ni la fecha, ni el plazo, ni
-- el estado. Para el visitante, ademas, topes como los de la reserva.
create or replace function public.arco_request_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.due_on := public.add_business_days((now() at time zone 'America/Mexico_City')::date, 20);
    new.status := 'recibida';
    new.responded_at := null;
    new.response_summary := null;
    new.handled_by := null;

    if auth.uid() is null then
      select count(*) into v_n from public.arco_requests
       where tenant_id = new.tenant_id
         and lower(requester_email) = lower(btrim(new.requester_email))
         and created_at > now() - interval '30 days';
      if v_n >= 3 then
        raise exception using errcode = 'P0429',
          message = 'Ya recibimos varias solicitudes tuyas este mes. Te responderemos por correo; si es urgente, escríbenos.';
      end if;
      select count(*) into v_n from public.arco_requests
       where tenant_id = new.tenant_id and created_at > now() - interval '1 day';
      if v_n >= 20 then
        raise exception using errcode = 'P0429',
          message = 'En este momento no podemos recibir más solicitudes en línea. Escríbenos por correo.';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: solo avanza el tramite. Lo que la persona pidio no se
  -- reescribe, y quien lo atiende y cuando lo pone la base.
  if new.tenant_id is distinct from old.tenant_id
     or new.id is distinct from old.id
     or new.request_type is distinct from old.request_type
     or new.requester_name is distinct from old.requester_name
     or new.requester_email is distinct from old.requester_email
     or new.requester_phone is distinct from old.requester_phone
     or new.relationship is distinct from old.relationship
     or new.on_behalf_of is distinct from old.on_behalf_of
     or new.details is distinct from old.details
     or new.created_at is distinct from old.created_at
     or new.due_on is distinct from old.due_on then
    raise exception 'Una solicitud ARCO no se reescribe: solo cambia su estado y la respuesta.';
  end if;
  if old.status in ('respondida', 'improcedente') and new.status is distinct from old.status then
    raise exception 'La solicitud ya se cerró.';
  end if;
  if new.status in ('respondida', 'improcedente')
     and char_length(btrim(coalesce(new.response_summary, ''))) < 10 then
    raise exception 'Para cerrar la solicitud escribe qué se respondió (mínimo 10 caracteres).';
  end if;
  new.handled_by := auth.uid();
  new.updated_at := now();
  if new.status in ('respondida', 'improcedente') and old.status not in ('respondida', 'improcedente') then
    new.responded_at := now();
  else
    new.responded_at := old.responded_at;
  end if;
  return new;
end $$;

drop trigger if exists arco_requests_rules on public.arco_requests;
create trigger arco_requests_rules
  before insert or update on public.arco_requests
  for each row execute function public.arco_request_rules();

create or replace function public.arco_requests_no_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Las solicitudes ARCO no se borran: son evidencia de cumplimiento.';
end $$;

drop trigger if exists arco_requests_no_delete on public.arco_requests;
create trigger arco_requests_no_delete
  before delete on public.arco_requests
  for each row execute function public.arco_requests_no_delete();

drop trigger if exists audit_arco_requests on public.arco_requests;
create trigger audit_arco_requests
  after insert or update on public.arco_requests
  for each row execute function public.record_audit_entry();

drop policy if exists "Public can file ARCO requests" on public.arco_requests;
create policy "Public can file ARCO requests" on public.arco_requests
  for insert to anon, authenticated
  with check (tenant_id = coalesce(public.current_tenant_id(), public.current_request_tenant()));

-- Las atiende el staff administrativo (dueño y admin del consultorio).
drop policy if exists "Clinic staff read ARCO requests" on public.arco_requests;
create policy "Clinic staff read ARCO requests" on public.arco_requests
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Clinic staff update ARCO requests" on public.arco_requests;
create policy "Clinic staff update ARCO requests" on public.arco_requests
  for update to authenticated
  using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

-- El visitante solo puede DEJAR una solicitud, nunca leer las de nadie.
revoke all on public.arco_requests from anon, authenticated;
grant insert on public.arco_requests to anon, authenticated;
grant select, update on public.arco_requests to authenticated;

-- ============================================================
-- 2 · Consentimiento informado
-- ============================================================

-- Quien registra y cuando lo pone la base, no el navegador. Y la
-- revocacion es de un solo sentido: no se "desrevoca", ni se mueve el
-- consentimiento a otro paciente.
create or replace function public.consent_server_stamps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.accepted_at := now();
    new.revoked_at := null;
    if auth.uid() is not null then
      new.evidence := coalesce(new.evidence, '{}'::jsonb)
        || jsonb_build_object('registrado_por', auth.uid(), 'rol', public.current_tenant_role());
    end if;
    return new;
  end if;
  if new.tenant_id is distinct from old.tenant_id
     or new.patient_id is distinct from old.patient_id
     or new.appointment_id is distinct from old.appointment_id then
    raise exception 'Un consentimiento no cambia de paciente ni de cita.';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'Una revocación no se deshace: registra un consentimiento nuevo.';
  end if;
  if new.revoked_at is not null and old.revoked_at is null then
    new.revoked_at := now();
  end if;
  return new;
end $$;

drop trigger if exists consents_server_stamps on public.consents;
create trigger consents_server_stamps
  before insert or update on public.consents
  for each row execute function public.consent_server_stamps();

-- El especialista registra y revoca el consentimiento de SUS pacientes.
drop policy if exists "Doctors read own patients consents" on public.consents;
create policy "Doctors read own patients consents" on public.consents
  for select to authenticated
  using (tenant_id = public.current_tenant_id()
         and patient_id is not null
         and public.doctor_can_access_patient(patient_id));

drop policy if exists "Doctors register clinical consent" on public.consents;
create policy "Doctors register clinical consent" on public.consents
  for insert to authenticated
  with check (tenant_id = public.current_tenant_id()
              and consent_type = 'clinical_treatment'
              and patient_id is not null
              and public.doctor_can_access_patient(patient_id));

drop policy if exists "Doctors revoke clinical consent" on public.consents;
create policy "Doctors revoke clinical consent" on public.consents
  for update to authenticated
  using (tenant_id = public.current_tenant_id()
         and consent_type = 'clinical_treatment'
         and patient_id is not null
         and public.doctor_can_access_patient(patient_id))
  with check (tenant_id = public.current_tenant_id()
              and patient_id is not null
              and public.doctor_can_access_patient(patient_id));

-- consents ya tiene su trigger de bitacora (audit_consents, esquema base).

-- ============================================================
-- 3 · Verificacion en dos pasos para el expediente
-- ============================================================

-- ¿Puede esta sesion tocar el expediente? Si la clinica no exige MFA, si.
-- Si la exige, solo una sesion verificada con el segundo factor (aal2
-- en el JWT, que firma Supabase Auth).
create or replace function public.clinical_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
           (select (t.config ->> 'mfa_clinico')::boolean
              from public.tenants t
             where t.id = public.current_tenant_id()),
           false) = false
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;
revoke all on function public.clinical_mfa_ok() from public;
grant execute on function public.clinical_mfa_ok() to anon, authenticated;

-- RESTRICTIVAS: se combinan con AND con las policies que ya existen.
-- Solo para sesiones autenticadas; la reserva publica (anon) no las ve.
do $$
declare
  t text;
begin
  foreach t in array array['patients', 'encounters', 'clinical_notes', 'note_addenda', 'consents'] loop
    execute format('drop policy if exists "MFA para el expediente" on public.%I', t);
    execute format(
      'create policy "MFA para el expediente" on public.%I as restrictive for all to authenticated
         using (public.clinical_mfa_ok()) with check (public.clinical_mfa_ok())', t);
  end loop;
end $$;

-- Solo el dueño lo enciende o apaga, y para ENCENDERLO tiene que estar
-- verificado el mismo: si no, se dejaria fuera sin forma de volver.
create or replace function public.set_clinical_mfa(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text := public.current_tenant_id();
begin
  if v_tenant is null or public.current_tenant_role() <> 'owner' then
    raise exception using errcode = '42501', message = 'Solo el dueño de la clínica puede cambiar esto.';
  end if;
  if p_enabled and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception using errcode = '42501',
      message = 'Activa primero tu propia verificación en dos pasos y entra con ella.';
  end if;
  update public.tenants
     set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
           'mfa_clinico', p_enabled,
           'mfa_clinico_por', auth.uid(),
           'mfa_clinico_en', now()),
         updated_at = now()
   where id = v_tenant;
end $$;
revoke all on function public.set_clinical_mfa(boolean) from public;
grant execute on function public.set_clinical_mfa(boolean) to authenticated;

-- Lo lee la app para saber si debe pedir el segundo factor.
create or replace function public.clinical_mfa_required()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (t.config ->> 'mfa_clinico')::boolean
                     from public.tenants t where t.id = public.current_tenant_id()), false);
$$;
revoke all on function public.clinical_mfa_required() from public;
grant execute on function public.clinical_mfa_required() to authenticated;
