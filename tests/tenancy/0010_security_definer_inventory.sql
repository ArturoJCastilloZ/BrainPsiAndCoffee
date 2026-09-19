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

-- Inventario de funciones security definer.
--
-- Estas funciones BYPASSEAN RLS: son la via natural de fuga entre
-- clinicas. La suite falla si aparece una nueva que nadie registro aqui,
-- para que la deuda no vuelva a crecer en silencio — el plan canonico
-- hablaba de 7 cuando ya eran 9.
--
-- Agregar una funcion a esta lista es declarar que se reviso: que acota
-- por tenant, que tiene search_path fijo, y que su execute esta revocado
-- salvo para quien de verdad la necesita.

do $$
declare
  v_esperadas text[] := array[
    -- Flujo publico de cafe: reciben el tenant como argumento, no del JWT.
    'appointment_can_receive_order',
    'order_can_receive_public_items',
    -- Triggers de dominio: acotan por el tenant de la fila.
    'prepare_order_operational_fields',
    'queue_appointment_notification',
    'sync_orders_from_appointment',
    'sync_patient_from_appointment',
    'record_audit_entry',
    -- Lectura de nota clinica: valida tenencia antes de registrar.
    'log_clinical_note_access',
    -- Pre-autenticacion: corre sin tenant por definicion. Sin execute
    -- para anon desde la Fase 1.
    'resolve_login_identifier',
    -- Resolucion de tenant y membresia.
    'current_request_tenant',
    'is_active_member',
    -- Pertenencia de un TERCERO a la clinica activa (0019). Definer para
    -- que la policy de profiles no dependa de las policies de
    -- tenant_members. Devuelve false cuando no hay tenant resuelto, asi
    -- que un header falsificado no abre nada.
    'user_belongs_to_current_tenant',
    -- Agenda: responden si/no sin publicar el horario de nadie.
    'fits_in_schedule',
    'within_booking_window',
    'apply_therapist_buffers',
    'seed_default_schedule',
    'set_agenda_prefs',
    -- Precio de un pedido. Definer para leer el catalogo sin depender de
    -- que el visitante anonimo tenga select sobre products/offers.
    -- Acotan por el tenant de la fila, no por el JWT.
    'price_of_order_item',
    'order_is_closed',
    'block_closed_order_item_delete',
    'freeze_appointment_price',
    'combo_savings_of_order',
    'freeze_order_amounts',
    'enforce_order_item_price',
    -- 0028: el importe del cobro lo topa el servidor, no el navegador.
    'enforce_payment_within_balance',
    'recalc_order_totals',
    -- Inmutabilidad clinica: no leen datos, solo rechazan escrituras.
    -- Son definer para que nadie pueda esquivarlas con otro rol.
    'enforce_signed_note_immutable',
    'enforce_addendum_append_only',
    -- Administracion de accesos: verifican owner en vivo.
    'assert_tenant_owner',
    'list_tenant_members',
    'set_tenant_member_role',
    'revoke_tenant_member',
    -- Consentimiento de membresia (0032). Estas tres NO acotan por
    -- tenant, y es deliberado: quien tiene una invitacion pendiente
    -- puede no tener ninguna clinica activa -puede no tener ninguna
    -- clinica-, asi que no hay tenant del que colgarse y
    -- current_tenant_id() devolveria null. Acotan por auth.uid(), que
    -- para este caso es mas estricto: el tenant que reciben solo sirve
    -- para elegir CUAL de TUS invitaciones, y si no hay fila tuya
    -- pendiente para ese tenant la llamada rebota. Son definer porque
    -- con active=false el invitado no pasa is_active_member y no puede
    -- leer ni el nombre de la clinica que lo invita. search_path fijo y
    -- execute revocado de public y anon en las tres.
    'my_pending_invitations',
    'accept_tenant_invitation',
    'decline_tenant_invitation',
    -- 0033: quita must_change_password cuando encrypted_password cambia
    -- de verdad. Es definer porque escribe sobre auth.users, que la
    -- aplicacion no puede tocar. No acota por tenant y no tiene que
    -- hacerlo: opera sobre la fila que dispara el trigger, y es la unica
    -- que ve. search_path fijo. No hace falta revocarle el execute
    -- porque devuelve 'trigger': Postgres no admite llamarla desde SQL.
    'clear_password_change_flag'
  ];
  v_reales text[];
  v_nuevas text[];
  v_faltantes text[];
begin
  select array_agg(p.proname order by p.proname) into v_reales
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef;

  select array_agg(f) into v_nuevas
  from unnest(v_reales) f where f <> all (v_esperadas);

  select array_agg(f) into v_faltantes
  from unnest(v_esperadas) f where f <> all (v_reales);

  if v_nuevas is not null then
    raise exception
      E'Hay funciones security definer sin revisar: %\nBypassean RLS. Revisa que acoten por tenant, que tengan search_path fijo y que su execute este revocado, y agregalas a esta lista.',
      array_to_string(v_nuevas, ', ');
  end if;

  if v_faltantes is not null then
    raise exception 'La lista menciona funciones que ya no existen: %. Actualizala.',
      array_to_string(v_faltantes, ', ');
  end if;

  -- Ninguna debe quedar con search_path libre: sin el, un search_path
  -- manipulado desvia la llamada a una tabla del atacante.
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                      where c like 'search_path=%')
  ) then
    raise exception 'Hay funciones security definer sin search_path fijo: %',
      (select string_agg(p.proname, ', ') from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                         where c like 'search_path=%'));
  end if;

  raise notice 'ok · % funciones security definer, todas revisadas y con search_path fijo',
    array_length(v_reales, 1);
end $$;
