# Revisión de seguridad de BrainPsi

21 de octubre de 2026 · `main` / `232aad3` · React, JavaScript/TypeScript, Supabase Auth/PostgREST y PostgreSQL.

## Resumen ejecutivo

Se reprodujeron dos fallos de seguridad en PostgreSQL desechable: el visitante controla el sello temporal que usan los límites y la caducidad de reservas; el dueño puede apagar la MFA clínica desde una sesión AAL1. No se encontró una prueba de filtración entre clínicas ni de acceso anónimo a notas; las 30 pruebas SQL existentes pasan con el arnés ejecutado mediante bash. Esa evidencia no cubre todos los flujos del gateway real ni sustituye un pentest.

El proyecto sigue en desarrollo y se orientará a SaaS de consultorios; la cafetería puede retirarse. Las severidades describen impacto potencial después de desplegar, no un incidente actual. No hay hallazgos clasificados como críticos en esta revisión. La ausencia de críticos encontrados no garantiza su ausencia.

## Hallazgos de prioridad alta

### S01 — El cliente anónimo controla `created_at` de las reservas

**Superficie:** alta pública en `appointments`. **Prerequisito:** acceso a la API pública de una clínica; no requiere contraseña.

**Evidencia:** `migrations/0037_booking_request_limits.sql:35-61` cuenta filas según `created_at`, pero `apply_booking_request_rules` en `:69-82` no reemplaza ese campo. `migrations/0036_booking_requests.sql:50-59` usa ese mismo campo para caducar. El mapper normal lo omite (`src/api/mappers.js:251`), pero omitirlo en la UI no impide enviarlo directamente a PostgREST.

**Reproducción:** después de aplicar esquema/migraciones y las 30 pruebas, como rol `anon` se insertó una cita con `created_at = 2100-01-01`; la base lo conservó y no la caducó. Luego se crearon tres solicitudes con igual correo y teléfono, fechas de cita diferentes y `created_at = 2000-01-01`: el límite de dos no las rechazó. Todas las comprobaciones terminaron correctamente en la última ejecución del arnés adicional. Solo se usaron datos ficticios.

**Impacto:** degradación de disponibilidad de agenda, duración de retención del horario manipulada y evasión de topes que facilita contaminar registros de pacientes y generar carga administrativa. No permite leer pacientes por sí mismo.

**Corrección:** sellar `created_at` en servidor antes de evaluar límites/caducidad; hacerlo inmutable. Aplicar contadores o bloqueos transaccionales para concurrencia; añadir control de abuso en una entrada de reserva y cerrar el insert directo cuando se adopte esa entrada. Probar fechas pasadas/futuras, cuerpos omitidos y reservas concurrentes. No confiar en un CAPTCHA exclusivamente del frontend.

**Detección:** solicitudes con antigüedad imposible, picos por tenant, creación de pacientes sin confirmación y solicitudes vigentes fuera de plazo.

### S02 — La MFA de la clínica puede desactivarse sin segundo factor

**Superficie:** RPC `set_clinical_mfa(false)`. **Prerequisito:** sesión AAL1 de un dueño activo.

**Evidencia:** `migrations/0039_compliance.sql:320-337` valida owner; el control AAL2 en `:324` solo se aplica cuando `p_enabled` es verdadero. La política clínica se basa en ese flag (`:279-294`).

**Reproducción:** en el fixture `t_cmp`, con MFA encendida por las pruebas existentes, se estableció una sesión de dueño con `aal1`, se invocó la RPC como `authenticated` y `clinical_mfa_required()` devolvió falso.

**Impacto:** quien comprometa solo la contraseña del dueño puede rebajar una protección de toda la clínica. No es un bypass anónimo ni concede automáticamente a un owner las notas que RLS reserva al autor. Puede habilitar el acceso a pacientes administrativos permitido al owner y facilitar ataques posteriores con otras credenciales comprometidas.

**Corrección:** exigir AAL2 para apagar o rebajar protecciones y para operaciones de recuperación sensibles, con reautenticación reciente donde el proveedor lo permita. Recuperación excepcional por un canal separado, acotado y auditado. Revisar también `supabase/functions/invite-staff/index.ts:227-251`: reinicia factores sin una comprobación explícita de AAL2 del solicitante. Esta rama Edge se revisó estáticamente, no se reprodujo en el proveedor.

**Detección:** alerta a responsables por desactivación de MFA y reinicio de factores; actor, clínica, AAL y correlación. No registrar secretos TOTP ni contraseñas temporales. [Supabase: la MFA debe exigirse en las capas de autorización](https://supabase.com/docs/guides/auth/auth-mfa).

## Hallazgos de prioridad media

### S03 — La auditoría de lectura clínica depende del cliente

**Evidencia:** `src/api/clinical.js:52-63` permite leer notas directamente; `:31-44` escribe auditoría mediante otra RPC. `src/doctor/DoctorApp.jsx:340-344` la solicita después de mostrar el expediente. Un cliente alternativo puede hacer la lectura autorizada sin invocar el registro.

**Impacto:** el usuario no obtiene más notas que las autorizadas por RLS, pero puede leerlas sin dejar la huella específica que la aplicación promete. Incluso el cliente normal puede mostrar información cuando el registro falla.

**Corrección:** RPC de lectura de expediente que aplique autorización y MFA, registre el acceso y devuelva solo el paciente solicitado; revisar permisos de SELECT directo y relaciones anidadas para evitar rutas paralelas. No usar una RPC SECURITY DEFINER como atajo sin controles equivalentes. Supabase advierte que estas funciones pueden ejecutar con privilegios que eluden RLS. [Funciones de base de datos](https://supabase.com/docs/guides/database/functions).

**Validación:** identidad autorizada/ajena, MFA y revocación; toda lectura exitosa debe tener un evento correlacionado y el acceso directo alternativo debe negarse.

### S04 — Límites públicos que permiten denegación y no resuelven concurrencia

**Evidencia:** `migrations/0037_booking_request_limits.sql:54-62`: 15 solicitudes por hora para toda la clínica; `migrations/0039_compliance.sql:121-130`: 20 solicitudes ARCO por día. Son consultas count y comprobación, sin serialización explícita en esas funciones. El insert de pedidos público en `migrations/0005_policies_by_tenant.sql:412-445` tampoco muestra un freno comparable.

**Impacto:** un atacante puede consumir un cupo compartido o inundar las entradas restantes. Dos transacciones simultáneas pueden observar el mismo contador antes de insertar. La restricción de solapamiento sí protege el mismo horario: no confundir ambos controles.

**Corrección:** tras S01, límites por origen y tenant con control transaccional, detección de automatización y desafío verificado en servidor cuando corresponda; permitir canal alternativo real de atención. Probar saturación y concurrencia en staging con datos ficticios. No se ejecutó un ataque de carga.

### S06 — Resolución de dependencias Edge variable

**Evidencia:** primera línea de ambas `supabase/functions/*/index.ts`: `https://esm.sh/@supabase/supabase-js@2`. No se encontró un lockfile Deno versionado en el árbol revisado.

**Impacto:** el lockfile npm no fija por sí mismo el contenido de esos imports remotos. Un despliegue posterior puede resolver otra revisión sin cambio del código de la función. No se identificó código malicioso ni se verificó cómo el proveedor cachea o empaqueta esas funciones.

**Corrección:** versión exacta y resolución reproducible compatible con Supabase, lockfiles si la herramienta los utiliza, revisión de cambios y typecheck/pruebas de integración de funciones Edge en CI. El lint actual las excluye (`eslint.config.mjs:16`).

### S07 — Mensajes libres enviados a observabilidad

**Evidencia:** `src/monitoring.js:27-30` pasa `error.message` al evento; `:17` lo envía al endpoint configurado. Puede incluir contexto no previsto por el contrato del evento. La CSP actual puede bloquear un destino externo.

**Impacto:** exposición condicional de datos si un error contiene valores personales y se configura receptor compatible. No se demostró que se hayan enviado datos ni que exista actualmente ese receptor.

**Corrección:** catálogo de códigos, campos permitidos y redacción centralizada. Separar métricas comerciales y diagnóstico técnico, no incluir contenido clínico ni identificadores de pacientes. Probar con un error sintético que contenga datos ficticios.

## Dependencias: severidad del aviso y exposición efectiva

### S05 — Dos paquetes con avisos high en npm

Reporte íntegro: `evidence/npm-audit.json`.

- `vite@8.3.0`: npm enumera seis avisos, incluyendo problemas del lanzador de editor y lectura de archivos del servidor de desarrollo. Algunos dependen de Windows, del editor o de cómo se expone el servidor. No se intentó explotarlos.
- `source-map-js@1.2.1`: denegación de servicio al procesar ciertos source maps indexados. Dependencia transitiva de herramientas de build/test, incluida PostCSS. [Aviso publicado](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

Ambos están marcados `dev: true` en el lockfile. La imagen runtime copia archivos estáticos y usa nginx: no se demostró que el servidor Vite exista en esa imagen ni que estos avisos sean explotables desde el sitio estático. Sí importan para desarrolladores y CI, especialmente ante entradas no confiables o servidor dev expuesto.

**Acción:** actualizar deliberadamente el lockfile a versiones corregidas según los avisos vigentes y ejecutar verify, SQL y build. No se ejecutó `npm audit fix` ni se modificaron versiones. Añadir revisión automatizada de dependencias y de imágenes; no elevar automáticamente cualquier aviso a “RCE en producción”.

## Preparación de privacidad y evidencia

### S08 — Documentos todavía en borrador y evidencia incompleta

`src/legal/avisoPrivacidad.mjs:22` y `:110` declaran borradores. La huella canónica (`:81-86`) no incluye los valores finales de responsable/domicilio/correo que se sustituyen al mostrar (`:100-103`). El consentimiento clínico registrado por `src/api/compliance.js:104` almacena versión y evidencia declarada, pero no adjunta por sí mismo el documento firmado.

**Mejora:** revisión profesional del contenido, responsables claros, snapshot o referencia inmutable del texto exacto entregado y relación verificable con la evidencia obtenida. Definir identidad del tutor, conservación, acceso, exportación y atención de solicitudes. No afirmar cumplimiento normativo por tener tablas o un checkbox. No se emite una interpretación jurídica en este informe.

La reserva y su consentimiento no son atómicos; ver T02 del informe integral. La identificación del paciente por correo de contacto y nombre de menor (`migrations/0038_minor_bookings_busy_slots.sql:96-156`) requiere además un proceso de verificación/conciliación: un visitante no ha demostrado ser titular de ese correo. No debe convertirse una coincidencia de contacto en prueba de identidad clínica.

## Controles comprobados y límites

La suite existente pasó aislamiento por tenant, roles, inmutabilidad de notas, reglas de precios, cobros, acceso a pacientes, MFA clínica en AAL1/AAL2, sucursales y restricciones de agenda. Se conservan como controles valiosos. Las comprobaciones adicionales demuestran que una suite verde no cubre cada camino de abuso.

No se auditó el contenido histórico completo de Git en busca de secretos ni se analizaron imágenes con un escáner de CVE. No se verificaron políticas/funciones efectivamente desplegadas, TTL real de sesiones, correos, permisos del equipo Supabase, backups contratados o branch protection. No se inspeccionaron valores secretos locales.

## Reproducción y remediación

- `evidence/additional-security-checks.sql` depende de los fixtures de la suite; contiene una guarda de banco desechable. No ejecutar en Supabase real. En esta revisión se añadió temporalmente al arnés después de los 30 archivos, antes de eliminar el contenedor.
- `evidence/reproduce-multitenant-login.cjs` se ejecuta desde la raíz del repo con Node y usa solo mocks. Prueba F01 funcional, no una intrusión.
- Las reproducciones adicionales fueron temporales; se conservaron como evidencia, no como pruebas de regresión que aprueben el comportamiento inseguro. Al corregir, deben invertirse sus expectativas.

Orden de seguridad: S01 → S02 → transacción reserva/consentimiento → lecturas auditadas/contexto de tenant → preparación documental/recuperación. Actualizar tooling avisado en paralelo con sus verificaciones. Cada corrección necesita una migración nueva si cambia SQL aplicado; no editar migraciones históricas.
