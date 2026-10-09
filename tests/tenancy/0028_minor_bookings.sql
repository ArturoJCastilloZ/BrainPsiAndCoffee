-- ===========================================================================
-- GUARD: esto es una PRUEBA. No se corre contra una base real.
-- ===========================================================================
do $guard$
begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception using
      message = 'ABORTADO: archivo de PRUEBA ejecutado fuera del banco desechable.',
      detail  = 'No existe la marca public.__banco_desechable, que solo crea tests/tenancy/run.sh en el contenedor que levanta.',
      hint    = 'Corre ./tests/tenancy/run.sh. Si estas viendo esto en el editor de Supabase: PARA, estas en una base real.';
  end if;
end
$guard$;

-- 0038 · Citas para una niña o un niño, y horarios ocupados publicos.
--
-- Usa la clinica t_a de 0004 (servicio 'sv', terapeuta 'tt'). Fecha y
-- horas distintas de las de 0027 para no chocar con sus solicitudes.

create or replace function pg_temp.dia_menor() returns date language plpgsql as $$
declare v date := current_date + 16;
begin
  while extract(dow from v) in (0,1) loop v := v + 1; end loop;
  return v;
end $$;

create or replace function pg_temp.reserva_menor(p_id text, p_hora text, p_nombre text) returns void
language plpgsql as $$
begin
  set local role anon;
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_a', true);
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,
    for_minor,patient_name)
  values ('t_a', p_id,'sv','tt', pg_temp.dia_menor(), p_hora::time,'Mamá Responsable',
    'mama@ex.mx','8133333333',50,'requested', true, p_nombre);
  reset role;
end $$;

-- 1 · La reserva para un menor crea SU ficha: a su nombre, marcada como
--     menor, con el adulto responsable. La cita conserva quien reservo.
do $$
declare p record; c record;
begin
  perform pg_temp.reserva_menor('men-1','10:00','Leo Responsable');
  select * into c from public.appointments where tenant_id='t_a' and id='men-1';
  select * into p from public.patients where id = c.patient_id;
  if p.full_name <> 'Leo Responsable' or not p.is_minor or p.guardian_name <> 'Mamá Responsable' then
    raise exception 'FALLA: la ficha del menor quedo como "%" (menor=%, responsable=%)', p.full_name, p.is_minor, p.guardian_name;
  end if;
  if c.customer_name <> 'Mamá Responsable' then
    raise exception 'FALLA: la cita perdio a quien reservo';
  end if;
  raise notice 'ok · la cita de un menor crea su ficha, con su adulto responsable';
end $$;

-- 2 · La mamá reserva para ella con el MISMO correo: es otra paciente.
--     Antes de 0038 el indice unico por correo lo impedia, y sin "not
--     is_minor" su cita se habria ligado a la ficha de su hijo.
do $$
declare v_mama uuid; v_hijo uuid;
begin
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status)
  values ('t_a','men-adulto','sv','tt', pg_temp.dia_menor(),'14:00','Mamá Responsable','mama@ex.mx','8133333333',50,'confirmed');
  select patient_id into v_mama from public.appointments where tenant_id='t_a' and id='men-adulto';
  select patient_id into v_hijo from public.appointments where tenant_id='t_a' and id='men-1';
  if v_mama = v_hijo then
    raise exception 'FUGA: la cita de la mamá quedo en el expediente de su hijo';
  end if;
  if (select is_minor from public.patients where id = v_mama) then
    raise exception 'FALLA: la ficha de la adulta quedo marcada como menor';
  end if;
  raise notice 'ok · la adulta y su hijo son fichas distintas con el mismo correo';
end $$;

-- 3 · Un hermano (mismo correo, otro nombre) es otra ficha; el mismo niño
--     otra vez, la misma. Va como staff: el tope de 0037 (dos solicitudes
--     por correo) ya lo alcanzo la mamá, y no es lo que se prueba aqui.
do $$
declare v_leo uuid; v_ana uuid; v_leo2 uuid;
begin
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,for_minor,patient_name)
  values
    ('t_a','men-ana','sv','tt', pg_temp.dia_menor() + 7,'10:00','Mamá Responsable','MAMA@ex.mx','8133333333',50,'confirmed',true,'Ana Responsable'),
    ('t_a','men-leo2','sv','tt', pg_temp.dia_menor() + 7,'14:00','Mamá Responsable','mama@ex.mx','8133333333',50,'confirmed',true,' leo responsable ');
  select patient_id into v_leo from public.appointments where tenant_id='t_a' and id='men-1';
  select patient_id into v_ana from public.appointments where tenant_id='t_a' and id='men-ana';
  select patient_id into v_leo2 from public.appointments where tenant_id='t_a' and id='men-leo2';
  if v_ana = v_leo then
    raise exception 'FUGA: dos hermanos quedaron en el mismo expediente';
  end if;
  if v_leo2 <> v_leo then
    raise exception 'FALLA: el mismo niño (mayusculas y espacios aparte) abrio una ficha nueva';
  end if;
  raise notice 'ok · hermanos en fichas distintas; el mismo niño, la misma ficha';
end $$;

-- 4 · La cita es coherente: menor exige nombre; adulto no lleva uno.
do $$
begin
  begin
    perform pg_temp.reserva_menor('men-sin-nombre','12:00',null);
    raise exception 'FALLA: una cita para un menor entro sin su nombre';
  exception when check_violation then null;
  end;
  begin
    insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
      appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status,patient_name)
    values ('t_a','men-incoherente','sv','tt', pg_temp.dia_menor() + 7,'16:00','Otra','otra@ex.mx','8144444444',50,'confirmed','Alguien');
    raise exception 'FALLA: una cita de adulto entro con patient_name: ¿de quien es?';
  exception when check_violation then null;
  end;
  raise notice 'ok · menor exige nombre, adulto no lleva uno';
end $$;

-- 5 · busy_slots: el visitante ve los rangos ocupados de SU clinica, sin
--     datos de nadie, y sin lo cancelado ni lo vencido.
do $$
declare v_n integer; v_firma text;
begin
  v_firma := pg_get_function_result('public.busy_slots(date, integer)'::regprocedure);
  if v_firma ~* '(customer|email|phone|name|patient|notes)' then
    raise exception 'FUGA: busy_slots devuelve datos personales: %', v_firma;
  end if;

  update public.appointments set status = 'cancelled' where tenant_id='t_a' and id='men-ana';

  set local role anon;
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_a', true);
  select count(*) into v_n from public.busy_slots(current_date, 42)
   where appointment_date = pg_temp.dia_menor() and appointment_time in ('10:00','14:00');
  if v_n <> 2 then
    raise exception 'FALLA: busy_slots no ve los dos horarios ocupados del dia (vio %)', v_n;
  end if;
  select count(*) into v_n from public.busy_slots(current_date, 42)
   where appointment_date = pg_temp.dia_menor() + 7 and appointment_time = '10:00';
  if v_n <> 0 then
    raise exception 'FALLA: busy_slots marca ocupado un horario CANCELADO';
  end if;

  perform set_config('request.tenant','t_inexistente', true);
  select count(*) into v_n from public.busy_slots(current_date, 42);
  if v_n <> 0 then
    raise exception 'FUGA: busy_slots respondio % rangos para una clinica que no existe', v_n;
  end if;
  reset role;
  raise notice 'ok · busy_slots: solo rangos, solo de la clinica visitada, sin cancelados';
end $$;

-- 6 · Una solicitud vencida ya no aparece como ocupada.
do $$
declare v_n integer;
begin
  update public.appointments set created_at = now() - interval '25 hours' where tenant_id='t_a' and id='men-1';
  set local role anon;
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_a', true);
  select count(*) into v_n from public.busy_slots(current_date, 42)
   where appointment_date = pg_temp.dia_menor() and appointment_time = '10:00';
  reset role;
  if v_n <> 0 then
    raise exception 'FALLA: una solicitud vencida sigue apartando el horario en busy_slots';
  end if;
  raise notice 'ok · una solicitud vencida no aparece ocupada';
end $$;

-- 7 · La vista publica trae las reglas de agenda (aviso minimo, descansos,
--     ventana) y sigue sin datos personales. Sin ellas el visitante veia
--     horarios que la base rechazaba al enviar.
do $$
declare v_faltantes text;
begin
  select string_agg(c, ', ') into v_faltantes
  from unnest(array['buffer_before_minutes','buffer_after_minutes','slot_interval_minutes',
                    'minimum_notice_minutes','booking_window_days']) c
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='therapists_public' and column_name=c
  );
  if v_faltantes is not null then
    raise exception 'FALLA: la vista publica no trae las reglas de agenda: %', v_faltantes;
  end if;
  raise notice 'ok · la vista publica trae las reglas de agenda';
end $$;
