-- ===========================================================================
-- Doctores ficticios: desactivar los cuatro, borrar los que se pueda
-- ESTE SI ESCRIBE  ·  ANTES: SNAPSHOT (Supabase -> Database -> Backups)
-- ===========================================================================
--
-- Contexto, confirmado por el dev: t1..t4 son doctores INVENTADOS con
-- cedulas profesionales falsas, y las citas que cuelgan de ellos son
-- pruebas suyas. Mientras sigan activos, la pagina publica ofrece terapia
-- con cuatro licencias que no existen — eso es lo urgente, y lo arregla el
-- paso 1 solo.
--
-- POR QUE t1 NO SE BORRA, y no es una limitacion tecnica:
--
--   La base RECHAZA borrar una nota clinica, firmada o no:
--     "Una nota clinica no se borra. NOM-004 exige conservar el
--      expediente 5 años desde el ultimo acto medico."
--   Es el trigger enforce_signed_note_immutable, de la 0013. t1 tiene un
--   encuentro con nota, el encuentro no se puede borrar sin borrar la
--   nota, y t1 no se puede borrar sin el encuentro.
--
--   Se podria desactivar el trigger, borrar y volver a activarlo. NO SE
--   HACE: es un control de cumplimiento en una base clinica viva, y
--   saltarselo por datos de prueba sienta el precedente de que se puede
--   saltar. t1 queda DESACTIVADO, que resuelve el problema real —deja de
--   publicarse— conservando el expediente.
--
-- Resultado: t2, t3 y t4 desaparecen; t1 queda archivado e invisible.
--
-- Una transaccion, SIN commit: la cierras tu tras mirar los NOTICE.
-- ===========================================================================

begin;

do $limpieza$
declare
  tenant     text   := 'brainpsi';
  ficticios  text[] := array['t1','t2','t3','t4'];
  borrables  text[] := array['t2','t3','t4'];   -- t1 no: ver arriba
  citas      text[];
  n bigint; total bigint := 0;
  pedidos_antes bigint; pedidos_despues bigint;
  notas_antes bigint; notas_despues bigint;
begin
  select count(*) into pedidos_antes from public.orders where tenant_id = tenant;
  select count(*) into notas_antes   from public.clinical_notes where tenant_id = tenant;

  -- 1 · LO URGENTE: dejan de publicarse. La vista therapists_public filtra
  --     por active = true, y TherapyPage y BookingFlow tambien.
  update public.therapists set active = false
   where tenant_id = tenant and id = any(ficticios) and active;
  get diagnostics n = row_count;
  raise notice 'desactivados (ya no salen en la pagina publica): %', n;

  -- 2 · Las citas de prueba de los que SI se pueden borrar.
  select coalesce(array_agg(id), array[]::text[]) into citas
    from public.appointments
   where tenant_id = tenant and therapist_id = any(borrables);
  raise notice 'citas de prueba de t2/t3/t4: %', coalesce(array_length(citas,1),0);

  -- Cobros de esas citas. La llave es RESTRICT: si quedara alguno, el
  -- borrado de la cita rebota.
  delete from public.payments where tenant_id = tenant and appointment_id = any(citas);
  get diagnostics n = row_count; total := total + n;
  raise notice 'cobros de esas citas: %', n;

  -- Pedidos que apunten a una cita de prueba: se DESLIGAN, no se borran.
  -- El cafe es del negocio real.
  update public.orders set appointment_id = null
   where tenant_id = tenant and appointment_id = any(citas);
  get diagnostics n = row_count;
  raise notice 'pedidos desligados: %', n;

  delete from public.appointments where tenant_id = tenant and id = any(citas);
  get diagnostics n = row_count; total := total + n;
  raise notice 'citas: %', n;

  -- 3 · Configuracion y terapeutas. Horarios y vinculos caen en cascada;
  --     explicitos para que el conteo diga la verdad.
  delete from public.therapist_schedules where tenant_id = tenant and therapist_id = any(borrables);
  get diagnostics n = row_count; total := total + n;
  raise notice 'horarios: %', n;

  delete from public.therapist_services where tenant_id = tenant and therapist_id = any(borrables);
  get diagnostics n = row_count; total := total + n;
  raise notice 'servicios habilitados: %', n;

  delete from public.therapists where tenant_id = tenant and id = any(borrables);
  get diagnostics n = row_count; total := total + n;
  raise notice 'terapeutas borrados (t2, t3, t4): %', n;

  -- 4 · Pacientes que ya no tienen NADA. Se mira lo que queda, no lo que
  --     se borro: si a uno le queda una cita o un encuentro, se queda.
  delete from public.patients pa
   where pa.tenant_id = tenant
     and not exists (select 1 from public.appointments a where a.tenant_id = tenant and a.patient_id = pa.id)
     and not exists (select 1 from public.encounters e where e.tenant_id = tenant and e.patient_id = pa.id);
  get diagnostics n = row_count; total := total + n;
  raise notice 'pacientes sin nada colgando: %', n;

  -- Controles: ni el cafe ni el expediente se movieron.
  select count(*) into pedidos_despues from public.orders where tenant_id = tenant;
  select count(*) into notas_despues   from public.clinical_notes where tenant_id = tenant;
  if pedidos_antes <> pedidos_despues then
    raise exception 'ABORTADO: habia % pedidos y ahora hay %.', pedidos_antes, pedidos_despues;
  end if;
  if notas_antes <> notas_despues then
    raise exception 'ABORTADO: habia % notas clinicas y ahora hay %. El expediente no se toca.',
      notas_antes, notas_despues;
  end if;

  -- POSTCONDICION. Esto era, hasta ahora, el ojo del operador mirando una
  -- tabla al final del archivo. Es exactamente lo que una maquina puede
  -- comprobar, asi que lo comprueba la maquina: si algo no cuadra, la
  -- excepcion tira la transaccion entera y no se guarda nada.
  if exists (select 1 from public.therapists
              where tenant_id = tenant and id = any(ficticios) and active) then
    raise exception 'ABORTADO: siguen publicandose ficticios con cedula falsa.';
  end if;

  if exists (select 1 from public.therapists
              where tenant_id = tenant and id = any(borrables)) then
    raise exception 'ABORTADO: t2, t3 o t4 no se borraron.';
  end if;

  -- t1 se conserva DESACTIVADO, no se borra: tiene un encuentro con nota
  -- clinica y NOM-004 exige guardar el expediente 5 años desde el ultimo
  -- acto medico. Que desaparezca seria tan defectuoso como que siga
  -- publicandose, y por eso tambien aborta.
  if not exists (select 1 from public.therapists
                  where tenant_id = tenant and id = 't1') then
    raise exception 'ABORTADO: t1 desaparecio. NOM-004 exige conservar su expediente.';
  end if;

  raise notice '---';
  raise notice 'TOTAL BORRADO: % filas. Pedidos: %. Notas clinicas: % (intactas).',
    total, pedidos_despues, notas_despues;
  raise notice 't1 queda DESACTIVADO con su expediente: no se publica, y NOM-004 se respeta.';
end
$limpieza$;

-- Se cierra sola.
--
-- Antes se dejaba abierta a proposito, para que el operador revisara los
-- NOTICE y escribiera commit. Fallo dos veces, el 2026-09-18 y el
-- 2026-09-19: una transaccion que nadie cierra no aborta, se deshace en
-- SILENCIO. El operador ve los NOTICE correctos y la tabla correcta -el
-- resultado real de algo que nunca ocurrio- y no tiene forma de
-- distinguirlo de un exito.
--
-- El repaso previo no se pierde: vive en los scripts diagnostico-*.sql,
-- que son solo lectura y existen justo para eso. Lo que antes miraba el
-- ojo ahora son las aserciones de arriba, y un fallo revierte solo.
commit;

-- Corre DESPUES del commit a proposito: lo que muestre esta GUARDADO.
-- Dentro de la transaccion mostraba un estado que podia no sobrevivir.
-- t1 tiene que salir con active = f; t2/t3/t4 no deben salir.
select id, name, cedula, active from public.therapists
 where tenant_id = 'brainpsi' and id in ('t1','t2','t3','t4') order by id;
