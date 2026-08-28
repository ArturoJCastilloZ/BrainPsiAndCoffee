-- Aislamiento entre tenants — nucleo (migracion 0001).
-- Cada bloque falla ruidosamente si la propiedad no se cumple.

insert into public.tenants (id, name) values
  ('t_acme','Clinica Acme'), ('t_beta','Clinica Beta');

-- Un psiquiatra en DOS clinicas con roles distintos: el caso que el
-- modelo viejo (rol global en app_metadata) no podia representar.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111','psq@ex.mx'),
  ('22222222-2222-2222-2222-222222222222','ajeno@ex.mx');
insert into public.tenant_members (tenant_id, user_id, role, therapist_id) values
  ('t_acme','11111111-1111-1111-1111-111111111111','doctor','psq-1'),
  ('t_beta','11111111-1111-1111-1111-111111111111','admin_consultorio','psq-7'),
  ('t_beta','22222222-2222-2222-2222-222222222222','doctor',null);

grant usage on schema public to authenticated;
grant select on public.tenants, public.tenant_members to authenticated;

do $$
declare v_rol text; v_n integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111111111","app_metadata":{"memberships":{"t_acme":"doctor","t_beta":"admin_consultorio"},"therapist_ids":{"t_acme":"psq-1","t_beta":"psq-7"}}}', true);

  -- El rol depende del tenant activo, no del usuario.
  perform set_config('request.tenant','t_acme', true);
  if public.current_tenant_role() <> 'doctor' then
    raise exception 'FALLA: en t_acme el rol debia ser doctor, fue %', public.current_tenant_role();
  end if;
  if public.current_therapist_id() <> 'psq-1' then
    raise exception 'FALLA: therapist_id de t_acme incorrecto';
  end if;

  perform set_config('request.tenant','t_beta', true);
  if public.current_tenant_role() <> 'admin_consultorio' then
    raise exception 'FALLA: el rol no cambio al cambiar de clinica';
  end if;

  -- ATAQUE: tenant activo falsificado. La membresia no esta en el claim,
  -- que solo service_role escribe, asi que no debe surtir efecto.
  perform set_config('request.tenant','t_ajeno', true);
  if public.current_tenant_id() is not null then
    raise exception 'FUGA: un tenant falsificado resolvio a %', public.current_tenant_id();
  end if;

  perform set_config('request.tenant','', true);
  if public.current_tenant_id() is not null then
    raise exception 'FUGA: sin tenant activo se resolvio algo';
  end if;
  raise notice 'ok · resolucion de tenant y rol por clinica';
end $$;

-- RLS con un rol real de Postgres, que es como llega la API.
set role authenticated;
do $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222222222","app_metadata":{"memberships":{"t_beta":"doctor"}}}', true);

  -- No bloquear de mas: lo propio SI se ve.
  perform set_config('request.tenant','t_beta', true);
  select count(*) into v_n from public.tenants where id = 't_beta';
  if v_n <> 1 then
    raise exception 'FALLA: el usuario no ve su propia clinica (%.filas)', v_n;
  end if;

  select count(*) into v_n from public.tenant_members;
  if v_n <> 1 then
    raise exception 'FUGA: ve % membresias, debia ver solo la suya', v_n;
  end if;

  -- ATAQUE: pedir el tenant ajeno por API directa.
  perform set_config('request.tenant','t_acme', true);
  select count(*) into v_n from public.tenants where id = 't_acme';
  if v_n <> 0 then
    raise exception 'FUGA: leyo % filas del tenant ajeno', v_n;
  end if;

  if public.is_active_member('t_acme') then
    raise exception 'FUGA: is_active_member aprobo un tenant ajeno';
  end if;
  if not public.is_active_member('t_beta') then
    raise exception 'FALLA: is_active_member nego la membresia real';
  end if;
  raise notice 'ok · aislamiento RLS y verificacion en vivo';
end $$;
reset role;

-- Escritura de membresias: negada por API, sin excepcion.
do $$
begin
  set local role authenticated;
  begin
    insert into public.tenant_members (tenant_id,user_id,role)
      values ('t_acme','22222222-2222-2222-2222-222222222222','owner');
    raise exception 'FUGA: pudo auto-asignarse una membresia';
  exception
    when insufficient_privilege then raise notice 'ok · escritura de membresias negada';
  end;
end $$;
