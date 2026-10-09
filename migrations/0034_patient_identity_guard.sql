-- 0034 · Una cita no reescribe la identidad de un paciente que ya existe.
--
-- El defecto (auditoria 2026-10-09, S3): sync_patient_from_appointment
-- buscaba al paciente por correo dentro de la clinica y, si existia, le
-- hacia UPDATE de nombre y telefono con lo que trajera la cita — y lo
-- reactivaba. Corre como security definer en cada alta, incluida la
-- reserva PUBLICA, asi que cualquier visitante sin sesion que conociera el
-- correo de un paciente podia cambiarle el nombre y el telefono en su
-- ficha de identificacion (NOM-004) y colgarle una cita falsa.
--
-- La regla nueva:
--   · Paciente que no existe: se crea, como antes.
--   · Paciente que ya existe: la cita se ENLAZA y nada mas. Lo que escribio
--     quien reservo vive en la cita (customer_name, customer_phone).
--   · Solo el staff administrativo de la clinica (owner, admin_consultorio)
--     propaga correcciones a la ficha. Hoy es la unica via para corregir
--     un telefono, y es una persona identificada que queda en la bitacora.
--     Un especialista no: crear una cita con un correo no le da poder
--     sobre la ficha de ese paciente.
--
-- Pendiente (fase de accesos): que el ENLACE por correo desde una reserva
-- anonima tampoco alcance a darle a un especialista acceso a la ficha de
-- un paciente que no atiende. Eso pide una relacion paciente-especialista
-- explicita y es otro cambio.

create or replace function public.sync_patient_from_appointment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_patient_id uuid;
begin
  -- El tenant sale de la FILA, no del JWT: este trigger tambien corre en
  -- backfills y tareas de service_role, donde no hay tenant activo.
  select id
  into resolved_patient_id
  from public.patients
  where tenant_id = new.tenant_id
    and lower(email) = lower(new.customer_email)
  limit 1;

  if resolved_patient_id is null then
    insert into public.patients (tenant_id, full_name, email, phone)
    values (new.tenant_id, trim(new.customer_name),
            lower(trim(new.customer_email)), trim(new.customer_phone))
    returning id into resolved_patient_id;
  elsif public.current_tenant_role() in ('owner', 'admin_consultorio')
        and public.current_tenant_id() = new.tenant_id then
    -- Correccion del staff administrativo de ESTA clinica. Sin reactivar:
    -- archivar o no a un paciente es una decision aparte, no un efecto
    -- secundario de editar una cita.
    update public.patients
    set full_name = trim(new.customer_name),
        phone = trim(new.customer_phone),
        updated_at = now()
    where tenant_id = new.tenant_id
      and id = resolved_patient_id;
  end if;

  new.patient_id := resolved_patient_id;
  new.updated_at := now();
  return new;
end;
$$;
