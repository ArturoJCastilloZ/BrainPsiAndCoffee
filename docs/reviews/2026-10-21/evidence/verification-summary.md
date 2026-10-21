# Resumen de ejecución

Fecha local de revisión: 2026-10-21. Commit: 232aad3. Node local v26.3.1, npm 11.16.0; CI configura Node 22. La diferencia de runtime es una limitación: no se afirmó equivalencia completa entre build local y CI.

- Instalación desde lockfile: npm ci --ignore-scripts. No se alteraron package.json/package-lock.json.
- verify: exit 1, lint incluyó .claude/worktrees y produjo 42 errores.
- eslint con --ignore-pattern '.claude/**': exit 0.
- npm test: exit 0, Node reporta 51 tests, Vitest 13 archivos/54 tests.
- npm run build: exit 0, bundle inicial 409.00 kB / 130.11 kB gzip.
- tests/tenancy/run.sh directo: exit 126, permission denied; git mode 100644.
- bash tests/tenancy/run.sh: exit 0, 30 archivos SQL.
- Suite con evidencia adicional, última ejecución: exit 0. Notices:
  - AUDIT CONFIRMED: owner at aal1 can disable clinical MFA
  - AUDIT CONFIRMED: anonymous client controls created_at and can postpone 24h expiration
  - AUDIT CONFIRMED: backdated requests bypass two-request email/phone limits
- Primer intento de la evidencia adicional: las dos primeras comprobaciones se observaron antes de que la tercera chocara con un intervalo ocupado por el propio fixture. Se corrigieron únicamente las fechas ficticias; segunda ejecución completa satisfactoria.
- Login con Auth simulado: exit 0 de la reproducción que afirma el rechazo incorrecto de una cuenta multiclínica sin preferencia.
- npm audit: exit 1, dos paquetes high, ambos devDependencies; reporte JSON adjunto.
- Browser skill: inicialización fallida con Cannot redefine property: process. Sin validación visual interactiva.

Los logs de ejecución completos se dejaron en /private/tmp/brainpsi-*. No son parte permanente del repositorio. Se conservan aquí la síntesis, los resultados npm y las reproducciones sin secretos.
