-- ============================================================
-- 0002 · tenant_id en las tablas de negocio
--
-- Crea el tenant #1 (el negocio actual), agrega tenant_id, hace el
-- backfill, lo vuelve obligatorio y corrige los indices unicos que
-- hoy son globales.
--
-- NO toca todavia las PKs, las FKs ni las policies: eso es 0003 y 0004.
-- Se separa a proposito para que cada paso se pueda revisar y probar
-- por su cuenta.
--
-- Diseno: ~/.claude/plans/brainpsi-fase2-diseno.md
-- ============================================================

-- ------------------------------------------------------------
-- El negocio actual se vuelve el tenant #1.
-- ------------------------------------------------------------
insert into public.tenants (id, name, timezone, plan, status)
values ('brainpsi', 'BrainPsi Coffee', 'America/Mexico_City', 'owner', 'active')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- tenant_id en las 15 tablas de negocio.
--
-- profiles queda fuera a proposito: es la identidad global del usuario.
-- Su columna 'role' se retira en 0004, cuando las policies dejen de
-- leerla y pasen a tenant_members.
--
-- Nada cuelga por relacion: cada tabla resuelve su tenant sin mirar a
-- ninguna otra. Un join en una policy paga por fila y, peor, vuelve el
-- aislamiento una propiedad derivada del padre. 0003 agrega los triggers
-- que impiden que un hijo difiera de su padre.
-- ------------------------------------------------------------
do $$
declare
  t text;
  business_tables text[] := array[
    'therapy_services', 'therapists', 'specialties', 'therapist_services',
    'products', 'offers', 'business_settings', 'appointments', 'patients',
    'appointment_notes', 'appointment_notifications', 'orders',
    'order_items', 'consents'
  ];
begin
  foreach t in array business_tables loop
    execute format('alter table public.%I add column if not exists tenant_id text', t);
    execute format('update public.%I set tenant_id = %L where tenant_id is null', t, 'brainpsi');
    execute format('alter table public.%I alter column tenant_id set not null', t);
    execute format(
      'alter table public.%I drop constraint if exists %I',
      t, t || '_tenant_id_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (tenant_id)
         references public.tenants(id) on delete restrict',
      t, t || '_tenant_id_fkey');
    -- Toda policy filtra por tenant_id: sin indice, cada lectura es un
    -- seq scan que empeora con cada cliente nuevo.
    execute format(
      'create index if not exists %I on public.%I (tenant_id)',
      t || '_tenant_idx', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- audit_log: tenant_id NULLABLE, a proposito.
--
-- Un intento de acceso cruzado, o un actor sin tenant activo, tiene que
-- poder registrarse igual. Un log que rechaza escrituras pierde justo
-- el evento que importa. Sin on delete restrict tampoco: borrar un
-- tenant no debe poder borrar su rastro de auditoria.
-- ------------------------------------------------------------
alter table public.audit_log add column if not exists tenant_id text;
update public.audit_log set tenant_id = 'brainpsi' where tenant_id is null;
create index if not exists audit_log_tenant_idx
  on public.audit_log (tenant_id) where tenant_id is not null;

-- ------------------------------------------------------------
-- Unicidad: de global a por tenant.
--
-- Los tres indices de abajo eran globales y rompen multitenancy hoy:
-- dos clinicas distintas no podian tener al mismo paciente, ni al mismo
-- terapeuta, ni al mismo usuario ligado como terapeuta. El tercero es
-- justo el caso que el modelo tiene que soportar: un psiquiatra que
-- trabaja en dos consultorios.
-- ------------------------------------------------------------
drop index if exists public.patients_email_unique;
create unique index if not exists patients_email_unique
  on public.patients (tenant_id, lower(email));

drop index if exists public.therapists_email_unique;
create unique index if not exists therapists_email_unique
  on public.therapists (tenant_id, lower(email)) where email is not null;

drop index if exists public.therapists_user_id_unique;
create unique index if not exists therapists_user_id_unique
  on public.therapists (tenant_id, user_id) where user_id is not null;

-- Misma correccion para el indice de cita duplicada: sin tenant_id, el
-- terapeuta 'psq-1' de dos clinicas distintas colisiona.
drop index if exists public.appointments_no_duplicate_confirmed_slot;
create unique index if not exists appointments_no_duplicate_confirmed_slot
  on public.appointments (tenant_id, therapist_id, appointment_date, appointment_time)
  where therapist_id is not null and status <> 'cancelled';

-- ------------------------------------------------------------
-- business_settings deja de ser singleton.
--
-- La PK era el literal 'main' (una sola fila por diseno). Pasa a una
-- fila por tenant. La PK real se cambia en 0003 junto con las demas;
-- aqui solo se garantiza que no haya dos filas para el mismo tenant.
-- ------------------------------------------------------------
create unique index if not exists business_settings_tenant_unique
  on public.business_settings (tenant_id);
