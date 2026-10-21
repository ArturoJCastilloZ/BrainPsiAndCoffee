# Corrección S02: cambios de protección MFA clínica

La RPC `set_clinical_mfa(false)` permitía a un dueño autenticado solo con contraseña retirar la protección del expediente. La migración nueva `0044_clinical_mfa_changes_require_aal2.sql` exige el claim firmado `aal2` para ambos cambios, activar y desactivar. Conserva la comprobación del dueño de la clínica activa y rechaza estados nulos.

La pantalla de seguridad deshabilita «Dejar de exigirla» mientras la sesión no esté verificada y explica cómo continuar. La base impone la regla aunque se invoque directamente la RPC.

## Validación

`npm run verify` completado: lint, QA, pruebas y build correctos. Dos pruebas nuevas de interfaz comprueban que aal1 no envía la operación y aal2 sí puede desactivar la exigencia.

La prueba SQL `0032_clinical_mfa_changes.sql` ejecuta las llamadas como `authenticated`: comprueba el rechazo de aal1, nivel ausente e inválido para activar/desactivar, protección intacta tras los rechazos, rechazo de un doctor distinto del dueño, rechazo del estado nulo y cambios autorizados en aal2. Solo se ejecuta en PostgreSQL desechable con la marca de pruebas obligatoria.

`./tests/tenancy/run.sh` completado: los 32 archivos SQL y la prueba de reservas con dos conexiones concurrentes pasaron.

## Alcance y entrega

Esta corrección cubre el cambio de la exigencia clínica. El reinicio administrativo de factores del personal mediante Edge Function, señalado por separado en la auditoría, sigue pendiente de revisión y corrección.

La migración 0044 está pendiente de aplicar en Supabase. El frontend también está pendiente de publicación. Las migraciones 0042 y 0043 ya aplicadas permanecen intactas.

El dueño debe verificar su sesión para retirar la exigencia. Si perdió su factor, este control requiere una recuperación de cuenta independiente; no se añade una excepción basada únicamente en contraseña.
