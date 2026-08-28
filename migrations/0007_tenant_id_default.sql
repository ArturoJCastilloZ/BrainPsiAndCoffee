-- ============================================================
-- 0007 · tenant_id con valor por defecto
--
-- El front escribe en 15 puntos distintos. Exigirle que ponga tenant_id
-- en cada uno es pedirle que no se le olvide nunca: el dia que se
-- agregue una ruta nueva sin la columna, el insert revienta en
-- produccion con un error de NOT NULL.
--
-- El default lo resuelve en la base: si no viene tenant_id, se toma el
-- tenant activo. Para trafico autenticado sale de las membresias del
-- JWT; para el publico, del tenant que se esta visitando.
--
-- Esto NO afloja el aislamiento. El default solo rellena; quien decide
-- si la fila puede entrar sigue siendo la policy, que compara tenant_id
-- contra el tenant activo. Y si no hay tenant, el default es null y el
-- NOT NULL rechaza la fila: falla cerrado.
-- ============================================================
do $$
declare
  t text;
  tabs text[] := array[
    'therapy_services','therapists','specialties','therapist_services',
    'products','offers','business_settings','appointments','patients',
    'appointment_notes','appointment_notifications','orders',
    'order_items','consents'
  ];
begin
  foreach t in array tabs loop
    execute format(
      'alter table public.%I alter column tenant_id set default
         coalesce(public.current_tenant_id(), public.current_request_tenant())', t);
  end loop;
end $$;

-- audit_log tambien, aunque el suyo admite null a proposito.
alter table public.audit_log alter column tenant_id set default
  coalesce(public.current_tenant_id(), public.current_request_tenant());
