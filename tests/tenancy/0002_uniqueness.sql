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

-- Unicidad por tenant (migracion 0002).
-- Depende de 0001_isolation.sql, que ya creo el tenant t_beta.
-- El tenant 'brainpsi' lo crea la propia migracion.

do $$
declare v_n integer;
begin
  -- No bloquear de mas: la MISMA persona puede ser paciente en dos
  -- clinicas. Con el indice global anterior esto era imposible, y el
  -- cliente numero dos se topaba con un error de insercion.
  insert into public.patients (tenant_id, full_name, email, phone) values
    ('brainpsi','Ana Ruiz','ana@ex.mx','5512345678'),
    ('t_beta',  'Ana Ruiz','ana@ex.mx','5512345678');
  select count(*) into v_n from public.patients where email = 'ana@ex.mx';
  if v_n <> 2 then
    raise exception 'FALLA: la misma persona no pudo ser paciente en dos clinicas (% filas)', v_n;
  end if;

  -- Pero dentro de UNA clinica el email sigue siendo unico, sin importar
  -- mayusculas.
  begin
    insert into public.patients (tenant_id, full_name, email, phone)
      values ('brainpsi','Otra Ana','ANA@ex.mx','5599999999');
    raise exception 'FALLA: acepto un email duplicado dentro del mismo tenant';
  exception when unique_violation then null;
  end;

  -- El caso que motiva todo el modelo: un psiquiatra en dos consultorios.
  insert into auth.users (id, email)
    values ('33333333-3333-3333-3333-333333333333','psq2@ex.mx');
  insert into public.therapists (tenant_id, id, name, user_id) values
    ('brainpsi','psq-1','Dr. Mena','33333333-3333-3333-3333-333333333333'),
    ('t_beta',  'psq-7','Dr. Mena','33333333-3333-3333-3333-333333333333');
  select count(*) into v_n from public.therapists
    where user_id = '33333333-3333-3333-3333-333333333333';
  if v_n <> 2 then
    raise exception 'FALLA: un usuario no pudo ser terapeuta en dos clinicas (% filas)', v_n;
  end if;

  -- Un tenant inexistente no debe poder colarse.
  begin
    insert into public.patients (tenant_id, full_name, email, phone)
      values ('t_fantasma','X','x@ex.mx','5511111111');
    raise exception 'FUGA: acepto una fila con un tenant que no existe';
  exception when foreign_key_violation then null;
  end;

  raise notice 'ok · unicidad por tenant y FK a tenants';
end $$;
