import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import prerender from './scripts/prerender.mjs';

// plugin-react: Fast Refresh en desarrollo (editar un componente conserva
// su estado). Estaba instalado y sin usar. VITE_USE_POLLING lo enciende
// docker-compose (perfil dev): las carpetas montadas desde Windows no
// emiten eventos de archivo. prerender: un HTML por ruta con su <head>
// (ver scripts/prerender.mjs).
export default defineConfig({
  plugins: [react(), prerender()],
  server: {
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
});
