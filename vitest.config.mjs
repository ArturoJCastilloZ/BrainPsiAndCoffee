import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Pruebas de COMPONENTES (auditoria M8): montan la pantalla en jsdom y la
// usan como una persona — clics, teclado, lo que se anuncia. Las de
// tests/front siguen corriendo con node --test: son de logica pura.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/components/**/*.test.jsx'],
    setupFiles: ['tests/components/setup.js'],
    restoreMocks: true,
  },
});
