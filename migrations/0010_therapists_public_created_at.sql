-- ============================================================
-- 0010 · created_at en la vista publica de terapeutas
--
-- El front ordena el catalogo por created_at
-- (src/api/supabaseData.js:249), y para un visitante sin sesion lee
-- therapists_public, que no expone esa columna. La consulta reventaba
-- con 'column therapists_public.created_at does not exist' y la pagina
-- publica no cargaba.
--
-- Viene de la Fase 1, no de la Fase 2: al sustituir la lectura publica
-- de la tabla por una vista, no se reconciliaron las consultas del front
-- contra las columnas de la vista. Comprobado contra una base con la
-- Fase 1 sola. Es el mismo patron que la reserva con terapeuta, que 0005
-- ya corrigio.
--
-- created_at no es dato sensible: es la fecha de alta del registro, no
-- del paciente. Lo que sigue prohibido aqui es email, cedula y user_id.
-- ============================================================

-- Con 'create or replace' y no 'drop': la policy de alta publica que
-- creo 0005 depende de esta vista, asi que soltarla falla. Replace lo
-- admite porque la columna se agrega AL FINAL, sin reordenar las que ya
-- estaban ni cambiarles el tipo.
create or replace view public.therapists_public
with (security_invoker = false) as
  select tenant_id, id, name, specialty, color, session_duration_minutes,
         active, created_at
  from public.therapists
  where active = true
    and tenant_id = public.current_request_tenant();

comment on view public.therapists_public is
  'Proyeccion publica de terapeutas, acotada al tenant que se visita. NUNCA agregar email, cedula ni user_id.';

revoke all on public.therapists_public from public, anon, authenticated;
grant select on public.therapists_public to anon, authenticated;
