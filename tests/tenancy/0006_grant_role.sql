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
  perform public.grant_tenant_role('primero@ex.mx','t_otra','doctor');

  select raw_app_meta_data into v_meta from auth.users where id = v_id;
  if v_meta -> 'memberships' ->> 'brainpsi' <> 'owner' then
    raise exception 'FUGA: dar acceso a otra clinica borro el rol de la primera';
  end if;
  if v_meta -> 'memberships' ->> 't_otra' <> 'doctor' then
    raise exception 'FALLA: no se agrego la segunda clinica';
  end if;

  raise notice 'ok · alta del primer acceso y fusion de membresias';
end $$;
