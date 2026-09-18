-- ============================================================
-- 0028 · El dinero lo fija el servidor, no quien manda la peticion
--
-- Dos huecos que dejo 0027, los dos de la MISMA clase que 0023 ya habia
-- cerrado para los pedidos: un importe que el cliente escribe y el
-- servidor acepta sin recalcular.
--
--   1. El PRECIO DE LA CITA. freeze_appointment_price solo calculaba el
--      precio "si venia nulo". La policy publica de alta de citas valida
--      nombre, correo, servicio activo, terapeuta y horario, pero no dice
--      nada de `price`, y no hay grants por columna. Con la anon key
--      —que viaja en el bundle del navegador— se podia mandar
--      "price": 0 y el trigger lo respetaba: la consulta entraba al libro
--      en cero, no se facturaba, no aparecia por cobrar, y la pantalla
--      mostraba el boton de cobro deshabilitado. Con un valor negativo se
--      bajaba el facturado del periodo entero.
--
--   2. EL IMPORTE DEL COBRO. payments solo exigia amount > 0. La regla de
--      "no cobrar mas que el saldo" vivia unicamente en el navegador
--      (payments.mjs), asi que una peticion directa registraba cualquier
--      cifra contra una cita: "Cobrado" inflado y utilidad falsa.
--
-- El criterio es el que 0024 dejo escrito para los pedidos: el importe es
-- un hecho que el servidor deriva, no un dato que el cliente propone.
--
-- Lo que esta migracion NO hace: impedir que el consultorio cobre en
-- partes, ni que aplique un precio distinto al del catalogo. Las dos
-- cosas son legitimas y siguen funcionando — la segunda, solo para quien
-- administra la clinica.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El precio de la cita sale del catalogo.
--
-- La excepcion es el personal de la clinica: cobrar distinto al catalogo
-- —un descuento, una tarifa social— es una decision de negocio legitima,
-- y quien la toma ya tiene permiso para editar el catalogo entero. Lo que
-- se cierra es que la tome un visitante anonimo.
-- ------------------------------------------------------------
create or replace function public.freeze_appointment_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  precio_catalogo numeric(10, 2);
  puede_fijar boolean := public.is_super_admin() or public.is_clinic_admin();
begin
  select s.price into precio_catalogo
  from public.therapy_services s
  where s.tenant_id = new.tenant_id and s.id = new.service_id;

  if tg_op = 'INSERT' then
    -- Quien no administra la clinica NO propone precio: se le impone el
    -- del catalogo aunque haya mandado uno. Antes bastaba con mandar
    -- cualquier valor para que el trigger se hiciera a un lado.
    if not puede_fijar or new.price is null then
      new.price := precio_catalogo;
    end if;
    return new;
  end if;

  -- UPDATE: el precio congelado es un hecho del momento en que se agendo.
  -- Reagendar no reprecia, y solo la clinica puede corregirlo.
  if not puede_fijar then
    new.price := old.price;
  elsif new.price is null then
    new.price := old.price;
  end if;

  return new;
end $$;

comment on function public.freeze_appointment_price() is
  'Congela el precio de la cita desde therapy_services. Solo el personal de la clinica puede fijar uno distinto: un visitante no propone importes.';

-- Un precio negativo no es un descuento, es un error o un ataque: bajaba
-- el facturado del periodo. NOT VALID a proposito — se aplica a todo lo
-- que entre o se modifique de ahora en adelante y no bloquea la
-- migracion si alguna fila vieja quedo mal. La consulta de verificacion
-- al final de este archivo dice si existe alguna.
alter table public.appointments
  drop constraint if exists appointments_price_no_negativo;
alter table public.appointments
  add constraint appointments_price_no_negativo
  check (price is null or price >= 0) not valid;

-- ------------------------------------------------------------
-- 2 · El cobro no puede exceder el saldo del documento.
--
-- Se permite el ABONO (cobrar en partes) porque es como cobra un
-- consultorio de verdad; lo que se rechaza es que la suma de los cobros
-- pase del importe, que descuadra el libro sin dejar dicho por que.
-- ------------------------------------------------------------
create or replace function public.enforce_payment_within_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  importe   numeric(10, 2);
  ya_pagado numeric(10, 2);
  saldo     numeric(10, 2);
begin
  if new.appointment_id is not null then
    select a.price into importe
    from public.appointments a
    where a.tenant_id = new.tenant_id and a.id = new.appointment_id;
  else
    select o.total into importe
    from public.orders o
    where o.tenant_id = new.tenant_id and o.id = new.order_id;
  end if;

  -- Sin importe no se cobra a ciegas: es la cita que quedo sin precio
  -- congelado. Registrar un cobro ahi taparia el problema.
  if importe is null then
    raise exception 'El documento no tiene importe registrado. Corrige su precio antes de cobrarlo.';
  end if;

  -- Los OTROS cobros del mismo documento. La propia fila se excluye
  -- SIEMPRE, no solo en UPDATE: como el trigger es AFTER, en un INSERT la
  -- fila ya esta en la tabla y se sumaria a si misma — el primer cobro de
  -- 900 contra una cita de 900 se rechazaba solo.
  select coalesce(sum(p.amount), 0) into ya_pagado
  from public.payments p
  where p.tenant_id = new.tenant_id
    and (
      (new.appointment_id is not null and p.appointment_id = new.appointment_id)
      or (new.order_id is not null and p.order_id = new.order_id)
    )
    and p.id <> new.id;

  saldo := importe - ya_pagado;

  if new.amount > saldo then
    raise exception
      'El cobro de % excede el saldo pendiente de % (importe %, ya cobrado %).',
      new.amount, saldo, importe, ya_pagado;
  end if;

  return new;
end $$;

comment on function public.enforce_payment_within_balance() is
  'La suma de los cobros de un documento no pasa de su importe. El abono parcial SI se permite: es como cobra un consultorio.';

-- AFTER y no BEFORE, a proposito.
--
-- Los triggers BEFORE corren ANTES del with check de RLS. Con BEFORE, un
-- admin de cafeteria que intentara registrar un cobro de consultorio
-- recibia "excede el saldo pendiente de 0.00 (importe 900.00)" en vez de
-- un error de permiso: el mensaje le revelaba el importe y el saldo de
-- una cita que no tiene derecho a ver. Lo caso la prueba de 0018, que
-- esperaba insufficient_privilege.
--
-- En AFTER la policy resuelve primero, asi que esta validacion solo corre
-- sobre filas que el usuario SI puede escribir. La excepcion aborta la
-- sentencia igual: no hace falta modificar la fila, solo rechazarla.
drop trigger if exists enforce_payment_within_balance on public.payments;
create trigger enforce_payment_within_balance
  after insert or update on public.payments
  for each row execute function public.enforce_payment_within_balance();

-- ------------------------------------------------------------
-- 3 · Verificacion, para correr a mano despues de aplicar.
--
-- No falla la migracion: informa. Si devuelve filas, son citas que ya
-- estaban mal antes de esta migracion y hay que corregirlas a mano.
-- ------------------------------------------------------------
do $$
declare
  en_cero   integer;
  negativas integer;
  sin_precio integer;
begin
  select count(*) filter (where price = 0),
         count(*) filter (where price < 0),
         count(*) filter (where price is null)
    into en_cero, negativas, sin_precio
  from public.appointments;

  raise notice '0028 · citas en cero: % · negativas: % · sin precio: %',
    en_cero, negativas, sin_precio;

  if negativas > 0 then
    raise notice '0028 · HAY CITAS CON PRECIO NEGATIVO. Revisalas: select id, service_id, price from public.appointments where price < 0;';
  end if;
end $$;
