# Primera entrega: integridad de las reservas

21 de octubre de 2026. Implementación local sobre la revisión de `232aad3`.

## Cambios

- `0042_booking_server_timestamps.sql`: sellos de creación/actualización del servidor para anon/authenticated; el API de personal no puede reescribir created_at. Conserva backfills administrativos. Ordena el trigger antes de los límites y serializa solicitudes anónimas por clínica con un advisory lock de transacción.
- `0043_atomic_public_booking.sql`: RPC invoker para la reserva web anónima. Cita, paciente creado por trigger, notificación y consentimiento participan en una única transacción. El fallo de cualquier paso deshace el conjunto. Valida aceptación explícita y versión/hash del aviso publicado; no recibe tenant como autoridad ni devuelve filas privadas.
- Frontend: una sola RPC por lote nuevo, sin fallback a INSERT separado. Los cambios administrativos existentes conservan su vía con RLS.
- QA: pruebas de API, guardas de versión/hash y SQL de regresión con fixtures aislados; prueba de dos conexiones reales al mismo PostgreSQL. El arnés SQL ahora es ejecutable. El lint excluye worktrees locales y evidencia archivada de la revisión.

## Evidencia de verificación

- `npm run verify`: pasa lint, QA, pruebas Node, 58 pruebas de componentes en 14 archivos y build.
- `./tests/tenancy/run.sh`: pasan los 31 archivos SQL y la prueba adicional de concurrencia.
- Se rechaza la evasión por fecha pasada/futura, y la actualización autenticada conserva el sello original.
- Se rechazan falta de aceptación, versión/hash inventados y cuerpo inválido.
- Un fallo inyectado en el consentimiento no deja cita, paciente ni notificación.
- Un lote cuya segunda cita falla por servicio de otra clínica no conserva la primera cita ni su consentimiento.
- La reserva exitosa conserva tenant/estado/precio/notas impuestos por servidor; un reintento del mismo ID no duplica consentimiento.
- Con una solicitud previa, dos conexiones concurrentes del mismo contacto producen solo una reserva nueva y un consentimiento.
- Después de mejorar la comprobación de futuras versiones en legal.test.mjs, se volvió a ejecutar esa prueba; pasa.
- `git diff --check` y sintaxis bash: pasan.

## Despliegue

No se aplicaron migraciones en Supabase real ni se publicó el frontend. Aplicar `0042` y `0043` por el runner normal antes de publicar el frontend nuevo. Un frontend nuevo sin RPC desplegada falla cerrado; no intenta guardar sin evidencia. Las migraciones anteriores no se editaron.

Al actualizar el aviso en el futuro, modificar su versión y hash mediante una migración nueva antes del frontend correspondiente. El texto actual sigue siendo borrador; estos cambios no sustituyen su revisión legal.

## Límites deliberados de esta entrega

La atomicidad corresponde al flujo web sin sesión que usa la RPC. Se conservaron los permisos históricos de INSERT directo de anon y el registro de consentimiento separado para compatibilidad; no se afirma que todas las escrituras alternativas por Data API deban incluir consentimiento. Cerrar ese acceso y exigir un único canal de alta requiere una migración adicional y actualizar los contratos/pruebas de las integraciones. Los sellos y topes de 0042 sí protegen los INSERT directos anónimos.

No hay idempotencia de respuesta ante una conexión cortada después del commit: el ID repetido produce un error sin duplicar datos, pero el cliente no recupera automáticamente el resultado perdido. El índice de agenda y los límites siguen vigentes. Resolver ese caso debe contemplar un identificador robusto y una respuesta mínima que no convierta el ID de cita en credencial de lectura.

No se cambiaron MFA, login multiclínica, marca, café, paginación ni el resto de la auditoría. No se alteraron datos históricos para intentar corregir fechas previamente manipuladas: la futura instalación debe revisar su estado con un procedimiento específico si hubo exposición real.

## Aplicación a Supabase — 21 de octubre de 2026

Aplicadas 0042 y 0043 a **BrainPsiSaaS**, proyecto `wdxxbhygptnnfgjbtvrt`, con autorización expresa del propietario. Las 41 migraciones anteriores coincidieron por checksum con los archivos locales y solo estas dos estaban pendientes.

La conexión al pooler PostgreSQL por 5432 agotó el tiempo de espera. Se usó la API de administración HTTPS de Supabase con la credencial existente del CLI, sin imprimirla ni persistirla. Ambas migraciones y sus registros se aplicaron en una transacción con revalidación de checksums, bloqueo de migraciones y notificación de recarga de PostgREST.

Verificación posterior:
- Checksums registrados de 0042 y 0043 coinciden con los archivos locales.
- Trigger de fechas presente y habilitado.
- RPC invoker: conserva RLS, ejecutable por anon y no por authenticated.
- Endpoint público accesible: una petición vacía sin consentimiento fue rechazada con HTTP 400 / 23514 antes de insertar datos.

No se crearon citas ni pacientes de prueba en este proyecto. El frontend no se publicó como parte de esta aplicación de migraciones. Este registro actualiza el estado de despliegue descrito antes en el documento.
