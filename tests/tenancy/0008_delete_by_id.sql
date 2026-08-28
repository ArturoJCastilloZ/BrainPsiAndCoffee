-- Los borrados del front no deben cruzar clinicas.
--
-- supabaseData.js borra por id sin mencionar el tenant:
--   .delete().not('id','is',null)      — "reemplaza todo el catalogo"
--   .delete().notIn('id', ids)         — "borra lo que ya no esta"
--   .delete().eq('id', id)
--
-- Con ids unicos solo dentro de su clinica, eso solo es seguro si RLS
-- acota el DELETE al tenant activo. Se prueba en vez de suponerlo: un
-- borrado mal acotado destruye datos de otro cliente y no hay vuelta.

insert into public.tenants (id,name) values ('t_del_a','A'),('t_del_b','B');
insert into auth.users (id,email) values ('aaaa0000-0000-0000-0000-000000000001','del@ex.mx');
insert into public.tenant_members (tenant_id,user_id,role) values
  ('t_del_a','aaaa0000-0000-0000-0000-000000000001','admin_consultorio');
insert into public.therapy_services (tenant_id,id,name,duration_minutes,price) values
  ('t_del_a','sv','Terapia A',50,900),
  ('t_del_b','sv','Terapia B',50,900);

grant usage on schema public to authenticated;
-- Solo sobre la tabla que esta prueba usa. Un grant amplio aqui deshacia
-- el 'revoke delete' que 0013 hace sobre clinical_notes y dejaba pasar un
-- borrado clinico en la prueba de mas abajo.
grant select, delete on public.therapy_services to authenticated;

do $$
declare v_ajenos integer; v_propios integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"aaaa0000-0000-0000-0000-000000000001","app_metadata":{"memberships":{"t_del_a":"admin_consultorio"}}}', true);
  perform set_config('request.tenant','t_del_a', true);

  -- El patron mas agresivo: "borra todo el catalogo".
  delete from public.therapy_services where id is not null;

  set local role postgres;
  select count(*) into v_ajenos  from public.therapy_services where tenant_id='t_del_b';
  select count(*) into v_propios from public.therapy_services where tenant_id='t_del_a';

  if v_ajenos <> 1 then
    raise exception 'CATASTROFE: el borrado alcanzo la clinica ajena (le quedan % filas)', v_ajenos;
  end if;
  if v_propios <> 0 then
    raise exception 'FALLA: no borro lo propio (% filas)', v_propios;
  end if;

  raise notice 'ok · el borrado masivo se queda dentro de su clinica';
end $$;
