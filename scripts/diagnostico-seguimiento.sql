-- ===========================================================================
-- SEGUIMIENTO del diagnostico  ·  SOLO LECTURA
-- ===========================================================================
--
-- Tres preguntas que el primer diagnostico dejo abiertas y que deciden el
-- alcance. No borra nada: son SELECT.
--
--   1. Que son los tenants que NO son 'brainpsi'. Sus nombres coinciden
--      con fixtures de tests/tenancy/0014_login_identifier.sql, que se
--      supone corren contra un Postgres desechable. Si son eso, hay datos
--      de prueba en la base real y eso pesa mas que el catalogo de demo.
--   2. Que historial cuelga de t1 y t3, y si el encuentro de t1 tiene una
--      NOTA CLINICA. Una nota firmada es inmutable por diseño (0013): ni
--      se edita ni se borra, asi que decide si ese doctor puede tocarse.
--   3. Quien tiene acceso a esos tenants.
--
-- PROBADO contra un Postgres desechable con el esquema hasta 0029. La
-- primera version reventaba con  invalid input syntax for type uuid: "?"
-- porque concatenaba patient_id (uuid) con un texto. Ese es el motivo de
-- probarlo antes de entregarlo.
-- ===========================================================================

select '1 · TENANTS' as seccion,
       t.id as clave,
       t.name as detalle,
       'plan=' || coalesce(t.plan,'?') || ' · estado=' || coalesce(t.status,'?')
         || ' · alta ' || to_char(t.created_at,'YYYY-MM-DD HH24:MI') as extra,
       (select count(*) from public.tenant_members m where m.tenant_id = t.id)::text
         || ' miembros · '
         || (select count(*) from public.therapists th where th.tenant_id = t.id)::text
         || ' terapeutas · '
         || (select count(*) from public.appointments a where a.tenant_id = t.id)::text
         || ' citas' as contenido
from public.tenants t

union all

select '2 · MIEMBROS',
       m.tenant_id,
       coalesce(u.email,'(sin correo en auth.users)'),
       'rol=' || m.role || ' · ' || case when m.active then 'activo' else 'inactivo' end,
       'user_id=' || m.user_id::text
from public.tenant_members m
left join auth.users u on u.id = m.user_id

union all

select '3 · CITAS DE t1/t3',
       a.therapist_id,
       a.customer_name || ' · ' || a.appointment_date || ' ' || a.appointment_time,
       'estado=' || a.status || ' · servicio=' || coalesce(a.service_id,'?')
         || ' · $' || coalesce(a.price::text,'sin precio'),
       'alta ' || to_char(a.created_at,'YYYY-MM-DD')
from public.appointments a
where a.tenant_id = 'brainpsi' and a.therapist_id in ('t1','t3')

union all

select '4 · ENCUENTROS',
       e.therapist_id,
       'encuentro ' || e.id || ' · paciente ' || coalesce(e.patient_id::text,'?'),
       'estado=' || e.status || ' · inicio ' || to_char(e.started_at,'YYYY-MM-DD HH24:MI'),
       -- Lo decisivo: si hay nota, y si esta FIRMADA. Una nota firmada no
       -- se puede editar ni borrar, ni siquiera por su autor.
       coalesce((
         select 'notas=' || count(*)
                || ' · firmadas=' || count(*) filter (where n.signed_at is not null)
                || ' · bloqueadas=' || count(*) filter (where n.locked)
           from public.clinical_notes n
          where n.tenant_id = e.tenant_id and n.encounter_id = e.id
       ), 'notas=0')
from public.encounters e
where e.tenant_id = 'brainpsi'

order by seccion, clave, detalle;
