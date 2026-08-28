-- ============================================================
-- 0003 · Llaves primarias y foraneas compuestas por tenant
--
-- Las PKs pasan de (id) a (tenant_id, id), y cada FK entre tablas de
-- negocio pasa a incluir tenant_id en AMBOS lados.
--
-- El efecto es que referenciar una fila de otro tenant se vuelve
-- imposible a nivel del motor, no de las policies. Una policy mal
-- escrita filtra datos; una FK compuesta mal apuntada ni siquiera deja
-- insertar la fila.
--
-- Esto tambien hace innecesarios los triggers de coherencia padre-hijo
-- que contemplaba el diseno: la FK compuesta YA garantiza que el
-- tenant_id del hijo coincida con el del padre. Un trigger encima seria
-- ruido que hay que mantener.
--
-- Los ids siguen siendo legibles ('s80', 'psq-1'): lo que cambia es que
-- ahora solo son unicos DENTRO de su clinica.
-- ============================================================

-- ON DELETE SET NULL con lista de columnas es de Postgres 15 en adelante.
-- Sin esa forma, borrar un terapeuta intentaria anular tambien tenant_id,
-- que es NOT NULL, y el delete fallaria en produccion.
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'Esta migracion necesita Postgres 15 o superior (actual: %)',
      current_setting('server_version');
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Soltar las FKs entre tablas de negocio.
--    Se recrean compuestas en el paso 4; no se pierde ninguna regla.
-- ------------------------------------------------------------
alter table public.appointment_notes
  drop constraint if exists appointment_notes_appointment_id_fkey,
  drop constraint if exists appointment_notes_patient_id_fkey,
  drop constraint if exists appointment_notes_therapist_id_fkey;
alter table public.appointment_notifications
  drop constraint if exists appointment_notifications_appointment_id_fkey,
  drop constraint if exists appointment_notifications_therapist_id_fkey;
alter table public.appointments
  drop constraint if exists appointments_patient_id_fkey,
  drop constraint if exists appointments_service_id_fkey,
  drop constraint if exists appointments_therapist_id_fkey;
alter table public.consents
  drop constraint if exists consents_appointment_id_fkey,
  drop constraint if exists consents_patient_id_fkey;
alter table public.order_items
  drop constraint if exists order_items_order_id_fkey,
  drop constraint if exists order_items_product_id_fkey;
alter table public.orders
  drop constraint if exists orders_appointment_id_fkey;
alter table public.therapist_services
  drop constraint if exists therapist_services_service_id_fkey,
  drop constraint if exists therapist_services_therapist_id_fkey;

-- El EXCLUDE de la Fase 1 discrimina por therapist_id. Como ese id deja
-- de ser unico global, se reconstruye con tenant_id en el paso 5: sin
-- eso, el 'psq-1' de dos clinicas distintas se trataria como el MISMO
-- terapeuta y se bloquearian citas legitimas entre clientes.
alter table public.appointments drop constraint if exists appointments_no_overlap;

-- ------------------------------------------------------------
-- 2. PKs compuestas.
--
-- audit_log queda fuera: su tenant_id es nullable a proposito (0002) y
-- una columna nullable no puede formar parte de una PK.
-- ------------------------------------------------------------
do $$
declare
  t text;
  tabs text[] := array[
    'therapy_services','therapists','specialties','products','offers',
    'appointments','patients','appointment_notes','appointment_notifications',
    'orders','order_items','consents'
  ];
begin
  foreach t in array tabs loop
    execute format('alter table public.%I drop constraint if exists %I', t, t||'_pkey');
    execute format('alter table public.%I add constraint %I primary key (tenant_id, id)', t, t||'_pkey');
  end loop;
end $$;

-- therapist_services ya tenia PK compuesta; solo se le antepone el tenant.
alter table public.therapist_services drop constraint if exists therapist_services_pkey;
alter table public.therapist_services
  add constraint therapist_services_pkey primary key (tenant_id, therapist_id, service_id);

-- business_settings deja de ser singleton: la PK era el literal 'main'.
-- La columna id se conserva por ahora porque el front todavia consulta
-- .eq('id','main') (src/api/supabaseData.js:250); se retira cuando ese
-- codigo pase a filtrar por tenant.
alter table public.business_settings drop constraint if exists business_settings_pkey;
alter table public.business_settings
  add constraint business_settings_pkey primary key (tenant_id);

-- ------------------------------------------------------------
-- 3. FKs compuestas, conservando cada regla ON DELETE original.
--
-- Las columnas hijas nullables (patient_id, therapist_id, appointment_id,
-- product_id) siguen funcionando: con MATCH SIMPLE, que es el default, la
-- FK no se evalua si alguna columna del par es NULL.
-- ------------------------------------------------------------
alter table public.appointments
  add constraint appointments_patient_id_fkey
    foreign key (tenant_id, patient_id) references public.patients(tenant_id, id)
    on delete set null (patient_id),
  add constraint appointments_service_id_fkey
    foreign key (tenant_id, service_id) references public.therapy_services(tenant_id, id),
  add constraint appointments_therapist_id_fkey
    foreign key (tenant_id, therapist_id) references public.therapists(tenant_id, id);

alter table public.appointment_notes
  add constraint appointment_notes_appointment_id_fkey
    foreign key (tenant_id, appointment_id) references public.appointments(tenant_id, id)
    on delete cascade,
  add constraint appointment_notes_patient_id_fkey
    foreign key (tenant_id, patient_id) references public.patients(tenant_id, id)
    on delete cascade,
  add constraint appointment_notes_therapist_id_fkey
    foreign key (tenant_id, therapist_id) references public.therapists(tenant_id, id)
    on delete cascade;

alter table public.appointment_notifications
  add constraint appointment_notifications_appointment_id_fkey
    foreign key (tenant_id, appointment_id) references public.appointments(tenant_id, id)
    on delete cascade,
  add constraint appointment_notifications_therapist_id_fkey
    foreign key (tenant_id, therapist_id) references public.therapists(tenant_id, id)
    on delete set null (therapist_id);

alter table public.consents
  add constraint consents_appointment_id_fkey
    foreign key (tenant_id, appointment_id) references public.appointments(tenant_id, id)
    on delete set null (appointment_id),
  add constraint consents_patient_id_fkey
    foreign key (tenant_id, patient_id) references public.patients(tenant_id, id)
    on delete restrict;

alter table public.orders
  add constraint orders_appointment_id_fkey
    foreign key (tenant_id, appointment_id) references public.appointments(tenant_id, id);

alter table public.order_items
  add constraint order_items_order_id_fkey
    foreign key (tenant_id, order_id) references public.orders(tenant_id, id)
    on delete cascade,
  add constraint order_items_product_id_fkey
    foreign key (tenant_id, product_id) references public.products(tenant_id, id);

alter table public.therapist_services
  add constraint therapist_services_therapist_id_fkey
    foreign key (tenant_id, therapist_id) references public.therapists(tenant_id, id)
    on delete cascade,
  add constraint therapist_services_service_id_fkey
    foreign key (tenant_id, service_id) references public.therapy_services(tenant_id, id)
    on delete cascade;

-- ------------------------------------------------------------
-- 4. EXCLUDE de solapamiento, ahora por tenant.
--
-- Como en la Fase 1, se niega a activarse si ya hay citas encimadas:
-- las nombra y se detiene, en vez de dejar la tabla sin proteccion en
-- silencio.
-- ------------------------------------------------------------
do $$
declare
  v_conflictos integer;
  v_detalle text;
begin
  select count(*), string_agg(
      format('%s vs %s (tenant %s, terapeuta %s, %s)',
             a.id, b.id, a.tenant_id, a.therapist_id, a.appointment_date),
      E'\n  ' order by a.appointment_date)
    into v_conflictos, v_detalle
  from public.appointments a
  join public.appointments b
    on a.tenant_id = b.tenant_id
   and a.therapist_id = b.therapist_id
   and a.id < b.id
   and a.slot && b.slot
  where a.status <> 'cancelled' and b.status <> 'cancelled'
    and a.therapist_id is not null;

  if v_conflictos > 0 then
    raise exception E'Hay % citas encimadas. Recalendarizalas o cancelalas antes de aplicar:\n  %',
      v_conflictos, v_detalle;
  end if;

  alter table public.appointments
    add constraint appointments_no_overlap
    exclude using gist (
      tenant_id with =,
      therapist_id with =,
      slot with &&
    ) where (status <> 'cancelled' and therapist_id is not null);
end $$;
