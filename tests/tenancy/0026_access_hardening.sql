-- ===========================================================================
-- GUARD: esto es una PRUEBA. No se corre contra una base real.
-- ===========================================================================
do $guard$
begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception using
      message = 'ABORTADO: archivo de PRUEBA ejecutado fuera del banco desechable.',
      detail  = 'No existe la marca public.__banco_desechable, que solo crea tests/tenancy/run.sh en el contenedor que levanta.',
      hint    = 'Corre ./tests/tenancy/run.sh. Si estas viendo esto en el editor de Supabase: PARA, estas en una base real.';
  end if;
end
$guard$;

-- 0035 · Permisos desde la tabla, fichas con expediente congeladas,
-- fechas clinicas del servidor, bitacora sin contenido clinico.
--
-- Cada bloque reproduce un ataque de la auditoria del 2026-10-09 y exige
-- que hoy falle. Las sesiones llevan el claim COMPLETO a proposito: el
-- defecto era justamente que el claim bastaba.

insert into public.tenants (id,name) values ('t_ah','Clinica Endurecida');
insert into auth.users (id,email) values
  ('ab000000-0000-0000-0000-0000000000d1','doc.ah@ex.mx'),
  ('ab000000-0000-0000-0000-0000000000d2','intruso.ah@ex.mx'),
  ('ab000000-0000-0000-0000-0000000000f1','owner.ah@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role,therapist_id) values
  ('t_ah','ab000000-0000-0000-0000-0000000000d1','doctor','th-ah'),
  ('t_ah','ab000000-0000-0000-0000-0000000000f1','owner',null);
insert into public.therapists (tenant_id,id,name,user_id) values
  ('t_ah','th-ah','Dra. Expediente','ab000000-0000-0000-0000-0000000000d1');
insert into public.patients (tenant_id,id,full_name,email,phone) values
  ('t_ah','ab000000-0000-0000-0000-0000000000a1','Paciente AH','pah@ex.mx','8111111111');
insert into public.encounters (tenant_id,id,patient_id,therapist_id,status) values
  ('t_ah','ab000000-0000-0000-0000-0000000000e1','ab000000-0000-0000-0000-0000000000a1','th-ah','completed');
insert into public.clinical_notes (tenant_id,id,encounter_id,patient_id,author_id,content)
values ('t_ah','ab000000-0000-0000-0000-0000000000c1','ab000000-0000-0000-0000-0000000000e1',
        'ab000000-0000-0000-0000-0000000000a1','ab000000-0000-0000-0000-0000000000d1',
        '{"texto":"Nota de la doctora"}');

grant usage on schema public to authenticated;
grant select, insert, update on public.clinical_notes to authenticated;
grant select, insert on public.note_addenda to authenticated;
grant select on public.encounters to authenticated;

create or replace function pg_temp.sesion(p_user text, p_rol text, p_ficha text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user,
      'app_metadata', json_build_object(
        'memberships', json_build_object('t_ah', p_rol),
        'therapist_ids', case when p_ficha is null then '{}'::json else json_build_object('t_ah', p_ficha) end))::text, true);
  perform set_config('request.tenant','t_ah', true);
end $$;

-- 1 · LINEA BASE: la doctora lee su nota. Sin esto, un cero abajo no
--     probaria nada.
do $$
declare v_n integer;
begin
  set local role authenticated;
  perform pg_temp.sesion('ab000000-0000-0000-0000-0000000000d1','doctor','th-ah');
  select count(*) into v_n from public.clinical_notes;
  if v_n <> 1 then raise exception 'FALLA DE LA PRUEBA: la linea base no ve su nota (% filas)', v_n; end if;
  raise notice 'ok · linea base: la doctora ve su nota';
end $$;

-- 2 · Revocada, su token todavia vigente ya NO le sirve (S8).
do $$
declare v_n integer;
begin
  update public.tenant_members set active = false
   where tenant_id='t_ah' and user_id='ab000000-0000-0000-0000-0000000000d1';
  set local role authenticated;
  perform pg_temp.sesion('ab000000-0000-0000-0000-0000000000d1','doctor','th-ah');
  select count(*) into v_n from public.clinical_notes;
  if v_n <> 0 then
    raise exception 'FUGA: revocada, con el token viejo siguio leyendo % notas', v_n;
  end if;
  raise notice 'ok · revocar corta el acceso clinico al instante';
end $$;
update public.tenant_members set active = true
 where tenant_id='t_ah' and user_id='ab000000-0000-0000-0000-0000000000d1';

-- 3 · El rol sale de la tabla: un dueño degradado deja de serlo aunque
--     su claim diga 'owner'.
do $$
declare v_rol text;
begin
  update public.tenant_members set role = 'admin_cafe'
   where tenant_id='t_ah' and user_id='ab000000-0000-0000-0000-0000000000f1';
  set local role authenticated;
  perform pg_temp.sesion('ab000000-0000-0000-0000-0000000000f1','owner',null);
  v_rol := public.current_tenant_role();
  if v_rol <> 'admin_cafe' then
    raise exception 'FUGA: degradado en la tabla, el claim lo seguia haciendo %', v_rol;
  end if;
  raise notice 'ok · el rol sale de tenant_members, no del claim';
end $$;
update public.tenant_members set role = 'owner'
 where tenant_id='t_ah' and user_id='ab000000-0000-0000-0000-0000000000f1';

-- 4 · Un claim que dice otra ficha no la abre: la ficha sale de la tabla.
do $$
declare v_n integer;
begin
  insert into public.tenant_members (tenant_id,user_id,role,therapist_id)
    values ('t_ah','ab000000-0000-0000-0000-0000000000d2','doctor',null);
  set local role authenticated;
  perform pg_temp.sesion('ab000000-0000-0000-0000-0000000000d2','doctor','th-ah');
  select count(*) into v_n from public.clinical_notes;
  if v_n <> 0 then
    raise exception 'FUGA: un claim con la ficha ajena abrio % notas', v_n;
  end if;
  raise notice 'ok · la ficha del claim no cuenta si la tabla no la respalda';
end $$;

-- 5 · Ligar la ficha con expediente a OTRA cuenta se rechaza, por las dos
--     vias (S2): la membresia y el catalogo de terapeutas.
do $$
begin
  begin
    update public.tenant_members set therapist_id = 'th-ah'
     where tenant_id='t_ah' and user_id='ab000000-0000-0000-0000-0000000000d2';
    raise exception 'FUGA: la ficha con expediente paso a otra cuenta por tenant_members';
  exception when others then
    if position('notas clinicas de otra persona' in sqlerrm) = 0 then raise; end if;
  end;
  begin
    update public.therapists set user_id = 'ab000000-0000-0000-0000-0000000000d2'
     where tenant_id='t_ah' and id='th-ah';
    raise exception 'FUGA: la ficha con expediente paso a otra cuenta por therapists';
  exception when others then
    if position('notas clinicas de otra persona' in sqlerrm) = 0 then raise; end if;
  end;
  raise notice 'ok · una ficha con expediente no cambia de dueño';
end $$;

-- 6 · Reincorporar a la MISMA especialista si funciona.
do $$
begin
  delete from public.tenant_members where tenant_id='t_ah' and user_id='ab000000-0000-0000-0000-0000000000d1';
  update public.therapists set user_id = null where tenant_id='t_ah' and id='th-ah';
  insert into public.tenant_members (tenant_id,user_id,role,therapist_id)
    values ('t_ah','ab000000-0000-0000-0000-0000000000d1','doctor','th-ah');
  update public.therapists set user_id = 'ab000000-0000-0000-0000-0000000000d1' where tenant_id='t_ah' and id='th-ah';
  raise notice 'ok · reincorporar a la misma especialista funciona';
end $$;

-- 7 · Las fechas clinicas las pone el servidor (S7).
do $$
declare v_creada timestamptz; v_firmada timestamptz;
begin
  set local role authenticated;
  perform pg_temp.sesion('ab000000-0000-0000-0000-0000000000d1','doctor','th-ah');

  -- No se puede crear una nota ya firmada.
  begin
    insert into public.clinical_notes (tenant_id,encounter_id,patient_id,author_id,content,signed_by,signed_at)
    values ('t_ah','ab000000-0000-0000-0000-0000000000e1','ab000000-0000-0000-0000-0000000000a1',
            'ab000000-0000-0000-0000-0000000000d1','{"texto":"x"}',
            'ab000000-0000-0000-0000-0000000000d1','2024-01-01');
    raise exception 'FUGA: se creo una nota ya firmada con fecha de 2024';
  exception when others then
    if position('no puede nacer firmada' in sqlerrm) = 0 then raise; end if;
  end;

  -- La fecha de creacion que manda el cliente se ignora.
  insert into public.clinical_notes (tenant_id,id,encounter_id,patient_id,author_id,content,created_at)
  values ('t_ah','ab000000-0000-0000-0000-0000000000c9','ab000000-0000-0000-0000-0000000000e1',
          'ab000000-0000-0000-0000-0000000000a1','ab000000-0000-0000-0000-0000000000d1',
          '{"texto":"borrador"}','2024-01-01');
  -- Y la de firma tambien.
  update public.clinical_notes
     set signed_by = 'ab000000-0000-0000-0000-0000000000d1', signed_at = '2024-01-01'
   where tenant_id='t_ah' and id='ab000000-0000-0000-0000-0000000000c9';

  select created_at, signed_at into v_creada, v_firmada
    from public.clinical_notes where tenant_id='t_ah' and id='ab000000-0000-0000-0000-0000000000c9';
  if v_creada < now() - interval '1 minute' or v_firmada < now() - interval '1 minute' then
    raise exception 'FUGA: la nota quedo con fechas del cliente (creada %, firmada %)', v_creada, v_firmada;
  end if;
  raise notice 'ok · creacion y firma fechadas por el servidor';
end $$;

-- 8 · La bitacora de un encuentro guarda QUE cambio, no el contenido (S11).
do $$
declare v_n integer;
begin
  update public.encounters set status = 'in_progress'
   where tenant_id='t_ah' and id='ab000000-0000-0000-0000-0000000000e1';
  select count(*) into v_n from public.audit_log
   where table_name = 'encounters' and (old_data is not null or new_data is not null);
  if v_n > 0 then
    raise exception 'FUGA: % entradas de la bitacora guardan el contenido de un encuentro', v_n;
  end if;
  select count(*) into v_n from public.audit_log
   where table_name = 'encounters' and record_id = 'ab000000-0000-0000-0000-0000000000e1' and changed_fields is not null;
  if v_n = 0 then
    raise exception 'FALLA: el cambio del encuentro ni siquiera quedo en la bitacora';
  end if;
  raise notice 'ok · la bitacora registra el encuentro sin su contenido';
end $$;

-- 9 · La lista de Accesos marca a quien se le puede regenerar la temporal
--     con la MISMA regla que invite-staff: creada aqui y sin estrenar.
insert into auth.users (id,email,raw_app_meta_data,last_sign_in_at) values
  ('ab000000-0000-0000-0000-0000000000b1','nueva.ah@ex.mx','{"created_by_tenant":"t_ah"}', null),
  ('ab000000-0000-0000-0000-0000000000b2','yaentro.ah@ex.mx','{"created_by_tenant":"t_ah"}', now()),
  ('ab000000-0000-0000-0000-0000000000b3','ajena.ah@ex.mx','{}', null);
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_ah','ab000000-0000-0000-0000-0000000000b1','barista'),
  ('t_ah','ab000000-0000-0000-0000-0000000000b2','barista'),
  ('t_ah','ab000000-0000-0000-0000-0000000000b3','barista');

do $$
declare v_si text; v_no text;
begin
  set local role authenticated;
  perform pg_temp.sesion('ab000000-0000-0000-0000-0000000000f1','owner',null);
  select string_agg(email, ',' order by email) filter (where puede_regenerar_temporal),
         string_agg(email, ',' order by email) filter (where not puede_regenerar_temporal)
    into v_si, v_no
    from public.list_tenant_members();
  if v_si is distinct from 'nueva.ah@ex.mx' then
    raise exception 'FALLA: la lista ofrece regenerar a: % (debia ser solo nueva.ah@ex.mx)', v_si;
  end if;
  if position('yaentro.ah@ex.mx' in v_no) = 0 or position('ajena.ah@ex.mx' in v_no) = 0 then
    raise exception 'FUGA: la lista ofrece regenerar la temporal de alguien que ya entro o de una cuenta ajena';
  end if;
  raise notice 'ok · la lista ofrece la temporal solo a cuentas propias sin estrenar';
end $$;
