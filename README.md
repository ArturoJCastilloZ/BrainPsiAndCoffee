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
- Crear al menos un usuario admin con `app_metadata.role = "admin"`.
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
