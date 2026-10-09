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

-- 0036 · La reserva publica es una solicitud que la clinica confirma.
--
-- Usa la clinica t_a de 0004 (servicio 'sv', terapeuta 'tt', horario por
-- defecto), que ya admite reservas publicas: lo que se prueba aqui es el
-- ESTADO con que entran y como vencen, no la policy de alta.

create or replace function pg_temp.fecha() returns date language plpgsql as $$
declare v date := current_date + 9;
begin
  while extract(dow from v) in (0,1) loop v := v + 1; end loop;
  return v;
end $$;

create or replace function pg_temp.reserva_publica(p_id text, p_hora text, p_estado text) returns void
language plpgsql as $$
begin
  set local role anon;
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_a', true);
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status)
  values ('t_a', p_id,'sv','tt', pg_temp.fecha(), p_hora::time,'Visitante','visita@ex.mx','8111111111',50, p_estado);
  reset role;
end $$;

-- 1 · Sin sesion, la cita nace 'requested' aunque el cliente diga
--     'confirmed'. La impone la base.
do $$
declare v_estado text;
begin
  perform pg_temp.reserva_publica('req-1','13:00','confirmed');
  select status into v_estado from public.appointments where tenant_id='t_a' and id='req-1';
  if v_estado is distinct from 'requested' then
    raise exception 'FUGA: una reserva sin sesion quedo como "%": cualquiera llenaria la agenda de citas confirmadas', v_estado;
  end if;
  raise notice 'ok · la reserva publica nace por confirmar';
end $$;

-- 2 · La solicitud aparta el horario: otra reserva encima se rechaza.
do $$
begin
  begin
    perform pg_temp.reserva_publica('req-2','13:00','requested');
    raise exception 'FUGA: una segunda reserva tomo el horario de una solicitud vigente';
  -- La misma hora exacta la para el indice unico (23505); un rango
  -- encimado, el EXCLUDE (23P01). Las dos cuentan las solicitudes.
  exception when exclusion_violation or unique_violation then null;
  end;
  raise notice 'ok · una solicitud vigente aparta el horario';
end $$;

-- 3 · Vencida (mas de 24 h sin confirmar) deja de apartarlo: la siguiente
--     reserva la cancela y entra.
do $$
declare v_estado text;
begin
  update public.appointments set created_at = now() - interval '25 hours'
   where tenant_id='t_a' and id='req-1';
  perform pg_temp.reserva_publica('req-3','13:00','requested');
  select status into v_estado from public.appointments where tenant_id='t_a' and id='req-1';
  if v_estado <> 'cancelled' then
    raise exception 'FALLA: la solicitud vencida sigue como "%"', v_estado;
  end if;
  select status into v_estado from public.appointments where tenant_id='t_a' and id='req-3';
  if v_estado <> 'requested' then
    raise exception 'FALLA: la nueva reserva no entro en el horario liberado (estado %)', v_estado;
  end if;
  raise notice 'ok · una solicitud vencida libera el horario';
end $$;

-- 4 · Una cita del STAFF (con sesion, no anon) conserva su estado.
do $$
declare v_estado text;
begin
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,status)
  values ('t_a','staff-1','sv','tt', pg_temp.fecha(),'16:00','Paciente','pac@ex.mx','8122222222',50,'confirmed');
  select status into v_estado from public.appointments where tenant_id='t_a' and id='staff-1';
  if v_estado <> 'confirmed' then
    raise exception 'REGRESION: una cita del staff se degrado a "%"', v_estado;
  end if;
  raise notice 'ok · la cita que agenda el staff queda confirmada';
end $$;

-- 5 · Una confirmada NO vence aunque sea vieja.
do $$
declare v_estado text;
begin
  update public.appointments set created_at = now() - interval '30 days'
   where tenant_id='t_a' and id='staff-1';
  perform public.expire_stale_booking_requests('t_a');
  select status into v_estado from public.appointments where tenant_id='t_a' and id='staff-1';
  if v_estado <> 'confirmed' then
    raise exception 'FUGA: el vencimiento cancelo una cita CONFIRMADA (estado %)', v_estado;
  end if;
  raise notice 'ok · el vencimiento solo toca solicitudes';
end $$;
