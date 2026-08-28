-- Bootstrap de membresias (migracion 0008).
--
-- Simula la base real: usuarios del modelo viejo (role global en
-- app_metadata) que la migracion debe pasar al modelo por clinica. Si
-- esto falla, migrar deja al dueño sin poder entrar a su propio admin.

do $$
declare v_role text; v_n integer; v_meta jsonb;
begin
  insert into auth.users (id,email,raw_app_meta_data) values
    ('10000000-0000-0000-0000-000000000001','dueno@ex.mx','{"role":"admin"}'),
    ('10000000-0000-0000-0000-000000000002','doc@ex.mx','{"role":"doctor","therapist_id":"psq-boot"}'),
    ('10000000-0000-0000-0000-000000000003','nadie@ex.mx','{}');
  insert into public.therapists (tenant_id,id,name) values ('brainpsi','psq-boot','Dr. Mena');

  -- Se re-ejecuta el cuerpo de 0008 sobre estos usuarios nuevos. La
  -- migracion es idempotente y solo toca a quien no tenga membresias.
  perform public.bootstrap_tenant_memberships('brainpsi');

  select role into v_role from public.tenant_members
    where user_id = '10000000-0000-0000-0000-000000000001';
  if v_role is distinct from 'owner' then
    raise exception 'FALLA: el admin global no quedo como owner de su clinica (rol=%)', v_role;
  end if;

  select raw_app_meta_data into v_meta from auth.users
    where id = '10000000-0000-0000-0000-000000000002';
  if v_meta -> 'memberships' ->> 'brainpsi' <> 'doctor' then
    raise exception 'FALLA: el doctor no quedo con membresia';
  end if;
  if v_meta -> 'therapist_ids' ->> 'brainpsi' <> 'psq-boot' then
    raise exception 'FALLA: no se migro el therapist_id a therapist_ids';
  end if;

  -- Quien no tenia rol reconocible NO debe recibir permisos.
  select count(*) into v_n from public.tenant_members
    where user_id = '10000000-0000-0000-0000-000000000003';
  if v_n <> 0 then
    raise exception 'FUGA: se le dio acceso a un usuario que no tenia rol';
  end if;

  -- Los claims viejos no deben sobrevivir como segunda fuente de permisos.
  select count(*) into v_n from auth.users where raw_app_meta_data ? 'role';
  if v_n <> 0 then
    raise exception 'FALLA: quedaron % usuarios con el claim role viejo', v_n;
  end if;

  raise notice 'ok · bootstrap de membresias del tenant #1';
end $$;
