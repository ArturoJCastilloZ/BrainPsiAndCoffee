# Segundo factor para reiniciar MFA del personal

La Edge Function `invite-staff` comprobaba que el llamante fuera dueño activo, pero permitía la acción `reiniciar_mfa` desde una sesión con contraseña sola. Ahora exige un token Bearer con claims verificados mediante `auth.getClaims(token)`, sujeto coincidente con el usuario comprobado por `getUser()` y nivel `aal2`. La comprobación ocurre antes de buscar al destinatario o tocar factores usando service_role. Errores de verificación, nivel ausente o distinto y sujetos distintos rechazan la operación.

Se conserva la consulta de la membresía activa del dueño en base de datos. También se conservan las restricciones del destinatario: no uno mismo, no otro dueño y no cuentas vinculadas a otras clínicas. El panel explica que el dueño debe verificar su sesión en Mi cuenta → Seguridad antes de mostrar la confirmación.

## Evidencia

Doce pruebas en `tests/front/staff-mfa-assurance.test.mjs` ejecutan el handler TypeScript real (sin sus imports de red), con clientes Supabase simulados. Cubren aal1, nivel nulo/desconocido, error de firma, sujeto distinto, error de red, ausencia de Bearer, éxito con aal2 y restricciones de dueño/destinatario. Comprueban que el rechazo por nivel ocurre antes de buscar usuarios o listar/borrar factores. No son pruebas del servicio Auth real ni de criptografía: esta se delega al SDK.

Una prueba de interfaz adicional verifica que una sesión aal1 recibe instrucciones y no abre la confirmación ni invoca la API. La prueba existente conserva el reinicio autorizado con aal2.

Validación final: `npm run verify` pasó lint, QA, 63 pruebas reportadas por Node, 68 de Vitest y build. También pasó `./tests/tenancy/run.sh`: 32 archivos SQL y la prueba de dos conexiones concurrentes. Las 45 migraciones remotas coinciden con sus checksums locales tras aplicar 0044 y 0045.

La elección de `getClaims` sigue la [documentación oficial de Supabase](https://supabase.com/docs/reference/javascript/auth-getclaims), que verifica la firma del JWT; no se usa una decodificación manual como autorización.

## Entrega

`invite-staff` fue desplegada en BrainPsiSaaS por solicitud del usuario mediante el CLI de Supabase, incluyendo `index.ts`, `password.mjs` y `mfa-assurance.mjs`. La consulta posterior confirmó estado ACTIVE, versión 10 y `verify_jwt: true`. No se desactivó JWT ni se modificaron los secretos de la función. No requiere otra migración de base de datos.

Una llamada vacía sin autenticación al endpoint desplegado fue rechazada con HTTP 401. No se ejecutó un reinicio MFA sobre usuarios reales; los casos aal1/aal2 y los destinatarios restringidos se verificaron en las pruebas del handler de esta entrega.

El frontend de esta entrega sigue pendiente de publicación. El control servidor del segundo factor ya se aplica, aunque el cliente antiguo no muestre la nueva ayuda. No se reiniciaron factores de cuentas reales. La recuperación del propio dueño continúa fuera de este flujo y no se incorpora una excepción basada solo en contraseña.
