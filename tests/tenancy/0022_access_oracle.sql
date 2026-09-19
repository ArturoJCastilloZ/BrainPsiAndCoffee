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

-- 0031 · El alta de personal no puede ser un directorio de la plataforma,
--        y dar acceso a una clinica tiene que dejar rastro.
--
-- Se prueba POR ABUSO. Lo que importa no es que el alta funcione -0009 ya
-- lo cubre- sino que un dueño no pueda usarla para averiguar si un correo
-- ajeno existe.

insert into public.tenants (id,name) values ('t_ora','Clinica Oraculo'),('t_aje','Clinica Ajena');
insert into auth.users (id,email) values
  ('0ba00000-0000-0000-0000-0000000000aa','ora.dueno@ex.mx'),
  ('0ba00000-0000-0000-0000-0000000000bb','ora.ajena@otraclinica.com'),
  ('0ba00000-0000-0000-0000-0000000000cc','ora.tercero@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_ora','0ba00000-0000-0000-0000-0000000000aa','owner'),
  ('t_aje','0ba00000-0000-0000-0000-0000000000bb','owner');
insert into public.therapists (tenant_id,id,name,active) values
  ('t_ora','psq-ora','Dra Ora',true),
  ('t_ora','psq-ocupada','Dra Ocupada',true);
insert into public.tenant_members (tenant_id,user_id,role,therapist_id) values
  ('t_ora','0ba00000-0000-0000-0000-0000000000cc','doctor','psq-ocupada');

grant usage on schema public to authenticated;
grant select on public.tenant_members to authenticated;

create or replace function pg_temp.como_dueno_ora() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"0ba00000-0000-0000-0000-0000000000aa","app_metadata":{"memberships":{"t_ora":"owner"}}}', true),
         set_config('request.tenant','t_ora', true);
$$;

-- 1 · Sondear con rol 'doctor' sin ficha no distingue un correo real de
--     uno inventado. Era el oraculo silencioso: no escribe nada, asi que
--     se puede repetir sobre toda la plataforma sin dejar rastro.
do $$
declare v_inventado text; v_real text;
begin
  set local role authenticated;
  perform pg_temp.como_dueno_ora();

  begin
    perform public.set_tenant_member_role('no.existe.nadie@ninguna.com','doctor');
    raise exception 'FALLA: el sondeo con correo inventado no fallo';
  exception when others then v_inventado := sqlerrm;
  end;

  begin
    perform public.set_tenant_member_role('ora.ajena@otraclinica.com','doctor');
    raise exception 'FALLA: el sondeo con correo real no fallo';
  exception when others then v_real := sqlerrm;
  end;

  if v_inventado is distinct from v_real then
    raise exception 'ORACULO: el mensaje delata si el correo existe. inventado=[%] real=[%]', v_inventado, v_real;
  end if;
  raise notice 'ok · sondear con doctor sin ficha no dice si el correo existe';
end $$;

-- 2 · Y tampoco lo dice una ficha ya ocupada, que era la segunda via:
--     "ya esta asignada" para un correo real contra "no existe" para uno
--     inventado.
do $$
declare v_inventado text; v_real text;
begin
  set local role authenticated;
  perform pg_temp.como_dueno_ora();

  begin
    perform public.set_tenant_member_role('no.existe.nadie@ninguna.com','doctor','psq-ocupada');
    raise exception 'FALLA: no fallo con correo inventado';
  exception when others then v_inventado := sqlerrm;
  end;

  begin
    perform public.set_tenant_member_role('ora.ajena@otraclinica.com','doctor','psq-ocupada');
    raise exception 'FALLA: no fallo con correo real';
  exception when others then v_real := sqlerrm;
  end;

  if v_inventado is distinct from v_real then
    raise exception 'ORACULO: la ficha ocupada delata si el correo existe. inventado=[%] real=[%]', v_inventado, v_real;
  end if;
  raise notice 'ok · una ficha ocupada tampoco dice si el correo existe';
end $$;

-- 3 · El uso legitimo NO se rompio: el "no existe" sigue llegando cuando
--     ya es lo unico que puede fallar. Sin esto, el arreglo del oraculo
--     podria haber sido "callar todos los errores", que dejaria al dueño
--     sin saber por que no puede dar de alta a alguien.
do $$
declare v_msg text;
begin
  set local role authenticated;
  perform pg_temp.como_dueno_ora();

  begin
    perform public.set_tenant_member_role('no.existe.nadie@ninguna.com','barista');
    raise exception 'FALLA: dio de alta a un correo que no existe';
  exception when others then v_msg := sqlerrm;
  end;

  if v_msg not like '%No existe ningun usuario%' then
    raise exception 'FALLA: el dueño ya no sabe que el correo no esta registrado (dijo: %)', v_msg;
  end if;
  raise notice 'ok · con todo lo demas en regla, el dueño si sabe que el correo no existe';
end $$;

-- 4 · Dar acceso a una clinica queda en la bitacora. Antes NO: de las 11
--     tablas auditadas, tenant_members no estaba, asi que el alta, el
--     cambio de rol y la baja no dejaban una sola fila.
do $$
declare v_n integer;
begin
  set local role authenticated;
  perform pg_temp.como_dueno_ora();
  perform public.set_tenant_member_role('ora.ajena@otraclinica.com','barista');
end $$;

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.audit_log
   where tenant_id='t_ora' and table_name='tenant_members' and action='INSERT';
  if v_n = 0 then
    raise exception 'FALLA: se dio acceso a la clinica y la bitacora no lo registro';
  end if;
  raise notice 'ok · dar acceso a una clinica deja rastro en la bitacora';
end $$;

-- 5 · Y la entrada de tenants es ENCONTRABLE. La tabla no tiene columna
--     tenant_id -la fila ES el tenant-, y la policy de lectura filtra por
--     (tenant_id = current_tenant_id()): una entrada con tenant nulo no
--     la veria nadie. Auditar a un agujero negro es peor que no auditar,
--     porque parece que si.
do $$
declare v_tenant text;
begin
  update public.tenants set name = 'Clinica Oraculo (renombrada)' where id = 't_ora';

  select tenant_id into v_tenant from public.audit_log
   where table_name='tenants' and action='UPDATE' and record_id='t_ora'
   order by occurred_at desc limit 1;

  if v_tenant is null then
    raise exception 'FALLA: la entrada de tenants quedo sin clinica; la policy de lectura la hace invisible para todos';
  end if;
  if v_tenant <> 't_ora' then
    raise exception 'FALLA: la entrada de tenants quedo bajo la clinica equivocada (%)', v_tenant;
  end if;
  raise notice 'ok · el cambio a una clinica queda registrado bajo esa clinica';
end $$;
