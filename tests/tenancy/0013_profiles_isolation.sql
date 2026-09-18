-- profiles no puede quedarse fuera del aislamiento.
--
-- La migracion 0005 redefinio is_super_admin() de "operador global de la
-- plataforma" (app_metadata.role = 'super_admin') a current_tenant_role()
-- = 'owner', es decir el dueño de CUALQUIER clinica. La policy de
-- profiles quedo como
--
--   for all using (public.is_super_admin())
--
-- y profiles no tiene tenant_id a proposito (0002: "es la identidad
-- global del usuario"), asi que el predicado no acota por clinica. El
-- dueño de una clinica pasaba a leer, modificar y BORRAR las filas de los
-- usuarios de todas las demas.
--
-- Que la aplicacion no consulte la tabla no cierra nada: la frontera es
-- RLS, y PostgREST la expone igual.

insert into public.tenants (id, name) values
  ('t_pf1','Clinica Perfil Uno'), ('t_pf2','Clinica Perfil Dos');

insert into auth.users (id, email) values
  ('dddddddd-0000-0000-0000-000000000001','dueno.uno@ex.mx'),
  ('dddddddd-0000-0000-0000-000000000002','staff.uno@ex.mx'),
  ('dddddddd-0000-0000-0000-000000000003','ajeno.dos@ex.mx');

insert into public.tenant_members (tenant_id, user_id, role) values
  ('t_pf1','dddddddd-0000-0000-0000-000000000001','owner'),
  ('t_pf1','dddddddd-0000-0000-0000-000000000002','doctor'),
  ('t_pf2','dddddddd-0000-0000-0000-000000000003','doctor');

insert into public.profiles (user_id, display_name) values
  ('dddddddd-0000-0000-0000-000000000001','Dueño Uno'),
  ('dddddddd-0000-0000-0000-000000000002','Staff Uno'),
  ('dddddddd-0000-0000-0000-000000000003','Ajeno Dos');

-- Lo que la API le da a un usuario con sesion. Se otorga aqui y solo
-- sobre profiles: una prueba que hace grant sobre TODAS las tablas
-- deshace los revoke de las migraciones y deja pasar lo que deberia
-- rebotar.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.tenant_members to authenticated;

set role authenticated;

do $$
declare v_n integer;
begin
  -- El dueño de t_pf1. Su membresia es real: no esta falsificando nada,
  -- y por eso is_super_admin() le da true.
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_pf1":"owner"}}}', true);
  perform set_config('request.tenant','t_pf1', true);

  if public.current_tenant_role() <> 'owner' then
    raise exception 'FALLA: el montaje no dejo al usuario como dueño de t_pf1';
  end if;

  -- Puede ver su propia ficha y la de su gente: eso es legitimo.
  select count(*) into v_n from public.profiles
   where user_id = 'dddddddd-0000-0000-0000-000000000002';
  if v_n <> 1 then
    raise exception 'FALLA: el dueño no ve el perfil de alguien de SU clinica (% filas)', v_n;
  end if;

  -- Pero NO la de un usuario de otra clinica.
  select count(*) into v_n from public.profiles
   where user_id = 'dddddddd-0000-0000-0000-000000000003';
  if v_n <> 0 then
    raise exception 'FUGA: el dueño de t_pf1 leyo el perfil de un usuario de t_pf2';
  end if;

  -- Y el barrido completo tampoco puede traerla.
  select count(*) into v_n from public.profiles
   where display_name = 'Ajeno Dos';
  if v_n <> 0 then
    raise exception 'FUGA: un select amplio expuso el padron de otra clinica';
  end if;

  raise notice 'ok · el dueño no lee perfiles de otra clinica';
end $$;

do $$
declare v_n integer;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"dddddddd-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_pf1":"owner"}}}', true);
  perform set_config('request.tenant','t_pf1', true);

  -- for all cubre update y delete, no solo select.
  update public.profiles set active = false
   where user_id = 'dddddddd-0000-0000-0000-000000000003';
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'FUGA: el dueño de t_pf1 modifico % perfil(es) de t_pf2', v_n;
  end if;

  delete from public.profiles
   where user_id = 'dddddddd-0000-0000-0000-000000000003';
  get diagnostics v_n = row_count;
  if v_n <> 0 then
    raise exception 'FUGA: el dueño de t_pf1 BORRO % perfil(es) de t_pf2', v_n;
  end if;

  raise notice 'ok · el dueño no modifica ni borra perfiles de otra clinica';
end $$;

reset role;

-- La fila ajena sigue intacta despues del intento.
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.profiles
   where user_id = 'dddddddd-0000-0000-0000-000000000003' and active;
  if v_n <> 1 then
    raise exception 'FUGA: la fila de t_pf2 no sobrevivio intacta al intento';
  end if;
  raise notice 'ok · la fila de la otra clinica quedo intacta';
end $$;
