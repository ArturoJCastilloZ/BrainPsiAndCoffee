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

-- El dinero lo fija el servidor.
--
-- Dos huecos de 0027: el precio de la cita lo podia escribir quien
-- insertara la fila, y el importe del cobro solo lo topaba el navegador.
-- Aqui se prueban las dos cosas Y que no bloquean de mas: un constraint
-- que rechaza casos legitimos es peor que el bug que vino a cerrar.

insert into public.tenants (id,name) values ('t_din','Clinica Dinero');
insert into auth.users (id,email) values
  ('d0000000-0000-0000-0000-000000000001','dueno.din@ex.mx'),
  ('d0000000-0000-0000-0000-000000000002','admin.din@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_din','d0000000-0000-0000-0000-000000000001','owner'),
  ('t_din','d0000000-0000-0000-0000-000000000002','admin_consultorio');

insert into public.therapy_services (tenant_id,id,name,duration_minutes,price,active) values
  ('t_din','sv-din','Terapia',50,900,true),
  -- Servicio en CERO. therapy_services.price es not null, asi que el
  -- catalogo no puede quedar en nulo — pero si en cero, y ahi es donde
  -- nacen las citas que salen en $0.00 en pantalla: mapServiceToDb
  -- escribe Number(price || 0), asi que un precio vacio se guarda como 0.
  ('t_din','sv-cero','Terapia sin tarifa',50,0,true);
insert into public.therapists (tenant_id,id,name,active) values ('t_din','th-din','Dra Din',true);

-- ------------------------------------------------------------
-- 1 · El visitante NO fija el precio.
--
-- Es el agujero: la policy publica valida nombre, correo y horario pero
-- no dice nada de price, asi que bastaba mandarlo en el insert.
-- ------------------------------------------------------------
-- El visitante ESCRIBE como anon; la comprobacion se hace despues con el
-- rol del dueño de la base. Leer la fila como anon devolvia NULL —RLS no
-- le deja ver appointments— y eso se confundia con "el precio quedo null".
set role anon;
do $$
begin
  perform set_config('request.jwt.claims', null, true);
  perform set_config('request.tenant','t_din', true);

  -- price 0 explicito, como una peticion directa con la anon key.
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,price)
    values ('t_din','ap-cero','sv-din','th-din','2026-12-02','10:00','Pac Cero','cero@ex.mx','5511111111',50,0);

  -- Y uno negativo, que bajaba el facturado del periodo entero.
  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,price)
    values ('t_din','ap-neg','sv-din','th-din','2026-12-02','13:00','Pac Neg','neg@ex.mx','5511111111',50,-5000);

  -- Y un intento de reescribirlo despues.
  begin
    update public.appointments set price = 1 where tenant_id='t_din' and id='ap-cero';
  exception when others then null;  -- si RLS ya lo niega, mejor
  end;
end $$;
reset role;

do $$
declare v_cero numeric; v_neg numeric;
begin
  select price into v_cero from public.appointments where id='ap-cero';
  select price into v_neg  from public.appointments where id='ap-neg';

  if v_cero is distinct from 900 then
    raise exception 'AGUJERO: el visitante dejo la cita en % (debia imponerse el catalogo, 900)',
      coalesce(v_cero::text,'NULL');
  end if;
  if v_neg is distinct from 900 then
    raise exception 'AGUJERO: entro una cita con precio % (debia imponerse 900)',
      coalesce(v_neg::text,'NULL');
  end if;
  raise notice 'ok · el visitante no fija el precio de su cita, ni en cero ni en negativo';
  raise notice 'ok · el visitante tampoco lo reescribe despues';
end $$;

-- ------------------------------------------------------------
-- 2 · La clinica SI puede fijar un precio distinto.
--
-- No bloquear de mas: un descuento o una tarifa social son decisiones de
-- negocio legitimas de quien administra la clinica.
-- ------------------------------------------------------------
set role authenticated;
do $$
declare v_precio numeric;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-0000-0000-000000000002","app_metadata":{"memberships":{"t_din":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_din', true);

  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes,price)
    values ('t_din','ap-desc','sv-din','th-din','2026-12-02','15:00','Pac Desc','desc@ex.mx','5511111111',50,450);

  select price into v_precio from public.appointments where id='ap-desc';
  if v_precio is distinct from 450 then
    raise exception 'BLOQUEA DE MAS: la clinica no pudo aplicar un descuento, quedo en %', v_precio;
  end if;
  raise notice 'ok · la clinica si puede cobrar distinto al catalogo';
end $$;

-- Y sin precio explicito sigue tomando el del catalogo.
do $$
declare v_precio numeric;
begin
  -- Las claims se fijan en CADA bloque: set_config(...,true) es local a
  -- la transaccion y cada bloque anonimo es la suya en este arnes.
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-0000-0000-000000000002","app_metadata":{"memberships":{"t_din":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_din', true);

  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
    values ('t_din','ap-normal','sv-din','th-din','2026-12-02','11:30','Pac Normal','nor@ex.mx','5511111111',50);

  select price into v_precio from public.appointments where id='ap-normal';
  if v_precio is distinct from 900 then
    raise exception 'REGRESION: la cita sin precio quedo en % y el catalogo dice 900',
      coalesce(v_precio::text,'NULL');
  end if;
  raise notice 'ok · sin precio explicito sigue congelando el del catalogo';
end $$;

-- ------------------------------------------------------------
-- 3 · El cobro no pasa del saldo.
-- ------------------------------------------------------------
do $$
declare v_falló boolean := false;
begin
  -- Las claims se fijan en CADA bloque: set_config(...,true) es local a
  -- la transaccion y cada bloque anonimo es la suya en este arnes.
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-0000-0000-000000000002","app_metadata":{"memberships":{"t_din":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_din', true);

  begin
    insert into public.payments (tenant_id,appointment_id,amount,method)
      values ('t_din','ap-normal',250000,'efectivo');
  exception when others then v_falló := true;
  end;

  if not v_falló then
    raise exception 'AGUJERO: se registro un cobro de 250000 contra una cita de 900';
  end if;
  raise notice 'ok · un cobro no puede exceder el importe de la cita';
end $$;

-- Pero el ABONO si: un consultorio cobra en partes.
do $$
declare v_suma numeric; v_falló boolean := false;
begin
  -- Las claims se fijan en CADA bloque: set_config(...,true) es local a
  -- la transaccion y cada bloque anonimo es la suya en este arnes.
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-0000-0000-000000000002","app_metadata":{"memberships":{"t_din":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_din', true);

  insert into public.payments (tenant_id,appointment_id,amount,method)
    values ('t_din','ap-normal',400,'transferencia');
  insert into public.payments (tenant_id,appointment_id,amount,method)
    values ('t_din','ap-normal',500,'tarjeta');

  select coalesce(sum(amount),0) into v_suma
  from public.payments where appointment_id='ap-normal';
  if v_suma <> 900 then
    raise exception 'BLOQUEA DE MAS: los dos abonos suman % y debian sumar 900', v_suma;
  end if;
  raise notice 'ok · se puede cobrar en partes hasta completar el importe';

  -- El que pasa del saldo restante si se rechaza.
  begin
    insert into public.payments (tenant_id,appointment_id,amount,method)
      values ('t_din','ap-normal',1,'efectivo');
  exception when others then v_falló := true;
  end;
  if not v_falló then
    raise exception 'AGUJERO: entro un cobro sobre una cita ya saldada';
  end if;
  raise notice 'ok · una cita saldada no admite otro cobro';
end $$;

-- Corregir un cobro A LA BAJA no se rechaza a si mismo: la fila propia no
-- se cuenta dos veces al sumar lo ya pagado.
do $$
declare v_monto numeric;
begin
  -- Las claims se fijan en CADA bloque: set_config(...,true) es local a
  -- la transaccion y cada bloque anonimo es la suya en este arnes.
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-0000-0000-000000000002","app_metadata":{"memberships":{"t_din":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_din', true);

  update public.payments set amount = 300
  where appointment_id='ap-normal' and amount = 400;

  select amount into v_monto
  from public.payments where appointment_id='ap-normal' and amount = 300;
  if v_monto is distinct from 300 then
    raise exception 'BLOQUEA DE MAS: no se pudo corregir un cobro a la baja';
  end if;
  raise notice 'ok · un cobro se puede corregir a la baja';
end $$;

-- La cita de prueba para el caso "sin importe".
do $$
begin
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-0000-0000-000000000002","app_metadata":{"memberships":{"t_din":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_din', true);

  insert into public.appointments (tenant_id,id,service_id,therapist_id,appointment_date,
    appointment_time,customer_name,customer_email,customer_phone,duration_minutes)
    values ('t_din','ap-sin','sv-cero','th-din','2026-12-02','16:30','Pac Sin','sin@ex.mx','5511111111',50);
end $$;

-- Una cita sin importe no se cobra a ciegas.
--
-- Su servicio vale 0 en el catalogo, asi que el trigger congela 0: es
-- exactamente la cita que sale en $0.00 en pantalla. El saldo es cero y
-- cualquier cobro contra ella se rechaza.
do $$
declare v_falló boolean := false;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"d0000000-0000-0000-0000-000000000002","app_metadata":{"memberships":{"t_din":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_din', true);

  begin
    insert into public.payments (tenant_id,appointment_id,amount,method)
      values ('t_din','ap-sin',100,'efectivo');
  exception when others then v_falló := true;
  end;

  if not v_falló then
    raise exception 'AGUJERO: se cobro una cita cuyo importe es cero';
  end if;
  raise notice 'ok · una cita sin importe (catalogo en cero) no se puede cobrar';
end $$;

reset role;
