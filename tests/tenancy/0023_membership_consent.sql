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

-- 0032 · A una clinica se entra aceptando.
--
-- Lo que se prueba NO es que la invitacion se cree: es que MIENTRAS no se
-- acepte, la persona no tenga acceso. Y lo que otorga acceso en este
-- sistema es el CLAIM, no la fila -de las 49 policies solo dos miran
-- tenant_members-, asi que las aserciones miran raw_app_meta_data.

insert into public.tenants (id,name) values ('t_inv','Clinica Invitadora'),('t_suy','Su Clinica');
insert into auth.users (id,email) values
  ('c5000000-0000-0000-0000-0000000000aa','inv.dueno@ex.mx'),
  ('c5000000-0000-0000-0000-0000000000bb','inv.ajena@otra.com'),
  ('c5000000-0000-0000-0000-0000000000cc','inv.dentro@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role,active) values
  ('t_inv','c5000000-0000-0000-0000-0000000000aa','owner',true),
  ('t_inv','c5000000-0000-0000-0000-0000000000cc','barista',true),
  ('t_suy','c5000000-0000-0000-0000-0000000000bb','owner',true);

-- La invitada YA tiene su propia clinica en el claim. Sin esto, la
-- asercion de que aceptar FUSIONA en vez de reemplazar no prueba nada:
-- comprobaria que sigue ausente algo que nunca estuvo.
update auth.users
   set raw_app_meta_data = '{"memberships":{"t_suy":"owner"}}'::jsonb
 where id='c5000000-0000-0000-0000-0000000000bb';

grant usage on schema public to authenticated;
grant select on public.tenant_members to authenticated;

create or replace function pg_temp.como(p_uid text, p_tenant text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'app_metadata',
      json_build_object('memberships', json_build_object(p_tenant,'owner')))::text, true);
  perform set_config('request.tenant', p_tenant, true);
end $$;

-- 1 · Nombrar a un ajeno NO le da acceso: no se le toca el claim.
do $$
declare v_claim jsonb; v_activa boolean;
begin
  set local role authenticated;
  perform pg_temp.como('c5000000-0000-0000-0000-0000000000aa','t_inv');
  perform public.set_tenant_member_role('inv.ajena@otra.com','barista');
  reset role;

  select raw_app_meta_data -> 'memberships' -> 't_inv' into v_claim
    from auth.users where id='c5000000-0000-0000-0000-0000000000bb';
  if v_claim is not null then
    raise exception 'FUGA: un tercero le escribio el claim y la metio a su clinica sin permiso (%)', v_claim;
  end if;

  select active into v_activa from public.tenant_members
   where tenant_id='t_inv' and user_id='c5000000-0000-0000-0000-0000000000bb';
  if v_activa is not false then
    raise exception 'FUGA: la membresia quedo activa sin que nadie aceptara (active=%)', v_activa;
  end if;
  raise notice 'ok · nombrar a alguien de fuera lo INVITA, no lo mete';
end $$;

-- 2 · La invitada la ve, y solo la suya.
do $$
declare v_n integer; v_tenant text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"c5000000-0000-0000-0000-0000000000bb"}', true);

  select count(*), min(tenant_id) into v_n, v_tenant from public.my_pending_invitations();
  if v_n <> 1 then
    raise exception 'FALLA: ve % invitaciones, esperaba 1', v_n;
  end if;
  if v_tenant <> 't_inv' then
    raise exception 'FALLA: ve la invitacion equivocada (%)', v_tenant;
  end if;
  raise notice 'ok · la invitada ve su invitacion pendiente, sin contexto de clinica';
end $$;

-- 3 · Y nadie mas la ve. my_pending_invitations es definer: si no colgara
--     de auth.uid() seria un listado de las invitaciones de todos.
do $$
declare v_n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"c5000000-0000-0000-0000-0000000000cc"}', true);
  select count(*) into v_n from public.my_pending_invitations();
  if v_n <> 0 then
    raise exception 'FUGA: otro usuario ve % invitaciones ajenas', v_n;
  end if;
  raise notice 'ok · las invitaciones de uno no las ve nadie mas';
end $$;

-- 4 · Un tercero no puede aceptar por ella. El consentimiento se cae
--     entero si aceptar no exige ser el invitado.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"c5000000-0000-0000-0000-0000000000aa"}', true);
  begin
    perform public.accept_tenant_invitation('t_inv');
    raise exception 'FUGA: el dueño acepto la invitacion EN NOMBRE de la invitada';
  exception when others then
    if position('No tienes una invitacion pendiente' in sqlerrm) = 0 then raise; end if;
  end;
  raise notice 'ok · nadie puede aceptar una invitacion ajena';
end $$;

-- 5 · Al aceptar ELLA, entonces si.
do $$
declare v_claim text; v_activa boolean; v_pend integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"c5000000-0000-0000-0000-0000000000bb"}', true);
  perform public.accept_tenant_invitation('t_inv');
  reset role;

  select raw_app_meta_data -> 'memberships' ->> 't_inv' into v_claim
    from auth.users where id='c5000000-0000-0000-0000-0000000000bb';
  if v_claim is distinct from 'barista' then
    raise exception 'FALLA: acepto y su claim no dice barista (dijo %)', coalesce(v_claim,'null');
  end if;

  select active into v_activa from public.tenant_members
   where tenant_id='t_inv' and user_id='c5000000-0000-0000-0000-0000000000bb';
  if v_activa is not true then
    raise exception 'FALLA: acepto y la membresia sigue inactiva';
  end if;

  -- Y su clinica propia sigue ahi: el claim se FUSIONA, no se reemplaza.
  -- Pisarlo dejaria a quien atiende en dos consultorios sin acceso al
  -- otro, y el sintoma seria "de pronto no veo a mis pacientes".
  select count(*) into v_pend from auth.users
   where id='c5000000-0000-0000-0000-0000000000bb'
     and raw_app_meta_data -> 'memberships' ->> 't_suy' = 'owner';
  if v_pend <> 1 then
    raise exception 'FALLA: al aceptar la invitacion perdio el acceso a su propia clinica';
  end if;
  raise notice 'ok · al aceptar entra, y conserva su propia clinica';
end $$;

-- 5b · Un doctor invitado no queda ligado a su ficha hasta que acepta.
--      Ligarla antes deja el catalogo diciendo que esa doctora ya es de
--      la casa, y el claim -que es lo que de verdad da acceso- vacio.
do $$
declare v_uid uuid;
begin
  insert into auth.users (id,email) values ('c5000000-0000-0000-0000-0000000000ee','inv.doc@ex.mx');
  insert into public.therapists (tenant_id,id,name,active) values ('t_inv','psq-inv','Dra Invitada',true);

  set local role authenticated;
  perform pg_temp.como('c5000000-0000-0000-0000-0000000000aa','t_inv');
  perform public.set_tenant_member_role('inv.doc@ex.mx','doctor','psq-inv');
  reset role;

  select user_id into v_uid from public.therapists where tenant_id='t_inv' and id='psq-inv';
  if v_uid is not null then
    raise exception 'FALLA: la ficha quedo ligada a alguien que no ha aceptado';
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"c5000000-0000-0000-0000-0000000000ee"}', true);
  perform public.accept_tenant_invitation('t_inv');
  reset role;

  select user_id into v_uid from public.therapists where tenant_id='t_inv' and id='psq-inv';
  if v_uid is distinct from 'c5000000-0000-0000-0000-0000000000ee'::uuid then
    raise exception 'FALLA: acepto y su ficha no quedo ligada (%), asi que no vera a sus pacientes', v_uid;
  end if;
  raise notice 'ok · la ficha se liga al aceptar, no al invitar';
end $$;

-- 6 · A quien YA esta dentro se le cambia el rol al instante. Sin esto,
--     el arreglo habria sido "nadie cambia de rol nunca".
do $$
declare v_claim text;
begin
  set local role authenticated;
  perform pg_temp.como('c5000000-0000-0000-0000-0000000000aa','t_inv');
  perform public.set_tenant_member_role('inv.dentro@ex.mx','admin_cafe');
  reset role;

  select raw_app_meta_data -> 'memberships' ->> 't_inv' into v_claim
    from auth.users where id='c5000000-0000-0000-0000-0000000000cc';
  if v_claim is distinct from 'admin_cafe' then
    raise exception 'FALLA: a un miembro activo no se le pudo cambiar el rol (claim: %)', coalesce(v_claim,'null');
  end if;
  raise notice 'ok · a quien ya acepto estar dentro se le cambia el rol al instante';
end $$;

-- 7 · Una invitacion caducada no deja entrar. Se envejece la fila a 8
--     dias, que es el unico modo de probar una caducidad sin esperarla.
do $$
declare v_claim jsonb;
begin
  insert into auth.users (id,email) values ('c5000000-0000-0000-0000-0000000000dd','inv.tarde@ex.mx');
  set local role authenticated;
  perform pg_temp.como('c5000000-0000-0000-0000-0000000000aa','t_inv');
  perform public.set_tenant_member_role('inv.tarde@ex.mx','barista');
  reset role;

  update public.tenant_members set invited_at = now() - interval '8 days'
   where tenant_id='t_inv' and user_id='c5000000-0000-0000-0000-0000000000dd';

  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"c5000000-0000-0000-0000-0000000000dd"}', true);
  begin
    perform public.accept_tenant_invitation('t_inv');
    raise exception 'FUGA: entro con una invitacion caducada';
  exception when others then
    if position('caduco' in sqlerrm) = 0 then raise; end if;
  end;
  reset role;

  select raw_app_meta_data -> 'memberships' -> 't_inv' into v_claim
    from auth.users where id='c5000000-0000-0000-0000-0000000000dd';
  if v_claim is not null then
    raise exception 'FUGA: la caducada rebotó pero el claim se escribio igual';
  end if;
  raise notice 'ok · una invitacion de mas de 7 dias no deja entrar';
end $$;

-- 8 · Rechazar la borra, y despues ya no hay nada que aceptar.
do $$
declare v_n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims','{"sub":"c5000000-0000-0000-0000-0000000000dd"}', true);
  perform public.decline_tenant_invitation('t_inv');
  select count(*) into v_n from public.my_pending_invitations();
  if v_n <> 0 then
    raise exception 'FALLA: rechazo y la invitacion sigue ahi';
  end if;
  begin
    perform public.accept_tenant_invitation('t_inv');
    raise exception 'FUGA: acepto una invitacion que habia rechazado';
  exception when others then
    if position('No tienes una invitacion pendiente' in sqlerrm) = 0 then raise; end if;
  end;
  raise notice 'ok · rechazar la borra y no se puede aceptar despues';
end $$;
