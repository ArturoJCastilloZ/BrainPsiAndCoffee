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

-- El recalculo no sirve de nada si despues se puede pisar el total.
--
-- Los triggers corrigen al escribir las lineas; si el visitante pudiera
-- mandar luego un UPDATE a orders.total, recuperaria el pedido en $0 con
-- una segunda peticion. Las policies de 0005 solo dan update a
-- is_cafe_staff(), pero eso es leer la policy: aqui se intenta.
set role anon;
do $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_pay', true);

  -- Dos formas validas de "no puede": sin privilegio de tabla (el grant
  -- nunca se otorgo) o con privilegio pero cero filas (RLS). Se aceptan
  -- las dos; lo que no se acepta es que TOQUE una fila. De hecho aqui
  -- salta la primera barrera, el grant, antes de llegar a RLS.
  begin
    update public.orders set total = 0, subtotal = 0 where id = 'ord-hack';
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception 'ROBO: el visitante piso el total de % pedido(s) despues del recalculo', v_n;
    end if;
  exception when insufficient_privilege then null;
  end;

  begin
    update public.order_items set unit_price = 0 where order_id = 'ord-hack';
    get diagnostics v_n = row_count;
    if v_n <> 0 then
      raise exception 'ROBO: el visitante modifico % linea(s) despues de crearlas', v_n;
    end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$
declare v_total numeric;
begin
  select total into v_total from public.orders where id='ord-hack';
  if v_total is distinct from 270 then
    raise exception 'ROBO: el total quedo en % tras el intento de pisarlo', coalesce(v_total::text,'NULL');
  end if;
  raise notice 'ok · el visitante no puede pisar el total despues del recalculo';
end $$;

-- ============================================================
-- Defectos que introdujo 0023 y corrige 0024.
-- ============================================================

-- A · Un producto INACTIVO no puede destruir el pedido.
--
-- saveOrders borra y reinserta las lineas en dos peticiones sin
-- transaccion. 0023 lanzaba excepcion si el producto estaba inactivo, asi
-- que el delete quedaba confirmado y el insert rechazado: pedido con CERO
-- lineas y total 0 para siempre. Bastaba un barista marcando algo listo.
update public.products set active = false where tenant_id='t_pay' and id='h1';

do $$
declare v_precio numeric; v_n integer;
begin
  delete from public.order_items where tenant_id='t_pay' and order_id='ord-1';
  insert into public.order_items (tenant_id,order_id,product_id,name,quantity,unit_price,options)
    values ('t_pay','ord-1','h1','Espresso',1,999,'{"optionIds":["addon-shot","flavor-van"]}'::jsonb);

  select count(*), max(unit_price) into v_n, v_precio
  from public.order_items where order_id='ord-1';
  if v_n <> 1 then
    raise exception 'DESTRUIDO: el pedido quedo con % lineas al reinsertarlo con un producto inactivo', v_n;
  end if;
  if v_precio is distinct from 45 then
    raise exception 'FALLA: la linea de un producto inactivo quedo en % y no en 45', coalesce(v_precio::text,'NULL');
  end if;
  raise notice 'ok · un producto inactivo no destruye el pedido, conserva su precio';
end $$;
update public.products set active = true where tenant_id='t_pay' and id='h1';

-- B · Un pedido ENTREGADO conserva su precio, y no admite lineas nuevas.
--
-- NOTA DE METODO: la primera version insertaba con unit_price = 45 y
-- verificaba que valiera 45 — afirmaba el numero que ella misma mandaba.
-- Como en un pedido cerrado el trigger no lo tocaba, pasaba siempre;
-- mandando 1 el servidor guardaba 1.00. Ahora el valor que se manda es
-- DISTINTO del esperado, que es lo unico que hace la prueba util.
do $$
declare v_precio numeric; v_n integer; v_falló boolean := false;
begin
  update public.orders set status='delivered' where tenant_id='t_pay' and id='ord-1';
  update public.products set price = 500 where tenant_id='t_pay' and id='h1';

  -- Una linea NUEVA sobre un pedido cerrado se rechaza.
  begin
    insert into public.order_items (tenant_id,order_id,product_id,name,quantity,unit_price,options)
      values ('t_pay','ord-1','h1','Espresso',1,1,'{}'::jsonb);
  exception when others then v_falló := true;
  end;
  if not v_falló then
    raise exception 'HISTORIAL: se agrego una linea a un pedido ya entregado';
  end if;

  -- Y un UPDATE de la linea existente NO cambia su precio, aunque se
  -- mande otro. 45 es lo que costo cuando se cobro; el catalogo dice 500.
  update public.order_items set unit_price = 1
   where tenant_id='t_pay' and order_id='ord-1';

  select unit_price into v_precio from public.order_items where order_id='ord-1';
  if v_precio is distinct from 45 then
    raise exception 'HISTORIAL: el precio de un pedido entregado quedo en % (se cobro 45, el catalogo dice 500)', coalesce(v_precio::text,'NULL');
  end if;
  raise notice 'ok · un pedido entregado conserva el precio con que se cobro';
  update public.products set price = 30 where tenant_id='t_pay' and id='h1';
end $$;

-- C · El personal del cafe tampoco puede pisar los importes.
insert into auth.users (id,email) values ('bb990000-0000-0000-0000-000000000001','barista@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_pay','bb990000-0000-0000-0000-000000000001','barista');
grant select, update on public.orders to authenticated;
grant select on public.tenant_members to authenticated;

set role authenticated;
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"bb990000-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_pay":"barista"}}}', true);
  perform set_config('request.tenant','t_pay', true);
  update public.orders set total = 0, subtotal = 0 where id = 'ord-hack';
end $$;
reset role;

do $$
declare v_total numeric;
begin
  select total into v_total from public.orders where id='ord-hack';
  if v_total is distinct from 270 then
    raise exception 'ROBO: el barista dejo el total en %', coalesce(v_total::text,'NULL');
  end if;
  raise notice 'ok · el personal del cafe tampoco fija los importes a mano';
end $$;

-- ============================================================
-- Vecinos que 0024 dejo abiertos y 0025 cierra.
-- ============================================================

-- D · Un pedido no puede NACER cerrado con el total puesto a mano.
--
-- 0024 puso freeze_order_amounts solo en 'before update'. Insertando el
-- pedido ya como 'delivered', nada lo recalculaba despues.
do $$
declare v_total numeric;
begin
  insert into public.orders (tenant_id,id,customer_name,customer_phone,status,order_source,subtotal,total)
    values ('t_pay','ord-nace','Listillo','5566666666','delivered','public_menu',5,5);
  select total into v_total from public.orders where id='ord-nace';
  if v_total is distinct from 0 then
    raise exception 'ROBO: un pedido nacio cerrado con total % y sin lineas que lo respalden', coalesce(v_total::text,'NULL');
  end if;
  raise notice 'ok · un pedido sin lineas nace en cero, no con el total que le pongan';
end $$;

-- E · Borrar las lineas y despues inventar el total.
--
-- La salida temprana de 0024 cuando no habia lineas dejaba pasar los
-- importes tal cual.
do $$
declare v_total numeric;
begin
  delete from public.order_items where tenant_id='t_pay' and order_id='ord-combo';
  update public.orders set total = 9999, subtotal = 9999 where tenant_id='t_pay' and id='ord-combo';
  select total into v_total from public.orders where id='ord-combo';
  if v_total = 9999 then
    raise exception 'ROBO: sin lineas se fijo un total de 9999 a mano';
  end if;
  raise notice 'ok · sin lineas no se puede inventar el total';
end $$;

-- F · Una promo cualquiera no se toma por el combo.
--
-- combo_savings_of_order tomaba la PRIMERA oferta activa. Una promo de
-- $25 hacia que todo pedido con cafe y postre descontara contra ella.
-- Como el cliente calculaba igual, nadie lo notaba.
insert into public.offers (tenant_id,id,name,price,active,kind) values
  ('t_pay','promo-postre','Postre del dia',25,true,'generic');

do $$
declare v_ahorro numeric; v_total numeric;
begin
  insert into public.orders (tenant_id,id,customer_name,customer_phone,status,order_source,subtotal,total)
    values ('t_pay','ord-promo','Cliente','5577777777','received','public_menu',0,0);
  insert into public.order_items (tenant_id,order_id,product_id,name,quantity,unit_price,options) values
    ('t_pay','ord-promo','h1','Espresso',1,0,'{}'::jsonb),
    ('t_pay','ord-promo','p1','Pastel',1,0,'{}'::jsonb);

  select combo_savings, total into v_ahorro, v_total from public.orders where id='ord-promo';
  -- 30 + 65 = 95. Contra el combo real (99) no hay ahorro. Contra la
  -- promo generica de 25 habria 70 de descuento.
  if v_ahorro is distinct from 0 then
    raise exception 'FUGA: una promo generica se tomo por el combo y desconto %', coalesce(v_ahorro::text,'NULL');
  end if;
  if v_total is distinct from 95 then
    raise exception 'FUGA: el total quedo en % y no en 95', coalesce(v_total::text,'NULL');
  end if;
  raise notice 'ok · solo la oferta marcada como combo descuenta';
end $$;

-- G · Las tres funciones de precio, revocadas por igual.
do $$
declare v_expuestas text;
begin
  select string_agg(p.proname, ', ') into v_expuestas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public'
    and p.proname in ('price_of_order_item','order_is_closed','combo_savings_of_order')
    and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute'));
  if v_expuestas is not null then
    raise exception 'FUGA: estas funciones de precio siguen expuestas como RPC: %', v_expuestas;
  end if;
  raise notice 'ok · ninguna funcion de precio es alcanzable por RPC';
end $$;
