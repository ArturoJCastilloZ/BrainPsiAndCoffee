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

-- Regresión S02: ni siquiera el dueño puede retirar MFA con solo contraseña.
begin;
do $$ begin
  if has_function_privilege('anon','public.set_clinical_mfa(boolean)','EXECUTE') then
    raise exception 'FUGA: anon conserva ejecución de set_clinical_mfa';
  end if;
end $$;
insert into public.tenants(id,name) values ('t_mfa_change','MFA change test');
insert into auth.users(id,email) values
  ('44000000-0000-0000-0000-000000000001','mfa-change@example.invalid'),
  ('44000000-0000-0000-0000-000000000002','mfa-doctor@example.invalid');
insert into public.tenant_members(tenant_id,user_id,role)
values ('t_mfa_change','44000000-0000-0000-0000-000000000001','owner'),
  ('t_mfa_change','44000000-0000-0000-0000-000000000002','doctor');

create function pg_temp.mfa_session(p_role text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.tenant','t_mfa_change',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',case when p_role = 'doctor' then '44000000-0000-0000-0000-000000000002'
               else '44000000-0000-0000-0000-000000000001' end,
    'aal',p_aal,'app_metadata',jsonb_build_object('memberships',jsonb_build_object('t_mfa_change',p_role)))::text,true);
end $$;

do $$
declare v_enabled boolean; v_aal text; v_target boolean;
begin
  perform pg_temp.mfa_session('owner','aal2');
  set local role authenticated;
  perform public.set_clinical_mfa(true);
  if not public.clinical_mfa_required() then raise exception 'No se activó MFA'; end if;
  reset role;

  foreach v_aal in array array['aal1',null,'invalid'] loop
    perform pg_temp.mfa_session('owner',v_aal);
    set local role authenticated;
    foreach v_target in array array[true,false] loop
      begin
        perform public.set_clinical_mfa(v_target);
        raise exception 'FUGA: cambió la regla sin aal2';
      exception when insufficient_privilege then null;
      end;
    end loop;
    if public.clinical_mfa_ok() then raise exception 'FUGA: se abrió el expediente sin segundo factor'; end if;
    reset role;
  end loop;
  select (config->>'mfa_clinico')::boolean into v_enabled from public.tenants where id='t_mfa_change';
  if v_enabled is distinct from true then raise exception 'FUGA: la protección cambió tras rechazos'; end if;

  perform pg_temp.mfa_session('doctor','aal2');
  set local role authenticated;
  begin
    perform public.set_clinical_mfa(false);
    raise exception 'FUGA: un doctor retiró la protección';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform pg_temp.mfa_session('owner','aal2');
  set local role authenticated;
  begin
    perform public.set_clinical_mfa(null);
    raise exception 'FUGA: aceptó estado nulo';
  exception when null_value_not_allowed then null;
  end;
  perform public.set_clinical_mfa(false);
  if public.clinical_mfa_required() then raise exception 'El dueño aal2 no pudo desactivarla'; end if;
  perform public.set_clinical_mfa(true);
  if not public.clinical_mfa_required() then raise exception 'El dueño aal2 no pudo reactivarla'; end if;
  reset role;
  raise notice 'ok · cambiar MFA clínica exige dueño y aal2, para activar y desactivar';
end $$;
rollback;
