-- Contabilidad: cada administrador ve la suya, el dueño ve ambas.
--
-- Esto vive en RLS y no solo en la pantalla. Si viviera en el front,
-- bastaria una peticion directa con la anon key —que viaja en el bundle—
-- para leer los numeros de la otra area.

insert into public.tenants (id,name) values ('t_con','Clinica Contable');
insert into auth.users (id,email) values
  ('c0000000-0000-0000-0000-000000000001','dueno.con@ex.mx'),
  ('c0000000-0000-0000-0000-000000000002','admin.cafe@ex.mx'),
  ('c0000000-0000-0000-0000-000000000003','admin.clinica@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_con','c0000000-0000-0000-0000-000000000001','owner'),
  ('t_con','c0000000-0000-0000-0000-000000000002','admin_cafe'),
  ('t_con','c0000000-0000-0000-0000-000000000003','admin_consultorio');

insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
  ('t_con','sv-con','Terapia',50,900);
insert into public.therapists (tenant_id,id,name,active) values ('t_con','th-con','Dra Con',true);
insert into public.products (tenant_id,id,category,name,price,active) values
  ('t_con','h1','hot','Espresso',30,true);

-- 1 · La cita congela su precio al nacer.
do $$
declare v_precio numeric;
begin
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
    values ('t_con','ap-con','sv-con','th-con','2026-12-01','10:00','Pac','p@ex.mx','5511111111',50);

  select price into v_precio from public.appointments where id='ap-con';
  if v_precio is distinct from 900 then
    raise exception 'FALLA: la cita nacio con precio % y el servicio cuesta 900', coalesce(v_precio::text,'NULL');
  end if;

  -- Subir el catalogo NO reescribe el historial.
  update public.therapy_services set price = 1200 where tenant_id='t_con' and id='sv-con';
  select price into v_precio from public.appointments where id='ap-con';
  if v_precio is distinct from 900 then
    raise exception 'HISTORIAL: la cita se reprecio a % al subir el catalogo', coalesce(v_precio::text,'NULL');
  end if;
  raise notice 'ok · la cita congela su precio y el catalogo no reescribe el historial';
end $$;

-- Un cobro de cada area, y gastos de las tres clases.
insert into public.orders (tenant_id,id,customer_name,customer_phone,status,order_source)
  values ('t_con','or-con','Cliente','5522222222','received','public_menu');
insert into public.order_items (tenant_id,order_id,product_id,name,quantity,unit_price,options)
  values ('t_con','or-con','h1','Espresso',1,0,'{}'::jsonb);

insert into public.payments (tenant_id,id,appointment_id,amount,method) values
  ('t_con','11111111-0000-0000-0000-000000000001','ap-con',900,'transferencia');
insert into public.payments (tenant_id,id,order_id,amount,method) values
  ('t_con','11111111-0000-0000-0000-000000000002','or-con',30,'efectivo');
insert into public.expenses (tenant_id,id,area,category,amount) values
  ('t_con','22222222-0000-0000-0000-000000000001','consultorio','Cedulas',500),
  ('t_con','22222222-0000-0000-0000-000000000002','cafeteria','Cafe en grano',800),
  ('t_con','22222222-0000-0000-0000-000000000003','compartido','Renta',9000);

grant usage on schema public to authenticated;
grant select on public.tenant_members to authenticated;
grant select, insert, update, delete on public.payments, public.expenses to authenticated;

-- 2 · El admin de CAFETERIA ve lo suyo y nada del consultorio.
set role authenticated;
do $$
declare v_n integer; v_suma numeric;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-0000-0000-000000000002","app_metadata":{"memberships":{"t_con":"admin_cafe"}}}', true);
  perform set_config('request.tenant','t_con', true);

  select count(*), coalesce(sum(amount),0) into v_n, v_suma from public.payments;
  if v_n <> 1 or v_suma <> 30 then
    raise exception 'FUGA: el admin de cafeteria vio % cobros por % (debia ver 1 por 30)', v_n, v_suma;
  end if;

  select count(*) into v_n from public.expenses;
  if v_n <> 1 then
    raise exception 'FUGA: el admin de cafeteria vio % gastos (solo el suyo, ni el compartido)', v_n;
  end if;

  -- Y no puede registrar un cobro de consultorio.
  begin
    insert into public.payments (tenant_id,id,appointment_id,amount,method)
      values ('t_con','11111111-0000-0000-0000-00000000000f','ap-con',100,'efectivo');
    raise exception 'FUGA: el admin de cafeteria registro un cobro de consultorio';
  exception when insufficient_privilege then null;
  end;

  raise notice 'ok · el admin de cafeteria solo ve y registra lo de cafeteria';
end $$;
reset role;

-- 3 · El admin de CONSULTORIO, al reves.
set role authenticated;
do $$
declare v_n integer; v_suma numeric;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-0000-0000-000000000003","app_metadata":{"memberships":{"t_con":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_con', true);

  select count(*), coalesce(sum(amount),0) into v_n, v_suma from public.payments;
  if v_n <> 1 or v_suma <> 900 then
    raise exception 'FUGA: el admin de consultorio vio % cobros por %', v_n, v_suma;
  end if;

  select count(*) into v_n from public.expenses;
  if v_n <> 1 then
    raise exception 'FUGA: el admin de consultorio vio % gastos', v_n;
  end if;
  raise notice 'ok · el admin de consultorio solo ve y registra lo de consultorio';
end $$;
reset role;

-- 4 · El DUEÑO ve las dos areas, y el gasto compartido que nadie mas ve.
set role authenticated;
do $$
declare v_n integer; v_suma numeric;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"c0000000-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_con":"owner"}}}', true);
  perform set_config('request.tenant','t_con', true);

  select count(*), coalesce(sum(amount),0) into v_n, v_suma from public.payments;
  if v_n <> 2 or v_suma <> 930 then
    raise exception 'FALLA: el dueño vio % cobros por % (debia ver 2 por 930)', v_n, v_suma;
  end if;

  select count(*), coalesce(sum(amount),0) into v_n, v_suma from public.expenses;
  if v_n <> 3 or v_suma <> 10300 then
    raise exception 'FALLA: el dueño vio % gastos por % (debia ver 3 por 10300)', v_n, v_suma;
  end if;
  raise notice 'ok · el dueño ve las dos areas y el gasto compartido';
end $$;
reset role;

-- 5 · Un cobro sin destino, o con los dos, no existe.
do $$
declare v_falló boolean := false;
begin
  begin
    insert into public.payments (tenant_id,id,amount,method)
      values ('t_con','11111111-0000-0000-0000-0000000000aa',100,'efectivo');
  exception when check_violation then v_falló := true;
  end;
  if not v_falló then raise exception 'FALLA: se registro un cobro sin destino'; end if;

  v_falló := false;
  begin
    insert into public.payments (tenant_id,id,appointment_id,order_id,amount,method)
      values ('t_con','11111111-0000-0000-0000-0000000000bb','ap-con','or-con',100,'efectivo');
  exception when check_violation then v_falló := true;
  end;
  if not v_falló then raise exception 'FALLA: se registro un cobro aplicado a cita Y pedido'; end if;

  raise notice 'ok · un cobro se aplica a exactamente una cosa';
end $$;

-- 6 · Los cobros no cruzan clinicas.
insert into public.tenants (id,name) values ('t_con2','Otra Clinica');
do $$
declare v_falló boolean := false;
begin
  begin
    insert into public.payments (tenant_id,id,appointment_id,amount,method)
      values ('t_con2','11111111-0000-0000-0000-0000000000cc','ap-con',900,'efectivo');
  exception when foreign_key_violation then v_falló := true;
  end;
  if not v_falló then
    raise exception 'FUGA: se registro un cobro de una clinica contra la cita de otra';
  end if;
  raise notice 'ok · un cobro no puede apuntar a la cita de otra clinica';
end $$;
