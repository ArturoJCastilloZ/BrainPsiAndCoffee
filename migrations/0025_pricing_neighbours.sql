-- ============================================================
-- 0025 · Los vecinos que 0024 dejo sin barrer
--
-- Tercera tanda sobre el mismo trabajo, con la misma firma que las dos
-- anteriores: se cerro el caso diagnosticado y quedo su vecino. Esta vez
-- ocurrio DENTRO del commit escrito para corregir justamente eso.
--
--   se cerro el UPDATE de orders     → quedo abierto el INSERT
--   se congelo el reprecio           → quedo libre escribir sus lineas
--   se revoco una de tres funciones  → quedaron dos hermanas
-- ============================================================

-- ------------------------------------------------------------
-- 1 · Un pedido cerrado CONGELA su precio; no lo deja pasar.
--
-- 0024 hacia 'return new' sin tocar unit_price cuando el pedido estaba
-- cerrado, para no repreciar lo ya cobrado. Pero no poner el precio no es
-- conservarlo: es aceptar el que venga. Y saveOrders reinserta las lineas
-- de cada pedido cargado con el numero del navegador.
--
-- La prueba que lo "verificaba" insertaba 45 y comprobaba 45: afirmaba el
-- numero que ella misma mandaba. Mandando 1, el servidor guardaba 1.00.
-- ------------------------------------------------------------
create or replace function public.enforce_order_item_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_status text;
begin
  if new.product_id is null then
    raise exception 'Una linea de pedido tiene que referenciar un producto del catalogo';
  end if;

  if not exists (
    select 1 from public.products p
     where p.tenant_id = new.tenant_id and p.id = new.product_id
  ) then
    raise exception 'El producto % no existe en esta clinica', new.product_id;
  end if;

  if new.quantity is null or new.quantity < 1 then
    raise exception 'La cantidad de una linea de pedido tiene que ser al menos 1';
  end if;

  if public.order_is_closed(new.tenant_id, new.order_id) then
    if tg_op = 'UPDATE' then
      new.unit_price := old.unit_price;
      return new;
    end if;
    select o.status into v_status from public.orders o
     where o.tenant_id = new.tenant_id and o.id = new.order_id;
    raise exception 'No se pueden agregar lineas a un pedido ya %', v_status;
  end if;

  new.unit_price := public.price_of_order_item(new.tenant_id, new.product_id, coalesce(new.options, '{}'::jsonb));
  return new;
end $$;

-- ------------------------------------------------------------
-- 2 · Las dos funciones hermanas, con el mismo revoke.
--
-- 0024 explica en su propio comentario por que 'revoke from public' no
-- basta en Supabase, y lo aplico a UNA de las tres funciones que creaba.
-- Las otras dos reciben el tenant como argumento y quedaban de oraculo
-- sobre pedidos de otra clinica.
-- ------------------------------------------------------------
revoke all on function public.order_is_closed(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3 · La oferta de combo se identifica por DATO, no por ser la primera.
--
-- combo_savings_of_order tomaba 'order by created_at limit 1' de todas
-- las ofertas activas y trataba su precio como el del combo. Una promo
-- cualquiera —"Postre del dia $25"— hacia que todo pedido con cafe y
-- postre descontara contra ese precio. Como el cliente calculaba igual,
-- los totales coincidian y nadie lo notaba: fuga silenciosa.
-- ------------------------------------------------------------
alter table public.offers
  add column if not exists kind text not null default 'generic';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offers_kind_valido') then
    alter table public.offers add constraint offers_kind_valido check (kind in ('combo', 'generic'));
  end if;
end $$;

comment on column public.offers.kind is
  'combo = la promocion cafe + postre que descuenta el total. generic = cualquier otra, informativa.';

-- Se preserva EXACTAMENTE la semantica de hoy: la que venia siendo
-- tratada como combo —la primera activa de cada clinica— queda marcada.
-- De aqui en adelante es explicito.
update public.offers o set kind = 'combo'
where o.id = (
  select o2.id from public.offers o2
  where o2.tenant_id = o.tenant_id and o2.active
  order by o2.created_at
  limit 1
);

create or replace function public.combo_savings_of_order(p_tenant text, p_order text)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_cafe numeric; v_postre numeric; v_combo numeric;
begin
  select min(i.unit_price) into v_cafe
  from public.order_items i
  join public.products p on p.tenant_id = i.tenant_id and p.id = i.product_id
  where i.tenant_id = p_tenant and i.order_id = p_order and p.category in ('hot','cold');

  select min(i.unit_price) into v_postre
  from public.order_items i
  join public.products p on p.tenant_id = i.tenant_id and p.id = i.product_id
  where i.tenant_id = p_tenant and i.order_id = p_order and p.category = 'desserts';

  if v_cafe is null or v_postre is null then
    return 0;
  end if;

  select o.price into v_combo
  from public.offers o
  where o.tenant_id = p_tenant and o.active and o.kind = 'combo'
    and (o.starts_at is null or o.starts_at <= current_date)
    and (o.ends_at   is null or o.ends_at   >= current_date)
  order by o.created_at
  limit 1;

  if v_combo is null or (v_cafe + v_postre) <= v_combo then
    return 0;
  end if;
  return (v_cafe + v_postre) - v_combo;
end $$;

revoke all on function public.combo_savings_of_order(text, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4 · Los importes se fijan tambien en el INSERT.
--
-- 0024 puso el trigger solo en 'before update'. Un admin_cafe podia
-- INSERTAR el pedido ya como 'delivered' con el total que quisiera: al
-- nacer cerrado, nada lo recalculaba. Y su salida temprana sin lineas
-- dejaba pasar los importes tal cual, asi que borrar las lineas y luego
-- mandar un total inventado se colaba por ahi.
-- ------------------------------------------------------------
create or replace function public.freeze_order_amounts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_sub numeric(10,2); v_ahorro numeric(10,2); v_lineas integer;
begin
  if tg_op = 'UPDATE' and old.status in ('delivered', 'cancelled') then
    new.subtotal      := old.subtotal;
    new.combo_savings := old.combo_savings;
    new.total         := old.total;
    return new;
  end if;

  select count(*), coalesce(sum(i.quantity * i.unit_price), 0)
    into v_lineas, v_sub
  from public.order_items i
  where i.tenant_id = new.tenant_id and i.order_id = new.id;

  if v_lineas = 0 then
    -- Sin lineas no hay importe que justificar. En un INSERT nace en cero
    -- y sus lineas lo pondran al dia; en un UPDATE se conserva lo que
    -- hubiera. Lo que NO se hace es dejar pasar el numero del cliente.
    if tg_op = 'INSERT' then
      new.subtotal := 0; new.combo_savings := 0; new.total := 0;
    else
      new.subtotal := old.subtotal; new.combo_savings := old.combo_savings; new.total := old.total;
    end if;
    return new;
  end if;

  v_ahorro := public.combo_savings_of_order(new.tenant_id, new.id);
  new.subtotal      := v_sub;
  new.combo_savings := v_ahorro;
  new.total         := v_sub - v_ahorro;
  return new;
end $$;

drop trigger if exists freeze_order_amounts on public.orders;
create trigger freeze_order_amounts
  before insert or update on public.orders
  for each row execute function public.freeze_order_amounts();

-- ------------------------------------------------------------
-- 5 · El criterio del registro de lectura, literal.
--
-- 0024 afirmaba usar "el mismo criterio que la policy de 0013" y no era
-- exacto: le faltaba is_doctor() y le sobraba el filtro de deleted_at,
-- que la policy no tiene. Una nota con borrado logico que un doctor puede
-- leer legitimamente no dejaba rastro. Un comentario que miente sobre un
-- criterio de acceso es el mismo defecto que 0024 vino a corregir.
-- ------------------------------------------------------------
create or replace function public.log_clinical_note_access(note_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_tenant text; v_patient uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null or not public.is_doctor() then
    return;
  end if;

  select n.patient_id into v_patient
  from public.clinical_notes n
  join public.encounters e
    on e.tenant_id = n.tenant_id and e.id = n.encounter_id
  where n.tenant_id = v_tenant
    and n.id = note_id
    and e.therapist_id = public.current_therapist_id();

  if v_patient is null then
    return;
  end if;

  insert into public.audit_log (
    tenant_id, actor_user_id, actor_role, action, table_name, record_id, patient_id
  ) values (
    v_tenant, auth.uid(), coalesce(public.current_tenant_role(), 'anon'),
    'READ', 'clinical_notes', note_id::text, v_patient
  );
end $$;

-- ------------------------------------------------------------
-- 6 · El comentario sobre encounters decia de mas.
--
-- 0024 afirmaba que nulificar old_data/new_data quitaba del alcance del
-- dueño "el mapa paciente ↔ terapeuta ↔ fecha". No es cierto: patient_id,
-- actor_user_id y la fecha se escriben FUERA de esa condicion.
--
-- Y esta bien que asi sea: ese mapa ES la bitacora. Responder "quien toco
-- el expediente de X y cuando" es para lo que existe, y el dueño de la
-- clinica responde por ello. Lo que se protege es el CONTENIDO —el texto
-- de la nota, el motivo, el estado de la consulta—, no que hubo acceso.
--
-- Se corrige la AFIRMACION, no el comportamiento.
-- ------------------------------------------------------------
comment on column public.audit_log.new_data is
  'Contenido de la fila DESPUES del cambio. Null para las tablas clinicas (clinical_notes, note_addenda, encounters): la bitacora la lee el dueño, a quien el diseño niega el expediente. Que hubo un acceso, a que paciente y por quien SI se registra: eso es la bitacora, no una fuga.';
comment on column public.audit_log.old_data is
  'Contenido de la fila ANTES del cambio. Null para las tablas clinicas, por el mismo motivo que new_data.';
