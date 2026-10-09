#!/bin/sh
# Escribe /env-config.js con la configuracion publica del contenedor.
#
# Solo pasan las variables de esta lista: todo lo que se escribe aqui lo
# descarga cualquier visitante. Nunca agregues una llave secreta
# (VITE_SUPABASE_SECRET_KEY, service role, etc.).
set -eu

# /tmp: el unico lugar escribible cuando el contenedor corre read_only.
OUT_DIR=/tmp/app-config
OUT="$OUT_DIR/env-config.js"
mkdir -p "$OUT_DIR"
VARS="VITE_API_BASE_URL VITE_AUTH_LOGIN_PATH VITE_AUTH_REFRESH_PATH \
VITE_AUTH_INACTIVITY_MINUTES VITE_AUTH_WARNING_SECONDS VITE_SUPABASE_URL \
VITE_SUPABASE_PUBLISHABLE_KEY VITE_ANALYTICS_ENDPOINT VITE_TENANT_ID"

# Escapa \ " < > y saltos de linea para que un valor no pueda romper el
# literal de JS ni cerrar la etiqueta <script>.
escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e 's/</\\u003c/g' -e 's/>/\\u003e/g' | tr '\n' ' '
}

{
  printf 'window.__APP_CONFIG__ = {\n'
  for name in $VARS; do
    value=$(printenv "$name" || true)
    [ -n "$value" ] && printf '  "%s": "%s",\n' "$name" "$(escape "$value")"
  done
  printf '};\n'
} > "$OUT"

echo "env-config: $(grep -c '": "' "$OUT" || true) variable(s) publicadas en env-config.js"
