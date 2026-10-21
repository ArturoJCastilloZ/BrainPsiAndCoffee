-- Todo cambio de la regla clínica exige segundo factor, incluso apagarla.
-- Una contraseña robada no debe poder retirar la barrera de los expedientes.
create or replace function public.set_clinical_mfa(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text := public.current_tenant_id();
begin
  if v_tenant is null or public.current_tenant_role() is distinct from 'owner' then
    raise exception using errcode = '42501', message = 'Solo el dueño de la clínica puede cambiar esto.';
  end if;
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception using errcode = '42501',
      message = 'Verifica esta sesión con tu segundo factor para cambiar la protección clínica.';
  end if;
  if p_enabled is null then
    raise exception using errcode = '22004', message = 'Indica si la protección clínica debe estar activa.';
  end if;
  update public.tenants
     set config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
           'mfa_clinico', p_enabled,
           'mfa_clinico_por', auth.uid(),
           'mfa_clinico_en', now()),
         updated_at = now()
   where id = v_tenant;
end $$;
revoke all on function public.set_clinical_mfa(boolean) from public;
grant execute on function public.set_clinical_mfa(boolean) to authenticated;

