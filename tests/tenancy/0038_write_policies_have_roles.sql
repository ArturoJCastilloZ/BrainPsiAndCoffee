do $$ begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception 'ABORTADO: la prueba requiere el banco desechable.';
  end if;
end $$;

-- Guard de policies de escritura. Una policy sin TO aplica a PUBLIC, que
-- incluye a authenticated: asi nacio A1 (0048). Este guard impide que una
-- policy nueva vuelva a abrir el hueco.
--
-- 1. Si la expresion se ancla a current_request_tenant() (la clinica del
--    header, sin verificar membresia), la policy no puede aplicar a public
--    ni a authenticated.
-- 2. Si la policy aplica a public, la expresion debe anclarse a
--    current_tenant_id() (la clinica verificada).
do $$
declare
  v text;
begin
  select string_agg(format('%I.%I (%s)', p.tablename, p.policyname, p.regla), '; ' order by p.tablename, p.policyname)
    into v
  from (
    select tablename, policyname, 'ancla al header y aplica a ' || array_to_string(roles, ',') as regla
      from pg_policies
     where schemaname = 'public'
       and cmd in ('INSERT','UPDATE','DELETE','ALL')
       and concat_ws(' ', qual, with_check) ~ 'current_request_tenant\(\)'
       and roles && array['public','authenticated']::name[]
       and (tablename, policyname) not in (('arco_requests','Public can file ARCO requests'))
    union all
    select tablename, policyname, 'aplica a public sin current_tenant_id()'
      from pg_policies
     where schemaname = 'public'
       and cmd in ('INSERT','UPDATE','DELETE','ALL')
       and roles = array['public']::name[]
       and concat_ws(' ', qual, with_check) !~ 'current_tenant_id\(\)'
       and (tablename, policyname) not in (('profiles','Owners manage profiles of their clinic'))
  ) p;
  if v is not null then
    raise exception 'FUGA: policies de escritura con roles demasiado amplios: %', v;
  end if;
  raise notice 'ok · ninguna policy de escritura anclada al header aplica a authenticated';
end $$;
