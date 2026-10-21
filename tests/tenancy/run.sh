#!/usr/bin/env bash
# Suite de aislamiento entre tenants. Levanta un Postgres desechable,
# aplica el esquema y las migraciones, y corre las pruebas.
#
#   ./tests/tenancy/run.sh
#
# Cada prueba levanta un 'exception' si la propiedad no se cumple, asi
# que un exit 0 significa que TODAS pasaron. Requiere Docker.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="bpc-tenancy-test"
PORT="${BPC_TEST_PORT:-55434}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "levantando postgres desechable ..."
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=test -e POSTGRES_DB=bpc \
  -p "$PORT:5432" postgres:16-alpine >/dev/null

ready=false
for _ in $(seq 1 40); do
  # The image first starts a temporary Unix-socket server before creating
  # POSTGRES_DB. pg_isready can succeed even when that database is missing.
  # A real query over TCP waits for the final server and the requested DB.
  if docker exec -e PGPASSWORD=test "$CONTAINER" \
    psql -h 127.0.0.1 -U postgres -d bpc -qtAX -c 'select 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo "Disposable PostgreSQL database did not become ready." >&2
  docker logs --tail 20 "$CONTAINER" >&2
  exit 1
fi

# La MARCA del banco desechable. Todos los .sql de esta carpeta abortan si
# no la encuentran, asi que esto es lo unico que los habilita — y solo se
# ejecuta aqui, contra el contenedor que este script acaba de levantar.
#
# Existe por un incidente real: el 2026-09-18 se ejecutaron 0013 y 0014
# contra la base de PRODUCCION y dejaron cuatro tenants y cuatro cuentas
# fantasma, una con rol owner.
echo "marcando el banco como desechable ..."
docker exec "$CONTAINER" psql -U postgres -d bpc -v ON_ERROR_STOP=1 -q -c \
  "create table if not exists public.__banco_desechable (
     creado_en timestamptz not null default now(),
     nota text not null default 'Postgres desechable de tests/tenancy/run.sh. Si ves esta tabla en una base real, algo se ejecuto donde no debia.'
   );"

run_file() {
  docker cp "$1" "$CONTAINER:/tmp/f.sql" >/dev/null
  docker exec "$CONTAINER" psql -U postgres -d bpc -v ON_ERROR_STOP=1 -q -f /tmp/f.sql
}

echo "cargando stub de supabase ..."
run_file "$ROOT/tests/tenancy/prelude.sql"

echo "cargando esquema base ..."
run_file "$ROOT/scripts/legacy/supabase-schema.sql" >/dev/null

echo "aplicando migraciones ..."
DATABASE_URL="postgres://postgres:test@localhost:$PORT/bpc" "$ROOT/scripts/migrate.sh" up

echo "corriendo pruebas ..."
for t in "$ROOT"/tests/tenancy/[0-9]*.sql; do
  echo "  $(basename "$t")"
  run_file "$t"
done

bash "$ROOT/tests/tenancy/booking-concurrency.sh" "$CONTAINER"

echo "TODAS LAS PRUEBAS PASARON"
