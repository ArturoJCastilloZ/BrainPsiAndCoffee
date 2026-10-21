do $$ begin
  if to_regclass('public.__banco_desechable') is null then raise exception 'ABORTADO: banco desechable obligatorio'; end if;
end $$;
begin;
insert into public.tenants(id,name) values ('t_module','Module'),('t_module_other','Other');
insert into public.business_settings(tenant_id,id,content) values ('t_module','main','{"name":"Clinic","cafeEnabled":true}');
insert into public.products(tenant_id,id,category,name,price) values ('t_module','coffee','hot','Coffee',30),('t_module_other','coffee','hot','Coffee',30);
insert into public.orders(tenant_id,id,customer_name,customer_phone,order_source,status,subtotal,total)
 values ('t_module','history','Cliente','8188888888','public_menu','received',30,30);
insert into public.order_items(tenant_id,order_id,product_id,name,quantity,unit_price)
 values ('t_module','history','coffee','Coffee',1,30);
update public.business_settings set content='{"name":"Clinic","cafeEnabled":false}' where tenant_id='t_module';
insert into auth.users(id,email) values ('47000000-0000-0000-0000-000000000001','clinic-admin-module@example.invalid');
insert into public.tenant_members(tenant_id,user_id,role) values ('t_module','47000000-0000-0000-0000-000000000001','admin_consultorio');
grant update on public.business_settings to authenticated;
do $$ begin
  perform set_config('request.tenant','t_module',true);
  perform set_config('request.jwt.claims','{"sub":"47000000-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_module":"admin_consultorio"}}}',true);
  set local role authenticated;
  update public.business_settings set content=content||'{"cafeEnabled":true}' where tenant_id='t_module';
  reset role;
  if not exists(select 1 from public.business_settings where tenant_id='t_module' and content @> '{"cafeEnabled":false}') then
    raise exception 'Non-owner changed the module configuration';
  end if;
end $$;

do $$ begin
  -- A legacy settings editor must not silently re-enable a disabled module.
  update public.business_settings set content='{"name":"Renamed"}' where tenant_id='t_module';
  if not exists(select 1 from public.business_settings where tenant_id='t_module' and content @> '{"cafeEnabled":false}') then raise exception 'Flag lost'; end if;
  begin
    update public.business_settings set content='{"cafeEnabled":"false"}' where tenant_id='t_module';
    raise exception 'String flag accepted';
  exception when check_violation then null; end;
  begin
    update public.business_settings set content='{"cafeEnabled":null}' where tenant_id='t_module';
    raise exception 'Null flag accepted';
  exception when check_violation then null; end;
  begin
    update public.business_settings set content='null' where tenant_id='t_module';
    raise exception 'Null document removed the module flag';
  exception when check_violation then null; end;

  perform set_config('request.tenant','t_module',true);
  perform set_config('request.jwt.claims','',true);
  set local role anon;
  begin
    insert into public.orders(tenant_id,id,customer_name,customer_phone,order_source,status,subtotal,total)
      values ('t_module','blocked','Cliente','8188888888','public_menu','received',30,30);
    raise exception 'Disabled cafe accepted a new public order';
  exception when check_violation then
    if sqlerrm not like 'La cafetería está desactivada%' then raise; end if;
  end;
  reset role;
  begin
    insert into public.order_items(tenant_id,order_id,product_id,name,quantity,unit_price)
      values ('t_module','history','coffee','Coffee',1,30);
    raise exception 'Historical order extended';
  exception when check_violation then null; end;
  begin
    delete from public.order_items where tenant_id='t_module' and order_id='history';
    raise exception 'Legacy delete-then-insert erased historical items';
  exception when check_violation then null; end;
  begin
    delete from public.orders where tenant_id='t_module' and id='history';
    raise exception 'Historical order deleted';
  exception when check_violation then null; end;
  if (select count(*) from public.orders where tenant_id='t_module') <> 1
     or (select count(*) from public.order_items where tenant_id='t_module') <> 1 then raise exception 'History changed'; end if;

  -- Another clinic, with no flag, retains the existing behavior.
  perform set_config('request.tenant','t_module_other',true);
  set local role anon;
  insert into public.orders(tenant_id,id,customer_name,customer_phone,order_source,status,subtotal,total)
    values ('t_module_other','allowed','Cliente','8188888888','public_menu','received',30,30);
  reset role;
end $$;

-- Clinic booking remains available, including consent; coffee is normalized.
insert into public.therapy_services(tenant_id,id,name,duration_minutes,price) values ('t_module','sv','Consulta',50,700);
insert into public.therapists(tenant_id,id,name,minimum_notice_minutes) values ('t_module','tt','Especialista',0);
delete from public.therapist_schedules where tenant_id='t_module';
insert into public.therapist_schedules(tenant_id,therapist_id,weekday,start_time,end_time,active)
select 't_module','tt',d,'09:00','19:00',true from generate_series(0,6)d;
do $$ begin
  perform set_config('request.tenant','t_module',true);
  perform set_config('request.jwt.claims','',true);
  set local role anon;
  perform public.create_public_booking(jsonb_build_array(jsonb_build_object(
    'id','clinic-still-open','service_id','sv','therapist_id','tt','appointment_date',current_date+10,
    'appointment_time','11:00','customer_name','Paciente','customer_email','module@example.invalid',
    'customer_phone','8188111122','duration_minutes',50,'wants_coffee',true)),true,
    '2026-10-borrador-2','3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188',null);
  reset role;
  if not exists(select 1 from public.appointments where tenant_id='t_module' and id='clinic-still-open' and wants_coffee=false)
     or not exists(select 1 from public.consents where tenant_id='t_module' and appointment_id='clinic-still-open') then
    raise exception 'Clinic booking or consent broken';
  end if;
  update public.business_settings set content=content||'{"cafeEnabled":true}' where tenant_id='t_module';
  insert into public.orders(tenant_id,id,customer_name,customer_phone,order_source,status,subtotal,total)
    values ('t_module','reactivated','Cliente','8188888888','public_menu','received',30,30);
  raise notice 'ok · cafe disabled per clinic, old clients blocked, history intact, clinic bookings and reactivation work';
end $$;
rollback;
