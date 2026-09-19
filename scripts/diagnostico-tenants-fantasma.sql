-- ===========================================================================
-- ALCANCE de los tenants FANTASMA  ·  SOLO LECTURA
-- ===========================================================================
--
-- Que son: t_li_a, t_li_b, t_pf1 y t_pf2 NO son clinicas. Salen, literales,
-- de dos archivos de prueba del repo:
--
--   tests/tenancy/0013_profiles_isolation.sql -> t_pf1, t_pf2
--                                                usuarios dddddddd-...
--   tests/tenancy/0014_login_identifier.sql   -> t_li_a, t_li_b
--                                                usuario  ffffffff-...
--
-- Esa suite corre contra un Postgres DESECHABLE en Docker. Que esten en la
-- base real significa que esos dos archivos se ejecutaron contra
-- produccion. Se crearon el 2026-09-18 entre 05:47 y 05:48, con un minuto
-- de diferencia: fue una sola sesion, uno tras otro.
--
-- Este script NO borra: cuenta EXACTAMENTE cuantas filas tocaria un
-- borrado, en CADA tabla. El canon lo exige antes de cualquier mutacion
-- masiva, y con razon: "huerfano" o "de prueba" no es lo mismo que
-- "basura", y el conteo tiene que salir de la base, no de una suposicion.
--
-- Las tablas NO van escritas a mano: se descubren del catalogo buscando
-- las que tienen columna tenant_id. Una lista a mano se queda corta en
-- cuanto alguien agrega una tabla, y aqui quedarse corto es subestimar el
-- alcance justo donde no se puede.
-- ===========================================================================

with fantasmas as (
  select unnest(array['t_li_a','t_li_b','t_pf1','t_pf2']) as tenant_id
),
tablas as (
  select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
   where c.table_schema = 'public'
     and c.column_name = 'tenant_id'
     and t.table_type = 'BASE TABLE'
),
conteos as (
  select f.tenant_id,
         tb.table_name,
         (xpath('/row/c/text()',
                query_to_xml(format('select count(*) as c from public.%I where tenant_id = %L',
                                    tb.table_name, f.tenant_id),
                             false, true, '')))[1]::text::bigint as filas
    from fantasmas f
    cross join tablas tb
)

-- 1 · Por tabla, solo donde hay algo
select '1 · FILAS POR TABLA' as seccion,
       tenant_id as clave,
       table_name as detalle,
       filas::text as cuantas
  from conteos
 where filas > 0

union all

-- 2 · Total por tenant fantasma
select '2 · TOTAL POR TENANT',
       tenant_id,
       '(todas las tablas con tenant_id)',
       sum(filas)::text
  from conteos
 group by tenant_id

union all

-- 3 · Los usuarios que esas pruebas crearon en auth.users.
--     Son cuentas reales del proveedor de autenticacion, no filas de
--     negocio: por eso van aparte. Uno de ellos tiene rol OWNER.
select '3 · USUARIOS DE PRUEBA',
       coalesce(m.tenant_id, '(sin membresia)'),
       u.email || ' · rol=' || coalesce(m.role, '(ninguno)'),
       -- Se usa la fecha de la MEMBRESIA y no la de auth.users: el stub
       -- de las pruebas no tiene created_at en auth.users (el Supabase
       -- real si), asi que validar contra el desechable no cubriria esa
       -- columna. Y ademas esta dice lo que importa: cuando se otorgo el
       -- acceso.
       coalesce('acceso otorgado ' || to_char(m.created_at, 'YYYY-MM-DD HH24:MI'), '(sin membresia)')
  from auth.users u
  left join public.tenant_members m on m.user_id = u.id
 where u.email like '%@ex.mx'
    or u.id::text like 'dddddddd-0000-%'
    or u.id::text like 'ffffffff-0000-%'

union all

-- 4 · Control: que NO se toca. Si esta cifra cambiara, algo va mal.
select '4 · TU CLINICA (no se toca)',
       'brainpsi',
       tb.table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I where tenant_id = %L',
                                  tb.table_name, 'brainpsi'),
                           false, true, '')))[1]::text
  from tablas tb
 where (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I where tenant_id = %L',
                                  tb.table_name, 'brainpsi'),
                           false, true, '')))[1]::text::bigint > 0

order by seccion, clave, detalle;
