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

ARG NODE_VERSION=22
ARG NGINX_VERSION=1.27

FROM node:${NODE_VERSION}-alpine AS deps
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
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION}-alpine AS runtime
# Generador de /env-config.js: lo ejecuta el entrypoint oficial de nginx.
COPY --chmod=0755 docker/40-env-config.sh /docker-entrypoint.d/40-env-config.sh
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
