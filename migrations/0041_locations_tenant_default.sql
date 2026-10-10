-- 0041 · locations.tenant_id lo pone la base.
--
-- 0040 creo locations sin default en tenant_id. El panel no lo manda (como
-- en todas las tablas: lo pone la base desde la sesion, 0007), asi que la
-- fila llegaba con tenant_id nulo y la policy "Clinic staff manage
-- locations" la rechazaba: "new row violates row-level security policy".
-- Mismo default que el resto de las tablas de la clinica.
alter table public.locations alter column tenant_id
  set default coalesce(public.current_tenant_id(), public.current_request_tenant());
