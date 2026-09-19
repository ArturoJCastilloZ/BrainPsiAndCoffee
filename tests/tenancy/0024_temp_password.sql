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

-- 0033 · La contraseña temporal encierra la sesion hasta que se cambie.
--
-- Lo que se prueba es el EFECTO sobre los datos, no que el flag exista:
-- el mismo usuario, con los mismos permisos, sobre las mismas filas,
-- antes y despues del flag.

insert into public.tenants (id,name) values ('t_tmp','Clinica Temporal');
insert into auth.users (id,email,encrypted_password) values
  ('d1000000-0000-0000-0000-0000000000aa','tmp.dueno@ex.mx','hash-viejo');
insert into public.tenant_members (tenant_id,user_id,role,active) values
  ('t_tmp','d1000000-0000-0000-0000-0000000000aa','owner',true);
insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values ('t_tmp','sv-tmp','Consulta',50,900);
insert into public.therapists (tenant_id,id,name,active) values ('t_tmp','psq-tmp','Dra Tmp',true);
insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,appointment_time,
  customer_name,customer_email,customer_phone,duration_minutes)
  values ('t_tmp','ap-tmp','sv-tmp','psq-tmp','2026-12-09','10:00','Pac Tmp','pac.tmp@ex.com','5511111111',50);

grant usage on schema public to authenticated;
grant select on public.patients, public.appointments to authenticated;

create or replace function pg_temp.sesion(p_flag boolean) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub','d1000000-0000-0000-0000-0000000000aa',
      'app_metadata', json_build_object('memberships', json_build_object('t_tmp','owner'),
                                        'must_change_password', p_flag))::text, true);
  perform set_config('request.tenant','t_tmp', true);
end $$;

-- 1 · LINEA BASE. Sin esto, un cero mas abajo no probaria nada: podria
--     ser que el rol no viera esos datos de todas formas.
do $$
declare v_pac integer; v_cit integer;
begin
  set local role authenticated;
  perform pg_temp.sesion(false);
  select count(*) into v_pac from public.patients;
  select count(*) into v_cit from public.appointments;
  if v_pac = 0 or v_cit = 0 then
    raise exception 'FALLA DE LA PRUEBA: la linea base ya venia en cero (pac=%, cit=%), el resto no mediria nada', v_pac, v_cit;
  end if;
  raise notice 'ok · linea base: el dueño ve % pacientes y % citas', v_pac, v_cit;
end $$;

-- 2 · CON el flag no ve nada, siendo el mismo dueño.
do $$
declare v_pac integer; v_cit integer; v_tenant text; v_rol text;
begin
  set local role authenticated;
  perform pg_temp.sesion(true);
  select public.current_tenant_id() into v_tenant;
  select public.current_tenant_role() into v_rol;
  select count(*) into v_pac from public.patients;
  select count(*) into v_cit from public.appointments;

  if v_tenant is not null then
    raise exception 'FUGA: con la temporal sin cambiar sigue habiendo clinica activa (%)', v_tenant;
  end if;
  if public.is_super_admin() then
    raise exception 'FUGA: con la temporal sin cambiar sigue siendo dueño';
  end if;
  if v_pac <> 0 or v_cit <> 0 then
    raise exception 'FUGA: con la temporal sin cambiar ve % pacientes y % citas', v_pac, v_cit;
  end if;
  raise notice 'ok · con la temporal sin cambiar no ve pacientes ni citas';
end $$;

-- 3 · Cambiar la contraseña limpia el flag. Anclado al EFECTO: se cambia
--     encrypted_password, no se llama a nada que "declare" el cambio.
do $$
declare v_flag jsonb;
begin
  update auth.users set raw_app_meta_data =
    '{"memberships":{"t_tmp":"owner"},"must_change_password":true,"temp_expires_at":"2099-01-01T00:00:00Z"}'::jsonb
   where id='d1000000-0000-0000-0000-0000000000aa';

  update auth.users set encrypted_password='hash-nuevo'
   where id='d1000000-0000-0000-0000-0000000000aa';

  select raw_app_meta_data -> 'must_change_password' into v_flag
    from auth.users where id='d1000000-0000-0000-0000-0000000000aa';
  if v_flag is not null then
    raise exception 'FALLA: cambio la contraseña y sigue encerrado (flag: %)', v_flag;
  end if;
  raise notice 'ok · cambiar la contraseña de verdad libera la sesion';
end $$;

-- 4 · Y una escritura que NO toca la contraseña no lo libera. Sin esta
--     condicion, conceder una membresia -que escribe app_metadata- le
--     quitaria el flag y entraria sin haber cambiado nada.
do $$
declare v_flag jsonb;
begin
  update auth.users set raw_app_meta_data =
    '{"memberships":{"t_tmp":"owner"},"must_change_password":true,"temp_expires_at":"2099-01-01T00:00:00Z"}'::jsonb
   where id='d1000000-0000-0000-0000-0000000000aa';

  -- Escritura tipica de set_tenant_member_role: toca el claim, no la clave.
  update auth.users
     set raw_app_meta_data = raw_app_meta_data || '{"memberships":{"t_tmp":"owner","otra":"barista"}}'::jsonb
   where id='d1000000-0000-0000-0000-0000000000aa';

  select raw_app_meta_data -> 'must_change_password' into v_flag
    from auth.users where id='d1000000-0000-0000-0000-0000000000aa';
  if v_flag is null then
    raise exception 'FUGA: una escritura que no toco la contraseña le quito el flag';
  end if;
  raise notice 'ok · escribir el claim no libera: solo cambiar la contraseña';
end $$;

-- 5 · Una temporal caducada no estrena cuenta. La que quedo apuntada en
--     un papel hace tres meses no puede seguir sirviendo.
do $$
declare v_msg text; v_flag jsonb;
begin
  -- La preparacion NO toca la contraseña: si la tocara, el trigger
  -- actuaria sobre ESA escritura y el escenario quedaria montado al
  -- reves. Fue el primer intento de esta prueba y fallaba por eso.
  update auth.users set
    raw_app_meta_data = '{"memberships":{"t_tmp":"owner"},"must_change_password":true,"temp_expires_at":"2020-01-01T00:00:00Z"}'::jsonb
   where id='d1000000-0000-0000-0000-0000000000aa';

  begin
    update auth.users set encrypted_password='hash-tardio'
     where id='d1000000-0000-0000-0000-0000000000aa';
    raise exception 'FUGA: estreno la cuenta con una temporal caducada';
  exception when others then
    v_msg := sqlerrm;
    if position('caduco' in v_msg) = 0 then raise; end if;
  end;

  select raw_app_meta_data -> 'must_change_password' into v_flag
    from auth.users where id='d1000000-0000-0000-0000-0000000000aa';
  if v_flag is null then
    raise exception 'FUGA: el cambio reboto pero el flag se limpio igual';
  end if;
  raise notice 'ok · una temporal caducada no deja estrenar la cuenta';
end $$;

-- 6 · Regenerar NO desbloquea. El dueño pone una temporal nueva y la
--     persona sigue debiendo cambiarla; si esto liberara, regenerar seria
--     la puerta trasera.
do $$
declare v_flag jsonb; v_exp text;
begin
  update auth.users set
    raw_app_meta_data = jsonb_build_object(
      'memberships', jsonb_build_object('t_tmp','owner'),
      'must_change_password', true,
      'temp_expires_at', to_char(now() + interval '72 hours','YYYY-MM-DD"T"HH24:MI:SSOF')),
    encrypted_password = 'hash-regenerado'
   where id='d1000000-0000-0000-0000-0000000000aa';

  select raw_app_meta_data -> 'must_change_password',
         raw_app_meta_data ->> 'temp_expires_at'
    into v_flag, v_exp
    from auth.users where id='d1000000-0000-0000-0000-0000000000aa';

  if v_flag is null then
    raise exception 'FUGA: regenerar la temporal desbloqueo la cuenta';
  end if;
  if v_exp is null then
    raise exception 'FALLA: la caducidad nueva no quedo escrita';
  end if;
  raise notice 'ok · regenerar la temporal no desbloquea, y renueva la caducidad';
end $$;
