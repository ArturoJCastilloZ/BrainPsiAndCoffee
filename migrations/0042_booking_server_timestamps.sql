-- Fechas de reserva del servidor, tambien ante INSERT directo por API.
-- El rol administrativo de migracion conserva el backfill de datos.
create or replace function public.booking_server_timestamps()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.created_at := now();
    else
      new.created_at := old.created_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;

-- Los BEFORE triggers se ordenan por nombre: el sello precede a los
-- limites de apply_booking_request_rules y a la creacion del paciente.
create trigger a_booking_server_timestamps
  before insert or update on public.appointments
  for each row execute function public.booking_server_timestamps();

create or replace function public.apply_booking_request_rules()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user = 'anon' then
    -- Serializa el conteo y el INSERT de solicitudes de la misma clinica.
    -- Una segunda transaccion espera el commit/rollback de la primera.
    perform pg_advisory_xact_lock(hashtextextended(new.tenant_id, 42));
    new.status := 'requested';
  end if;
  perform public.expire_stale_booking_requests(new.tenant_id);
  if current_user = 'anon' then
    perform public.check_booking_request_limits(new.tenant_id, new.customer_email, new.customer_phone);
  end if;
  return new;
end $$;
