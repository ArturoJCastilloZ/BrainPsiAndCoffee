#!/usr/bin/env bash
# Dos conexiones reales: con una solicitud previa, solo una de las dos
# solicitudes simultaneas del mismo contacto puede entrar.
set -euo pipefail
CONTAINER="${1:?Falta el contenedor desechable}"
TEST_LOG_DIR="$(mktemp -d)"
FIRST_PID=''
SECOND_PID=''
cleanup() {
  if [[ -n "$FIRST_PID" ]]; then wait "$FIRST_PID" 2>/dev/null || true; fi
  if [[ -n "$SECOND_PID" ]]; then wait "$SECOND_PID" 2>/dev/null || true; fi
  rm -rf "$TEST_LOG_DIR"
}
trap cleanup EXIT
sql() { docker exec -i "$CONTAINER" psql -U postgres -d bpc -v ON_ERROR_STOP=1 -qtAX "$@"; }
sql <<'SQL'
do $$ begin
  if to_regclass('public.__banco_desechable') is null then
    raise exception 'ABORTADO: la prueba requiere el banco desechable';
  end if;
end $$;
insert into public.tenants(id,name) values ('t_race','Concurrencia de reservas');
insert into public.therapy_services(tenant_id,id,name,duration_minutes,price) values ('t_race','sv','Consulta',50,700);
insert into public.therapists(tenant_id,id,name,minimum_notice_minutes) values ('t_race','tt','Especialista',0);
delete from public.therapist_schedules where tenant_id='t_race';
insert into public.therapist_schedules(tenant_id,therapist_id,weekday,start_time,end_time,active)
select 't_race','tt',d,'09:00','19:00',true from generate_series(0,6) d;
insert into public.appointments(tenant_id,id,service_id,therapist_id,appointment_date,appointment_time,
  customer_name,customer_email,customer_phone,duration_minutes,status)
values ('t_race','race-existing','sv','tt',current_date+10,'11:00','Fixture','race@ex.mx','8188800000',50,'requested');
SQL

# La primera mantiene abierta la transaccion DESPUES de insertar.
sql >"$TEST_LOG_DIR/first.log" 2>&1 <<'SQL' &
begin;
set local application_name='booking-limit-first';
set local role anon;
set local request.tenant='t_race';
set local request.jwt.claims='';
select public.create_public_booking(jsonb_build_array(jsonb_build_object(
  'id','race-first','service_id','sv','therapist_id','tt','appointment_date',current_date+11,
  'appointment_time','11:00','customer_name','Fixture','customer_email','race@ex.mx',
  'customer_phone','8188800000','duration_minutes',50)),true,'2026-10-borrador-2',
  '3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188',null);
select pg_sleep(3);
commit;
SQL
FIRST_PID=$!
READY=false
for _ in $(seq 1 50); do
  if [[ "$(sql -c "select count(*) from pg_stat_activity where application_name='booking-limit-first' and wait_event='PgSleep'")" == 1 ]]; then
    READY=true
    break
  fi
  sleep 0.05
done
if [[ "$READY" != true ]]; then cat "$TEST_LOG_DIR/first.log"; exit 1; fi

sql >"$TEST_LOG_DIR/second.log" 2>&1 <<'SQL' &
begin;
set local role anon;
set local request.tenant='t_race';
set local request.jwt.claims='';
select public.create_public_booking(jsonb_build_array(jsonb_build_object(
  'id','race-second','service_id','sv','therapist_id','tt','appointment_date',current_date+12,
  'appointment_time','11:00','customer_name','Fixture','customer_email','race@ex.mx',
  'customer_phone','8188800000','duration_minutes',50)),true,'2026-10-borrador-2',
  '3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188',null);
commit;
SQL
SECOND_PID=$!
if ! wait "$FIRST_PID"; then cat "$TEST_LOG_DIR/first.log"; exit 1; fi
FIRST_PID=''
if wait "$SECOND_PID"; then echo 'FUGA: dos reservas simultaneas superaron el tope'; exit 1; fi
SECOND_PID=''
if ! grep -q 'dos solicitudes' "$TEST_LOG_DIR/second.log"; then cat "$TEST_LOG_DIR/second.log"; exit 1; fi
sql <<'SQL'
do $$ begin
  if (select count(*) from public.appointments where tenant_id='t_race') <> 2
     or (select count(*) from public.consents where tenant_id='t_race') <> 1 then
    raise exception 'FUGA: concurrencia dejo reservas o consentimientos incorrectos';
  end if;
  raise notice 'ok · dos conexiones concurrentes respetan el tope sin escrituras parciales';
end $$;
SQL
