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

-- La bitacora del expediente: que registre, y que NO filtre.

insert into public.tenants (id,name) values ('t_aud','Clinica Auditoria');
insert into auth.users (id,email) values
  ('aa110000-0000-0000-0000-000000000001','doc.aud@ex.mx'),
  ('aa110000-0000-0000-0000-000000000002','dueno.aud@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role,therapist_id) values
  ('t_aud','aa110000-0000-0000-0000-000000000001','doctor','psq-aud'),
  ('t_aud','aa110000-0000-0000-0000-000000000002','owner',null);

insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
  ('t_aud','sv-aud','Consulta',50,900);
insert into public.therapists (tenant_id,id,name,active,user_id) values
  ('t_aud','psq-aud','Dra Aud',true,'aa110000-0000-0000-0000-000000000001');
insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
  appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
  values ('t_aud','ap-aud','sv-aud','psq-aud','2026-12-01','10:00','Pac Aud','pac.aud@ex.mx','5511111111',50);

insert into public.encounters (tenant_id,id,patient_id,therapist_id,appointment_id,status)
  select 't_aud','ee110000-0000-0000-0000-000000000001'::uuid, a.patient_id,'psq-aud','ap-aud','completed'
  from public.appointments a where a.tenant_id='t_aud' and a.id='ap-aud';

insert into public.clinical_notes (tenant_id,id,encounter_id,patient_id,author_id,content)
  select 't_aud','cc110000-0000-0000-0000-000000000001'::uuid,
         'ee110000-0000-0000-0000-000000000001'::uuid, e.patient_id,
         'aa110000-0000-0000-0000-000000000001',
         '{"motivo":"SECRETO CLINICO DEL PACIENTE"}'::jsonb
  from public.encounters e where e.tenant_id='t_aud' and e.id='ee110000-0000-0000-0000-000000000001';

-- 1 · El cambio queda registrado CON los campos que cambiaron.
do $$
declare v_campos text[]; v_pac uuid; v_n integer;
begin
  update public.clinical_notes
     set content = '{"motivo":"OTRO SECRETO"}'::jsonb
   where tenant_id='t_aud' and id='cc110000-0000-0000-0000-000000000001';

  select changed_fields, patient_id into v_campos, v_pac
  from public.audit_log
  where table_name='clinical_notes' and action='UPDATE' and tenant_id='t_aud'
  order by occurred_at desc limit 1;

  if v_campos is null then
    raise exception 'FALLA: la bitacora no dice QUE campo cambio';
  end if;
  if not ('content' = any(v_campos)) then
    raise exception 'FALLA: changed_fields no menciona content (trajo %)', v_campos;
  end if;
  if v_pac is null then
    raise exception 'FALLA: la entrada no dice de que paciente es el expediente';
  end if;
  raise notice 'ok · la bitacora registra que campo cambio y de que paciente';
end $$;

-- 2 · Pero NO guarda el contenido de la nota.
--
-- audit_log lo lee is_super_admin(), que aqui es el DUEÑO de la clinica, y
-- el diseño le niega deliberadamente el acceso a las notas. Copiar el
-- cuerpo a new_data se lo entregaria por la puerta de atras.
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.audit_log
   where tenant_id='t_aud' and table_name='clinical_notes'
     and (old_data is not null or new_data is not null);
  if v_n <> 0 then
    raise exception 'FUGA: % entradas de bitacora guardan el contenido de una nota clinica', v_n;
  end if;

  select count(*) into v_n from public.audit_log
   where tenant_id='t_aud' and (new_data::text like '%SECRETO%' or old_data::text like '%SECRETO%');
  if v_n <> 0 then
    raise exception 'FUGA: el texto de la nota aparece en la bitacora';
  end if;
  raise notice 'ok · la bitacora no copia el contenido del expediente';
end $$;

-- 3 · Una tabla NO clinica si conserva el antes y el despues.
--
-- Se usa therapists y no therapy_services: los triggers de auditoria estan
-- sobre patients, appointments, profiles, therapists y consents, mas las
-- tablas clinicas nuevas. therapy_services no lleva trigger, asi que la
-- prueba habria fallado por un motivo que no era el que mide.
do $$
declare v_new jsonb; v_old jsonb;
begin
  update public.therapists set name = 'Dra Aud Renombrada'
   where tenant_id='t_aud' and id='psq-aud';

  select old_data, new_data into v_old, v_new from public.audit_log
   where tenant_id='t_aud' and table_name='therapists' and action='UPDATE'
   order by occurred_at desc limit 1;

  if v_new is null or v_old is null then
    raise exception 'FALLA: una tabla no clinica debe conservar el antes y el despues';
  end if;
  if v_new ->> 'name' <> 'Dra Aud Renombrada' then
    raise exception 'FALLA: new_data no refleja el valor nuevo (%)', v_new ->> 'name';
  end if;
  if v_old ->> 'name' <> 'Dra Aud' then
    raise exception 'FALLA: old_data no conserva el valor anterior (%)', v_old ->> 'name';
  end if;
  raise notice 'ok · fuera de lo clinico la bitacora si guarda el antes y el despues';
end $$;

-- 4 · La LECTURA deja huella.
--
-- El conteo va FUERA del rol authenticated a proposito. audit_log tiene
-- policy 'for select using (tenant_id = current_tenant_id() and
-- is_super_admin())': un doctor NO puede leer la bitacora. Contando desde
-- su sesion daban 0 filas y parecia que la funcion no escribia; la
-- insercion si ocurria. Medido: como doctor 0, sin RLS 1.
grant usage on schema public to authenticated;
grant select on public.tenant_members to authenticated;

set role authenticated;
do $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"aa110000-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_aud":"doctor"},"therapist_ids":{"t_aud":"psq-aud"}}}', true);
  perform set_config('request.tenant','t_aud', true);

  perform public.log_clinical_note_access('cc110000-0000-0000-0000-000000000001'::uuid);

  -- Y una nota que no existe no debe dejar entrada: si no, la bitacora se
  -- vuelve un oraculo para averiguar que ids existen.
  perform public.log_clinical_note_access('cc110000-0000-0000-0000-0000000000ff'::uuid);
end $$;
reset role;

do $$
declare v_n integer; v_pac uuid;
begin
  select count(*) into v_n from public.audit_log
   where tenant_id='t_aud' and action='READ' and table_name='clinical_notes';
  if v_n <> 1 then
    raise exception 'FALLA: se esperaba UNA huella de lectura, hubo %', v_n;
  end if;

  select patient_id into v_pac from public.audit_log
   where tenant_id='t_aud' and action='READ' limit 1;
  if v_pac is null then
    raise exception 'FALLA: la huella de lectura no dice de que paciente era el expediente';
  end if;
  raise notice 'ok · la lectura del expediente queda registrada, y una nota inexistente no';
end $$;

-- 5 · El doctor no puede LEER la bitacora, aunque la genere.
set role authenticated;
do $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"aa110000-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_aud":"doctor"}}}', true);
  perform set_config('request.tenant','t_aud', true);
  select count(*) into v_n from public.audit_log where tenant_id='t_aud';
  if v_n <> 0 then
    raise exception 'FUGA: un doctor leyo % entradas de la bitacora', v_n;
  end if;
  raise notice 'ok · el doctor genera bitacora pero no la lee';
end $$;
reset role;

-- 6 · Quien no puede leer la nota tampoco genera huella de lectura.
set role authenticated;
do $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"aa110000-0000-0000-0000-000000000002","app_metadata":{"memberships":{"t_aud":"owner"}}}', true);
  perform set_config('request.tenant','t_aud', true);
  perform public.log_clinical_note_access('cc110000-0000-0000-0000-000000000001'::uuid);
end $$;
reset role;

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.audit_log
   where tenant_id='t_aud' and action='READ'
     and actor_user_id='aa110000-0000-0000-0000-000000000002';
  if v_n <> 0 then
    raise exception 'FALLA: el dueño, que no es autor, genero % entradas de lectura', v_n;
  end if;
  raise notice 'ok · quien no puede leer la nota tampoco genera huella de lectura';
end $$;
