-- ============================================================
-- 0027 · Contabilidad: lo facturado, lo cobrado y lo gastado
--
-- Hasta ahora el unico numero de dinero era "Ingresos estimados" en el
-- Dashboard: la suma de los totales de pedidos mas el precio ACTUAL del
-- catalogo por cada cita confirmada. Tres problemas, los tres graves para
-- contabilidad:
--
--   1. Mezclaba cafeteria y consultorio en una sola cifra.
--   2. La cita NO guarda su precio, asi que subir una terapia de 900 a
--      1000 cambiaba retroactivamente los ingresos de meses pasados.
--   3. Contaba lo FACTURADO como si fuera COBRADO. Nada registraba si el
--      paciente pago, como, ni cuando.
--
-- Esta migracion arregla los tres. La pasarela de pagos queda pendiente
-- (ver el handoff): cuando exista, solo automatiza el registro — el
-- esquema no cambia.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · La cita congela su precio.
--
-- Mismo criterio que las lineas de pedido en 0023: el importe es un hecho
-- del momento en que ocurrio, no una consulta al catalogo de hoy.
-- ------------------------------------------------------------
alter table public.appointments
  add column if not exists price numeric(10, 2);

comment on column public.appointments.price is
  'Precio de la cita AL AGENDARLA. Congelado: cambiar el catalogo no reescribe el historial.';

-- Las citas que ya existen se rellenan con el precio actual de su
-- servicio. Es lo mejor disponible —no hay registro de lo que costaban
-- entonces— y queda dicho aqui para que nadie lo lea como un dato exacto.
update public.appointments a
   set price = s.price
  from public.therapy_services s
 where s.tenant_id = a.tenant_id
   and s.id = a.service_id
   and a.price is null;

create or replace function public.freeze_appointment_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Solo al nacer, y solo si no viene puesto. Reagendar no reprecia.
  if new.price is null then
    select s.price into new.price
    from public.therapy_services s
    where s.tenant_id = new.tenant_id and s.id = new.service_id;
  end if;

  -- Y una cita ya creada conserva el suyo.
  if tg_op = 'UPDATE' and old.price is not null then
    new.price := old.price;
  end if;

  return new;
end $$;

drop trigger if exists freeze_appointment_price on public.appointments;
create trigger freeze_appointment_price
  before insert or update on public.appointments
  for each row execute function public.freeze_appointment_price();

-- ------------------------------------------------------------
-- 2 · Los cobros.
--
-- Una tabla y no dos: un cobro es un cobro, y el panel necesita sumarlos
-- juntos para el dueño y por separado para cada administrador. El area
-- sale de a QUE se aplica, no de una columna que alguien pueda equivocar.
--
-- El METODO es dato fiscal, no cosmetico. Art. 151 LISR: el paciente solo
-- deduce honorarios medicos pagados por transferencia, tarjeta o cheque
-- nominativo; el EFECTIVO invalida la deduccion aunque exista CFDI.
-- Confirmado en fuente primaria del SAT. Por eso el metodo es obligatorio
-- y la aplicacion advierte al registrar efectivo — no lo impide, pero no
-- deja que pase en silencio.
-- ------------------------------------------------------------
create table if not exists public.payments (
  tenant_id      text not null default coalesce(public.current_tenant_id(),
                                                public.current_request_tenant()),
  id             uuid not null default gen_random_uuid(),
  -- A que se aplica. Exactamente uno de los dos, nunca ambos ni ninguno.
  appointment_id text,
  order_id       text,
  amount         numeric(10, 2) not null check (amount > 0),
  method         text not null check (method in ('efectivo','transferencia','tarjeta','cheque','otro')),
  paid_at        timestamptz not null default now(),
  reference      text,
  notes          text,
  recorded_by    uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint payments_tenant_fk
    foreign key (tenant_id) references public.tenants(id) on delete restrict,
  constraint payments_appointment_fk
    foreign key (tenant_id, appointment_id) references public.appointments(tenant_id, id) on delete restrict,
  constraint payments_order_fk
    foreign key (tenant_id, order_id) references public.orders(tenant_id, id) on delete restrict,
  -- Un cobro sin destino no es contabilidad, es un numero suelto.
  constraint payments_un_solo_destino check (
    (appointment_id is not null and order_id is null) or
    (appointment_id is null and order_id is not null)
  )
);

comment on table public.payments is
  'Cobros registrados. Lo COBRADO, que no es lo facturado. El metodo es dato fiscal: el efectivo invalida la deduccion del paciente (Art. 151 LISR).';

create index if not exists payments_tenant_fecha_idx
  on public.payments (tenant_id, paid_at desc);
create index if not exists payments_appointment_idx
  on public.payments (tenant_id, appointment_id) where appointment_id is not null;
create index if not exists payments_order_idx
  on public.payments (tenant_id, order_id) where order_id is not null;

-- ------------------------------------------------------------
-- 3 · Los gastos.
--
-- Sin egresos no hay utilidad, solo ingreso. El area SI es explicita aqui
-- porque un gasto no cuelga de una cita ni de un pedido: la renta del
-- local es compartida, el cafe en grano es de la cafeteria, y la cedula
-- de un terapeuta es del consultorio.
-- ------------------------------------------------------------
create table if not exists public.expenses (
  tenant_id   text not null default coalesce(public.current_tenant_id(),
                                             public.current_request_tenant()),
  id          uuid not null default gen_random_uuid(),
  area        text not null check (area in ('cafeteria','consultorio','compartido')),
  category    text not null,
  description text,
  amount      numeric(10, 2) not null check (amount > 0),
  spent_at    date not null default current_date,
  method      text check (method in ('efectivo','transferencia','tarjeta','cheque','otro')),
  reference   text,
  recorded_by uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint expenses_tenant_fk
    foreign key (tenant_id) references public.tenants(id) on delete restrict
);

comment on table public.expenses is
  'Egresos por area. compartido = ni cafeteria ni consultorio en exclusiva (renta, luz): el panel lo prorratea o lo muestra aparte, nunca lo asigna a uno solo en silencio.';

create index if not exists expenses_tenant_fecha_idx
  on public.expenses (tenant_id, spent_at desc);

-- ------------------------------------------------------------
-- 4 · Quien ve que.
--
-- El dueño ve las dos areas; cada administrador la suya. Esto va en RLS y
-- no solo en la pantalla: si viviera en el front, bastaria una peticion
-- directa con la anon key para ver lo que no te toca.
--
-- Un cobro de CITA es del consultorio; uno de PEDIDO, de la cafeteria.
-- No hace falta preguntarselo a una columna.
-- ------------------------------------------------------------
alter table public.payments enable row level security;
alter table public.expenses enable row level security;

drop policy if exists "Clinic staff manage clinic payments" on public.payments;
create policy "Clinic staff manage clinic payments" on public.payments
  for all using (
    tenant_id = public.current_tenant_id()
    and appointment_id is not null
    and (public.is_super_admin() or public.is_clinic_admin())
  ) with check (
    tenant_id = public.current_tenant_id()
    and appointment_id is not null
    and (public.is_super_admin() or public.is_clinic_admin())
  );

drop policy if exists "Cafe staff manage cafe payments" on public.payments;
create policy "Cafe staff manage cafe payments" on public.payments
  for all using (
    tenant_id = public.current_tenant_id()
    and order_id is not null
    and (public.is_super_admin() or public.is_cafe_admin())
  ) with check (
    tenant_id = public.current_tenant_id()
    and order_id is not null
    and (public.is_super_admin() or public.is_cafe_admin())
  );

-- Gastos: el area manda. 'compartido' lo ve y lo administra solo el dueño,
-- porque repartirlo es una decision de negocio y no de quien lo capturo.
drop policy if exists "Owner manages shared expenses" on public.expenses;
create policy "Owner manages shared expenses" on public.expenses
  for all using (
    tenant_id = public.current_tenant_id() and public.is_super_admin()
  ) with check (
    tenant_id = public.current_tenant_id() and public.is_super_admin()
  );

drop policy if exists "Clinic admin manages clinic expenses" on public.expenses;
create policy "Clinic admin manages clinic expenses" on public.expenses
  for all using (
    tenant_id = public.current_tenant_id() and area = 'consultorio' and public.is_clinic_admin()
  ) with check (
    tenant_id = public.current_tenant_id() and area = 'consultorio' and public.is_clinic_admin()
  );

drop policy if exists "Cafe admin manages cafe expenses" on public.expenses;
create policy "Cafe admin manages cafe expenses" on public.expenses
  for all using (
    tenant_id = public.current_tenant_id() and area = 'cafeteria' and public.is_cafe_admin()
  ) with check (
    tenant_id = public.current_tenant_id() and area = 'cafeteria' and public.is_cafe_admin()
  );

-- ------------------------------------------------------------
-- 5 · Bitacora.
--
-- Dinero se audita. Ni payments ni expenses llevan contenido clinico, asi
-- que guardan el antes y el despues completos.
-- ------------------------------------------------------------
drop trigger if exists audit_payments on public.payments;
create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.record_audit_entry();

drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses
  after insert or update or delete on public.expenses
  for each row execute function public.record_audit_entry();
