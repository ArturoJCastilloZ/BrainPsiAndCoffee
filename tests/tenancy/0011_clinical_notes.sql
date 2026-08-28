-- Nota clinica firmada: inmutable (migraciones 0012-0014).
--
-- Criterio de aceptacion de la Fase 3: una nota firmada no se puede
-- modificar ni borrar con el token de su PROPIO autor. Se prueba el caso
-- del autor y no el de un tercero porque el tercero ya lo bloquea RLS: lo
-- dificil es que ni quien la escribio pueda reescribir la historia.

insert into public.tenants (id,name) values ('t_cn','Clinica CN');
insert into auth.users (id,email) values
  ('cc000000-0000-0000-0000-0000000000d1','doc.cn@ex.mx'),
  ('cc000000-0000-0000-0000-0000000000d2','otro.doc@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role,therapist_id) values
  ('t_cn','cc000000-0000-0000-0000-0000000000d1','doctor','th-cn'),
  ('t_cn','cc000000-0000-0000-0000-0000000000d2','doctor','th-cn2');
insert into public.therapists (tenant_id,id,name,user_id) values
  ('t_cn','th-cn','Dra. CN','cc000000-0000-0000-0000-0000000000d1'),
  ('t_cn','th-cn2','Dr. Otro','cc000000-0000-0000-0000-0000000000d2');
insert into public.patients (tenant_id,id,full_name,email,phone) values
  ('t_cn','cc000000-0000-0000-0000-0000000000a1','Paciente CN','pcn@ex.mx','5511111111');
insert into public.encounters (tenant_id,id,patient_id,therapist_id,status) values
  ('t_cn','cc000000-0000-0000-0000-0000000000e1','cc000000-0000-0000-0000-0000000000a1','th-cn','completed');
insert into public.clinical_notes (tenant_id,id,encounter_id,patient_id,author_id,content,signed_by,signed_at)
values ('t_cn','cc000000-0000-0000-0000-0000000000c1','cc000000-0000-0000-0000-0000000000e1',
        'cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000d1',
        '{"texto":"Valoracion inicial"}','cc000000-0000-0000-0000-0000000000d1', now());
insert into public.clinical_notes (tenant_id,id,encounter_id,patient_id,author_id,content)
values ('t_cn','cc000000-0000-0000-0000-0000000000c2','cc000000-0000-0000-0000-0000000000e1',
        'cc000000-0000-0000-0000-0000000000a1','cc000000-0000-0000-0000-0000000000d1',
        '{"texto":"Borrador"}');

grant usage on schema public to authenticated;
grant select, insert, update on public.clinical_notes to authenticated;
grant select, insert on public.note_addenda to authenticated;
grant select, insert, update on public.encounters to authenticated;

do $$
declare v_txt text; v_n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"cc000000-0000-0000-0000-0000000000d1","app_metadata":{"memberships":{"t_cn":"doctor"},"therapist_ids":{"t_cn":"th-cn"}}}', true);
  perform set_config('request.tenant','t_cn', true);

  -- ATAQUE: el AUTOR modifica su propia nota firmada.
  begin
    update public.clinical_notes set content = '{"texto":"ALTERADO"}'
     where id = 'cc000000-0000-0000-0000-0000000000c1';
    raise exception 'FUGA: el autor modifico su nota firmada';
  exception when others then
    if position('nota firmada no se modifica' in sqlerrm) = 0 then raise; end if;
  end;

  -- ATAQUE: desfirmarla para poder editarla despues.
  begin
    update public.clinical_notes set signed_at = null, signed_by = null
     where id = 'cc000000-0000-0000-0000-0000000000c1';
    raise exception 'FUGA: pudo desfirmar la nota';
  exception when others then
    if position('nota firmada no se modifica' in sqlerrm) = 0 then raise; end if;
  end;

  -- ATAQUE: borrado logico de una nota firmada. NOM-004 exige conservarla.
  begin
    update public.clinical_notes set deleted_at = now()
     where id = 'cc000000-0000-0000-0000-0000000000c1';
    raise exception 'FUGA: marco como borrada una nota firmada';
  exception when others then
    if position('nota firmada no se modifica' in sqlerrm) = 0 then raise; end if;
  end;

  -- ATAQUE: borrado fisico. Se afirma el RESULTADO y no una forma
  -- concreta de fallo: puede rebotar por falta de permiso, por el
  -- trigger, o quedarse en no-op porque RLS no encuentra la fila. Lo que
  -- no puede pasar, de ninguna de las tres maneras, es que la nota
  -- desaparezca.
  begin
    delete from public.clinical_notes where id = 'cc000000-0000-0000-0000-0000000000c1';
  exception when others then null;
  end;
  select count(*) into v_n from public.clinical_notes
   where id = 'cc000000-0000-0000-0000-0000000000c1';
  if v_n <> 1 then
    raise exception 'CATASTROFE: se borro una nota clinica firmada';
  end if;

  -- El contenido debe seguir intacto: que las escrituras fallen no basta
  -- si alguna alcanzo a aplicarse.
  select content ->> 'texto' into v_txt from public.clinical_notes
   where id = 'cc000000-0000-0000-0000-0000000000c1';
  if v_txt <> 'Valoracion inicial' then
    raise exception 'FUGA: el contenido de la nota firmada cambio a "%"', v_txt;
  end if;

  -- NO bloquear de mas: el borrador propio si se edita y se firma.
  update public.clinical_notes set content = '{"texto":"Borrador corregido"}'
   where id = 'cc000000-0000-0000-0000-0000000000c2';
  update public.clinical_notes
     set signed_by = 'cc000000-0000-0000-0000-0000000000d1', signed_at = now()
   where id = 'cc000000-0000-0000-0000-0000000000c2';

  select locked::text into v_txt from public.clinical_notes
   where id = 'cc000000-0000-0000-0000-0000000000c2';
  if v_txt <> 'true' then
    raise exception 'FALLA: la nota no quedo bloqueada tras firmarla';
  end if;

  -- Y ya firmada, tampoco se toca.
  begin
    update public.clinical_notes set content = '{"texto":"otra vez"}'
     where id = 'cc000000-0000-0000-0000-0000000000c2';
    raise exception 'FUGA: edito la nota que acababa de firmar';
  exception when others then
    if position('nota firmada no se modifica' in sqlerrm) = 0 then raise; end if;
  end;

  -- La unica via legitima: un addendum, que tampoco se edita.
  insert into public.note_addenda (tenant_id, note_id, author_id, content)
  values ('t_cn','cc000000-0000-0000-0000-0000000000c1',
          'cc000000-0000-0000-0000-0000000000d1','{"texto":"Correccion: dosis 25mg"}');

  begin
    update public.note_addenda set content = '{"texto":"alterado"}';
    raise exception 'FUGA: edito un addendum';
  exception when insufficient_privilege then null;
    when others then
      if position('addendum no se edita' in sqlerrm) = 0 then raise; end if;
  end;

  raise notice 'ok · la nota firmada es inmutable incluso para su autor';
end $$;

-- Otro doctor de la MISMA clinica no alcanza notas que no son suyas.
do $$
declare v_n integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"cc000000-0000-0000-0000-0000000000d2","app_metadata":{"memberships":{"t_cn":"doctor"},"therapist_ids":{"t_cn":"th-cn2"}}}', true);
  perform set_config('request.tenant','t_cn', true);

  select count(*) into v_n from public.clinical_notes;
  if v_n <> 0 then
    raise exception 'FUGA: otro doctor leyo % notas ajenas', v_n;
  end if;

  raise notice 'ok · un doctor no lee las notas de otro';
end $$;

-- La administracion sigue sin alcanzar lo clinico (decision de la Fase 1).
do $$
declare v_n integer;
begin
  insert into public.tenant_members (tenant_id,user_id,role) values
    ('t_cn','cc000000-0000-0000-0000-0000000000d2','admin_consultorio')
    on conflict (tenant_id,user_id) do update set role = 'admin_consultorio';

  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"cc000000-0000-0000-0000-0000000000d2","app_metadata":{"memberships":{"t_cn":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_cn', true);

  select count(*) into v_n from public.clinical_notes;
  if v_n <> 0 then
    raise exception 'FUGA: admin_consultorio leyo % notas clinicas', v_n;
  end if;

  raise notice 'ok · la administracion no alcanza las notas clinicas';
end $$;
