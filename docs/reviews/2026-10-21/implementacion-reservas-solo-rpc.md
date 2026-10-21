# Escritura pública de reservas solo mediante RPC

La migración nueva `0046_public_booking_rpc_only.sql` revoca INSERT sobre `appointments` y `consents` a `anon` y PUBLIC. La RPC conserva su contrato de entrada y no devuelve filas privadas. Las integraciones que insertaban directamente deben adoptar esta RPC.

## Diseño de permisos

La RPC pasa de invoker a definer con un dueño dedicado `bpc_booking_writer`, no con el dueño de las tablas ni service_role. Este rol es NOLOGIN, NOBYPASSRLS, sin privilegios de administración ni propiedad de tablas. Hereda las policies y lecturas de anon, y recibe INSERT sobre las dos tablas necesarias. No se concede este rol a anon, authenticated ni authenticator. La membresía temporal del ejecutor de migración y el permiso CREATE del esquema se retiran tras cambiar el dueño de la función.

La función exige que el rol de petición sea anon y que `auth.uid()` sea nulo; conserva validaciones de clínica, aceptación, versión/hash y campos permitidos. Mantiene RLS, agenda y precio del servidor. Los triggers reconocen al escritor interno como público, por lo que siguen imponiendo el estado solicitado, las fechas del servidor, el bloqueo por clínica y los topes de contacto.

El rol interno hereda los permisos públicos de anon; su alcance debe revisarse si esos permisos cambian. No acepta SQL arbitrario ni parámetros de tabla o rol. Una futura migración que modifique esta función debe gestionar temporalmente la membresía de su propietario, manteniendo sus atributos restringidos.

El diseño sigue la distinción de Supabase entre [funciones invoker y definer](https://supabase.com/docs/guides/database/functions) y las reglas de [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security). Cambiar a definer con el dueño habitual de las tablas habría evitado RLS; por eso aquí se usa un rol separado que no posee tablas ni BYPASSRLS.

## Pruebas

Los casos históricos que probaban INSERT de bajo nivel ahora usan el rol interno para seguir probando precio, agenda, sellos, menores y RLS. Ya no representan una escritura directa del navegador. Los casos de RPC en 0031 y la prueba de concurrencia siguen ejecutándose como anon.

Se retiró el INSERT general de anon que una prueba antigua concedía a todas las tablas: reabría permisos retirados por las migraciones. El nuevo archivo 0033 comprueba los permisos finales de tabla y columnas, la ausencia de membresías hacia el rol interno, sus atributos, la falta de CREATE en el esquema, el propietario definer, el rechazo de inserts directos, el acceso permitido por RPC y la ausencia de lectura privada para anon.

Validación: `npm run verify` pasó lint, QA, 63 pruebas reportadas por Node, 78 de Vitest y build. `./tests/tenancy/run.sh` pasó los 33 archivos SQL y la prueba de dos conexiones concurrentes, incluyendo rollback de cita/paciente/notificación si falla el consentimiento y rechazo de servicios de otra clínica.

## Orden de despliegue

0046 fue aplicada en BrainPsiSaaS por solicitud explícita del usuario, después de avisar que el frontend publicado todavía no contenía `create_public_booking`. Se verificaron las huellas de las 45 migraciones anteriores y la nueva se aplicó en una transacción con bloqueo y registro de checksum. Las migraciones anteriores aplicadas no se modificaron.

La comprobación remota confirmó: anon sin INSERT de tabla ni columnas en citas y consentimientos; RPC ejecutable por anon, no authenticated; propietario `bpc_booking_writer`; rol sin login ni privilegios administrativos/BYPASSRLS ni CREATE del esquema; anon, authenticated y authenticator sin membresía hacia ese rol. La RPC publicada rechazó una solicitud sin consentimiento con 23514, sin crear citas.

La comprobación de Data API con objetos vacíos rechazó ambos INSERT directos con 42501 (permisos), sin crear datos.

Queda pendiente publicar el frontend con RPC en https://brainpsi.vercel.app/. La versión antigua no puede reservar mediante sus inserts separados desde que se aplicó 0046. El código de frontend compatible está publicado en la rama `bug/saas-review-fixes`, con CI exitoso, pendiente de integrar/publicar en producción. Las pestañas con la versión anterior deberán recargar después de esa publicación.

No se crearon registros clínicos de prueba ni se desplegó frontend al aplicar esta migración. La aceptación registrada es evidencia de lo enviado, no una verificación independiente de identidad del solicitante.
