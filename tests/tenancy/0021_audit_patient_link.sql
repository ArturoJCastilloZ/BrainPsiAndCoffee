-- ===========================================================================
-- GUARD: esto es una PRUEBA. No se corre contra una base real.
-- ===========================================================================
-- Falla CERRADO: aborta salvo que pueda demostrar que esta en el Postgres
-- desechable. Enumerar señales de produccion fallaria ABIERTO en cuanto la
-- lista se quedara corta; exigir una marca que solo existe en el
-- desechable no tiene esa fuga.
--
-- La marca la crea tests/tenancy/run.sh en el contenedor que el mismo
-- acaba de levantar, asi que no puede existir en ningun otro lado.
do $guard$
begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception using
      message = 'ABORTADO: archivo de PRUEBA ejecutado fuera del banco desechable.',
      detail  = 'No existe la marca public.__banco_desechable, que solo crea tests/tenancy/run.sh en el contenedor que levanta.',
      hint    = 'Corre ./tests/tenancy/run.sh. Si estas viendo esto en el editor de Supabase: PARA, estas en una base real. El 2026-09-18 se ejecutaron 0013 y 0014 contra produccion y dejaron cuatro tenants y cuatro cuentas fantasma.';
  end if;
end
$guard$;

-- 0030 · La bitacora se interroga como la interroga un auditor.
--
-- Estas pruebas NO preguntan "¿se escribio la entrada?" — eso ya pasaba,
-- y por eso el hueco sobrevivio. Preguntan lo que se le pregunta a una
-- bitacora clinica:
--
--   select * from public.audit_log where patient_id = X;
--
-- Una entrada que existe pero no aparece en esa consulta es peor que no
-- existir: la bitacora parece completa.

insert into public.tenants (id,name) values ('t_vin','Clinica Vinculo');
insert into auth.users (id,email) values ('cc110000-0000-0000-0000-000000000001','doc.vin@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role,therapist_id) values
  ('t_vin','cc110000-0000-0000-0000-000000000001','doctor','psq-vin');
insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
  ('t_vin','sv-vin','Consulta',50,900);
insert into public.therapists (tenant_id,id,name,active,user_id) values
  ('t_vin','psq-vin','Dra Vinculo',true,'cc110000-0000-0000-0000-000000000001');
insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
  appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
  values ('t_vin','ap-vin','sv-vin','psq-vin','2026-12-03','12:00','Pac Vinculo','pac.vin@ex.mx','5533333333',50);
insert into public.encounters (tenant_id,id,patient_id,therapist_id,appointment_id,status)
  select 't_vin','ff110000-0000-0000-0000-000000000001'::uuid, a.patient_id,'psq-vin','ap-vin','completed'
  from public.appointments a where a.tenant_id='t_vin' and a.id='ap-vin';
insert into public.clinical_notes (tenant_id,id,encounter_id,patient_id,author_id,content)
  select 't_vin','dd110000-0000-0000-0000-000000000001'::uuid,
         'ff110000-0000-0000-0000-000000000001'::uuid, e.patient_id,
         'cc110000-0000-0000-0000-000000000001',
         '{"motivo":"cuerpo de la nota"}'::jsonb
  from public.encounters e where e.tenant_id='t_vin' and e.id='ff110000-0000-0000-0000-000000000001';

-- 1 · Un cambio en el PADRON aparece en la consulta del auditor.
--
-- La regresion: 0022 reescribio record_audit_entry entera y perdio el
-- caso especial del esquema base. La fila de patients ES el paciente —su
-- identidad esta en id, no en un patient_id que esa tabla no tiene—, asi
-- que cada cambio al padron quedaba registrado con patient_id en null.
do $$
declare v_pac uuid; v_n integer; v_campos text[];
begin
  select patient_id into v_pac from public.appointments
   where tenant_id='t_vin' and id='ap-vin';

  update public.patients set phone='5544444444'
   where tenant_id='t_vin' and id=v_pac;

  select count(*) into v_n from public.audit_log
   where tenant_id='t_vin' and table_name='patients'
     and action='UPDATE' and patient_id=v_pac;

  if v_n = 0 then
    raise exception 'FALLA: se cambio el padron del paciente y la consulta del auditor (where patient_id=X) no lo encuentra';
  end if;

  select changed_fields into v_campos from public.audit_log
   where tenant_id='t_vin' and table_name='patients'
     and action='UPDATE' and patient_id=v_pac
   order by occurred_at desc limit 1;

  if not ('phone' = any(coalesce(v_campos,'{}'))) then
    raise exception 'FALLA: la entrada no dice que campo del padron cambio (trajo %)', v_campos;
  end if;

  raise notice 'ok · un cambio en el padron aparece bajo el paciente al que pertenece';
end $$;

-- 2 · El ALTA del paciente tambien queda ligada.
--
-- El insert lo dispara la propia cita; si solo se cubriera el update, la
-- primera fila del expediente seguiria huerfana.
do $$
declare v_pac uuid; v_n integer;
begin
  select patient_id into v_pac from public.appointments
   where tenant_id='t_vin' and id='ap-vin';

  select count(*) into v_n from public.audit_log
   where tenant_id='t_vin' and table_name='patients'
     and action='INSERT' and patient_id=v_pac;

  if v_n = 0 then
    raise exception 'FALLA: el alta del paciente no aparece bajo su propio expediente';
  end if;
  raise notice 'ok · el alta del paciente queda ligada a el mismo';
end $$;

-- 3 · Una ADENDA al expediente dice de quien es.
--
-- note_addenda no trae patient_id: cuelga de note_id. Esto nunca estuvo
-- cubierto —no es regresion, es un hueco de origen— y una adenda es parte
-- del expediente: 0013 la hizo append-only justo por eso.
do $$
declare v_pac uuid; v_n integer;
begin
  select patient_id into v_pac from public.clinical_notes
   where tenant_id='t_vin' and id='dd110000-0000-0000-0000-000000000001';

  insert into public.note_addenda (tenant_id,id,note_id,author_id,content)
  values ('t_vin','ee220000-0000-0000-0000-000000000001'::uuid,
          'dd110000-0000-0000-0000-000000000001'::uuid,
          'cc110000-0000-0000-0000-000000000001',
          '{"texto":"precision sobre la sesion"}'::jsonb);

  select count(*) into v_n from public.audit_log
   where tenant_id='t_vin' and table_name='note_addenda' and patient_id=v_pac;

  if v_n = 0 then
    raise exception 'FALLA: se agrego una adenda al expediente y la consulta del auditor no dice de que paciente es';
  end if;
  raise notice 'ok · una adenda al expediente queda ligada a su paciente';
end $$;

-- 4 · Pero resolver el paciente NO abrio la puerta al contenido.
--
-- El riesgo del arreglo: para ligar la adenda hay que mirar la nota. Si
-- de paso se copiara el cuerpo a la bitacora, 0030 desharia la proteccion
-- de 0022 —audit_log la lee el dueño, y al dueño se le niega la nota—
-- sin que nadie lo notara.
do $$
declare v_old jsonb; v_new jsonb;
begin
  select old_data, new_data into v_old, v_new from public.audit_log
   where tenant_id='t_vin' and table_name='note_addenda'
   order by occurred_at desc limit 1;

  if v_new is not null or v_old is not null then
    raise exception 'FALLA: la bitacora copio el contenido de la adenda; el dueño leeria el expediente por la puerta de atras';
  end if;
  raise notice 'ok · la adenda se liga al paciente sin copiar su contenido';
end $$;
