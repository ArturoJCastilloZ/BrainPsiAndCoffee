-- 0049 · M1: definers que reciben la clinica como argumento.
-- Dentro de un SECURITY DEFINER current_user es el dueño; el rol de la
-- peticion se lee de current_setting('role') (mismo patron que
-- create_public_booking, 0046). bpc_booking_writer corre con role='anon'.

-- Vencimiento: solo la clinica de la peticion. anon ya no la llama
-- directo; el dueño de la RPC publica la recibe por grant propio.
create or replace function public.expire_stale_booking_requests(p_tenant_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(current_setting('role', true), 'none');
begin
  if (v_role = 'authenticated' and p_tenant_id is distinct from public.current_tenant_id())
     or (v_role = 'anon' and p_tenant_id is distinct from public.current_request_tenant()) then
    -- No-op, no error: dentro del trigger, el rechazo canonico es el de RLS.
    return;
  end if;
  update public.appointments
     set status = 'cancelled', updated_at = now()
   where tenant_id = p_tenant_id
     and status = 'requested'
     and created_at < now() - interval '24 hours';
end $$;
revoke all on function public.expire_stale_booking_requests(text) from public, anon, authenticated;
grant execute on function public.expire_stale_booking_requests(text) to authenticated, bpc_booking_writer;

-- Topes: solo el trigger, y solo para la RPC publica (anon ya no tiene
-- INSERT en appointments desde 0046).
revoke all on function public.check_booking_request_limits(text, text, text) from public, anon, authenticated;
grant execute on function public.check_booking_request_limits(text, text, text) to bpc_booking_writer;

-- Predicados de policies publicas: solo responden por la clinica del
-- header. authenticated ya no los necesita (0048).
-- REQUIERE 0048: si una policy publica siguiera aplicando a authenticated,
-- revocarle estos predicados haria fallar con 42501 los INSERT del staff.
-- No pueden revocarse a anon: Postgres evalua la policy con los privilegios
-- de quien consulta.
-- Riesgo residual aceptado: con x-tenant-id de B, anon sigue sabiendo si
-- existe la cita X en B (appointment_can_receive_order). Es inherente al
-- pedido ligado a una cita: el propio INSERT lo revela. Los ids son base36
-- de 7 caracteres (src/utils.jsx), asi que no se enumeran en masa.
create or replace function public.fits_in_schedule(
  p_tenant_id text, p_therapist_id text, p_date date, p_time time,
  p_duration integer, p_location_id text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(current_setting('role', true), 'none') = 'anon'
         and p_tenant_id is distinct from public.current_request_tenant() then false
    else exists (
      select 1 from public.therapist_schedules s
      where s.tenant_id = p_tenant_id
        and s.therapist_id = p_therapist_id
        and s.active
        and s.weekday = extract(dow from p_date)
        and p_time >= s.start_time
        and (p_time + make_interval(mins => coalesce(p_duration, 50))) <= s.end_time
        and (p_location_id is null or s.location_id is null or s.location_id = p_location_id))
  end;
$$;
revoke all on function public.fits_in_schedule(text, text, date, time, integer, text) from public, authenticated;
grant execute on function public.fits_in_schedule(text, text, date, time, integer, text) to anon;
-- La sobrecarga de 5 argumentos (0017) ya no la usa ninguna policy (0040).
revoke all on function public.fits_in_schedule(text, text, date, time, integer) from public, anon, authenticated;

create or replace function public.within_booking_window(
  p_tenant_id text, p_therapist_id text, p_date date, p_time time)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(current_setting('role', true), 'none') = 'anon'
         and p_tenant_id is distinct from public.current_request_tenant() then false
    else exists (
      select 1 from public.therapists t
      where t.tenant_id = p_tenant_id
        and t.id = p_therapist_id
        and p_date <= current_date + t.booking_window_days
        and ((p_date + p_time) at time zone t.timezone)
              >= now() + make_interval(mins => t.minimum_notice_minutes))
  end;
$$;
revoke all on function public.within_booking_window(text, text, date, time) from public, authenticated;
grant execute on function public.within_booking_window(text, text, date, time) to anon;

create or replace function public.appointment_can_receive_order(p_tenant_id text, p_appointment_id text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(current_setting('role', true), 'none') = 'anon'
         and p_tenant_id is distinct from public.current_request_tenant() then false
    else exists (
      select 1 from public.appointments a
      where a.tenant_id = p_tenant_id
        and a.id = p_appointment_id
        and a.status <> 'cancelled')
  end;
$$;
revoke all on function public.appointment_can_receive_order(text, text) from public, authenticated;
grant execute on function public.appointment_can_receive_order(text, text) to anon;

create or replace function public.order_can_receive_public_items(p_tenant_id text, p_order_id text)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select case
    when coalesce(current_setting('role', true), 'none') = 'anon'
         and p_tenant_id is distinct from public.current_request_tenant() then false
    else exists (
      select 1 from public.orders o
      where o.tenant_id = p_tenant_id
        and o.id = p_order_id
        and o.order_source in ('public_menu', 'appointment')
        and o.status in ('received', 'pending_appointment')
        and o.created_at >= now() - interval '15 minutes')
  end;
$$;
revoke all on function public.order_can_receive_public_items(text, text) from public, authenticated;
grant execute on function public.order_can_receive_public_items(text, text) to anon;
