-- ============================================================
-- 0005 · Las policies, filtradas por tenant
--
-- Cierra la Fase 2. Dos cosas distintas que hay que arreglar juntas:
--
--   · QUE ROL TENGO — los helpers leian app_metadata.role, un rol
--     global. Pasan a leer el rol DENTRO del tenant activo.
--   · QUE FILAS VEO — ninguna policy filtraba por tenant_id. Sin eso,
--     un admin de una clinica veia las filas de todas.
--
-- Los helpers solos no bastan: responden quien soy, no que puedo leer.
-- ============================================================

-- ------------------------------------------------------------
-- Tenant para el trafico PUBLICO (anon).
--
-- Un visitante que agenda una cita no tiene membresia, asi que
-- current_tenant_id() le da null y toda policy publica lo dejaria fuera:
-- la pagina de reservas dejaria de funcionar.
--
-- Esta funcion devuelve el tenant TAL CUAL lo pide el cliente, sin
-- verificar nada. NO ES UNA FRONTERA DE SEGURIDAD y no debe usarse en
-- ninguna policy sobre datos privados. Solo selecciona de que clinica
-- se esta viendo el catalogo publico — que ya es publico por diseno
-- (active = true, y la vista therapists_public de la Fase 1).
--
-- Todo lo autenticado sigue usando current_tenant_id(), que si verifica
-- la membresia contra un claim que solo service_role escribe.
-- ------------------------------------------------------------
-- security definer a proposito: consulta public.tenants para descartar
-- clinicas suspendidas, y anon no puede leer esa tabla. Sin definer,
-- TODA policy publica reventaba con 'permission denied for table tenants'
-- y la pagina de reservas quedaba muerta.
--
-- Lo unico que revela es si el tenant que el propio visitante pidio esta
-- activo — algo que el subdominio ya delata. No alcanza ningun dato.
create or replace function public.current_request_tenant()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id
  from public.tenants t
  where t.id = nullif(current_setting('request.tenant', true), '')
    and t.status = 'active';
$$;

comment on function public.current_request_tenant() is
  'Tenant pedido por un visitante sin sesion. NO verifica membresia: usar solo en policies de datos ya publicos.';

revoke all on function public.current_request_tenant() from public;
grant execute on function public.current_request_tenant() to anon, authenticated;

-- La vista publica de terapeutas (Fase 1) tambien necesita el tenant:
-- sin el, expone el directorio de TODAS las clinicas.
--
-- Conserva security_invoker = false a proposito. La Fase 1 le quito al
-- publico la lectura de la tabla therapists, asi que la vista tiene que
-- correr como su dueño; ponerla en invoker la dejaria sin permisos y
-- tumbaria la pagina publica de reservas. El filtro de tenant va DENTRO
-- de la vista, que es justo donde sirve.
-- Se suelta antes de recrear: 'create or replace view' no admite
-- cambiar el orden ni el nombre de las columnas, y aqui entra tenant_id.
drop view if exists public.therapists_public;

create view public.therapists_public
with (security_invoker = false) as
  select tenant_id, id, name, specialty, color, session_duration_minutes, active
  from public.therapists
  where active = true
    and tenant_id = public.current_request_tenant();

comment on view public.therapists_public is
  'Proyeccion publica de terapeutas, acotada al tenant que se visita. NUNCA agregar email, cedula ni user_id.';

revoke all on public.therapists_public from public, anon, authenticated;
grant select on public.therapists_public to anon, authenticated;

-- ------------------------------------------------------------
-- Helpers de rol, ahora por clinica.
--
-- El rol sale de current_tenant_role() (0001), que lo lee de las
-- membresias del claim contra el tenant activo. Si no hay tenant activo
-- valido no hay rol, y todas devuelven false: fallan cerrado.
--
-- 'owner' es el rol nuevo de tenant_members y hereda lo que antes hacia
-- super_admin DENTRO de su clinica. El super_admin global desaparece:
-- en un SaaS, un admin de un cliente no puede ser admin de los demas.
-- ------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$ select public.current_tenant_role() = 'owner' $$;

create or replace function public.is_cafe_admin()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$ select public.current_tenant_role() = 'admin_cafe' $$;

create or replace function public.is_clinic_admin()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$ select public.current_tenant_role() = 'admin_consultorio' $$;

create or replace function public.is_doctor()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$ select public.current_tenant_role() = 'doctor' $$;

create or replace function public.is_barista()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$ select public.current_tenant_role() = 'barista' $$;

create or replace function public.is_cafe_staff()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$ select public.is_super_admin() or public.is_cafe_admin() or public.is_barista() $$;

create or replace function public.is_clinic_staff()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$ select public.is_super_admin() or public.is_clinic_admin() $$;

create or replace function public.is_admin()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$ select public.current_tenant_role() in ('owner', 'admin_consultorio', 'admin_cafe') $$;

-- El doctor solo alcanza a sus pacientes, y solo dentro de su clinica.
create or replace function public.doctor_can_access_patient(patient_id uuid)
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$
  select public.is_doctor()
    and exists (
      select 1 from public.appointments a
      where a.tenant_id = public.current_tenant_id()
        and a.patient_id = $1
        and a.therapist_id = public.current_therapist_id()
    );
$$;

-- ------------------------------------------------------------
-- Catalogo. Lectura publica acotada a la clinica que se visita;
-- administracion acotada a la clinica del usuario.
-- ------------------------------------------------------------
drop policy if exists "Public can read active services" on public.therapy_services;
create policy "Public can read active services" on public.therapy_services
  for select using (tenant_id = public.current_request_tenant() and active = true);

drop policy if exists "Admins can manage services" on public.therapy_services;
create policy "Admins can manage services" on public.therapy_services
  for all using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Admins can manage therapists" on public.therapists;
create policy "Admins can manage therapists" on public.therapists
  for all using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

-- La Fase 1 quito la lectura publica de therapists (exponia email y
-- cedula) y la dejo en la vista therapists_public. Eso no se toca.
drop policy if exists "Doctors can read own profile" on public.therapists;
create policy "Doctors can read own profile" on public.therapists
  for select using (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and id = public.current_therapist_id()
  );

drop policy if exists "Public can read active specialties" on public.specialties;
create policy "Public can read active specialties" on public.specialties
  for select using (tenant_id = public.current_request_tenant() and active = true);

drop policy if exists "Admins can manage specialties" on public.specialties;
create policy "Admins can manage specialties" on public.specialties
  for all using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Public can read therapist services" on public.therapist_services;
create policy "Public can read therapist services" on public.therapist_services
  for select using (tenant_id = public.current_request_tenant());

drop policy if exists "Admins can manage therapist services" on public.therapist_services;
create policy "Admins can manage therapist services" on public.therapist_services
  for all using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products" on public.products
  for select using (tenant_id = public.current_request_tenant() and active = true);

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products" on public.products
  for all using (tenant_id = public.current_tenant_id() and (public.is_super_admin() or public.is_cafe_admin()))
  with check (tenant_id = public.current_tenant_id() and (public.is_super_admin() or public.is_cafe_admin()));

drop policy if exists "Public can read active offers" on public.offers;
create policy "Public can read active offers" on public.offers
  for select using (
    tenant_id = public.current_request_tenant()
    and active = true
    and (starts_at is null or starts_at <= current_date)
    and (ends_at is null or ends_at >= current_date)
  );

drop policy if exists "Admins can manage offers" on public.offers;
create policy "Admins can manage offers" on public.offers
  for all using (tenant_id = public.current_tenant_id() and (public.is_super_admin() or public.is_cafe_admin()))
  with check (tenant_id = public.current_tenant_id() and (public.is_super_admin() or public.is_cafe_admin()));

-- business_settings ya no es el singleton 'main': una fila por clinica.
drop policy if exists "Public can read business settings" on public.business_settings;
create policy "Public can read business settings" on public.business_settings
  for select using (tenant_id = public.current_request_tenant());

drop policy if exists "Admins can manage business settings" on public.business_settings;
create policy "Admins can manage business settings" on public.business_settings
  for all using (tenant_id = public.current_tenant_id() and public.is_super_admin())
  with check (tenant_id = public.current_tenant_id() and public.is_super_admin());

-- ------------------------------------------------------------
-- Agenda.
-- ------------------------------------------------------------
drop policy if exists "Admins can manage appointments" on public.appointments;
create policy "Admins can manage appointments" on public.appointments
  for all using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Doctors can manage own appointments" on public.appointments;
create policy "Doctors can manage own appointments" on public.appointments
  for all using (
    tenant_id = public.current_tenant_id()
    and public.is_doctor() and therapist_id = public.current_therapist_id()
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_doctor() and therapist_id = public.current_therapist_id()
  );

-- Alta publica. Las dos subconsultas se acotan al tenant de la fila: sin
-- eso, un servicio activo de OTRA clinica validaba la cita.
drop policy if exists "Public can create appointments" on public.appointments;
create policy "Public can create appointments" on public.appointments
  for insert with check (
    tenant_id = public.current_request_tenant()
    and status = 'confirmed'
    and appointment_date >= current_date
    and appointment_date <= current_date + 35
    and appointment_time >= '09:00:00'::time
    and appointment_time < '19:00:00'::time
    and extract(isodow from appointment_date) between 2 and 6
    and char_length(trim(customer_name)) between 2 and 120
    and customer_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and customer_phone ~ '^[0-9+(). -]{8,20}$'
    and char_length(coalesce(notes, '')) <= 280
    and exists (
      select 1 from public.therapy_services s
      where s.tenant_id = appointments.tenant_id
        and s.id = appointments.service_id
        and s.active = true
    )
    and (
      therapist_id is null
      -- Contra therapists_public, NO contra therapists.
      --
      -- La Fase 1 le quito al publico la lectura de therapists (exponia
      -- email y cedula) pero dejo este exists apuntando a la tabla. Para
      -- un visitante la subconsulta devuelve cero filas, asi que toda
      -- reserva con terapeuta especifico quedo rechazada por RLS: solo
      -- pasaba la opcion 'cualquiera', que manda therapist_id nulo.
      -- Comprobado contra una base con la Fase 1 sola.
      --
      -- La vista corre como su dueño y ya filtra active y tenant, que es
      -- exactamente lo que este check necesita comprobar.
      or exists (
        select 1 from public.therapists_public t
        where t.tenant_id = appointments.tenant_id
          and t.id = appointments.therapist_id
      )
    )
  );

-- ------------------------------------------------------------
-- Pacientes y notas clinicas.
--
-- admin_consultorio sigue SIN acceso a notas clinicas: es una decision
-- deliberada de la Fase 1 y se conserva tal cual.
-- ------------------------------------------------------------
drop policy if exists "Clinic staff can read patients" on public.patients;
create policy "Clinic staff can read patients" on public.patients
  for select using (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Clinic staff can manage patients" on public.patients;
create policy "Clinic staff can manage patients" on public.patients
  for all using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Doctors can read own patients" on public.patients;
create policy "Doctors can read own patients" on public.patients
  for select using (
    tenant_id = public.current_tenant_id()
    and public.doctor_can_access_patient(id)
  );

drop policy if exists "Doctors can manage own clinical notes" on public.appointment_notes;
create policy "Doctors can manage own clinical notes" on public.appointment_notes
  for all using (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and therapist_id = public.current_therapist_id()
    and public.doctor_can_access_patient(patient_id)
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.is_doctor()
    and therapist_id = public.current_therapist_id()
    and author_user_id = auth.uid()
    and public.doctor_can_access_patient(patient_id)
    and exists (
      select 1 from public.appointments a
      where a.tenant_id = appointment_notes.tenant_id
        and a.id = appointment_notes.appointment_id
        and a.patient_id = appointment_notes.patient_id
        and a.therapist_id = public.current_therapist_id()
    )
  );

drop policy if exists "Clinic staff can manage appointment notifications" on public.appointment_notifications;
create policy "Clinic staff can manage appointment notifications" on public.appointment_notifications
  for all using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Doctors can read own appointment notifications" on public.appointment_notifications;
create policy "Doctors can read own appointment notifications" on public.appointment_notifications
  for select using (
    tenant_id = public.current_tenant_id()
    and public.is_doctor() and therapist_id = public.current_therapist_id()
  );

-- ------------------------------------------------------------
-- Consentimientos y bitacora.
-- ------------------------------------------------------------
drop policy if exists "Clinic staff can read consents" on public.consents;
create policy "Clinic staff can read consents" on public.consents
  for select using (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Clinic staff can manage consents" on public.consents;
create policy "Clinic staff can manage consents" on public.consents
  for all using (tenant_id = public.current_tenant_id() and public.is_clinic_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_clinic_staff());

drop policy if exists "Public can register consent" on public.consents;
create policy "Public can register consent" on public.consents
  for insert with check (
    tenant_id = public.current_request_tenant()
    and consent_type in ('privacy_notice','telehealth')
    and revoked_at is null
    and char_length(document_version) between 1 and 40
  );

-- La bitacora la lee el owner de SU clinica. Las filas sin tenant
-- (intentos sin tenant activo) no las ve nadie por API: se consultan con
-- service_role, que es lo correcto para un registro forense.
drop policy if exists "Admins can read audit log" on public.audit_log;
create policy "Admins can read audit log" on public.audit_log
  for select using (tenant_id = public.current_tenant_id() and public.is_super_admin());

-- ------------------------------------------------------------
-- Cafe. Congelado por decision de producto: se le pone tenant_id para
-- que no haya huecos en el aislamiento, pero no se rediseña.
-- ------------------------------------------------------------
drop policy if exists "Cafe staff can read orders" on public.orders;
create policy "Cafe staff can read orders" on public.orders
  for select using (tenant_id = public.current_tenant_id() and public.is_cafe_staff());

drop policy if exists "Cafe staff can update orders" on public.orders;
create policy "Cafe staff can update orders" on public.orders
  for update using (tenant_id = public.current_tenant_id() and public.is_cafe_staff())
  with check (tenant_id = public.current_tenant_id() and public.is_cafe_staff());

drop policy if exists "Cafe admins can insert orders" on public.orders;
create policy "Cafe admins can insert orders" on public.orders
  for insert with check (
    tenant_id = public.current_tenant_id()
    and (public.is_super_admin() or public.is_cafe_admin())
  );

drop policy if exists "Cafe admins can delete orders" on public.orders;
create policy "Cafe admins can delete orders" on public.orders
  for delete using (
    tenant_id = public.current_tenant_id()
    and (public.is_super_admin() or public.is_cafe_admin())
  );

drop policy if exists "Cafe staff can read order items" on public.order_items;
create policy "Cafe staff can read order items" on public.order_items
  for select using (tenant_id = public.current_tenant_id() and public.is_cafe_staff());

drop policy if exists "Cafe admins can manage order items" on public.order_items;
create policy "Cafe admins can manage order items" on public.order_items
  for all using (tenant_id = public.current_tenant_id() and (public.is_super_admin() or public.is_cafe_admin()))
  with check (tenant_id = public.current_tenant_id() and (public.is_super_admin() or public.is_cafe_admin()));

-- Las dos policies publicas del cafe se reescribieron en 0004, cuando los
-- predicados pasaron a recibir el tenant como argumento. Se les agrega el
-- filtro del tenant de la fila.
drop policy if exists "Public can create orders" on public.orders;
create policy "Public can create orders" on public.orders
  for insert with check (
    tenant_id = public.current_request_tenant()
    and status in ('received', 'pending_appointment')
    and (
      (appointment_id is null and order_source = 'public_menu')
      or (
        appointment_id is not null
        and order_source = 'appointment'
        and public.appointment_can_receive_order(tenant_id, appointment_id)
      )
    )
    and total >= 0 and subtotal >= 0 and combo_savings >= 0
    and char_length(trim(coalesce(customer_name, ''))) between 2 and 120
    and coalesce(customer_phone, '') ~ '^[0-9+(). -]{8,20}$'
    and char_length(coalesce(operational_notes, '')) <= 280
  );

drop policy if exists "Public can create order items" on public.order_items;
create policy "Public can create order items" on public.order_items
  for insert with check (
    tenant_id = public.current_request_tenant()
    and quantity > 0
    and unit_price >= 0
    and char_length(trim(name)) between 1 and 160
    and public.order_can_receive_public_items(tenant_id, order_id)
  );

-- ------------------------------------------------------------
-- profiles: el rol global se retira.
--
-- La columna 'role' quedaba como una segunda fuente de verdad de
-- permisos, ya sin nada que la leyera. Dos fuentes de permisos que
-- pueden discrepar son peor que una sola: se elimina.
-- tenant_members es ahora la unica.
-- ------------------------------------------------------------
drop policy if exists "Super admins can manage profiles" on public.profiles;
create policy "Super admins can manage profiles" on public.profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = user_id);

alter table public.profiles drop column if exists role;
