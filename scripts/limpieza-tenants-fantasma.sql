-- ===========================================================================
-- LIMPIEZA de los tenants fantasma  ·  ESTE SI ESCRIBE
-- ===========================================================================
--
-- ANTES DE CORRERLO: haz un SNAPSHOT de la base. Supabase -> Database ->
-- Backups. No es una formalidad: esto borra filas y no hay deshacer.
--
-- Que borra: los cuatro tenants que dejaron dos archivos de prueba
-- ejecutados contra produccion el 2026-09-18 entre 05:47 y 05:48, y solo
-- esos. Medido con scripts/diagnostico-tenants-fantasma.sql:
--
--     t_li_a   32 filas     t_pf1    9 filas
--     t_li_b   31 filas     t_pf2    8 filas      total 80
--
-- Ninguno tiene citas, pacientes, notas clinicas, pedidos ni cobros. Lo
-- que tienen es configuracion (terapeutas de prueba, horarios sembrados,
-- product_options que les metio la 0021) y su rastro en audit_log.
--
-- Que NO borra:
--   · Nada de 'brainpsi'. Hay un guard que aborta si alguien mete ese id
--     en la lista, y una comprobacion final que verifica que no se movio.
--   · Las CUENTAS de auth.users. Eso se hace desde Supabase ->
--     Authentication -> Users, borrando a mano estos cuatro:
--         dueno.uno@ex.mx   (rol owner)
--         staff.uno@ex.mx
--         ajeno.dos@ex.mx
--         staff.a@ex.mx
--     Se hace ahi y no aqui a proposito: borrar de auth.users con SQL
--     crudo puede dejar sesiones e identidades sueltas. El panel usa la
--     API de Auth, que limpia todo. Hazlo DESPUES de correr esto.
--
-- Va en UNA transaccion: si algo falla, no se borra nada.
-- ===========================================================================

begin;

do $limpieza$
declare
  -- La lista, en un solo sitio.
  fantasmas text[] := array['t_li_a','t_li_b','t_pf1','t_pf2'];
  -- Orden HIJAS -> PADRES. Importa: 20 de las 21 llaves hacia tenants son
  -- RESTRICT, asi que borrar el tenant sin vaciar antes REBOTA.
  orden text[] := array[
    'note_addenda', 'clinical_notes', 'encounters', 'consents',
    'appointment_notifications', 'order_items', 'orders',
    'payments', 'expenses', 'appointments',
    'therapist_services', 'therapist_schedules', 'patients',
    'product_options', 'products', 'offers',
    'therapy_services', 'therapists', 'specialties',
    'business_settings', 'audit_log', 'tenant_members'
  ];
  t text;
  n bigint;
  total bigint := 0;
  antes_brainpsi bigint;
  despues_brainpsi bigint;
begin
  -- Guard: que nadie meta la clinica real en la lista por un dedazo.
  if 'brainpsi' = any(fantasmas) then
    raise exception 'ABORTADO: brainpsi esta en la lista de tenants a borrar.';
  end if;

  -- Foto del tamaño de la clinica real, para compararla al final.
  select count(*) into antes_brainpsi from public.appointments where tenant_id = 'brainpsi';

  foreach t in array orden loop
    if to_regclass('public.' || t) is null then
      raise notice 'salto %: no existe en esta base', t;
      continue;
    end if;
    execute format('delete from public.%I where tenant_id = any($1)', t) using fantasmas;
    get diagnostics n = row_count;
    if n > 0 then
      raise notice 'borradas % filas de %', n, t;
      total := total + n;
    end if;
  end loop;

  delete from public.tenants where id = any(fantasmas);
  get diagnostics n = row_count;
  raise notice 'borrados % tenants', n;
  total := total + n;

  -- Comprobacion: la clinica real no se movio.
  select count(*) into despues_brainpsi from public.appointments where tenant_id = 'brainpsi';
  if antes_brainpsi <> despues_brainpsi then
    raise exception 'ABORTADO: brainpsi tenia % citas y ahora tiene %. Algo borro de mas.',
      antes_brainpsi, despues_brainpsi;
  end if;

  raise notice '---';
  raise notice 'TOTAL BORRADO: % filas. brainpsi intacto (% citas antes y despues).',
    total, antes_brainpsi;
end
$limpieza$;

-- Resultado: esto tiene que salir VACIO. Si devuelve filas, algo quedo.
select t.id as tenant_que_no_debia_seguir, t.name
  from public.tenants t
 where t.id in ('t_li_a','t_li_b','t_pf1','t_pf2');

-- Si lo de arriba salio vacio y los NOTICE cuadran, confirma con:
--     commit;
-- Si algo no cuadra:
--     rollback;
--
-- Se deja SIN cerrar a proposito: la transaccion la cierras tu despues de
-- mirar. Una limpieza que se confirma sola no te deja revisarla.
