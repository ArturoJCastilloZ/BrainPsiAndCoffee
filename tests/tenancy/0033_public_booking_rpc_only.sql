do $$ begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception 'ABORTADO: la prueba requiere el banco desechable.';
  end if;
end $$;

do $$
declare t text; r text; v_owner text;
begin
  foreach t in array array['appointments','consents'] loop
    if has_table_privilege('anon','public.'||t,'INSERT')
       or has_any_column_privilege('anon','public.'||t,'INSERT') then
      raise exception 'FUGA: anon conserva INSERT sobre %',t;
    end if;
  end loop;
  foreach r in array array['anon','authenticated'] loop
    if pg_has_role(r,'bpc_booking_writer','MEMBER') then raise exception 'FUGA: % puede adoptar el escritor interno',r; end if;
  end loop;
  if exists (select 1 from pg_roles where rolname='bpc_booking_writer'
    and (rolcanlogin or rolbypassrls or rolsuper or rolcreaterole or rolcreatedb)) then
    raise exception 'FUGA: rol interno privilegiado';
  end if;
  if has_schema_privilege('bpc_booking_writer','public','CREATE') then raise exception 'FUGA: rol interno puede crear objetos'; end if;
  select pg_get_userbyid(proowner) into v_owner from pg_proc
    where oid='public.create_public_booking(jsonb,boolean,text,text,text)'::regprocedure and prosecdef;
  if v_owner is distinct from 'bpc_booking_writer' then raise exception 'RPC no usa el rol acotado'; end if;
  if has_function_privilege('authenticated','public.create_public_booking(jsonb,boolean,text,text,text)','EXECUTE') then
    raise exception 'FUGA: authenticated ejecuta RPC pública';
  end if;
end $$;

-- Ni INSERT normal ni por columnas pueden saltarse la RPC.
do $$ begin
  set local role anon;
  begin
    insert into public.appointments default values;
    raise exception 'FUGA: INSERT directo de cita permitido';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.consents(subject_email) values ('forged@example.invalid');
    raise exception 'FUGA: INSERT directo de consentimiento permitido';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;

-- Las pruebas 0031 ya validan rollback, versión/hash, aislamiento de servicio,
-- campos ignorados y evidencia. Este caso recorre la RPC con el rol final.
insert into public.tenants(id,name) values ('t_rpc_only','RPC only');
insert into public.therapy_services(tenant_id,id,name,duration_minutes,price) values ('t_rpc_only','sv','Consulta',50,700);
insert into public.therapists(tenant_id,id,name,minimum_notice_minutes) values ('t_rpc_only','tt','Especialista',0);
delete from public.therapist_schedules where tenant_id='t_rpc_only';
insert into public.therapist_schedules(tenant_id,therapist_id,weekday,start_time,end_time,active)
select 't_rpc_only','tt',d,'09:00','19:00',true from generate_series(0,6) d;
do $$ declare n integer; begin
  perform set_config('request.tenant','t_rpc_only',true);
  perform set_config('request.jwt.claims','',true);
  set local role anon;
  perform public.create_public_booking(jsonb_build_array(jsonb_build_object(
    'id','rpc-only','service_id','sv','therapist_id','tt',
    'appointment_date',current_date+10,'appointment_time','11:00',
    'customer_name','Paciente','customer_email','rpc-only@example.invalid',
    'customer_phone','8188000000','duration_minutes',50)),true,
    '2026-10-borrador-2','3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188',null);
  select count(*) into n from public.appointments where tenant_id='t_rpc_only';
  if n <> 0 then raise exception 'FUGA: anon leyó citas privadas'; end if;
  reset role;
  if (select count(*) from public.appointments where tenant_id='t_rpc_only' and status='requested' and created_at=now()) <> 1
     or (select count(*) from public.consents where tenant_id='t_rpc_only' and appointment_id='rpc-only') <> 1 then
    raise exception 'FALLO: RPC no guardó cita y consentimiento';
  end if;
  raise notice 'ok · anon sin INSERT; RPC con RLS conserva reserva y consentimiento atómicos';
end $$;
