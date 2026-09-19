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

-- El visitante lee el horario de atencion, y solo ese.
--
-- Sin esta policy la pantalla publica de reserva no podia leer
-- therapist_schedules (las dos policies de 0016 son `to authenticated`),
-- y por eso tenia su propio motor con 9:00-19:00 y martes-sabado
-- hardcodeados. Aqui se prueba que ahora si lee, Y que no lee de mas.

insert into public.tenants (id,name) values
  ('t_pub','Clinica Publica'),
  ('t_pub2','Clinica Vecina');

insert into public.therapists (tenant_id,id,name,active) values
  ('t_pub','th-act','Dra Activa',true),
  ('t_pub','th-baja','Dr De Baja',false),
  ('t_pub2','th-vec','Dra Vecina',true);

-- El trigger seed_default_schedule ya sembro martes-sabado 09:00-19:00
-- para los tres. Se agrega un bloque inactivo para probar el filtro.
insert into public.therapist_schedules (tenant_id,therapist_id,weekday,start_time,end_time,active)
  values ('t_pub','th-act',1,'08:00','13:00',false);

set role anon;
do $$
declare v_n integer; v_otros integer; v_baja integer; v_inact integer;
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('request.tenant','t_pub', true);

  select count(*) into v_n from public.therapist_schedules;
  if v_n = 0 then
    raise exception 'AGUJERO AL REVES: el visitante no lee ningun horario; la reserva publica quedaria en cero disponibilidad';
  end if;
  raise notice 'ok · el visitante lee el horario de atencion (% bloques)', v_n;

  -- Y NO el de la clinica vecina.
  select count(*) into v_otros from public.therapist_schedules where tenant_id <> 't_pub';
  if v_otros > 0 then
    raise exception 'FUGA: el visitante vio % bloques de otra clinica', v_otros;
  end if;
  raise notice 'ok · no ve el horario de otra clinica';

  -- Ni el de un terapeuta dado de baja: si no se le puede reservar,
  -- tampoco debe publicar sus dias.
  select count(*) into v_baja from public.therapist_schedules where therapist_id = 'th-baja';
  if v_baja > 0 then
    raise exception 'FUGA: el visitante vio el horario de un terapeuta inactivo';
  end if;
  raise notice 'ok · un terapeuta dado de baja no publica su horario';

  -- Ni los bloques marcados inactivos.
  select count(*) into v_inact from public.therapist_schedules where active = false;
  if v_inact > 0 then
    raise exception 'FUGA: el visitante vio % bloques inactivos', v_inact;
  end if;
  raise notice 'ok · los bloques inactivos no se publican';
end $$;

-- Leer no es escribir: la policy es solo `for select`.
do $$
declare v_falló boolean := false;
begin
  begin
    insert into public.therapist_schedules (tenant_id,therapist_id,weekday,start_time,end_time)
      values ('t_pub','th-act',0,'10:00','12:00');
  exception when others then v_falló := true;
  end;
  if not v_falló then
    raise exception 'AGUJERO: el visitante escribio un horario';
  end if;
  raise notice 'ok · el visitante lee pero no escribe el horario';
end $$;

reset role;
