#!/usr/bin/env bash
# Runner de migraciones versionadas.
#
# Sin dependencias nuevas: usa psql del host si existe, y si no lo baja
# en un contenedor efimero. El repo no adopta el CLI de Supabase.
#
#   ./scripts/migrate.sh status               que falta por aplicar
#   ./scripts/migrate.sh up                   aplica lo pendiente
#   ./scripts/migrate.sh up --dry-run         imprime sin aplicar
#   ./scripts/migrate.sh baseline --confirm   marca lo ya aplicado a mano
#
# La conexion sale de DATABASE_URL.
set -euo pipefail

MIGRATIONS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/migrations"
CMD="${1:-status}"
DRY_RUN="${2:-}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: falta DATABASE_URL." >&2
  echo "  local:  export DATABASE_URL=postgres://postgres:test@localhost:55432/bpc" >&2
  echo "  remoto: la connection string de Supabase (boton Connect > Session pooler)" >&2
  echo >&2
  echo "  Para no dejarla en el historial del shell:" >&2
  # zsh y bash difieren: en zsh el prompt va dentro de la variable con '?',
  # y 'read -p' significa leer de un coproceso — de ahi el error
  # 'no coprocess' si se usa la forma de bash.
  if [[ -n "${ZSH_VERSION:-}" ]] || [[ "${SHELL:-}" == *"zsh" ]]; then
    echo "    read -rs '?DATABASE_URL: ' DATABASE_URL && export DATABASE_URL   # zsh" >&2
  else
    echo "    read -rs -p 'DATABASE_URL: ' DATABASE_URL && export DATABASE_URL  # bash" >&2
  fi
  exit 1
fi

# Diagnostico de la cadena ANTES de conectar. psql da errores cripticos
# para estos tres casos y cada uno cuesta un intento.
if [[ "$DATABASE_URL" == *"pgbouncer="* ]]; then
  echo "ERROR: la cadena trae 'pgbouncer=', que es un parametro de Prisma y no de psql." >&2
  echo "       Quitalo: psql responde 'invalid URI query parameter'." >&2
  exit 1
fi

if [[ "$DATABASE_URL" == *":6543/"* ]]; then
  echo "ERROR: el puerto 6543 es el Transaction pooler de Supabase." >&2
  echo "       No sostiene las transacciones de varias sentencias que usa este runner." >&2
  echo "       Usa el Session pooler (puerto 5432) o la conexion directa." >&2
  exit 1
fi

# Dos arrobas antes del host casi siempre significa una contraseña con
# '@' sin escapar: psql corta el host ahi y el error habla de un host que
# nadie escribio.
sin_esquema="${DATABASE_URL#*://}"
credenciales="${sin_esquema%%/*}"
arrobas="$(grep -o "@" <<<"$credenciales" | wc -l | tr -d " ")"
if [[ "$arrobas" -gt 1 ]]; then
  echo "ERROR: la contraseña parece traer un '@' sin escapar." >&2
  echo "       En un URI va como %40 (y '%'=%25, ':'=%3A, '/'=%2F)." >&2
  echo "       Lo mas simple es rotar la contraseña a una sin caracteres especiales." >&2
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

# shasum viene de perl y es lo habitual en macOS; sha256sum es lo de
# coreutils en Linux. El runner de CI trae el segundo: sin este fallback,
# el checksum salia vacio y toda migracion parecia haber cambiado.
if command -v shasum >/dev/null 2>&1; then
  checksum_of() { shasum -a 256 "$1" | cut -d' ' -f1; }
elif command -v sha256sum >/dev/null 2>&1; then
  checksum_of() { sha256sum "$1" | cut -d' ' -f1; }
else
  echo "ERROR: no hay shasum ni sha256sum para calcular checksums." >&2
  exit 1
fi

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

# baseline: marcar migraciones como aplicadas SIN ejecutarlas.
#
# Para una base que ya trae el esquema porque alguien corrio el SQL a mano
# (por ejemplo desde el SQL Editor de Supabase). Sin esto, el runner ve el
# registro vacio e intenta aplicar todo de nuevo sobre una base que ya lo
# tiene: unas migraciones son idempotentes y otras no, y termina a medias.
#
# Antes de marcar comprueba que un objeto centinela de cada migracion
# exista de verdad. Marcar sin verificar seria escribir en el registro que
# algo se aplico porque alguien lo dijo, y ese registro es justamente lo
# que despues se usa para decidir que falta.
if [[ "$CMD" == "baseline" ]]; then
  declare -a CENTINELAS=(
    "0001_tenancy_core|to_regclass('public.tenant_members')"
    "0002_tenant_id_columns|(select 1 from information_schema.columns where table_name='appointments' and column_name='tenant_id')"
    "0003_composite_keys|(select 1 from pg_constraint where conname='appointments_no_overlap')"
    "0004_security_definer_tenant_aware|(select 1 from pg_proc where proname='appointment_can_receive_order' and pronargs=2)"
    "0005_policies_by_tenant|(select 1 from pg_proc where proname='current_request_tenant')"
    "0006_tenant_from_header|(select 1 from pg_proc where proname='requested_tenant')"
    "0007_tenant_id_default|(select 1 from information_schema.columns where table_name='patients' and column_name='tenant_id' and column_default is not null)"
    "0008_bootstrap_memberships|(select 1 from pg_proc where proname='bootstrap_tenant_memberships')"
    "0009_grant_tenant_role|(select 1 from pg_proc where proname='grant_tenant_role')"
    "0010_therapists_public_created_at|(select 1 from information_schema.columns where table_name='therapists_public' and column_name='created_at')"
    "0011_access_management|(select 1 from pg_proc where proname='set_tenant_member_role')"
    "0012_encounters|to_regclass('public.encounters')"
    "0013_clinical_notes|to_regclass('public.clinical_notes')"
    "0014_migrate_appointment_notes|(select case when to_regclass('public.appointment_notes') is null then 1 end)"
  )

  faltan=0
  for entrada in "${CENTINELAS[@]}"; do
    version="${entrada%%|*}"
    prueba="${entrada#*|}"
    presente="$(psql_q "select case when ($prueba) is not null then 'si' else 'no' end;")"
    if [[ "$presente" != "si" ]]; then
      echo "NO aplicada: $version" >&2
      faltan=1
    fi
  done

  if [[ $faltan -eq 1 ]]; then
    echo >&2
    echo "El esquema no coincide con las migraciones que se marcarian." >&2
    echo "Aplica lo que falte antes de hacer baseline." >&2
    exit 1
  fi

  if [[ "$DRY_RUN" != "--confirm" ]]; then
    echo "Se marcarian como aplicadas, SIN ejecutarlas:"
    for f in "${files[@]}"; do echo "  $(basename "$f" .sql)"; done
    echo
    echo "Los objetos centinela estan presentes en la base."
    echo "Para escribirlo: $0 baseline --confirm"
    exit 0
  fi

  for f in "${files[@]}"; do
    version="$(basename "$f" .sql)"
    is_applied "$version" && continue
    psql_q "insert into public.schema_migrations (version, checksum)
            values ('$version', '$(checksum_of "$f")')
            on conflict (version) do nothing;" >/dev/null
    echo "  marcada $version"
  done
  echo "Listo. El runner ya esta sincronizado con la base."
  exit 0
fi

if [[ "$CMD" != "up" ]]; then
  echo "Uso: $0 [status|up|baseline] [--dry-run|--confirm]" >&2
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
