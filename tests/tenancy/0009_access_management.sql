-- Administracion de accesos (migracion 0011).
--
-- Estas funciones OTORGAN PERMISOS y escriben en auth.users, y quedan
-- expuestas al navegador. Se prueban por abuso, no por uso: lo que
-- importa es lo que NO deben dejar hacer.

insert into public.tenants (id,name) values ('t_acc_a','Clinica A'),('t_acc_b','Clinica B');
insert into auth.users (id,email) values
  ('acc00000-0000-0000-0000-00000000000a','acc.dueno@ex.mx'),
  ('acc00000-0000-0000-0000-00000000000b','acc.staff@ex.mx'),
  ('acc00000-0000-0000-0000-00000000000c','acc.otro@ex.mx'),
  ('acc00000-0000-0000-0000-00000000000d','acc.ajeno@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_acc_a','acc00000-0000-0000-0000-00000000000a','owner'),
  ('t_acc_a','acc00000-0000-0000-0000-00000000000b','barista'),
  ('t_acc_b','acc00000-0000-0000-0000-00000000000d','owner');

-- La prueba se otorga lo que necesita: depender de los grants que dejo
-- otro archivo la volvia dependiente del orden de ejecucion, y ese fue el
-- motivo de que fallara de forma distinta corriendo sola y en la suite.
grant usage on schema public to authenticated;
grant select on public.tenant_members to authenticated;

-- Sesion del dueño de A.
create or replace function pg_temp.como_dueno() returns void language sql as $$
  select set_config('request.jwt.claims',
    '{"sub":"acc00000-0000-0000-0000-00000000000a","app_metadata":{"memberships":{"t_acc_a":"owner"}}}', true),
         set_config('request.tenant','t_acc_a', true);
$$;

do $$
declare v_n integer; v_role text;
begin
  set local role authenticated;
  perform pg_temp.como_dueno();

  -- Uso legitimo: ve a los miembros de SU clinica y solo de la suya.
  select count(*) into v_n from public.list_tenant_members();
  if v_n <> 2 then
    raise exception 'FALLA: el dueño ve % miembros, esperaba 2', v_n;
  end if;
  if exists (select 1 from public.list_tenant_members() where email = 'acc.ajeno@ex.mx') then
    raise exception 'FUGA: vio a un miembro de otra clinica';
  end if;

  -- Uso legitimo: cambiar el rol de otro.
  perform public.set_tenant_member_role('acc.staff@ex.mx','admin_cafe');
  select role into v_role from public.tenant_members
   where tenant_id='t_acc_a' and user_id='acc00000-0000-0000-0000-00000000000b';
  if v_role is distinct from 'admin_cafe' then
    raise exception 'FALLA: no aplico el cambio de rol (quedo %)', v_role;
  end if;

  -- ATAQUE: cambiarse el rol a uno mismo.
  begin
    perform public.set_tenant_member_role('acc.dueno@ex.mx','barista');
    raise exception 'FUGA: pudo cambiar su propio rol';
  exception when others then
    if position('tu propio rol' in sqlerrm) = 0 then raise; end if;
  end;

  -- ATAQUE: quedarse sin dueño degradandose via otro camino no aplica,
  -- pero degradar al UNICO owner si debe bloquearse. Se nombra a otro y
  -- recien entonces se permite.
  begin
    perform public.revoke_tenant_member('acc00000-0000-0000-0000-00000000000a');
    raise exception 'FUGA: se quito a si mismo el acceso';
  exception when others then
    if position('a ti mismo' in sqlerrm) = 0 then raise; end if;
  end;

  -- ATAQUE: rol inventado.
  begin
    perform public.set_tenant_member_role('acc.staff@ex.mx','superusuario');
    raise exception 'FUGA: acepto un rol que no existe';
  exception when others then
    if position('Rol no valido' in sqlerrm) = 0 then raise; end if;
  end;

  -- ATAQUE: dar acceso a un correo inexistente.
  begin
    perform public.set_tenant_member_role('acc.fantasma@ex.mx','doctor');
    raise exception 'FUGA: dio acceso a un correo que no existe';
  exception when others then
    if position('No existe ningun usuario' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'ok · el dueño administra su clinica y no puede abusar';
end $$;

-- ATAQUE: un miembro que NO es owner intenta administrar.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"acc00000-0000-0000-0000-00000000000b","app_metadata":{"memberships":{"t_acc_a":"admin_cafe"}}}', true);
  perform set_config('request.tenant','t_acc_a', true);

  begin
    perform public.list_tenant_members();
    raise exception 'FUGA: un no-dueño listo los accesos';
  exception when others then
    if position('Solo el dueño' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.set_tenant_member_role('acc.staff@ex.mx','owner');
    raise exception 'FUGA: un no-dueño se auto-ascendio';
  exception when others then
    if position('Solo el dueño' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'ok · un no-dueño no administra accesos';
end $$;

-- ATAQUE: el dueño de A apunta su header a la clinica B.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"acc00000-0000-0000-0000-00000000000a","app_metadata":{"memberships":{"t_acc_a":"owner"}}}', true);
  perform set_config('request.tenant','t_acc_b', true);
  begin
    perform public.set_tenant_member_role('acc.ajeno@ex.mx','barista');
    raise exception 'FUGA: administro accesos de una clinica ajena';
  exception when others then
    if position('clinica activa' in sqlerrm) = 0
       and position('Solo el dueño' in sqlerrm) = 0 then raise; end if;
  end;
  raise notice 'ok · no se administran accesos de una clinica ajena';
end $$;

-- El ultimo dueño no se puede degradar ni quitar.
do $$
begin
  set local role authenticated;
  perform pg_temp.como_dueno();

  perform public.set_tenant_member_role('acc.otro@ex.mx','owner');

  set local role postgres;
  perform set_config('request.jwt.claims',
    '{"sub":"acc00000-0000-0000-0000-00000000000c","app_metadata":{"memberships":{"t_acc_a":"owner"}}}', true);
  perform set_config('request.tenant','t_acc_a', true);
  set local role authenticated;

  -- Ahora hay dos dueños: degradar a uno si se permite.
  perform public.set_tenant_member_role('acc.dueno@ex.mx','admin_consultorio');

  -- Y quedando uno solo, ya no.
  begin
    perform public.set_tenant_member_role('acc.otro@ex.mx','barista');
    raise exception 'FUGA: se degrado al ultimo dueño';
  exception when others then
    if position('tu propio rol' in sqlerrm) > 0 then null;
    elsif position('unico dueño' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'ok · la clinica nunca se queda sin dueño';
end $$;

-- Vinculo doctor ↔ ficha de terapeuta (migracion 0015).
--
-- Un doctor sin ficha es un rol inservible: current_therapist_id() queda
-- vacio y todas las policies clinicas lo rechazan, con un error que no
-- apunta a la causa. Se exige la ficha al asignarlo.
do $$
declare v_ficha text; v_meta jsonb;
begin
  insert into public.therapists (tenant_id,id,name) values
    ('t_acc_a','th-uno','Dra. Uno'), ('t_acc_a','th-dos','Dr. Dos');

  -- El bloque anterior degrado al dueño original y dejo a acc.otro como
  -- unico owner: se actua como el, no como quien ya no manda.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"acc00000-0000-0000-0000-00000000000c","app_metadata":{"memberships":{"t_acc_a":"owner"}}}', true);
  perform set_config('request.tenant','t_acc_a', true);

  -- Nombrar doctor SIN ficha debe rechazarse.
  begin
    perform public.set_tenant_member_role('acc.staff@ex.mx','doctor');
    raise exception 'FALLA: acepto un doctor sin ficha de terapeuta';
  exception when others then
    if position('necesita una ficha' in sqlerrm) = 0 then raise; end if;
  end;

  -- Con una ficha inexistente, tampoco.
  begin
    perform public.set_tenant_member_role('acc.staff@ex.mx','doctor','no-existe');
    raise exception 'FALLA: acepto una ficha que no existe';
  exception when others then
    if position('No existe la ficha' in sqlerrm) = 0 then raise; end if;
  end;

  -- Con ficha valida: se escribe en la tabla Y en el claim.
  perform public.set_tenant_member_role('acc.staff@ex.mx','doctor','th-uno');

  set local role postgres;
  select therapist_id into v_ficha from public.tenant_members
   where tenant_id='t_acc_a' and user_id='acc00000-0000-0000-0000-00000000000b';
  if v_ficha is distinct from 'th-uno' then
    raise exception 'FALLA: no se guardo la ficha en tenant_members (quedo %)', v_ficha;
  end if;

  select raw_app_meta_data into v_meta from auth.users
   where id='acc00000-0000-0000-0000-00000000000b';
  if v_meta -> 'therapist_ids' ->> 't_acc_a' <> 'th-uno' then
    raise exception 'FALLA: no se guardo la ficha en el claim';
  end if;

  -- Dos usuarios sobre la misma ficha se verian las citas y las notas
  -- entre si, porque las policies comparan por therapist_id. Se prueba
  -- con un tercero: sobre uno mismo saltaria antes el guard de no
  -- cambiarse el propio rol.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"acc00000-0000-0000-0000-00000000000c","app_metadata":{"memberships":{"t_acc_a":"owner"}}}', true);
  perform set_config('request.tenant','t_acc_a', true);
  begin
    perform public.set_tenant_member_role('acc.ajeno@ex.mx','doctor','th-uno');
    raise exception 'FUGA: dos usuarios quedaron sobre la misma ficha';
  exception when others then
    if position('ya esta asignada' in sqlerrm) = 0 then raise; end if;
  end;

  -- Al dejar de ser doctor, la ficha se limpia en los dos lados: dejarla
  -- colgando seria un vinculo que nadie lee y que confunde despues.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"acc00000-0000-0000-0000-00000000000c","app_metadata":{"memberships":{"t_acc_a":"owner"}}}', true);
  perform set_config('request.tenant','t_acc_a', true);
  perform public.set_tenant_member_role('acc.staff@ex.mx','barista');

  set local role postgres;
  select therapist_id into v_ficha from public.tenant_members
   where tenant_id='t_acc_a' and user_id='acc00000-0000-0000-0000-00000000000b';
  if v_ficha is not null then
    raise exception 'FALLA: la ficha quedo colgando tras cambiar de rol (%)', v_ficha;
  end if;
  select raw_app_meta_data into v_meta from auth.users
   where id='acc00000-0000-0000-0000-00000000000b';
  if v_meta -> 'therapist_ids' ? 't_acc_a' then
    raise exception 'FALLA: la ficha quedo en el claim tras cambiar de rol';
  end if;

  raise notice 'ok · el doctor queda vinculado a su ficha, y solo el';
end $$;
