-- El precio de un pedido lo decide el CATALOGO, no el navegador.
--
-- mapOrderToDb mandaba total y subtotal tal cual venian del cliente, y
-- cada order_item su unit_price desde customizations.totalPrice — el
-- numero que optionsTotal() calculo EN EL NAVEGADOR. Del lado del
-- servidor, las policies solo exigian >= 0;
-- prepare_order_operational_fields toca estado y horarios, no precios; y
-- order_can_receive_public_items valida tenant, origen y ventana de
-- tiempo, no el catalogo. Ningun trigger comparaba contra products.price.
--
-- Es decir: un visitante anonimo podia pedir con la clave anon y mandar
-- total 0. Pasaba RLS, el barista veia el ticket en $0 y el cafe se
-- entregaba.
--
-- NOTA DE METODO: la primera version de esta prueba verificaba DENTRO del
-- rol anon, que no tiene lectura sobre order_items. El select devolvia
-- null, y 'null <> 45' en SQL es UNKNOWN y no TRUE, asi que el if nunca
-- disparaba y la prueba pasaba sin arreglo alguno. Se verifica fuera del
-- rol y con 'is distinct from', que si distingue null.

insert into public.tenants (id,name) values ('t_pay','Cafe Precio');
insert into public.products (tenant_id,id,category,name,price,active) values
  ('t_pay','h1','hot','Espresso',30,true),
  ('t_pay','p1','desserts','Pastel',65,true);
insert into public.product_options (tenant_id,id,kind,name,price_delta) values
  ('t_pay','addon-shot','addon','Shot extra',10),
  ('t_pay','flavor-van','flavor','Vainilla',5);
insert into public.offers (tenant_id,id,name,price,active) values
  ('t_pay','combo','Combo cafe + postre',99,true);

grant usage on schema public to anon;
grant select on public.products, public.product_options, public.offers to anon;
grant insert on public.orders, public.order_items to anon;

set role anon;

-- Las INSERCIONES van como anon, que es el visitante publico.
set role anon;
do $$
begin
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_pay', true);

  -- 1 · Pedido honesto: espresso 30 + shot 10 + sabor 5 = 45.
  insert into public.orders (tenant_id,id,customer_name,customer_phone,status,order_source,subtotal,total)
    values ('t_pay','ord-1','Cliente','5511111111','received','public_menu',45,45);
  insert into public.order_items (tenant_id,order_id,product_id,name,quantity,unit_price,options)
    values ('t_pay','ord-1','h1','Espresso',1,45,'{"optionIds":["addon-shot","flavor-van"]}'::jsonb);

  -- 2 · EL ATAQUE: los mismos productos, con los precios en cero.
  insert into public.orders (tenant_id,id,customer_name,customer_phone,status,order_source,subtotal,total)
    values ('t_pay','ord-hack','Listillo','5522222222','received','public_menu',0,0);
  insert into public.order_items (tenant_id,order_id,product_id,name,quantity,unit_price,options)
    values ('t_pay','ord-hack','h1','Espresso',6,0,'{"optionIds":["addon-shot","flavor-van"]}'::jsonb);

  -- 3 · Un descuento de combo inventado, sin postre en el pedido.
  insert into public.orders (tenant_id,id,customer_name,customer_phone,status,order_source,subtotal,combo_savings,total)
    values ('t_pay','ord-combo','Listillo','5533333333','received','public_menu',30,30,0);
  insert into public.order_items (tenant_id,order_id,product_id,name,quantity,unit_price,options)
    values ('t_pay','ord-combo','h1','Espresso',1,30,'{}'::jsonb);

  -- 4 · Un combo que SI se cumple: cafe 30 + postre 65 = 95, menor que 99.
  insert into public.orders (tenant_id,id,customer_name,customer_phone,status,order_source,subtotal,total)
    values ('t_pay','ord-ok','Cliente','5544444444','received','public_menu',0,0);
  insert into public.order_items (tenant_id,order_id,product_id,name,quantity,unit_price,options) values
    ('t_pay','ord-ok','h1','Espresso',1,0,'{}'::jsonb),
    ('t_pay','ord-ok','p1','Pastel',1,0,'{}'::jsonb);
end $$;
reset role;

-- Las VERIFICACIONES van fuera del rol: anon no puede leer order_items, y
-- desde su sesion todo select devuelve null y toda comparacion, UNKNOWN.
do $$
declare v_precio numeric; v_sub numeric; v_total numeric; v_ahorro numeric; v_n integer;
begin
  select count(*) into v_n from public.order_items where order_id='ord-1';
  if v_n <> 1 then raise exception 'MONTAJE: el pedido honesto no se inserto (% filas)', v_n; end if;

  select unit_price into v_precio from public.order_items where order_id='ord-1';
  if v_precio is distinct from 45 then
    raise exception 'FALLA: un pedido honesto quedo en % y no en 45', coalesce(v_precio::text,'NULL');
  end if;
  raise notice 'ok · el pedido honesto conserva su precio';

  select unit_price into v_precio from public.order_items where order_id='ord-hack';
  if v_precio is distinct from 45 then
    raise exception 'ROBO: el cliente fijo el precio unitario en % (el catalogo dice 45)', coalesce(v_precio::text,'NULL');
  end if;
  select subtotal, total into v_sub, v_total from public.orders where id='ord-hack';
  if v_sub is distinct from 270 then
    raise exception 'ROBO: el subtotal quedo en % y no en 270 (6 x 45)', coalesce(v_sub::text,'NULL');
  end if;
  if v_total is distinct from 270 then
    raise exception 'ROBO: el total quedo en % y no en 270', coalesce(v_total::text,'NULL');
  end if;
  raise notice 'ok · el servidor recalcula el precio desde el catalogo';

  select combo_savings, total into v_ahorro, v_total from public.orders where id='ord-combo';
  if v_ahorro is distinct from 0 then
    raise exception 'ROBO: se aplico un ahorro de combo de % sin postre en el pedido', coalesce(v_ahorro::text,'NULL');
  end if;
  if v_total is distinct from 30 then
    raise exception 'ROBO: el total quedo en % y no en 30', coalesce(v_total::text,'NULL');
  end if;
  raise notice 'ok · el combo no se aplica si el pedido no lo cumple';

  select combo_savings, total into v_ahorro, v_total from public.orders where id='ord-ok';
  if v_ahorro is distinct from 0 then
    raise exception 'FALLA: se invento un ahorro de % cuando el combo (99) es mas caro que 95', coalesce(v_ahorro::text,'NULL');
  end if;
  if v_total is distinct from 95 then
    raise exception 'FALLA: el total quedo en % y no en 95', coalesce(v_total::text,'NULL');
  end if;
  raise notice 'ok · el combo solo descuenta cuando de verdad conviene';
end $$;
