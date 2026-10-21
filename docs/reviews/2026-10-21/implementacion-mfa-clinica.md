# Corrección S02: cambios de protección MFA clínica

La RPC `set_clinical_mfa(false)` permitía a un dueño autenticado solo con contraseña retirar la protección del expediente. La migración nueva `0044_clinical_mfa_changes_require_aal2.sql` exige el claim firmado `aal2` para ambos cambios, activar y desactivar. Conserva la comprobación del dueño de la clínica activa y rechaza estados nulos.

La pantalla de seguridad deshabilita «Dejar de exigirla» mientras la sesión no esté verificada y explica cómo continuar. La base impone la regla aunque se invoque directamente la RPC.

## Validación

`npm run verify` completado: lint, QA, pruebas y build correctos. Dos pruebas nuevas de interfaz comprueban que aal1 no envía la operación y aal2 sí puede desactivar la exigencia.

La prueba SQL `0032_clinical_mfa_changes.sql` ejecuta las llamadas como `authenticated`: comprueba el rechazo de aal1, nivel ausente e inválido para activar/desactivar, protección intacta tras los rechazos, rechazo de un doctor distinto del dueño, rechazo del estado nulo y cambios autorizados en aal2. Solo se ejecuta en PostgreSQL desechable con la marca de pruebas obligatoria.

`./tests/tenancy/run.sh` completado: los 32 archivos SQL y la prueba de reservas con dos conexiones concurrentes pasaron.

## Alcance y entrega

Esta corrección cubre el cambio de la exigencia clínica. El reinicio administrativo de factores del personal mediante Edge Function, señalado por separado en la auditoría, sigue pendiente de revisión y corrección.

Las migraciones 0044 y 0045 fueron aplicadas en BrainPsiSaaS por la API de gestión de Supabase. Se verificaron las huellas de las 43 migraciones previas antes de 0044 y se registraron las nuevas en transacciones con bloqueo. La comprobación independiente confirmó que la función exige aal2 para todos los cambios y que authenticated conserva ejecución.

La comprobación remota de 0044 detectó además un grant heredado de ejecución para anon. La migración adicional 0045 lo retira explícitamente; la comprobación posterior confirmó `anon_can_execute: false`. Se agregó una aserción SQL de regresión de este permiso. No se crearon pacientes ni usuarios de prueba en la base remota ni se cambió la configuración MFA de ninguna clínica.

El frontend sigue pendiente de publicación. Las migraciones 0042, 0043 y 0044 ya aplicadas permanecen intactas.

El dueño debe verificar su sesión para retirar la exigencia. Si perdió su factor, este control requiere una recuperación de cuenta independiente; no se añade una excepción basada únicamente en contraseña.
