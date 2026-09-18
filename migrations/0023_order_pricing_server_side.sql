-- ============================================================
-- 0023 · El precio de un pedido lo decide el catalogo, no el navegador
--
-- mapOrderToDb mandaba total y subtotal tal cual venian del cliente, y
-- cada order_item su unit_price desde customizations.totalPrice — el
-- numero que optionsTotal() calculo EN EL NAVEGADOR. Del lado del
-- servidor nadie lo comprobaba: las policies solo exigen >= 0,
-- prepare_order_operational_fields toca estado y horarios, y
-- order_can_receive_public_items valida tenant, origen y ventana de
-- tiempo. Ningun trigger comparaba contra products.price.
--
-- Un visitante anonimo podia pedir con la clave anon —que viaja en el
-- bundle— y mandar total 0. Pasaba RLS, el barista veia el ticket en $0
-- y el cafe se entregaba. Reproducido en tests/tenancy/0017:
--   ROBO: el cliente fijo el precio unitario en 0.00 (el catalogo dice 45)
--
-- Regla: el cliente PROPONE, el servidor DISPONE. Lo que el navegador
-- manda en unit_price, subtotal, combo_savings y total se ignora y se
-- recalcula. Que el cliente los siga mandando no molesta: se pisan.
--
-- DOMINIO CRITICO (dinero). Los importes que el negocio cobra dependen de
-- estas tres funciones; conviene leerlas con calma antes de integrar.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · El precio de una linea: producto + sus modificadores.
--
-- Los modificadores se identifican por ID y no por nombre. El cliente
-- guardaba 'Vainilla' y un nombre no es una llave: no se puede validar
-- contra el catalogo, y dos clinicas pueden tener sabores homonimos a
-- precios distintos. options.optionIds trae los ids.
-- ------------------------------------------------------------
create or replace function public.price_of_order_item(
  p_tenant     text,
  p_product_id text,
  p_options    jsonb
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.price from public.products p
      where p.tenant_id = p_tenant and p.id = p_product_id and p.active),
    0)
  + coalesce(
    (select sum(o.price_delta) from public.product_options o
      where o.tenant_id = p_tenant
        and o.active
        and o.id in (
          select jsonb_array_elements_text(
            case when jsonb_typeof(p_options -> 'optionIds') = 'array'
                 then p_options -> 'optionIds'
                 else '[]'::jsonb end)
        )),
    0);
$$;

comment on function public.price_of_order_item(text, text, jsonb) is
  'Precio de una linea de pedido segun el catalogo: producto activo mas los modificadores activos que referencia por id. Un producto que no existe o esta inactivo vale 0.';

-- ------------------------------------------------------------
-- 2 · Se aplica ANTES de escribir la linea.
-- ------------------------------------------------------------
create or replace function public.enforce_order_item_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Sin producto del catalogo no hay contra que validar. La linea se
  -- rechaza en vez de aceptarse al precio que traiga: un pedido que no
  -- referencia el catalogo no es un pedido, es un importe a mano.
  if new.product_id is null then
    raise exception 'Una linea de pedido tiene que referenciar un producto del catalogo';
  end if;

  if not exists (
    select 1 from public.products p
     where p.tenant_id = new.tenant_id and p.id = new.product_id and p.active
  ) then
    raise exception 'El producto % no existe o no esta activo en esta clinica', new.product_id;
  end if;

  if new.quantity is null or new.quantity < 1 then
    raise exception 'La cantidad de una linea de pedido tiene que ser al menos 1';
  end if;

  new.unit_price := public.price_of_order_item(new.tenant_id, new.product_id, coalesce(new.options, '{}'::jsonb));
  return new;
end $$;

drop trigger if exists enforce_order_item_price on public.order_items;
create trigger enforce_order_item_price
  before insert or update on public.order_items
  for each row execute function public.enforce_order_item_price();

-- ------------------------------------------------------------
-- 3 · Los totales del pedido se recalculan desde sus lineas.
--
-- El ahorro del combo se recalcula tambien, con la misma regla que la
-- pantalla: hace falta al menos un cafe y un postre, y se descuenta la
-- diferencia entre el mas barato de cada uno y el precio del combo, solo
-- si esa suma SUPERA al combo.
--
-- La pantalla decide cafe/postre por el PREFIJO del id ('h', 'c', 'p').
-- Aqui se usa products.category, que es el dato real: un producto con
-- otro id dejaria de contar para el combo sin que nadie lo notara.
-- ------------------------------------------------------------
create or replace function public.recalc_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order    text;
  v_tenant   text;
  v_sub      numeric(10,2);
  v_cafe     numeric(10,2);
  v_postre   numeric(10,2);
  v_combo    numeric(10,2);
  v_ahorro   numeric(10,2) := 0;
begin
  v_order  := coalesce(new.order_id, old.order_id);
  v_tenant := coalesce(new.tenant_id, old.tenant_id);

  select coalesce(sum(i.quantity * i.unit_price), 0) into v_sub
  from public.order_items i
  where i.tenant_id = v_tenant and i.order_id = v_order;

  -- El mas barato de cada lado, por categoria del catalogo.
  select min(i.unit_price) into v_cafe
  from public.order_items i
  join public.products p on p.tenant_id = i.tenant_id and p.id = i.product_id
  where i.tenant_id = v_tenant and i.order_id = v_order and p.category in ('hot','cold');

  select min(i.unit_price) into v_postre
  from public.order_items i
  join public.products p on p.tenant_id = i.tenant_id and p.id = i.product_id
  where i.tenant_id = v_tenant and i.order_id = v_order and p.category = 'desserts';

  if v_cafe is not null and v_postre is not null then
    select o.price into v_combo
    from public.offers o
    where o.tenant_id = v_tenant and o.active
      and (o.starts_at is null or o.starts_at <= current_date)
      and (o.ends_at   is null or o.ends_at   >= current_date)
    order by o.created_at
    limit 1;

    if v_combo is not null and (v_cafe + v_postre) > v_combo then
      v_ahorro := (v_cafe + v_postre) - v_combo;
    end if;
  end if;

  update public.orders
     set subtotal      = v_sub,
         combo_savings = v_ahorro,
         total         = v_sub - v_ahorro,
         updated_at    = now()
   where tenant_id = v_tenant and id = v_order;

  return coalesce(new, old);
end $$;

drop trigger if exists recalc_order_totals on public.order_items;
create trigger recalc_order_totals
  after insert or update or delete on public.order_items
  for each row execute function public.recalc_order_totals();
