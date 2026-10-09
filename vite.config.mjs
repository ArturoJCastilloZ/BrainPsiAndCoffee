import { defineConfig } from 'vite';

// Solo opciones del servidor de desarrollo: el build queda igual que sin
// este archivo. VITE_USE_POLLING lo enciende docker-compose (perfil dev),
// porque las carpetas montadas desde Windows no emiten eventos de archivo.
export default defineConfig({
  server: {
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
});
