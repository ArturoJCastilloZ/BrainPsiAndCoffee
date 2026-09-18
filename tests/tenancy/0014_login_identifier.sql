-- resolve_login_identifier no puede ser un directorio de toda la plataforma.
--
-- La funcion resuelve "nombre o correo" a un correo para la pantalla de
-- acceso. Es security definer y su cuerpo era:
--
--   select email from public.therapists
--   where active = true and email is not null
--     and (lower(email) = lower(identifier) or lower(name) = lower(identifier))
--   limit 1;
--
-- Sin una sola mencion de tenant, y con execute para authenticated. Es una
-- LECTURA autorizada por pertenecer a UNA clinica que cae sobre el
-- directorio de terapeutas de TODAS — y devuelve therapists.email, justo
-- la columna que la Fase 1 saco de la exposicion publica.
--
-- El 'limit 1' sin order by es ademas la trampa del lookup por clave
-- natural: dos personas con el mismo nombre resuelven a una arbitraria.

insert into public.tenants (id,name) values
  ('t_li_a','Clinica Login A'), ('t_li_b','Clinica Login B');

insert into auth.users (id,email) values
  ('ffffffff-0000-0000-0000-000000000001','staff.a@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_li_a','ffffffff-0000-0000-0000-000000000001','barista');

-- Terapeutas homonimos en clinicas distintas: el apellido comun es el
-- caso real, no uno rebuscado.
insert into public.therapists (tenant_id,id,name,email,active) values
  ('t_li_a','th-a','Dra. Martinez','martinez.a@clinica-a.mx',true),
  ('t_li_b','th-b','Dra. Martinez','martinez.b@clinica-b.mx',true),
  ('t_li_b','th-b2','Dr. Solo B','solo.b@clinica-b.mx',true);

grant usage on schema public to authenticated;
grant select on public.tenant_members to authenticated;

set role authenticated;

do $$
declare v_res text;
begin
  -- Un BARISTA de la clinica A. No es personal clinico: ni siquiera ve el
  -- catalogo de doctores de su propia clinica en la aplicacion.
  perform set_config('request.jwt.claims',
    '{"sub":"ffffffff-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_li_a":"barista"}}}', true);
  perform set_config('request.tenant','t_li_a', true);

  -- Dentro de SU clinica la funcion sigue sirviendo: es para lo que existe.
  v_res := public.resolve_login_identifier('Dra. Martinez');
  if v_res is distinct from 'martinez.a@clinica-a.mx' then
    raise exception 'FALLA: dentro de su propia clinica ya no resuelve (devolvio %)', coalesce(v_res,'NULL');
  end if;

  -- Pero el correo de una terapeuta de OTRA clinica no sale por aqui.
  v_res := public.resolve_login_identifier('Dr. Solo B');
  if v_res is not null then
    raise exception 'FUGA: un barista de t_li_a obtuvo el correo % de un terapeuta de t_li_b', v_res;
  end if;

  raise notice 'ok · el directorio de terapeutas no cruza clinicas';
end $$;

-- Tenant falsificado: el header solo no basta. current_tenant_id() exige
-- que la clinica este entre las membresias del JWT, que unicamente
-- service_role escribe.
do $$
declare v_res text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"ffffffff-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_li_a":"barista"}}}', true);
  perform set_config('request.tenant','t_li_b', true);

  v_res := public.resolve_login_identifier('Dr. Solo B');
  if v_res is not null then
    raise exception 'FUGA: apuntando el header a t_li_b se obtuvo %', v_res;
  end if;
  raise notice 'ok · el header por si solo no abre el directorio de otra clinica';
end $$;

reset role;

-- Ambiguidad DENTRO de una clinica: dos homonimos no pueden resolver a
-- una persona arbitraria. Es la leccion del lookup por clave natural, la
-- misma que set_tenant_member_role aprendio con into strict.
insert into public.therapists (tenant_id,id,name,email,active) values
  ('t_li_a','th-a2','Dra. Martinez','martinez.dos@clinica-a.mx',true);

set role authenticated;
do $$
declare v_res text;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"ffffffff-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_li_a":"barista"}}}', true);
  perform set_config('request.tenant','t_li_a', true);

  v_res := public.resolve_login_identifier('Dra. Martinez');
  if v_res is not null then
    raise exception 'AMBIGUO: con dos homonimas resolvio a % en vez de rechazar', v_res;
  end if;
  raise notice 'ok · dos homonimas no resuelven a una arbitraria';
end $$;
reset role;
