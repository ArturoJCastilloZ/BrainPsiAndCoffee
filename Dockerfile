# syntax=docker/dockerfile:1.7
#
# Imagen de Brainpsi. Tres etapas:
#   deps     -> node_modules a partir del lockfile (capa cacheada)
#   dev      -> servidor de Vite con recarga en caliente (docker compose --profile dev)
#   build    -> compila el bundle estatico
#   runtime  -> nginx sin root sirviendo dist/ (la imagen que se despliega)
#
# La configuracion (Supabase, tenant, etc.) NO se compila dentro: se
# inyecta al arrancar el contenedor (docker/40-env-config.sh). Una sola
# imagen sirve a cualquier clinica o entorno.

# Imagenes base fijadas por DIGEST (2026-10-09), no solo por etiqueta: una
# etiqueta como 22-alpine cambia de contenido con cada publicacion, y una
# reconstruccion traeria otra imagen sin que nadie lo decidiera. Para
# actualizar: docker buildx imagetools inspect node:22-alpine (y la de
# nginx), y reemplazar el digest — de forma deliberada, con su commit.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM deps AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 5173
CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "5173"]

FROM deps AS build
ENV NODE_ENV=production
# Dominio publico (https://..., sin barra final). Va en el BUILD y no en
# el arranque: el canonical y el sitemap quedan escritos en el HTML
# prerenderizado. Vacio = sin canonical ni sitemap (hoy no hay dominio).
ARG SITE_URL=""
ENV SITE_URL=${SITE_URL}
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0 AS runtime
# Generador de /env-config.js: lo ejecuta el entrypoint oficial de nginx.
COPY --chmod=0755 docker/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
