import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// plugin-react: Fast Refresh en desarrollo (editar un componente conserva
// su estado). Estaba instalado y sin usar. VITE_USE_POLLING lo enciende
// docker-compose (perfil dev): las carpetas montadas desde Windows no
// emiten eventos de archivo.
export default defineConfig({
  plugins: [react()],
  server: {
    watch: process.env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
  },
});
