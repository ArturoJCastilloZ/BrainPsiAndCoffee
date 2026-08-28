#!/usr/bin/env bash
# Runner de migraciones versionadas.
#
# Sin dependencias nuevas: usa psql del host si existe, y si no lo baja
# en un contenedor efimero. El repo no adopta el CLI de Supabase.
#
#   ./scripts/migrate.sh status               que falta por aplicar
#   ./scripts/migrate.sh up                   aplica lo pendiente
#   ./scripts/migrate.sh up --dry-run         imprime sin aplicar
#
# La conexion sale de DATABASE_URL.
set -euo pipefail

MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/migrations"
CMD="${1:-status}"
DRY_RUN="${2:-}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: falta DATABASE_URL." >&2
  echo "  local:  export DATABASE_URL=postgres://postgres:test@localhost:55432/bpc" >&2
  echo "  remoto: la connection string de Supabase (Settings > Database)" >&2
  exit 1
fi

# psql del host, o contenedor efimero. --network=host para alcanzar un
# Postgres local sin publicar nada extra.
if command -v psql >/dev/null 2>&1; then
  psql_run() { psql "$DATABASE_URL" "$@"; }
elif command -v docker >/dev/null 2>&1; then
  psql_run() {
    docker run --rm -i --network=host -e PGCONNECT_TIMEOUT=10 \
      postgres:16-alpine psql "$DATABASE_URL" "$@"
  }
else
  echo "ERROR: no hay psql ni docker. Se necesita uno de los dos." >&2
  exit 1
fi

# ON_ERROR_STOP=1 en todo: sin eso psql sigue tras un error y reporta
# exito con la migracion aplicada a medias.
psql_q() { psql_run -v ON_ERROR_STOP=1 -qtAX -c "$1"; }

psql_q "
create table if not exists public.schema_migrations (
  version     text primary key,
  checksum    text not null,
  applied_at  timestamptz not null default now(),
  applied_by  text not null default current_user
);
comment on table public.schema_migrations is
  'Migraciones aplicadas. Lo mantiene scripts/migrate.sh; no editar a mano.';
" >/dev/null

checksum_of() { shasum -a 256 "$1" | cut -d' ' -f1; }

applied_versions="$(psql_q "select version from public.schema_migrations order by version;")"
is_applied() { [[ -n "$applied_versions" ]] && grep -qxF "$1" <<<"$applied_versions"; }

shopt -s nullglob
files=("$MIGRATIONS_DIR"/[0-9]*.sql)
shopt -u nullglob

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No hay migraciones en $MIGRATIONS_DIR"
  exit 0
fi

# Una migracion ya aplicada que cambio de contenido significa que la base
# y el repo divergieron. Error duro: aplicar lo pendiente encima de una
# base que no es la que el repo describe es como se corrompe un esquema.
drift=0
for f in "${files[@]}"; do
  version="$(basename "$f" .sql)"
  if is_applied "$version"; then
    stored="$(psql_q "select checksum from public.schema_migrations where version = '$version';")"
    actual="$(checksum_of "$f")"
    if [[ "$stored" != "$actual" ]]; then
      echo "DRIFT: $version cambio despues de aplicarse." >&2
      echo "       en la base: $stored" >&2
      echo "       en el repo: $actual" >&2
      drift=1
    fi
  fi
done
if [[ $drift -eq 1 ]]; then
  echo >&2
  echo "Una migracion aplicada no se edita: se escribe una nueva que corrija." >&2
  exit 1
fi

pending=()
for f in "${files[@]}"; do
  is_applied "$(basename "$f" .sql)" || pending+=("$f")
done

if [[ "$CMD" == "status" ]]; then
  echo "Aplicadas:"
  if [[ -n "$applied_versions" ]]; then sed 's/^/  ok  /' <<<"$applied_versions"; else echo "  (ninguna)"; fi
  echo "Pendientes:"
  if [[ ${#pending[@]} -eq 0 ]]; then
    echo "  (ninguna)"
  else
    for f in "${pending[@]}"; do echo "  --  $(basename "$f" .sql)"; done
  fi
  exit 0
fi

if [[ "$CMD" != "up" ]]; then
  echo "Uso: $0 [status|up] [--dry-run]" >&2
  exit 1
fi

if [[ ${#pending[@]} -eq 0 ]]; then
  echo "Nada pendiente."
  exit 0
fi

for f in "${pending[@]}"; do
  version="$(basename "$f" .sql)"
  if [[ "$DRY_RUN" == "--dry-run" ]]; then
    echo "[dry-run] aplicaria $version"
    continue
  fi
  echo "aplicando $version ..."
  # La migracion y su registro van en la MISMA transaccion: si el SQL
  # falla a la mitad, no queda marcada como aplicada.
  {
    echo "begin;"
    cat "$f"
    echo "insert into public.schema_migrations (version, checksum)
          values ('$version', '$(checksum_of "$f")');"
    echo "commit;"
  } | psql_run -v ON_ERROR_STOP=1 -qX -f -
  echo "  ok $version"
done
echo "Listo."
