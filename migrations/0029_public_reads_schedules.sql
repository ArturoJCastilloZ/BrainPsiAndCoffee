-- ============================================================
-- 0029 · El visitante puede leer el horario de atencion
--
-- Por que hace falta: la pantalla publica de reserva NO usa los horarios
-- que el consultorio configura. Tiene su propio motor con 9:00-19:00 y
-- martes-sabado ESCRITOS A MANO (BookingFlow.jsx, MyBookings.jsx), asi
-- que un consultorio que configure lunes 8:00-13:00 sigue recibiendo
-- reservas martes-sabado 9:00-19:00 — y despues ve esas citas como fuera
-- de horario en su propia rejilla, que si usa el motor bueno.
--
-- La razon de que exista ese motor paralelo esta aqui, en la base:
-- therapist_schedules tiene DOS policies y las dos son `to authenticated`
-- (0016:148 y 0016:155). Con RLS activo y sin policy para anon, el
-- visitante recibe CERO filas. El front no hardcodeo el horario por
-- descuido: lo hardcodeo porque no podia leerlo.
--
-- Por eso el arreglo del front no puede ir solo. Cablear el motor real
-- sin esta policy dejaria la reserva publica en cero disponibilidad, que
-- es peor que el bug que viene a cerrar.
--
-- QUE SE EXPONE, Y POR QUE NO ES UNA FUGA
--
-- La tabla guarda tenant_id, therapist_id, dia de la semana, hora de
-- inicio y hora de fin. No hay dato personal ni clinico. Y el horario de
-- atencion es justo lo que la pagina de reserva ya le muestra al
-- visitante: hoy se lo muestra ADIVINADO, y a partir de aqui se lo
-- muestra CORRECTO. No se expone informacion nueva; se deja de inventar
-- la que ya se mostraba.
--
-- Se acota igual que el resto de lecturas publicas (0005:151, servicios
-- activos): por el tenant de la peticion y solo filas activas.
-- ============================================================

drop policy if exists "Public can read active schedules" on public.therapist_schedules;
create policy "Public can read active schedules" on public.therapist_schedules
  for select
  using (
    tenant_id = public.current_request_tenant()
    and active = true
    -- Solo de terapeutas que el publico YA puede ver. Un terapeuta dado
    -- de baja no debe seguir publicando sus dias de atencion.
    --
    -- Se consulta therapists_public, NO public.therapists. La Fase 1 quito
    -- la lectura publica de la tabla porque exponia email y cedula
    -- (0005:164), asi que una subconsulta contra ella se evalua con los
    -- permisos del visitante y devuelve CERO — la policy entera negaria
    -- todo. La vista es la proyeccion sancionada: security_invoker=false,
    -- y ya acota por tenant de la peticion y por activo.
    and exists (
      select 1 from public.therapists_public t
      where t.tenant_id = therapist_schedules.tenant_id
        and t.id = therapist_schedules.therapist_id
    )
  );

comment on policy "Public can read active schedules" on public.therapist_schedules is
  'El visitante lee el horario de atencion para que la reserva publica ofrezca los huecos REALES en vez de un 9:00-19:00 hardcodeado. Sin dato personal: dia y hora de atencion de un terapeuta activo.';
