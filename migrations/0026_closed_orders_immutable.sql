-- ============================================================
-- 0026 · Un pedido cerrado es inmutable, por todas sus puertas
--
-- 0025 rechazo el INSERT de lineas sobre un pedido cerrado. Como
-- saveOrders BORRA y reinserta —dos peticiones sin transaccion— el borrado
-- pasaba y el insert tronaba: el pedido entregado quedaba con CERO
-- lineas. Es exactamente la perdida de datos que 0024 existia para
-- arreglar, reintroducida por el vecino de al lado.
--
-- Cuarta tanda con la misma firma. La leccion que deja: cuando se protege
-- un objeto, no se enumera la operacion que se vio — se enumeran las
-- CUATRO (insert, update, delete y el cambio de estado que lo saca de la
-- proteccion). Aqui estan las cuatro.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · DELETE. La puerta que faltaba, y la que habilitaba el desastre.
-- ------------------------------------------------------------
create or replace function public.block_closed_order_item_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.order_is_closed(old.tenant_id, old.order_id) then
    raise exception 'No se pueden borrar lineas de un pedido ya cobrado';
  end if;
  return old;
end $$;

drop trigger if exists block_closed_order_item_delete on public.order_items;
create trigger block_closed_order_item_delete
  before delete on public.order_items
  for each row execute function public.block_closed_order_item_delete();

-- ------------------------------------------------------------
-- 2 · UPDATE. Se conservaba unit_price y quedaban libres quantity y
--     product_id — el vecino inmediato del campo que si se acoto.
--
-- Con el total congelado y las lineas editables, el ticket dejaba de
-- cuadrar con el importe cobrado. En un historial contable eso es peor
-- que un error visible.
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
      -- Las TRES columnas que componen el importe, no solo el precio.
      new.unit_price := old.unit_price;
      new.quantity   := old.quantity;
      new.product_id := old.product_id;
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
-- 3 · El cambio de ESTADO que saca al pedido de la proteccion.
--
-- freeze_order_amounts decide por old.status, y nada impedia
-- 'delivered' → 'received'. En tres pasos —reabrir, editar, volver a
-- cerrar— se alteraba lo ya cobrado sin tocar un solo importe
-- directamente. Congelar los importes no sirve si se puede descongelar
-- el pedido.
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
    if new.status is distinct from old.status then
      raise exception 'Un pedido % no se puede reabrir', old.status;
    end if;
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
