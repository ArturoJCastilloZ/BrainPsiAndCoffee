-- ===========================================================================
-- DIAGNOSTICO de los datos de demostracion  ·  SOLO LECTURA
-- ===========================================================================
--
-- Que es: un inventario de lo que en la base quedo sembrado desde data.js,
-- y de QUE CUELGA de cada fila. No borra nada, no modifica nada: son
-- SELECT. Pegalo entero en el editor SQL de Supabase y ejecutalo.
--
-- Por que una sola consulta y no varias: el editor de Supabase solo
-- muestra el resultado de la ULTIMA sentencia. Varias separadas por ';'
-- corren, pero solo se ve una. Por eso va todo unido con union all.
--
-- Por que importa el detalle y no solo el conteo: un id con pinta de demo
-- NO prueba que la fila sea de demo. Si en algun momento se renombro 't1'
-- y se le ligo una cuenta real, esa fila es un doctor de verdad con un id
-- feo. Por eso cada fila trae nombre, correo y si tiene cuenta ligada:
-- para que la decision la tomes mirando, no contando.
--
-- La columna VEREDICTO sale de las REGLAS DE BORRADO reales del catalogo,
-- no de "tiene llave foranea". Medidas en la base:
--
--   appointments, encounters, order_items ...... NO ACTION -> BLOQUEAN
--   therapist_schedules, therapist_services .... CASCADE   -> se borran SOLOS
--   appointment_notifications .................. SET NULL  -> se desligan
--
-- La diferencia importa: "tiene 5 horarios" NO impide borrar al doctor,
-- esos horarios desaparecen en silencio. Lo que si bloquea es el
-- HISTORIAL —citas, encuentros, lineas de pedido— y que bloquee es bueno.
--
-- PROBADO antes de entregarlo: se levanto un Postgres desechable con el
-- esquema base mas las migraciones hasta 0029 —las mismas que corre la
-- suite de aislamiento— se sembro un escenario con las tres situaciones
-- (un id de demo renombrado y con cuenta ligada, uno con cita colgando y
-- uno suelto) y se ejecuto este script contra el. Un diagnostico que
-- revienta en produccion hace perder el tiempo.
-- ===========================================================================

with
-- Los ids que data.js siembra. Si alguno se renombro, no aparecera aqui,
-- y eso tambien es informacion.
ids_servicios as (
  select unnest(array['psi-adultos','psi-infantil','neuro-adultos',
                      'neuro-infantil','pareja','evaluacion']) as id
),
ids_terapeutas as (
  select unnest(array['t1','t2','t3','t4']) as id
),
ids_productos as (
  select unnest(array['h1','h2','h3','h4','h5','h6','c1','c2','c3','c4',
                      'd1','d2','d3','d4','d5','p1','p2']) as id
),
ids_ofertas as (
  select unnest(array['combo-cafe-postre']) as id
),
ids_especialidades as (
  select unnest(array['psicologia-clinica-adultos','psicologia-infantil',
                      'neuropsicologia','pareja-familia']) as id
),

-- --- A · Cuanto hay de cada cosa, por clinica -----------------------------
resumen as (
  select 'A · RESUMEN' as seccion, t.tenant_id, t.tabla, '' as id,
         t.total || ' filas en total, ' || t.demo || ' con id de demostracion' as detalle,
         null::bigint as dependencias, '' as de_donde,
         case when t.demo = 0 then 'limpio'
              when t.demo = t.total then 'TODO el catalogo es de demostracion'
              else 'mezclado: hay filas propias y de demostracion' end as veredicto
  from (
    select tenant_id, 'therapy_services' as tabla, count(*) as total,
           count(*) filter (where id in (select id from ids_servicios)) as demo
      from public.therapy_services group by tenant_id
    union all
    select tenant_id, 'therapists', count(*),
           count(*) filter (where id in (select id from ids_terapeutas))
      from public.therapists group by tenant_id
    union all
    select tenant_id, 'products', count(*),
           count(*) filter (where id in (select id from ids_productos))
      from public.products group by tenant_id
    union all
    select tenant_id, 'offers', count(*),
           count(*) filter (where id in (select id from ids_ofertas))
      from public.offers group by tenant_id
    union all
    select tenant_id, 'specialties', count(*),
           count(*) filter (where id in (select id from ids_especialidades))
      from public.specialties group by tenant_id
  ) t
),

-- --- B · Terapeutas: quien es y que cuelga de el --------------------------
terapeutas as (
  select 'B · TERAPEUTAS' as seccion, th.tenant_id, 'therapists' as tabla, th.id,
         th.name || ' · ' || coalesce(th.email, 'sin correo')
           || ' · cuenta ligada: ' || case when th.user_id is null then 'NO' else 'SI' end
           || ' · ' || case when th.active then 'activo' else 'inactivo' end
           || ' · alta ' || to_char(th.created_at, 'YYYY-MM-DD') as detalle,
         (d.citas + d.encuentros) as dependencias,
         'BLOQUEAN: citas=' || d.citas || ' · encuentros=' || d.encuentros
           || '  ||  EN CASCADA: horarios=' || d.horarios || ' · servicios=' || d.servicios
           || '  ||  SE DESLIGAN: notificaciones=' || d.notificaciones as de_donde,
         case
           when th.user_id is not null
             then 'NO BORRAR SIN MIRAR: tiene cuenta ligada, puede ser un doctor real'
           when (d.citas + d.encuentros) > 0
             then 'BLOQUEADO por historial (' || (d.citas + d.encuentros) || '): el borrado rebota, y esta bien'
           when (d.horarios + d.servicios) > 0
             then 'se puede borrar, PERO arrastra en cascada ' || (d.horarios + d.servicios) || ' filas de configuracion'
           else 'se puede borrar sin arrastrar nada'
         end as veredicto
  from public.therapists th
  cross join lateral (
    select
      (select count(*) from public.appointments a
         where a.tenant_id = th.tenant_id and a.therapist_id = th.id) as citas,
      (select count(*) from public.encounters e
         where e.tenant_id = th.tenant_id and e.therapist_id = th.id) as encuentros,
      (select count(*) from public.therapist_schedules s
         where s.tenant_id = th.tenant_id and s.therapist_id = th.id) as horarios,
      (select count(*) from public.therapist_services ts
         where ts.tenant_id = th.tenant_id and ts.therapist_id = th.id) as servicios,
      (select count(*) from public.appointment_notifications n
         where n.tenant_id = th.tenant_id and n.therapist_id = th.id) as notificaciones
  ) d
  where th.id in (select id from ids_terapeutas)
),

-- --- C · Servicios --------------------------------------------------------
servicios as (
  select 'C · SERVICIOS' as seccion, s.tenant_id, 'therapy_services' as tabla, s.id,
         s.name || ' · ' || s.duration_minutes || ' min · $' || s.price
           || ' · ' || case when s.active then 'activo' else 'inactivo' end as detalle,
         d.citas as dependencias,
         'BLOQUEAN: citas=' || d.citas
           || '  ||  EN CASCADA: terapeutas habilitados=' || d.ligados as de_donde,
         case when d.citas > 0
              then 'BLOQUEADO por historial (' || d.citas || ' citas): el borrado rebota'
              when d.ligados > 0
              then 'se puede borrar, PERO arrastra en cascada ' || d.ligados || ' vinculos de terapeuta'
              else 'se puede borrar sin arrastrar nada' end as veredicto
  from public.therapy_services s
  cross join lateral (
    select
      (select count(*) from public.appointments a
         where a.tenant_id = s.tenant_id and a.service_id = s.id) as citas,
      (select count(*) from public.therapist_services ts
         where ts.tenant_id = s.tenant_id and ts.service_id = s.id) as ligados
  ) d
  where s.id in (select id from ids_servicios)
),

-- --- D · Productos del menu ----------------------------------------------
productos as (
  select 'D · PRODUCTOS' as seccion, p.tenant_id, 'products' as tabla, p.id,
         p.name || ' · ' || p.category || ' · $' || p.price
           || ' · ' || case when p.active then 'activo' else 'inactivo' end as detalle,
         d.lineas as dependencias,
         'lineas de pedido=' || d.lineas as de_donde,
         case when d.lineas > 0
              then 'BLOQUEADO por historial (' || d.lineas || ' lineas de pedido): el borrado rebota'
              else 'se puede borrar sin arrastrar nada' end as veredicto
  from public.products p
  cross join lateral (
    select (select count(*) from public.order_items oi
              where oi.tenant_id = p.tenant_id and oi.product_id = p.id) as lineas
  ) d
  where p.id in (select id from ids_productos)
),

-- --- E · Ofertas y especialidades ----------------------------------------
--
-- Ninguna llave foranea apunta aqui, asi que un DELETE no rebota. OJO con
-- las especialidades: therapists.specialty guarda el NOMBRE, no el id, asi
-- que borrar una NO da error pero deja a los doctores con el texto viejo.
otros as (
  select 'E · OFERTAS' as seccion, o.tenant_id, 'offers' as tabla, o.id,
         o.name || ' · $' || o.price as detalle,
         0::bigint, 'sin llaves foraneas apuntando aqui' as de_donde,
         'se puede borrar sin arrastrar nada' as veredicto
  from public.offers o where o.id in (select id from ids_ofertas)
  union all
  select 'E · ESPECIALIDADES', e.tenant_id, 'specialties', e.id,
         e.name as detalle,
         (select count(*) from public.therapists th
            where th.tenant_id = e.tenant_id and th.specialty = e.name)::bigint,
         'doctores con ese texto en specialty=' ||
           (select count(*) from public.therapists th
              where th.tenant_id = e.tenant_id and th.specialty = e.name) as de_donde,
         case when (select count(*) from public.therapists th
                      where th.tenant_id = e.tenant_id and th.specialty = e.name) > 0
              then 'no rebota (es texto, no llave), pero deja el texto huerfano en esos doctores'
              else 'se puede borrar sin arrastrar nada' end
  from public.specialties e where e.id in (select id from ids_especialidades)
)

select * from resumen
union all select * from terapeutas
union all select * from servicios
union all select * from productos
union all select * from otros
order by seccion, tenant_id, id;
