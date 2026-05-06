# Brainpsi

Aplicacion web para Brainpsi Coffee: agenda de citas terapeuticas, pedidos de cafeteria y panel administrativo con catalogos editables.

## Caracteristicas

- App para usuarios con home, reservas, menu de cafeteria, carrito y citas.
- Panel admin para revisar dashboard, citas, pedidos y catalogos.
- Tema claro/oscuro persistente.
- Datos persistidos en `localStorage` para uso local/demo.
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
