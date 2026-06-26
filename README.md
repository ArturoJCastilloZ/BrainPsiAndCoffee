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

## Acceso admin demo

En modo local/demo, las credenciales del admin son:

```text
Usuario: admin
Password: brainpsi
```

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
- Ejecutar `scripts/supabase-schema.sql` en el proyecto Supabase de produccion y confirmar que RLS queda activo.
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

Despues de actualizar el codigo, vuelve a ejecutar `scripts/supabase-schema.sql` en Supabase para crear columnas/politicas nuevas.

## Cambios Fase 3

- Code splitting con `React.lazy` para separar carga publica, admin, doctor, login y set-password.
- Monitoreo basico en `src/monitoring.js` con soporte para `window.dataLayer` y `VITE_ANALYTICS_ENDPOINT`.
- Eventos de conversion: solicitud de cita, pedido de cafeteria, clicks de contacto y confirmacion por WhatsApp.
- Script de QA basico: `npm test`.

## Usuarios de prueba recomendados

Crea estos usuarios desde Supabase Auth para probar roles. Por seguridad y compatibilidad, no se insertan directo en `auth.users` desde el schema.

```text
Admin
Correo: admin@brainpsi.test
Password: BrainpsiAdmin123!

Doctor
Correo: doctor@brainpsi.test
Password: BrainpsiDoctor123!
```

Despues de crearlos, asigna roles con SQL. Reemplaza los correos si usaste otros:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'admin')
where email = 'admin@brainpsi.test';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'doctor', 'therapist_id', 't1')
where email = 'doctor@brainpsi.test';

update public.therapists
set email = 'doctor@brainpsi.test',
    user_id = (select id from auth.users where email = 'doctor@brainpsi.test')
where id = 't1';
```

Con esos usuarios puedes probar: login admin, edicion de catalogos, negocio, ofertas, citas, pedidos y panel doctor.

## Roles y permisos

La fuente de verdad para permisos criticos es `auth.users.raw_app_meta_data.role` en Supabase Auth. La tabla `public.profiles` existe como espejo administrativo para futuras pantallas de usuarios, pero las politicas RLS usan `app_metadata`.

Roles soportados:

```text
super_admin
admin_cafe
admin_consultorio
doctor
barista
```

Compatibilidad: el rol antiguo `admin` se interpreta como `super_admin`.

Asignar rol a usuarios existentes:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'super_admin')
where email = 'admin@brainpsi.test';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'admin_cafe')
where email = 'admin-cafe@brainpsi.test';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'admin_consultorio')
where email = 'admin-consultorio@brainpsi.test';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'barista')
where email = 'barista@brainpsi.test';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'doctor', 'therapist_id', 't1')
where email = 'doctor@brainpsi.test';
```

Matriz aplicada en esta fase:

| Rol | Acceso frontend | Datos Supabase principales |
|---|---|---|
| `super_admin` | Admin completo actual | Gestiona productos, ofertas, citas, consultorio, pedidos, negocio y perfiles |
| `admin_cafe` | Pedidos y catalogos de cafeteria | Gestiona productos, ofertas, pedidos y order items |
| `admin_consultorio` | Citas y catalogos de consultorio | Gestiona citas, servicios, doctores, especialidades y vinculos terapeuta-servicio |
| `doctor` | Solo `/doctor` | Gestiona solo citas de su `therapist_id` |
| `barista` | Solo pedidos de cafeteria | Lee pedidos/items y actualiza estado de pedidos |

Despues de cambiar roles en Supabase, el usuario debe cerrar sesion y volver a entrar para recibir el nuevo JWT.

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

Despues de actualizar el codigo, vuelve a ejecutar `scripts/supabase-schema.sql` en Supabase para crear columnas, constraints, indices, funciones y triggers nuevos.
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
2. Entrar como `doctor@brainpsi.test`; debe ver solo sus citas.
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
