-- 0037 · Limites a la reserva publica (auditoria 2026-10-09, S12).
--
-- Desde 0036 una solicitud aparta su horario 24 horas. Sin limites, un
-- solo visitante podia apartar la agenda entera de un consultorio —cada
-- cita con un correo inventado— y dejarla bloqueada un dia completo, una
-- y otra vez. Tambien llenaba patients de fichas basura.
--
-- Tres topes, contados solo sobre solicitudes VIGENTES (por confirmar y
-- de menos de 24 h) de la misma clinica:
--
--   · por correo:   2   — una persona real rara vez pide mas de dos citas
--                         a la vez sin que nadie le haya confirmado ninguna;
--   · por telefono: 2   — el mismo tope con otro dato, por si cambia el
--                         correo (se comparan solo los digitos);
--   · por clinica:  15 nuevas por hora — el freno de fondo contra correos
--                         y telefonos inventados.
--
-- El tercero tiene un costo: quien abuse puede agotar el cupo de la hora y
-- frenar tambien a pacientes reales. Es el limite de lo que se puede hacer
-- sin saber quien pide; lo que lo cierra es un captcha en la reserva, que
-- requiere cuenta con un proveedor (pendiente de decision).
--
-- Solo aplica sin sesion: el staff agenda lo que quiera.

create or replace function public.check_booking_request_limits(
  p_tenant_id text, p_email text, p_phone text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_digitos text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_n integer;
begin
  select count(*) into v_n from public.appointments
   where tenant_id = p_tenant_id and status = 'requested'
     and created_at > now() - interval '24 hours'
     and lower(customer_email) = lower(trim(p_email));
  if v_n >= 2 then
    raise exception using errcode = 'P0429',
      message = 'Ya tienes dos solicitudes por confirmar. Espera a que te confirmemos o escríbenos por WhatsApp.';
  end if;

  if length(v_digitos) >= 8 then
    select count(*) into v_n from public.appointments
     where tenant_id = p_tenant_id and status = 'requested'
       and created_at > now() - interval '24 hours'
       and regexp_replace(customer_phone, '[^0-9]', '', 'g') = v_digitos;
    if v_n >= 2 then
      raise exception using errcode = 'P0429',
        message = 'Ya tienes dos solicitudes por confirmar. Espera a que te confirmemos o escríbenos por WhatsApp.';
    end if;
  end if;

  select count(*) into v_n from public.appointments
   where tenant_id = p_tenant_id and status = 'requested'
     and created_at > now() - interval '1 hour';
  if v_n >= 15 then
    raise exception using errcode = 'P0429',
      message = 'En este momento no podemos recibir más solicitudes en línea. Escríbenos por WhatsApp y te agendamos.';
  end if;
end $$;
revoke all on function public.check_booking_request_limits(text, text, text) from public;
grant execute on function public.check_booking_request_limits(text, text, text) to anon, authenticated;

-- La regla de 0036, con los limites. Funcion ENTERA otra vez.
create or replace function public.apply_booking_request_rules()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.expire_stale_booking_requests(new.tenant_id);
  if current_user = 'anon' then
    new.status := 'requested';
    -- Despues de expirar: una solicitud vencida ya no cuenta para el tope.
    perform public.check_booking_request_limits(new.tenant_id, new.customer_email, new.customer_phone);
  end if;
  return new;
end $$;
