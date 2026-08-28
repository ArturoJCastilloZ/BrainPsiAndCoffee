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
    -- Inmutabilidad clinica: no leen datos, solo rechazan escrituras.
    -- Son definer para que nadie pueda esquivarlas con otro rol.
    'enforce_signed_note_immutable',
    'enforce_addendum_append_only',
    -- Administracion de accesos: verifican owner en vivo.
    'assert_tenant_owner',
    'list_tenant_members',
    'set_tenant_member_role',
    'revoke_tenant_member'
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
