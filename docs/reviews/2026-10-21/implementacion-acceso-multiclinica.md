# Corrección F01: acceso con varias clínicas

El inicio de sesión rechazaba cuentas válidas con varias membresías y ninguna clínica guardada: antes de llegar al selector, su rol provisional `user` se interpretaba como falta de permisos.

`src/auth/authService.js` permite ahora continuar al selector cuando alguna membresía de `app_metadata` permite acceso al panel. La sesión conserva `tenantId: null` y rol `user` hasta elegir. Si ya hay clínica elegida, se valida exclusivamente su rol; no se heredan permisos de otra membresía. No se usan los roles editables de `user_metadata`.

La selección y `reloadSession()` existentes derivan el rol de la clínica elegida. No hay cambios en RLS, membresías ni migraciones. Se conserva la consulta del segundo factor durante el login; esta entrega no constituye una auditoría completa del flujo MFA.

## Validación

Siete pruebas de regresión en `tests/components/auth-multitenant.test.jsx` cubren selección y cambio de rol, acceso con una sola clínica, selección guardada revocada, rechazo sin permisos aunque otra clínica tenga acceso, membresías vacías/desconocidas, datos editables ignorados y solicitud de segundo factor.

`npm run verify` completado: lint, QA, 51 pruebas reportadas por Node, 65 pruebas de Vitest y build correctos. Las pruebas de autenticación usan un cliente simulado y la lógica real de selección de clínica; no autentican cuentas reales ni comprueban visualmente el navegador.

El reproductor histórico `evidence/reproduce-multitenant-login.cjs` documenta el comportamiento anterior y no es una prueba de regresión: su aserción de rechazo ya no corresponde al código corregido.

## Entrega

Cambio local pendiente de publicación del frontend. No requiere aplicar migraciones ni modifica datos en Supabase.
