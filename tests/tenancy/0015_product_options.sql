-- Los modificadores del menu son de cada clinica.
--
-- Salen del codigo (MILKS, FLAVORS y los recargos) a la base para poder
-- editarlos. Al hacerlo dejan de ser una constante igual para todos y
-- pasan a ser dato por tenant, asi que necesitan el mismo aislamiento que
-- el resto del catalogo.

insert into public.tenants (id,name) values
  ('t_po_a','Cafe A'), ('t_po_b','Cafe B');

-- La siembra de 0021 corrio ANTES de que existieran estas dos clinicas,
-- asi que se les cargan sus propios modificadores.
insert into public.product_options (tenant_id,id,kind,name,price_delta,sort_order) values
  ('t_po_a','milk-entera','milk','Entera',0,10),
  ('t_po_a','flavor-vainilla','flavor','Vainilla',5,10),
  ('t_po_a','addon-shot-extra','addon','Shot extra',10,10),
  ('t_po_b','milk-entera','milk','Entera',0,10),
  ('t_po_b','flavor-vainilla','flavor','Vainilla',9,10),
  ('t_po_b','addon-shot-extra','addon','Shot extra',12,10);

insert into auth.users (id,email) values
  ('cafe0000-0000-0000-0000-000000000001','admin.cafe.a@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_po_a','cafe0000-0000-0000-0000-000000000001','admin_cafe');

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.product_options to authenticated;
grant select on public.product_options to anon;

-- El mismo id en dos clinicas con precios distintos: es la prueba de que
-- el id solo es unico DENTRO de su clinica.
do $$
declare v_n integer; v_p numeric;
begin
  -- Acotado a las dos clinicas de esta prueba: 0021 siembra para TODAS
  -- las que ya existian, asi que brainpsi tambien tiene la suya y un
  -- conteo global contaria de mas.
  select count(*) into v_n from public.product_options
   where id = 'addon-shot-extra' and tenant_id in ('t_po_a','t_po_b');
  if v_n <> 2 then raise exception 'FALLA: el montaje esperaba el mismo id en las dos clinicas de la prueba, hubo %', v_n; end if;
  raise notice 'ok · el mismo modificador existe en dos clinicas con precio distinto';
end $$;

-- El visitante ve los de la clinica que visita, y solo esos.
set role anon;
do $$
declare v_p numeric; v_n integer;
begin
  perform set_config('request.jwt.claims','', true);

  perform set_config('request.tenant','t_po_a', true);
  select price_delta into v_p from public.product_options where id='addon-shot-extra';
  if v_p <> 10 then raise exception 'FALLA: visitando A el shot costaba % y no 10', v_p; end if;

  perform set_config('request.tenant','t_po_b', true);
  select price_delta into v_p from public.product_options where id='addon-shot-extra';
  if v_p <> 12 then raise exception 'FUGA: visitando B se vio el precio de A (%)', v_p; end if;

  select count(*) into v_n from public.product_options;
  if v_n <> 3 then raise exception 'FUGA: visitando B se vieron % modificadores', v_n; end if;

  perform set_config('request.tenant','', true);
  select count(*) into v_n from public.product_options;
  if v_n <> 0 then raise exception 'FUGA: sin clinica se vieron % modificadores', v_n; end if;

  raise notice 'ok · el visitante ve los precios de la clinica que visita';
end $$;
reset role;

-- Un inactivo no se le ofrece al visitante, pero la administracion si lo ve.
update public.product_options set active = false
 where tenant_id='t_po_a' and id='flavor-vainilla';

set role anon;
do $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_po_a', true);
  select count(*) into v_n from public.product_options where kind='flavor';
  if v_n <> 0 then raise exception 'FALLA: un sabor inactivo se le seguia ofreciendo al visitante'; end if;
  raise notice 'ok · inactivar un sabor lo retira del menu publico';
end $$;
reset role;

-- El admin de cafe administra los suyos y NO los de la clinica vecina.
set role authenticated;
do $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"cafe0000-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_po_a":"admin_cafe"}}}', true);
  perform set_config('request.tenant','t_po_a', true);

  -- Ve los inactivos de SU clinica: si no, no podria reactivarlos.
  select count(*) into v_n from public.product_options;
  if v_n <> 3 then raise exception 'FALLA: el admin de cafe ve % modificadores propios y no 3', v_n; end if;

  update public.product_options set price_delta = 14 where id='addon-shot-extra';
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'FUGA: el update alcanzo % filas y no solo la propia', v_n; end if;

  delete from public.product_options where tenant_id='t_po_b';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FUGA: borro % modificadores de la clinica vecina', v_n; end if;

  raise notice 'ok · el admin de cafe solo administra los suyos';
end $$;
reset role;

do $$
declare v_p numeric;
begin
  select price_delta into v_p from public.product_options
   where tenant_id='t_po_b' and id='addon-shot-extra';
  if v_p <> 12 then raise exception 'FUGA: el precio de la clinica vecina quedo en %', v_p; end if;
  raise notice 'ok · el precio de la clinica vecina quedo intacto';
end $$;
