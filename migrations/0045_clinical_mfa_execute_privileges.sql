-- Quita grants heredados de la API pública: esta operación solo es autenticada.
revoke all on function public.set_clinical_mfa(boolean) from public, anon;
grant execute on function public.set_clinical_mfa(boolean) to authenticated;
