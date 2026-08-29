-- ============================================================
-- 0018 · El doctor puede guardar SUS preferencias de agenda
--
-- 0016 le dio al doctor una policy sobre therapist_schedules —sus dias y
-- horas— pero sus buffers viven en la tabla therapists, donde solo tiene
-- SELECT. Guardar desde "Mi horario" actualizaba cero filas, y la
-- pantalla respondia que no se encontro al doctor: un mensaje que manda a
-- revisar el catalogo en vez del permiso que falta. Se dio la pantalla sin
-- dar el permiso.
--
-- Se resuelve con una funcion y no con una policy de UPDATE porque RLS
-- acota FILAS, no columnas: una policy dejaria al doctor cambiar tambien
-- su nombre, su cedula y su duracion de sesion. Restringir columnas con
-- grants tampoco sirve — aplican al rol 'authenticated' entero y le
-- quitarian al administrador la capacidad de editar el resto de la ficha.
--
-- La funcion escribe EXACTAMENTE los seis campos de agenda, y autoriza
-- las dos vias: la clinica sobre cualquiera de sus fichas, y el doctor
-- sobre la suya.
-- ============================================================

create or replace function public.set_agenda_prefs(
  p_therapist_id           text,
  p_buffer_before_minutes  integer,
  p_buffer_after_minutes   integer,
  p_slot_interval_minutes  integer,
  p_minimum_notice_minutes integer,
  p_booking_window_days    integer,
  p_max_bookings_per_day   integer
)
returns public.therapists
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tenant text := public.current_tenant_id();
  v_fila   public.therapists;
begin
  if v_tenant is null then
    raise exception 'No hay una clinica activa en esta sesion.';
  end if;

  -- La clinica administra a todos sus doctores; el doctor, solo su ficha.
  if not (
    public.is_clinic_staff()
    or (public.is_doctor() and p_therapist_id = public.current_therapist_id())
  ) then
    raise exception 'No tienes permiso para cambiar la agenda de ese doctor.';
  end if;

  update public.therapists t
     set buffer_before_minutes  = p_buffer_before_minutes,
         buffer_after_minutes   = p_buffer_after_minutes,
         slot_interval_minutes  = p_slot_interval_minutes,
         minimum_notice_minutes = p_minimum_notice_minutes,
         booking_window_days    = p_booking_window_days,
         max_bookings_per_day   = p_max_bookings_per_day,
         updated_at             = now()
   where t.tenant_id = v_tenant
     and t.id = p_therapist_id
  returning t.* into v_fila;

  if v_fila.id is null then
    raise exception 'No existe la ficha de terapeuta "%" en esta clinica.', p_therapist_id;
  end if;

  return v_fila;
end $$;

revoke all on function public.set_agenda_prefs(text, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.set_agenda_prefs(text, integer, integer, integer, integer, integer, integer) to authenticated;
