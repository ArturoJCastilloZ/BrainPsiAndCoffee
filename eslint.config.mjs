// Linter (auditoria 2026-10-09, M8). El proyecto no tenia ninguno.
//
// Lo que es error rompe `npm run lint` (y por tanto verify y CI): reglas
// de hooks y fallos reales. Lo que es aviso se reporta pero no frena,
// para poder adoptar el linter sin reescribir 9 000 lineas de golpe; la
// limpieza de esos avisos va aparte.
//
// .mjs porque package.json es "type": "commonjs".
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist', 'node_modules', 'scripts/legacy', 'supabase/functions', 'coverage'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '19' } },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      'react/prop-types': 'off',
      // Texto en español con comillas y apostrofes: no es un error.
      'react/no-unescaped-entities': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Hay ~300 imports de iconos sin usar copiados entre archivos. Aviso,
      // no error: limpiarlos es mecanico y va en su propio cambio.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^React$', args: 'none', caughtErrors: 'none' }],
    },
  },
  {
    // Se sirve tal cual al navegador (no pasa por Vite).
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },
  {
    files: ['tests/**/*.mjs', 'scripts/**/*.mjs', '*.config.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
  },
];
