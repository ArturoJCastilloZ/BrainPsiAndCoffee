do $$
begin
  if to_regclass('public.__banco_desechable') is null then raise exception 'Disposable database required'; end if;
end $$;

do $$
declare v_enabled boolean;
begin
  perform set_config('request.tenant','t_cmp',true);
  perform set_config('request.jwt.claims','{"sub":"c9000000-0000-0000-0000-0000000000f1","aal":"aal1","app_metadata":{"memberships":{"t_cmp":"owner"}}}',true);
  set local role authenticated;
  perform public.set_clinical_mfa(false);
  select public.clinical_mfa_required() into v_enabled;
  reset role;
  if v_enabled then raise exception 'Hypothesis not reproduced'; end if;
  raise notice 'AUDIT CONFIRMED: owner at aal1 can disable clinical MFA';
end $$;

do $$
declare v_stamp timestamptz; v_status text; i integer;
begin
  perform set_config('request.tenant','t_cmp',true);
  perform set_config('request.jwt.claims','',true);
  set local role anon;
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,created_at)
  values ('t_cmp','audit-future','sv-cmp','th-cmp',current_date+30,'13:00','Audit Fixture','future@audit.invalid','8199990001',50,'requested','2100-01-01');
  perform public.expire_stale_booking_requests('t_cmp');
  reset role;
  select created_at,status into v_stamp,v_status from public.appointments where tenant_id='t_cmp' and id='audit-future';
  if v_stamp <> '2100-01-01'::timestamptz or v_status <> 'requested' then raise exception 'Future timestamp hypothesis not reproduced'; end if;
  raise notice 'AUDIT CONFIRMED: anonymous client controls created_at and can postpone 24h expiration';
  set local role anon;
  for i in 1..3 loop
    insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,created_at)
    values ('t_cmp','audit-past-'||i,'sv-cmp','th-cmp',current_date+20+i,'14:00','Audit Fixture','same@audit.invalid','8199990002',50,'requested','2000-01-01');
  end loop;
  reset role;
  if (select count(*) from public.appointments where tenant_id='t_cmp' and id like 'audit-past-%') <> 3 then raise exception 'Past timestamp hypothesis not reproduced'; end if;
  raise notice 'AUDIT CONFIRMED: backdated requests bypass two-request email/phone limits';
end $$;
