-- 0048 · A1: las altas publicas son SOLO del visitante anonimo.
-- Sin TO, una policy aplica a PUBLIC: un authenticated (de otra clinica o
-- sin membresia) insertaba citas, consentimientos y pedidos en cualquier
-- clinica activa nombrandola en x-tenant-id, y se saltaba los topes que
-- apply_booking_request_rules solo aplica a anon/bpc_booking_writer.
-- ALTER POLICY ... TO conserva el WITH CHECK vigente (0040/0005): no se
-- reescribe el predicado.
-- El front publicado no cambia: reserva por la RPC (sin sesion), pide cafe
-- y presenta ARCO como anon, y el staff usa upsert, que ya pedia su propia
-- policy. Para probar la reserva publica, el staff cierra sesion.
alter policy "Public can create appointments" on public.appointments to anon, bpc_booking_writer;
alter policy "Public can register consent"   on public.consents     to anon, bpc_booking_writer;
alter policy "Public can create orders"      on public.orders       to anon;
alter policy "Public can create order items" on public.order_items  to anon;

-- ARCO sigue abierto a authenticated (derecho del titular, aunque tenga
-- sesion en otra clinica), pero los topes aplican a quien NO es miembro
-- de la clinica destino, no solo a quien no tiene sesion.
create or replace function public.arco_request_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_n integer;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.due_on := public.add_business_days((now() at time zone 'America/Mexico_City')::date, 20);
    new.status := 'recibida';
    new.responded_at := null;
    new.response_summary := null;
    new.handled_by := null;

    if auth.uid() is null or new.tenant_id is distinct from public.current_tenant_id() then
      select count(*) into v_n from public.arco_requests
       where tenant_id = new.tenant_id
         and lower(requester_email) = lower(btrim(new.requester_email))
         and created_at > now() - interval '30 days';
      if v_n >= 3 then
        raise exception using errcode = 'P0429',
          message = 'Ya recibimos varias solicitudes tuyas este mes. Te responderemos por correo; si es urgente, escríbenos.';
      end if;
      select count(*) into v_n from public.arco_requests
       where tenant_id = new.tenant_id and created_at > now() - interval '1 day';
      if v_n >= 20 then
        raise exception using errcode = 'P0429',
          message = 'En este momento no podemos recibir más solicitudes en línea. Escríbenos por correo.';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: solo avanza el tramite. Lo que la persona pidio no se
  -- reescribe, y quien lo atiende y cuando lo pone la base.
  if new.tenant_id is distinct from old.tenant_id
     or new.id is distinct from old.id
     or new.request_type is distinct from old.request_type
     or new.requester_name is distinct from old.requester_name
     or new.requester_email is distinct from old.requester_email
     or new.requester_phone is distinct from old.requester_phone
     or new.relationship is distinct from old.relationship
     or new.on_behalf_of is distinct from old.on_behalf_of
     or new.details is distinct from old.details
     or new.created_at is distinct from old.created_at
     or new.due_on is distinct from old.due_on then
    raise exception 'Una solicitud ARCO no se reescribe: solo cambia su estado y la respuesta.';
  end if;
  if old.status in ('respondida', 'improcedente') and new.status is distinct from old.status then
    raise exception 'La solicitud ya se cerró.';
  end if;
  if new.status in ('respondida', 'improcedente')
     and char_length(btrim(coalesce(new.response_summary, ''))) < 10 then
    raise exception 'Para cerrar la solicitud escribe qué se respondió (mínimo 10 caracteres).';
  end if;
  new.handled_by := auth.uid();
  new.updated_at := now();
  if new.status in ('respondida', 'improcedente') and old.status not in ('respondida', 'improcedente') then
    new.responded_at := now();
  else
    new.responded_at := old.responded_at;
  end if;
  return new;
end $function$

;
