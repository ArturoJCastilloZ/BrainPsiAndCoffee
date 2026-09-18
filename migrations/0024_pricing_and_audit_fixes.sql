-- ============================================================
-- 0024 · Correcciones a 0022 y 0023
--
-- Todo lo de aqui son defectos que introdujeron las dos migraciones
-- anteriores, encontrados auditandolas. Ninguno estaba en el diagnostico;
-- todos estaban en el arreglo.
-- ============================================================

-- ------------------------------------------------------------
-- 1 · 0023 destruia pedidos historicos.
--
-- saveOrders, con sesion, BORRA todas las lineas de cada pedido cargado y
-- las reinserta. Son dos peticiones HTTP distintas, sin transaccion.
-- 0023 lanzaba excepcion si el producto estaba inactivo — y el toggle de
-- inactivar existe en el admin. Resultado: el delete ya confirmado, el
-- insert rechazado, y el pedido con CERO lineas y total 0 para siempre.
-- Bastaba con que un barista marcara un pedido como listo.
--
-- Dos cambios:
--
-- a) Un producto inactivo ya no rechaza la linea. Se le pone el precio de
--    su ficha igual. Que hoy no se venda no cambia lo que costo cuando se
--    pidio; 'active' es una decision de catalogo, no un control de
--    seguridad. Solo se rechaza un producto que no existe en la clinica.
--
-- b) Un pedido ENTREGADO o CANCELADO ya no se reprecia. Sin esto, un
--    cambio de precio reescribia el importe de pedidos de hace meses: se
--    alteraba lo ya cobrado.
-- ------------------------------------------------------------
create or replace function public.order_is_closed(p_tenant text, p_order text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.orders o
    where o.tenant_id = p_tenant and o.id = p_order
      and o.status in ('delivered', 'cancelled')
  );
$$;

revoke all on function public.order_is_closed(text, text) from public;

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
  -- Sin filtro de 'active': se cobra lo que la ficha dice, exista o no
  -- hoy en la carta. Ver la nota (a) de arriba.
  select coalesce(
    (select p.price from public.products p
      where p.tenant_id = p_tenant and p.id = p_product_id),
    0)
  + coalesce(
    (select sum(o.price_delta) from public.product_options o
      where o.tenant_id = p_tenant
        and o.id in (
          select jsonb_array_elements_text(
            case when jsonb_typeof(p_options -> 'optionIds') = 'array'
                 then p_options -> 'optionIds'
                 else '[]'::jsonb end)
        )),
    0);
$$;

-- 0023 la dejo sin revocar. En Supabase toda funcion de public se expone
-- como RPC: un anonimo podia llamarla con el tenant de OTRA clinica
-- —lo recibe como argumento, no del JWT— y confirmar que productos
-- existen y a que precio, saltandose RLS. El trigger la invoca como
-- definer y no necesita el grant.
revoke all on function public.price_of_order_item(text, text, jsonb) from public;
revoke all on function public.price_of_order_item(text, text, jsonb) from anon, authenticated;

create or replace function public.enforce_order_item_price()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  -- Un pedido cerrado conserva su precio. Re-guardarlo desde el panel no
  -- puede cambiar lo que ya se cobro.
  if public.order_is_closed(new.tenant_id, new.order_id) then
    return new;
  end if;

  new.unit_price := public.price_of_order_item(new.tenant_id, new.product_id, coalesce(new.options, '{}'::jsonb));
  return new;
end $$;

-- ------------------------------------------------------------
-- 2 · El personal del cafe podia pisar los importes.
--
-- 0023 recalcula al tocar las LINEAS. La policy "Cafe staff can update
-- orders" permite update sin restringir columnas, asi que un barista
-- autenticado podia mandar {"total": 0} directo a orders y quedarse asi.
-- El visitante anonimo no puede —no tiene el privilegio—, pero "el
-- cliente propone, el servidor dispone" tiene que valer tambien adentro.
-- ------------------------------------------------------------
-- El ahorro del combo, en UN solo lugar.
--
-- La primera version de freeze_order_amounts CONSERVABA old.combo_savings
-- en vez de recalcularlo, y como corre en el update que dispara
-- recalc_order_totals, pisaba el recalculo con el valor que habia mandado
-- el cliente. El arreglo rompia el arreglo. Dos triggers que deciden el
-- mismo importe tienen que compartir la funcion, no reimplementarla.
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
  where o.tenant_id = p_tenant and o.active
    and (o.starts_at is null or o.starts_at <= current_date)
    and (o.ends_at   is null or o.ends_at   >= current_date)
  order by o.created_at
  limit 1;

  if v_combo is null or (v_cafe + v_postre) <= v_combo then
    return 0;
  end if;
  return (v_cafe + v_postre) - v_combo;
end $$;

revoke all on function public.combo_savings_of_order(text, text) from public;

create or replace function public.freeze_order_amounts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_sub numeric(10,2); v_ahorro numeric(10,2);
begin
  -- Un pedido cerrado no se recalcula ni aqui.
  if old.status in ('delivered', 'cancelled') then
    new.subtotal      := old.subtotal;
    new.combo_savings := old.combo_savings;
    new.total         := old.total;
    return new;
  end if;

  select coalesce(sum(i.quantity * i.unit_price), 0) into v_sub
  from public.order_items i
  where i.tenant_id = new.tenant_id and i.order_id = new.id;

  -- Sin lineas todavia (el pedido se inserta antes que ellas), se
  -- conserva lo que haya: el trigger de order_items lo pondra al dia.
  if not exists (select 1 from public.order_items i
                  where i.tenant_id = new.tenant_id and i.order_id = new.id) then
    return new;
  end if;

  -- Se RECALCULA, no se conserva: conservarlo dejaba pasar el ahorro que
  -- mando el cliente.
  v_ahorro := public.combo_savings_of_order(new.tenant_id, new.id);
  new.subtotal      := v_sub;
  new.combo_savings := v_ahorro;
  new.total         := v_sub - v_ahorro;
  return new;
end $$;

drop trigger if exists freeze_order_amounts on public.orders;
create trigger freeze_order_amounts
  before update on public.orders
  for each row execute function public.freeze_order_amounts();

-- ------------------------------------------------------------
-- 3 · encounters tambien es clinico.
--
-- 0022 dejo v_clinica en ('clinical_notes','note_addenda'). encounters
-- tiene trigger de auditoria desde 0012 y quedo fuera, asi que old_data y
-- new_data guardaban la fila entera. audit_log lo lee el DUEÑO, y 0012
-- dice explicitamente que la administracion no alcanza lo clinico: por la
-- bitacora obtenia el mapa paciente ↔ terapeuta ↔ fecha de cada consulta,
-- justo lo que la policy de encounters le niega. La misma decision de
-- 0022, aplicada a medias.
-- ------------------------------------------------------------
create or replace function public.record_audit_entry()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new jsonb; v_old jsonb; v_row jsonb;
  v_tenant text; v_patient uuid; v_campos text[]; v_clinica boolean;
begin
  v_new := case when new is null then null else to_jsonb(new) end;
  v_old := case when old is null then null else to_jsonb(old) end;
  v_row := coalesce(v_new, v_old);
  v_tenant := coalesce(v_row ->> 'tenant_id', public.current_tenant_id());

  begin
    v_patient := nullif(v_row ->> 'patient_id', '')::uuid;
  exception when others then
    v_patient := null;
  end;

  if v_new is not null and v_old is not null then
    select array_agg(clave order by clave) into v_campos
    from jsonb_object_keys(v_new) as clave
    where v_new -> clave is distinct from v_old -> clave and clave <> 'updated_at';
  elsif v_new is not null then
    select array_agg(clave order by clave) into v_campos
    from jsonb_object_keys(v_new) as clave
    where v_new -> clave <> 'null'::jsonb;
  end if;

  v_clinica := tg_table_name in ('clinical_notes', 'note_addenda', 'encounters');

  insert into public.audit_log (
    tenant_id, actor_user_id, actor_role, action, table_name, record_id,
    patient_id, changed_fields, old_data, new_data
  ) values (
    v_tenant, auth.uid(), coalesce(public.current_tenant_role(), 'anon'),
    tg_op, tg_table_name, v_row ->> 'id', v_patient, v_campos,
    case when v_clinica then null else v_old end,
    case when v_clinica then null else v_new end
  );
  return coalesce(new, old);
end $$;

-- ------------------------------------------------------------
-- 4 · El registro de lectura no cubria las lecturas que importan.
--
-- 0022 filtraba por author_id, y su comentario afirmaba que era "el mismo
-- criterio que la policy de lectura de 0013". Era falso: esa policy
-- autoriza por TERAPEUTA DEL ENCUENTRO, no por autor. Un medico puede
-- leer legitimamente una nota que no escribio —autoria reasignada, la
-- ficha de terapeuta remapeada a otro usuario, un addendum ajeno— y esa
-- lectura no dejaba rastro. Es exactamente el caso que la norma quiere
-- auditar: quien leyo el expediente que no escribio.
-- ------------------------------------------------------------
create or replace function public.log_clinical_note_access(note_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text; v_patient uuid;
begin
  v_tenant := public.current_tenant_id();
  if v_tenant is null then
    return;
  end if;

  -- Mismo criterio que la policy de 0013, ahora de verdad: el terapeuta
  -- del encuentro al que cuelga la nota.
  select n.patient_id into v_patient
  from public.clinical_notes n
  join public.encounters e
    on e.tenant_id = n.tenant_id and e.id = n.encounter_id
  where n.tenant_id = v_tenant
    and n.id = note_id
    and n.deleted_at is null
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

comment on function public.log_clinical_note_access(uuid) is
  'Deja constancia de que alguien LEYO una nota clinica. Autoriza por terapeuta del encuentro, el mismo criterio que la policy de lectura de 0013. Silenciosa si la nota no es del tenant activo o no le corresponde.';


-- recalc_order_totals pasa a usar la misma funcion, para que no existan
-- dos implementaciones del mismo importe.
create or replace function public.recalc_order_totals()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_order text; v_tenant text; v_sub numeric(10,2); v_ahorro numeric(10,2);
begin
  v_order  := coalesce(new.order_id, old.order_id);
  v_tenant := coalesce(new.tenant_id, old.tenant_id);

  if public.order_is_closed(v_tenant, v_order) then
    return coalesce(new, old);
  end if;

  select coalesce(sum(i.quantity * i.unit_price), 0) into v_sub
  from public.order_items i
  where i.tenant_id = v_tenant and i.order_id = v_order;

  v_ahorro := public.combo_savings_of_order(v_tenant, v_order);

  update public.orders
     set subtotal = v_sub, combo_savings = v_ahorro,
         total = v_sub - v_ahorro, updated_at = now()
   where tenant_id = v_tenant and id = v_order;

  return coalesce(new, old);
end $$;
