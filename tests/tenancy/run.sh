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

for _ in $(seq 1 40); do
  docker exec "$CONTAINER" pg_isready -U postgres -d bpc >/dev/null 2>&1 && break
  sleep 1
done

run_file() {
  docker cp "$1" "$CONTAINER:/tmp/f.sql" >/dev/null
  docker exec "$CONTAINER" psql -U postgres -d bpc -v ON_ERROR_STOP=1 -q -f /tmp/f.sql
}

echo "cargando stub de supabase ..."
run_file "$ROOT/tests/tenancy/prelude.sql"

echo "cargando esquema base ..."
run_file "$ROOT/scripts/supabase-schema.sql" >/dev/null

echo "aplicando migraciones ..."
DATABASE_URL="postgres://postgres:test@localhost:$PORT/bpc" "$ROOT/scripts/migrate.sh" up

echo "corriendo pruebas ..."
for t in "$ROOT"/tests/tenancy/[0-9]*.sql; do
  echo "  $(basename "$t")"
  run_file "$t"
done

echo "TODAS LAS PRUEBAS PASARON"
