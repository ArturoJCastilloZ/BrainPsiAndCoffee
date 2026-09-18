-- ============================================================
-- 0021 · Las personalizaciones del café salen del código
--
-- Cuatro cosas del menu vivian escritas a mano y no se podian cambiar sin
-- redesplegar:
--
--   src/data.js:67        MILKS   = ['Entera', 'Deslactosada']
--   src/data.js:66        FLAVORS = 4 sabores
--   src/user/MenuPage.jsx:112   shot extra  +$10
--   src/user/MenuPage.jsx:112   agregar sabor +$5
--
-- Las cuatro son LO MISMO: modificadores de un producto. Lo unico que las
-- distingue es de que tipo son y si suman al precio. Una sola tabla las
-- cubre, y con ella una sola pantalla en el admin en vez de tres.
--
-- El recargo por sabor pasa a ser POR SABOR y no uno solo para todos. Hoy
-- los cuatro quedan en $5, asi que no cambia nada; pero permite cobrar
-- distinto un sabor premium sin tocar codigo, que es justo lo que se pedia.
-- ============================================================

create table if not exists public.product_options (
  tenant_id   text    not null,
  id          text    not null,
  -- 'milk'   eleccion de leche
  -- 'flavor' eleccion de sabor
  -- 'addon'  extra que se marca o no (el shot)
  kind        text    not null check (kind in ('milk', 'flavor', 'addon')),
  name        text    not null,
  -- Lo que SUMA al precio del producto. 0 para las que no cobran.
  -- numeric(10,2) igual que products.price: un float haria que 10.1 + 5.2
  -- no diera 15.3 en un total que el cliente ve.
  price_delta numeric(10, 2) not null default 0,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, id),
  constraint product_options_tenant_fk
    foreign key (tenant_id) references public.tenants(id) on delete restrict,
  constraint product_options_delta_no_negativo check (price_delta >= 0)
);

comment on table public.product_options is
  'Modificadores del menu de cafe por clinica: tipos de leche, sabores y extras. Reemplaza MILKS, FLAVORS y los recargos que estaban en el codigo.';

alter table public.product_options alter column tenant_id set default public.current_request_tenant();

create index if not exists product_options_lookup_idx
  on public.product_options (tenant_id, kind, sort_order) where active;

alter table public.product_options enable row level security;

-- Mismas dos policies que products: el visitante lee lo activo de la
-- clinica que visita, y solo la administracion del cafe escribe.
drop policy if exists "Public can read active product options" on public.product_options;
create policy "Public can read active product options" on public.product_options
  for select using (tenant_id = public.current_request_tenant() and active = true);

drop policy if exists "Admins can manage product options" on public.product_options;
create policy "Admins can manage product options" on public.product_options
  for all using (tenant_id = public.current_tenant_id() and (public.is_super_admin() or public.is_cafe_admin()))
  with check (tenant_id = public.current_tenant_id() and (public.is_super_admin() or public.is_cafe_admin()));

-- ------------------------------------------------------------
-- Se siembran los valores que HOY estan en el codigo, para cada clinica
-- que ya existe. Asi el comportamiento no cambia al aplicar la migracion:
-- lo que el cliente veia ayer es lo que ve hoy, solo que ahora editable.
--
-- Las clinicas NUEVAS nacen sin ninguno, que es lo correcto: el cafe no
-- es parte del producto que se vende a otros consultorios.
-- ------------------------------------------------------------
insert into public.product_options (tenant_id, id, kind, name, price_delta, sort_order)
select t.id, o.id, o.kind, o.name, o.price_delta, o.sort_order
from public.tenants t
cross join (values
  ('milk-entera',        'milk',   'Entera',                          0,  10),
  ('milk-deslactosada',  'milk',   'Deslactosada',                    0,  20),
  ('flavor-vainilla',    'flavor', 'Vainilla',                        5,  10),
  ('flavor-pistacho',    'flavor', 'Pistacho',                        5,  20),
  ('flavor-vainilla-fr', 'flavor', 'Vainilla francesa (sin azúcar)',  5,  30),
  ('flavor-caramelo',    'flavor', 'Caramelo (sin azúcar)',           5,  40),
  ('addon-shot-extra',   'addon',  'Shot extra',                     10,  10)
) as o(id, kind, name, price_delta, sort_order)
on conflict (tenant_id, id) do nothing;
