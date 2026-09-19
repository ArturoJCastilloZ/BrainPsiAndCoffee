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

-- Alta del primer acceso (migracion 0009).
--
-- 0008 solo migra usuarios que ya existian: su guard depende de que
-- haya alguno, asi que una instalacion nueva migra bien y se queda sin
-- puerta de entrada. Esta es la via para abrirla.

do $$
declare v_id uuid; v_role text; v_meta jsonb;
begin
  -- Sin usuario creado debe explicar que hacer, no fallar de forma opaca.
  begin
    perform public.grant_tenant_role('fantasma@ex.mx','brainpsi','owner');
    raise exception 'FALLA: acepto un correo que no existe';
  exception when others then
    if position('No hay ningun usuario' in sqlerrm) = 0 then raise; end if;
  end;

  -- Rol invalido: tampoco pasa.
  insert into auth.users (id,email) values
    ('99999999-9999-9999-9999-999999999999','primero@ex.mx');
  begin
    perform public.grant_tenant_role('primero@ex.mx','brainpsi','superusuario');
    raise exception 'FALLA: acepto un rol que no existe';
  exception when others then
    if position('Rol no valido' in sqlerrm) = 0 then raise; end if;
  end;

  v_id := public.grant_tenant_role('primero@ex.mx','brainpsi','owner');

  select role into v_role from public.tenant_members
    where tenant_id='brainpsi' and user_id = v_id;
  if v_role is distinct from 'owner' then
    raise exception 'FALLA: no quedo como owner (rol=%)', v_role;
  end if;

  select raw_app_meta_data into v_meta from auth.users where id = v_id;
  if v_meta -> 'memberships' ->> 'brainpsi' <> 'owner' then
    raise exception 'FALLA: el claim de membresia no se escribio';
  end if;

  -- Fusiona, no pisa: darle un rol en otra clinica conserva el anterior.
  insert into public.tenants (id,name) values ('t_otra','Otra') on conflict do nothing;
  -- Un doctor necesita ficha de terapeuta en SU clinica (0015).
  insert into public.therapists (tenant_id,id,name) values ('t_otra','th-otra','Dra. Otra');
  perform public.grant_tenant_role('primero@ex.mx','t_otra','doctor','th-otra');

  select raw_app_meta_data into v_meta from auth.users where id = v_id;
  if v_meta -> 'memberships' ->> 'brainpsi' <> 'owner' then
    raise exception 'FUGA: dar acceso a otra clinica borro el rol de la primera';
  end if;
  if v_meta -> 'memberships' ->> 't_otra' <> 'doctor' then
    raise exception 'FALLA: no se agrego la segunda clinica';
  end if;

  raise notice 'ok · alta del primer acceso y fusion de membresias';
end $$;
