# Brainpsi

Aplicacion web para Brainpsi Coffee: agenda de citas terapeuticas, pedidos de cafeteria y panel administrativo con catalogos editables.

## Caracteristicas

- App para usuarios con home, reservas, menu de cafeteria, carrito y citas.
- Panel admin para revisar dashboard, citas, pedidos y catalogos.
- Configuracion administrable de informacion del negocio, horarios y promociones con vigencia.
- Reagendado basico de citas desde usuario y admin.
- Tema claro/oscuro persistente.
- Datos persistidos en Supabase cuando `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` estan configuradas.
- Configuracion de API y tiempos de sesion via variables de entorno de Vite.

## Stack

- React 19
- Vite
- React Router
- Lucide React

## Requisitos

- Node.js 20 o superior recomendado
- npm

## Instalacion

```bash
npm install
```

## Variables de entorno

El proyecto incluye `.env.example`. Para desarrollo local puedes copiarlo a `.env.development` y ajustar los valores si conectas una API real:

```bash
cp .env.example .env.development
```

Variables disponibles:

```env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_AUTH_LOGIN_PATH=/auth/login
VITE_AUTH_REFRESH_PATH=/auth/refresh
VITE_AUTH_INACTIVITY_MINUTES=15
VITE_AUTH_WARNING_SECONDS=60
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
VITE_ANALYTICS_ENDPOINT=
```

## Scripts

```bash
npm run dev
```

Inicia el servidor de desarrollo.

```bash
npm run build
```

Genera la version de produccion en `dist/`.

```bash
npm run preview
```

Sirve localmente el build de produccion.

```bash
npm run verify
```

Ejecuta QA basico y build de produccion. Usalo antes de desplegar.

## Docker

Requiere Docker Desktop (o Docker Engine con Compose v2). La configuracion
sale de `.env.development`; para otro archivo usa `BRAINPSI_ENV_FILE`.

```bash
docker compose --profile dev up
```

Desarrollo con recarga en caliente en http://localhost:5173. El codigo se
monta desde tu carpeta; `node_modules` vive en un volumen del contenedor.

```bash
docker compose --profile prod up -d --build
```

Imagen de produccion (nginx sin root, solo lectura) en http://localhost:8080,
con `GET /healthz` para healthchecks.

### Una imagen, cualquier clinica o entorno

Las variables `VITE_*` publicas no se compilan dentro de la imagen: el
contenedor escribe `/env-config.js` al arrancar (`docker/40-env-config.sh`)
y `src/config/env.js` lo lee antes que `import.meta.env`. La misma imagen
sirve a otra clinica cambiando solo el entorno:

```bash
docker run -d -p 8080:8080 --read-only --tmpfs /tmp --tmpfs /var/cache/nginx -e VITE_SUPABASE_URL=https://xxx.supabase.co -e VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx -e VITE_TENANT_ID=otra-clinica brainpsi-web:local
```

Solo se publican las variables listadas en `docker/40-env-config.sh`. Todo lo
que esta ahi lo descarga cualquier visitante: nunca agregues una llave
secreta (service role, `VITE_SUPABASE_SECRET_KEY`).

Archivos: `Dockerfile` (etapas `deps`, `dev`, `build`, `runtime`),
`docker-compose.yml`, `docker/nginx.conf` (fallback de React Router, cache
inmutable de `/assets`, cabeceras de seguridad, gzip) y `.dockerignore`.

## Estructura principal

```text
src/
  admin/       Panel administrativo
  api/         Cliente API
  auth/        Sesion, JWT y autenticacion
  components/  Componentes compartidos
  config/      Configuracion de entorno
  hooks/       Hooks reutilizables
  user/        Experiencia de usuario
```

## Notas para GitHub

No subas `node_modules/`, `dist/` ni archivos `.env` locales. Usa `.env.example` como referencia para configurar entornos nuevos.

## Checklist Fase 1 para produccion

- Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en el hosting.
- Aplicar las migraciones con `./scripts/migrate.sh up` y confirmar que RLS queda activo. **No corras `scripts/legacy/supabase-schema.sql`**: reescribiria las policies y apagaria el aislamiento entre clinicas sin lanzar error (ver `scripts/legacy/README.md`).
- Crear al menos un usuario `super_admin` con `app_metadata.role = "super_admin"`.
- Desplegar la funcion `sync-doctor-access` si se administraran accesos de doctores desde el panel.
- Confirmar dominio final y actualizar `index.html`, `public/robots.txt` y `public/sitemap.xml` si no sera `https://brainpsicoffee.com`.
- Revisar y reemplazar los datos temporales de contacto en `src/businessInfo.js`.
- Publicar aviso de privacidad validado por el negocio antes de recibir citas reales.
- Probar en produccion: login admin, crear cita publica, crear pedido publico, editar catalogo, cancelar cita y flujo de doctor.

## Cambios Fase 2

- Nueva tabla `business_settings` para editar nombre, contacto, mapas, redes y horarios desde el admin.
- Promociones con `starts_at` y `ends_at`; el sitio publico solo muestra promociones vigentes.
- Reagendado de citas en `Mis citas` y en el panel admin.
- Boton de confirmacion por WhatsApp despues de solicitar cita.
- El precio del combo en carrito usa la promocion activa administrada.

Despues de actualizar el codigo, aplica las migraciones pendientes con `./scripts/migrate.sh up`.

## Cambios Fase 3

- Code splitting con `React.lazy` para separar carga publica, admin, doctor, login y set-password.
- Monitoreo basico en `src/monitoring.js` con soporte para `window.dataLayer` y `VITE_ANALYTICS_ENDPOINT`.
- Eventos de conversion: solicitud de cita, pedido de cafeteria, clicks de contacto y confirmacion por WhatsApp.
- Script de QA basico: `npm test`.

## Usuarios y roles

No hay cuentas de prueba ni contraseñas fijas: Supabase guarda las
contraseñas cifradas y nadie puede leerlas. Cada persona tiene su propia
cuenta y un rol **por clínica** (una misma persona puede ser especialista
en una clínica y administradora en otra).

### Roles

| Rol (en `tenant_members`) | Se muestra como | Qué ve |
|---|---|---|
| `owner` | Dueño | Todo: resumen, contabilidad, negocio, accesos, derechos ARCO, seguridad |
| `admin_consultorio` | Administración del consultorio | Citas, servicios, especialistas, horarios, derechos ARCO |
| `admin_cafe` | Administración de cafetería | Pedidos, menú, personalización y promociones |
| `doctor` | Especialista | Solo `/doctor`: sus citas, sus pacientes, notas y consentimientos |
| `barista` | Barista | Solo los pedidos de la cafetería |

La fuente de verdad es la tabla `public.tenant_members` (migración 0035): la
base decide los permisos leyendo esa tabla, no lo que diga el token. Un
`owner` aparece en el código como `super_admin`.

### Dar acceso a alguien (lo normal)

1. Entra al panel como dueño y ve a **General → Accesos**.
2. Escribe el correo y elige el rol. Para **Especialista**, primero crea su
   ficha en **Consultorio → Especialistas** y elígela al invitar.
3. Si la persona ya tiene cuenta, recibe una invitación que acepta al
   entrar. Si es nueva, el sistema genera una **contraseña temporal** que
   le compartes; al entrar por primera vez debe cambiarla.

Para probar cada rol sin tener varios correos, con Gmail sirve
`tucorreo+doctor@gmail.com`, `tucorreo+barista@gmail.com`, etc.: llegan al
mismo buzón y cuentan como cuentas distintas.

### El primer dueño de una clínica nueva

Nadie puede invitar si todavía no hay dueño. Se crea una sola vez:

1. Crea el usuario en Supabase → Authentication → Users.
2. En el editor SQL de Supabase (corre con permisos de administrador):

```sql
select public.grant_tenant_role('dueno@ejemplo.mx', 'id-de-la-clinica', 'owner');
```

`grant_tenant_role` no se puede llamar desde la app: escribe permisos y
solo la ejecuta un administrador de la base.

### Verificación en dos pasos

Cualquier persona puede activarla en **Seguridad** (con una app como Google
Authenticator). El dueño puede exigirla a toda la clínica para abrir
expedientes, pero solo después de activar y verificar la suya, para no
quedarse fuera (migración 0039).

## Cambios Fase B

El panel admin ya no expone todo bajo una sola entrada de `Catálogos`. La navegación actual se agrupa por áreas, respetando los permisos de Fase A:

- Administración general
  - Dashboard
  - Negocio
- Cafetería
  - Pedidos café
  - Menú / productos
  - Promociones
- Consultorio
  - Citas
  - Servicios
  - Doctores
  - Especialidades

Esta fase no crea dashboards nuevos ni cambia el modelo de pedidos/citas; solo reorganiza la navegación existente para que cada rol vea secciones claras y autorizadas.

## Cambios Fase C

El flujo de pedidos de cafetería ahora distingue pedidos normales y pedidos ligados a una cita:

- `orders.order_source`: `public_menu`, `appointment`, `admin` o `doctor_reception`.
- `orders.target_ready_at`: hora objetivo para preparar/entregar el pedido.
- `orders.operational_notes`: notas operativas no clínicas, máximo 280 caracteres.
- Estados válidos: `received`, `pending_appointment`, `preparing`, `ready`, `delivered`, `cancelled`.
- Un pedido creado desde una cita entra como `pending_appointment` y se muestra al barista como ligado a cita, sin datos clínicos.
- Si una cita se cancela, el pedido ligado se cancela automáticamente si no fue entregado.
- Si una cita se reagenda, el pedido ligado actualiza su `target_ready_at`.
- El barista sigue pudiendo actualizar solo el estado del pedido.
- El panel de pedidos se suscribe por Supabase Realtime a `orders` y `order_items` para refrescar la cola cuando entran o cambian pedidos.

Despues de actualizar el codigo, aplica las migraciones pendientes con `./scripts/migrate.sh up`. El esquema ya no se aplica de forma monolitica: cada cambio vive en `migrations/` y se aplica una sola vez.
Para actualizacion automatica, activa Realtime en Supabase para las tablas `orders` y `order_items`.

Pruebas manuales recomendadas para esta fase:

1. Crear un pedido normal desde `/coffee`; debe aparecer como `NUEVO` y origen `Menú público`.
2. Crear una cita con café y confirmar el pedido; debe aparecer como `PENDIENTE POR CITA`, origen `Cita` y con hora objetivo.
3. Entrar como `barista`; debe poder pasar un pedido por `Preparar`, `Listo`, `Entregar` o `Cancelar`, pero no crear pedidos.
4. Entrar como `admin_cafe`; debe poder crear pedido manual desde admin con origen `Admin`.
5. Reagendar una cita con pedido vinculado; el pedido debe actualizar su hora objetivo.
6. Cancelar una cita con pedido vinculado; el pedido debe cambiar a `cancelled` si no estaba entregado.

## Cambios Fase D

Se agregó una base mínima para operación del consultorio con separación de datos administrativos y clínicos:

- Nueva tabla `patients` para datos de contacto del paciente.
- Nueva columna `appointments.patient_id`.
- Nueva tabla `appointment_notes` para notas clínicas sensibles.
- Las citas crean o actualizan automáticamente el paciente por correo mediante trigger.
- El doctor ve en `/doctor` dos vistas: `Citas` y `Pacientes`.
- En `Pacientes`, el doctor puede crear, editar y eliminar notas clínicas ligadas a una cita propia.
- Admin consultorio puede gestionar citas y pacientes administrativos, pero no tiene política RLS para leer notas clínicas.
- Barista y admin cafetería no tienen acceso a pacientes ni notas clínicas.
- Las notas clínicas permiten máximo 5000 caracteres y solo `note_type = 'clinical'`.

Despues de actualizar el codigo, vuelve a ejecutar `scripts/supabase-schema.sql` en Supabase para crear `patients`, `appointment_notes`, triggers, indices y politicas RLS.

Pruebas manuales recomendadas para esta fase:

1. Crear una cita nueva y confirmar que se llena `appointments.patient_id`.
2. Entrar con una cuenta de especialista; debe ver solo sus citas.
3. En `/doctor`, abrir `Pacientes`; debe ver solo pacientes relacionados a sus citas.
4. Crear una nota clínica para una cita propia; debe guardarse en `appointment_notes`.
5. Editar y eliminar esa nota desde el panel doctor.
6. Entrar como `admin_consultorio`; debe poder ver citas/pacientes administrativos, pero no notas clínicas.
7. Entrar como `admin_cafe` o `barista`; no debe poder acceder a consultorio, pacientes ni notas.

## Cambios Fase E

Se agregó la base para notificaciones de citas y recuperación de contraseña:

- Nueva tabla `appointment_notifications` como cola/auditoría de notificaciones.
- Eventos generados automáticamente por trigger:
  - `created`
  - `updated`
  - `rescheduled`
  - `cancelled`
  - `reminder` queda permitido para una fase posterior.
- Cada notificación guarda canal, destinatario, estado, intentos, error y payload operativo.
- Estados de notificación: `pending`, `sent`, `failed`, `skipped`.
- El payload no incluye notas clínicas ni motivos sensibles.
- `admin_consultorio` y `super_admin` pueden gestionar la cola.
- Doctor solo puede leer notificaciones relacionadas con sus citas.
- El login ahora tiene `Recuperar contraseña`.
- La recuperación usa `Supabase Auth resetPasswordForEmail` y redirige a `/set-password`.

Despues de actualizar el codigo, vuelve a ejecutar `scripts/supabase-schema.sql` en Supabase para crear `appointment_notifications`, indices, constraints, trigger y politicas RLS.

Configuracion necesaria en Supabase Auth:

- En Auth URL Configuration, agrega la URL del sitio en producción.
- En Redirect URLs, agrega `https://tu-dominio.com/set-password`.
- En desarrollo, agrega `http://localhost:5173/set-password`.
- Configura SMTP en Supabase si quieres enviar correos con dominio propio.

Pruebas manuales recomendadas para esta fase:

1. Desde `/login`, usar `Recuperar contraseña` con un correo existente.
2. Abrir el enlace recibido y cambiar contraseña en `/set-password`.
3. Crear una cita; debe generarse una fila `appointment_notifications` con `event_type = 'created'`.
4. Reagendar una cita; debe generarse `event_type = 'rescheduled'`.
5. Cancelar una cita; debe generarse `event_type = 'cancelled'`.
6. Confirmar que `appointment_notifications.payload` no contiene notas clínicas.

## Cambios Fase F

Preparación final para producción:

- Nuevo script `npm run verify` para ejecutar QA y build en un solo comando.
- QA ampliado para validar:
  - SEO básico: `index.html`, `robots.txt`, `sitemap.xml`.
  - Variables requeridas en `.env.example`.
  - Tablas sensibles y políticas RLS en `supabase-schema.sql`.
  - Roles principales en `permissions.js`.
  - Recuperación de contraseña.
  - Vista de pacientes/notas del doctor.
- `src/config/env.js` centraliza `VITE_ANALYTICS_ENDPOINT`.
- `src/monitoring.js` usa la configuración centralizada.

Checklist final antes de publicar:

1. Ejecutar `npm install`.
2. Ejecutar `npm run verify`.
3. Ejecutar `scripts/supabase-schema.sql` completo en Supabase.
4. Confirmar que RLS está activo en todas las tablas públicas del schema.
5. Activar Realtime en `orders` y `order_items`.
6. Configurar Redirect URLs de Supabase Auth:
   - `http://localhost:5173/set-password`
   - `https://tu-dominio.com/set-password`
7. Configurar SMTP de Supabase Auth si el sitio usará correos reales.
8. Crear usuarios reales y asignar roles con `raw_app_meta_data.role`.
9. Confirmar que ningún usuario use todavía el rol legacy `admin`, salvo transición controlada.
10. Revisar `index.html`, `robots.txt` y `sitemap.xml` con el dominio final.
11. Reemplazar datos temporales del negocio desde admin o `src/businessInfo.js`.
12. Revisar aviso de privacidad con el negocio antes de recibir información real.
13. Probar los flujos manuales por rol.

Pruebas manuales por rol:

- `super_admin`: entra al admin completo, edita negocio, productos, citas, servicios y pedidos.
- `admin_cafe`: ve solo cafetería, puede productos/ofertas/pedidos, no ve consultorio.
- `admin_consultorio`: ve citas, servicios, doctores, especialidades y pacientes administrativos, no ve notas clínicas.
- `doctor`: entra solo a `/doctor`, ve sus citas, pacientes vinculados y sus notas clínicas.
- `barista`: entra solo a pedidos café, cambia estados, no crea productos ni ve consultorio.
- Usuario público: agenda cita, crea pedido normal, crea pedido con cita y consulta páginas públicas.

Pendientes recomendados después del lanzamiento:

- Implementar Edge Function que procese `appointment_notifications` y envíe email/WhatsApp real.
- Agregar auditoría detallada de cambios administrativos.
- Agregar pruebas E2E con Playwright/Cypress cuando el flujo esté estable.
- Configurar monitoreo externo de errores y uptime.
