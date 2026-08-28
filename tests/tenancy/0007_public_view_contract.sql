-- Contrato de la vista publica de terapeutas.
--
-- Dos direcciones, y las dos importan:
--   · debe TENER las columnas que el front consulta — si falta una, la
--     pagina publica no carga (paso con created_at, heredado de Fase 1);
--   · NUNCA debe exponer email, cedula ni user_id — la fuga que la
--     Fase 1 cerro.

do $$
declare v_faltantes text; v_prohibidas text;
begin
  select string_agg(c, ', ') into v_faltantes
  from unnest(array['tenant_id','id','name','specialty','color',
                    'session_duration_minutes','active','created_at']) c
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='therapists_public' and column_name=c
  );
  if v_faltantes is not null then
    raise exception 'FALLA: la vista publica no expone: %', v_faltantes;
  end if;

  select string_agg(column_name, ', ') into v_prohibidas
  from information_schema.columns
  where table_schema='public' and table_name='therapists_public'
    and column_name in ('email','cedula','user_id');
  if v_prohibidas is not null then
    raise exception 'FUGA: la vista publica expone datos sensibles: %', v_prohibidas;
  end if;

  raise notice 'ok · contrato de la vista publica de terapeutas';
end $$;

-- La consulta exacta que hace el front para un visitante sin sesion.
do $$
declare v_n integer;
begin
  set local role anon;
  perform set_config('request.jwt.claims','', true);
  perform set_config('request.tenant','t_a', true);
  select count(*) into v_n from (
    select * from public.therapists_public order by created_at
  ) q;
  raise notice 'ok · el catalogo publico se ordena por created_at (% filas)', v_n;
end $$;
