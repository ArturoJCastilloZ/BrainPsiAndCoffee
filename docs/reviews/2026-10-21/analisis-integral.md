# BrainPsi: análisis integral en tres pasadas

Fecha: 21 de octubre de 2026. Base revisada: `main`, commit `232aad3`.

## Dictamen

Hay una base técnica aprovechable para un SaaS de consultorios: roles por clínica, aislamiento en PostgreSQL, agenda con restricciones de solapamiento, expediente con notas firmadas inmutables, consentimientos, cobros y pruebas SQL. No recomiendo reescribirla ni agregar microservicios ahora. Recomiendo concentrar el producto en el consultorio, cerrar los defectos de integridad y acceso identificados y convertir el alta y operación de una clínica en un flujo repetible.

El producto todavía no está listo para un piloto con datos clínicos reales. Esta es una valoración de preparación basada en los fallos reproducidos y las verificaciones pendientes, no una afirmación de que haya una filtración actual.

Contexto confirmado por el propietario: sigue en desarrollo, la cafetería posiblemente cerrará y el consultorio continuará; se busca rentarlo como SaaS y conservar la posibilidad de venta. Por ello, el acoplamiento con cafetería y la marca fija son problemas de producto prioritarios, no simples detalles visuales.

## Alcance y método

Tres recorridos con objetivos diferentes: (1) propuesta de valor, journeys, diseño y comercialización; (2) arquitectura, datos, transacciones y operación; (3) seguridad, abuso, pruebas y contraste de los hallazgos anteriores. Se revisaron frontend React/Vite, API Supabase, autenticación, catálogo, agenda, pedidos, expediente, contabilidad, migraciones relevantes, funciones Edge, CI y contenedores. Hay 41 migraciones y 30 archivos de pruebas SQL.

Se aplicaron `security-best-practices` y `security-threat-model`; se leyó y se intentó usar `browser:control-in-app-browser`. El navegador conectado falló al iniciar con `Cannot redefine property: process`; no fue posible obtener una inspección visual interactiva. El análisis de diseño se basa en JSX, CSS, textos y pruebas de componentes; no certifica apariencia renderizada, contraste de todos los estados, teclado ni comportamiento móvil real. No se utilizó otro automatizador para evadir ese fallo.

No se leyeron los valores de `.env`, no se consultó Supabase real ni se ejecutaron migraciones contra servicios del usuario. Las reproducciones usaron cuentas ficticias y PostgreSQL desechable. No hubo cambios al código funcional, publicaciones, commits ni actualizaciones de dependencias. Se instalaron las dependencias del lockfile con `npm ci --ignore-scripts` y se generó `dist/` para verificar el build.

Esto no es un pentest exhaustivo ni una certificación legal. Las prioridades consideran exposición futura como SaaS; en el entorno actual de desarrollo no se infiere explotación ni afectación de pacientes.

## Verificación ejecutada

| Comprobación | Resultado | Interpretación |
|---|---|---|
| `npm run verify` | Falla: 42 errores de lint en `.claude/worktrees/...` | La configuración de lint incluye árboles locales ajenos al proyecto activo. No equivale a 42 defectos del código de `main`. |
| ESLint excluyendo `.claude/**` | Pasa | El árbol activo supera el lint con esa exclusión temporal. No se modificó la configuración. |
| `npm test` | Pasa | QA, 51 unidades/subtests reportados por Node y 54 pruebas de componentes en 13 archivos. No se suman como si fueran idénticas unidades de cobertura. |
| `npm run build` | Pasa | Bundle inicial de unos 409 KB, 130 KB gzip; no se midieron Core Web Vitals. |
| `./tests/tenancy/run.sh` | Falla por permiso ejecutable | Git registra el archivo como `100644`; CI usa precisamente esa invocación. |
| `bash tests/tenancy/run.sh` | Pasa | Se aplicaron las migraciones y pasaron los 30 archivos SQL en PostgreSQL 16 desechable. |
| Comprobaciones SQL adicionales | Tres comportamientos reproducidos | Desactivar MFA con AAL1, fecha futura de reserva y evasión de topes mediante fecha pasada. |
| Reproducción de login con mocks | Falla de producto reproducida | Cuenta con dos clínicas y sin selección guardada es rechazada antes del selector. |
| `npm audit --json` | Dos paquetes clasificados como high | Vite 8.3.0 y source-map-js 1.2.1, ambos de desarrollo. No demuestra ejecución remota en el sitio estático publicado. |

La suite SQL usa stubs de Supabase Auth. Es valiosa para políticas y triggers, pero no verifica el gateway real, envío de correos, límites del proveedor, configuración de JWT, CORS en navegador ni Realtime de una instalación real.

## Pasada 1: producto, enfoque, negocio y diseño

### B01 — Separar el producto SaaS de la marca y operación Brainpsi. Prioridad alta

**Evidencia:** `src/user/UserApp.jsx:111-115` y `:171` fijan nombre y ciudad; `src/user/UserHome.jsx:32` centra la propuesta en café y acompañantes; `src/user/AboutPage.jsx:11` describe consultorio con cafetería. `src/api/catalogs.js:23` carga catálogos clínicos y de cafetería juntos.

**Impacto:** una clínica nueva hereda mensajes, marca y funcionalidades que no corresponden a su negocio. El cierre del café dejaría una promesa comercial incompatible con la operación.

**Mejora:** definir un producto de consultorio independiente y permitir, por clínica, módulos habilitados. La autorización de un módulo debe existir también en servidor: ocultar el menú no basta para deshabilitar pedidos públicos. Separar marca del proveedor, marca de la clínica y contenido público por tenant. Resolver el tenant público mediante dominio o configuración explícita; la cabecera propuesta por el cliente sigue siendo una entrada que la base valida.

**Retirada de cafetería:** desactivar nuevas ventas y rutas públicas del módulo, mantener historial/cobros con acceso restringido y actualizar avisos y métricas. No borrar tablas ni historial para simplificar la interfaz. No construir un sistema genérico de plugins: una configuración pequeña y comprobable basta.

### B02 — Definir un cliente inicial y una promesa verificable. Prioridad alta

La aplicación reúne portal público, agenda, notas, cobros, café, sucursales y gestión de accesos. Esa amplitud aumenta soporte antes de comprobar qué compra un consultorio.

**Hipótesis recomendada:** comenzar con consultorios pequeños de psicología/neuropsicología que necesitan agenda, seguimiento administrativo y expediente separado de recepción. Es una hipótesis de segmentación derivada del código y del negocio actual, no evidencia de demanda de mercado.

**Oferta inicial propuesta:** “Agenda, confirma y documenta la consulta sin mezclar recepción y expediente”. Medir tiempo administrativo, porcentaje de solicitudes confirmadas, ausencias y sesiones efectivamente cobradas. Evitar prometer ahorros o mejoras clínicas sin medirlos en pilotos.

### B03 — Alta de clínicas todavía operativa, no producto repetible. Prioridad alta

**Evidencia:** README, sección del primer dueño: crear usuario y ejecutar `grant_tenant_role` mediante SQL administrativo. No se identificó en el árbol revisado un flujo completo de aprovisionamiento, contratación y activación de un cliente SaaS.

**Mejora:** primero un asistente interno controlado: crear clínica, propietario, marca, sucursal, servicios, especialistas, horarios y prueba de reserva. Debe ser idempotente, registrar resultados y permitir reanudar un alta fallida. Para el piloto no hace falta automatizar tarjetas y facturas de suscripción.

**Criterio de aceptación:** alguien que no escribió el código puede configurar una clínica ficticia y completar reserva, confirmación, consulta y cobro siguiendo un único procedimiento, sin improvisar SQL.

### B04 — Rentar el servicio y vender una instalación son operaciones distintas. Prioridad media

Recomendación comercial, no valoración financiera: comenzar con suscripción y alta acompañada para observar soporte y retención. Probar una tarifa base por clínica y un componente por especialistas activos; definir límites comprensibles, exportación de datos y qué incluye el soporte. No hay información suficiente para fijar precios o una valuación.

Si aparece un comprador, distinguir una licencia o instalación dedicada de una cesión del producto/código. Antes de ofrecerla, documentar propiedad intelectual, licencias, dependencias, exportación, entrega técnica y mantenimiento. La venta de una instalación no debería implicar copiar información de otras clínicas.

### UX01 — Completar la confianza clínica. Prioridad alta antes de captar pacientes

**Evidencia:** `src/user/TherapyPage.jsx:70` ofrece mostrar cédula, pero la vista pública definida en `migrations/0038_minor_bookings_busy_slots.sql:203` no la expone. El visitante anónimo verá “por publicar” aunque exista en la ficha privada. `src/businessInfo.js:3` contiene respaldos identificados como datos de relleno.

**Mejora:** publicar un perfil profesional aprobado para cada especialista: formación verificada, servicios, población atendida, idiomas y la información profesional que se decida hacer pública. No ampliar `therapists_public` con datos privados por conveniencia; crear un contrato explícito de perfil público. Desactivar contactos de relleno en vez de presentarlos como reales.

### UX02 — “Mis citas” no es un portal de seguimiento. Prioridad alta para autoservicio

**Evidencia:** `src/user/MyBookings.jsx:17` y `src/user/UserApp.jsx:54-64`: solo se conservan identificadores en memoria durante esa visita. Cerrar o recargar pierde el seguimiento; los estados locales no acreditan cambios posteriores del consultorio.

**Mejora:** enlace de gestión con token aleatorio robusto, expiración, alcance limitado y revocación; lectura mínima del estado, cancelación y reagendado sujetos a reglas del consultorio. No convertir un ID corto de cita en credencial. Evitar guardar datos clínicos en almacenamiento público del navegador para resolver la persistencia.

### UX03 — Promesas de notificación sin circuito demostrable. Prioridad alta

**Evidencia:** `src/user/CartPage.jsx:96` promete avisar; el README describe `appointment_notifications`, y el esquema base encola eventos. En los servicios revisados no se identificó un consumidor de esa cola que envíe recordatorios o confirmaciones con reintentos. Esto no descarta automatizaciones externas que no estén en el repositorio.

**Mejora:** para consultorio, definir un responsable y plazo de confirmación, acciones desde recepción, escalamiento de solicitudes próximas a vencer y recordatorios medibles. Si se automatiza, usar un trabajador de cola con idempotencia, reintentos, estado de entrega y exclusión de contenido clínico. Mientras sea manual, el texto debe decirlo con precisión.

### UX04 — Consolidar accesibilidad y reducir carga de trabajo. Prioridad media

Hay decisiones acertadas: fuentes autoalojadas y legibles, enlace para saltar contenido, foco al navegar, mensajes asociados a campos, reducción de movimiento y separación entre solicitud y confirmación. Mantenerlas.

Antes del piloto, verificar en navegador tamaños táctiles, foco visible, zoom al 200 %, lectores de pantalla, errores y temas claro/oscuro. Probar agendas densas y nombres largos, no solo pantallas vacías. Adoptar WCAG 2.2 AA como criterio de verificación; esta revisión no demuestra conformidad. [Referencia W3C](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/).

Para recepción, priorizar una cola “por confirmar / hoy / por cobrar”; para el especialista, “mi agenda / expediente”. La cafetería no debe ocupar la navegación clínica cuando está deshabilitada.

## Pasada 2: arquitectura, servicios, datos y operación

### T01 — Pedidos sin transacción. Prioridad alta si se conserva cafetería

**Evidencia:** `src/api/orders.js:49-86`: guardar cabecera, borrar líneas e insertar líneas son peticiones separadas. Una falla después del borrado deja un pedido parcial; el rollback del estado React no revierte las escrituras ya aceptadas.

**Mejora:** una RPC transaccional por operación, validación y precio en servidor, bloqueo del pedido e idempotencia para reintentos. Probar fallo de línea, concurrencia y repetición de petición. Si café se retira antes del piloto, deshabilitar el alta y diferir esta inversión; no dejar el endpoint público habilitado.

### T02 — Reserva y evidencia de privacidad no son atómicas. Prioridad alta

**Evidencia:** `src/api/appointments.js:69-70` inserta la cita y después registra el consentimiento; `:79-95` realiza otra petición. Una caída en la segunda deja una cita real mientras la UI informa que no se guardó. Reintentar puede generar una nueva solicitud o un error de horario.

**Mejora:** operación de reserva que confirme ambas escrituras o ninguna; clave de idempotencia; versión del aviso validada por servidor. El contenido del documento mostrado y sus datos de responsable deben quedar recuperables como evidencia. Probar explícitamente falla entre ambas escrituras.

### T03 — Estado local no identificado por clínica ni usuario. Prioridad alta antes de SaaS

**Evidencia:** `src/hooks/useSupabaseCrud.js:182` no incluye `tenantId` ni identidad de usuario en dependencias de recarga; los borrados `:193-199` dependen solo de permisos booleanos. `src/admin/useAccountingData.js:42` depende de capacidad, no de clínica. El canal Realtime sí cambia por tenant, pero no invalida por sí solo todos los datos ya cargados ni todas las respuestas en vuelo.

**Impacto:** en una transición de sesión/clínica que conserve capacidades, pueden persistir datos o borradores del contexto anterior. No se demostró un salto de RLS ni acceso a una clínica no autorizada. Es un defecto de separación de estado y una posibilidad de registrar cambios en el contexto equivocado. La UI actual no ofrece un selector general permanente: ese alcance limita la reproducibilidad por navegación normal.

**Mejora:** clave de contexto `{userId, tenantId, permisos}`, limpiar datos sensibles al cambiar y descartar respuestas capturadas con otra clave. Aplicarlo también a formularios, expediente y contabilidad. Pruebas con dos clínicas, mismos roles, respuestas lentas y logout durante Realtime.

### T04 — Lecturas sin paginación y sin filtros temporales. Prioridad alta para confiabilidad

**Evidencia:** `src/api/appointments.js:15`, `src/api/orders.js:14`, `src/api/clinical.js:57` y `src/api/accounting.js:65` solicitan listas completas. No hay paginación en esas rutas.

**Impacto:** crecimiento de carga y memoria; además, si la configuración de la API limita filas, los totales calculados sobre la respuesta pueden representar solo una parte del historial. El límite efectivo del proyecto real no se comprobó.

**Mejora:** agenda por rango visible y especialista, pedidos por estado/rango, expediente por paciente, contabilidad por periodo; contadores y agregados en SQL. Paginación estable para historiales y exportaciones. Probar con un volumen superior al límite de filas configurado, no solo con pocas filas ficticias.

### T05 — Concurrencia y latencia sin contratos completos. Prioridad media

`useRemoteState` protege parte del rollback local, pero los upserts no comparan versión de registro. Dos operadores pueden sobrescribir la misma cita. `src/api/rest.js:25` no aporta timeout/cancelación ni una política explícita de reintentos.

**Mejora:** comandos por entidad y transición, `updated_at` o versión como condición de actualización, error de conflicto legible y recarga puntual. AbortController/timeout para lecturas; no reintentar escrituras ciegamente sin idempotencia. Realtime debe actualizar el subconjunto afectado, no todo el historial.

### T06 — El check de seguridad SQL no puede ejecutarse como lo pide CI. Prioridad alta

**Evidencia:** `.github/workflows/ci.yml:53` usa `./tests/tenancy/run.sh`; `git ls-files -s` devuelve `100644` para ese archivo. Reproducción: permiso denegado; mediante `bash` pasa.

**Mejora:** versionar el bit ejecutable o usar `bash` consistentemente en workflow y documentación. Añadir una prueba de checkout limpio. Por separado, excluir `.claude/worktrees/**` del alcance de lint: el `verify` local falló por 42 errores en ese árbol no versionado.

### T07 — Documentación de despliegue contradictoria y baseline incompleto. Prioridad alta operativa

**Evidencia:** README advierte usar migraciones, pero `:336`, `:367` y `:404` todavía indican ejecutar el antiguo `scripts/supabase-schema.sql`; `:411` describe roles globales que el modelo vigente reemplazó. `scripts/migrate.sh:224-264` solo enumera centinelas hasta 0033 y luego rechaza baseline si faltan: con 0034–0041, esa ruta no funciona sin actualizarla.

**Mejora:** un procedimiento vigente de instalación desde cero, actualización y recuperación; historia de fases separada de instrucciones actuales. La negativa del baseline es una protección correcta: completar centinelas, no quitar la validación. Documentar también concurrencia de migradores: actualmente no se identificó un bloqueo global de ejecución.

### T08 — Observabilidad y recuperación todavía no acreditadas. Prioridad alta antes de datos reales

**Evidencia:** `src/monitoring.js:27-30` transmite el mensaje libre de errores; la CSP solo permite conexiones propias y Supabase (`docker/security-headers.conf:22`). Un endpoint externo configurado puede quedar bloqueado. No se identificó en el repositorio un ensayo de restauración ni objetivos de recuperación.

**Mejora:** eventos operativos sin PII, códigos de error, identificador de correlación y alertas de reservas/confirmaciones/cola fallida. Lista permitida para el destino de telemetría y prueba con las cabeceras reales. Definir cuánto dato puede perderse y cuánto puede durar una recuperación; ejecutar una restauración en entorno aislado. Confirmar backups del plan contratado y cobertura de archivos: no inferirlos por usar Supabase. [Documentación de backups](https://supabase.com/docs/guides/platform/backups).

### T09 — Modularizar de forma selectiva. Prioridad media

`DoctorApp.jsx` tiene 817 líneas y `BookingFlow.jsx` 628. Son áreas de riesgo por mezclar carga, permisos, formularios y estados. Separar consultas/comandos de componentes por caso de uso, con límites entre agenda, expediente, accesos y cobros. Mantener Supabase/PostgreSQL como backend principal: no hay evidencia de que microservicios o un framework nuevo resuelvan los fallos encontrados.

## Pasada 3: seguridad y contraste adversarial

El detalle reproducible está en `security_best_practices_report.md` y el modelo contextual en `BrainPsiAndCoffee-threat-model.md`.

| ID | Prioridad | Hallazgo | Estado |
|---|---|---|---|
| S01 | Alta | Fecha de creación anónima manipulable: evade topes y altera caducidad | Reproducido en SQL desechable |
| S02 | Alta | Dueño en AAL1 puede desactivar la exigencia de MFA clínica | Reproducido en SQL desechable |
| S03 | Media | Lectura de notas y auditoría de acceso son operaciones separadas del cliente | Confirmado en código y grants/policies |
| S04 | Media | Topes públicos consumibles y sin control robusto de concurrencia/identidad | Riesgo residual; no se hizo prueba de carga |
| S05 | Alta en tooling; contextual en despliegue | Avisos de Vite y source-map-js | Reportados por npm; ambos devDependencies |
| S06 | Media | Dependencias Edge remotas fijadas solo por major | Confirmado en imports; no se certificó resolución efectiva del proveedor |
| S07 | Media | Captura de mensajes libres de error para analítica | Condicional a configurar receptor; no se demostró envío de PII |
| S08 | Alta de preparación | Aviso y consentimiento clínico declarados borrador | Confirmado; no es dictamen legal |

### F01 — Login multiclínica bloqueado. Prioridad alta funcional

**Evidencia:** `src/api/tenant.js:84` deja tenant nulo cuando hay varias membresías sin preferencia; `src/auth/authService.js:34` deriva rol `user`; `:122-124` cierra sesión por ese rol antes de que `App.jsx:181` pueda ofrecer el selector.

Se reprodujo con el código real de AuthService y un proveedor simulado, sin usuarios ni red reales. **Mejora:** distinguir “autenticado pendiente de elegir clínica” de “sin permisos”; completar selección antes de decidir la ruta/rol. Probar primer ingreso, almacenamiento borrado y cambio de membresías.

### Qué está bien y conviene preservar

- Fuente de autoridad de permisos en `tenant_members`, con comprobación de membresía activa (`migrations/0035_access_hardening.sql:64-99`). No sustituirla por controles de React.
- Restricciones de solapamiento y horario en base, precios establecidos en servidor y límites para modificar pedidos cerrados.
- Notas firmadas y addenda protegidas por triggers, además de RLS.
- Proyección pública de especialistas separada de campos privados.
- MFA restrictiva en tablas clínicas, aunque su desactivación requiere endurecerse.
- Pruebas SQL con marca de base desechable; jamás ejecutarlas en una instalación de cliente.
- Imagen runtime sin root, CSP sin scripts inline ni eval, fuentes autoalojadas y carga diferida de paneles.

## Orden de ejecución recomendado

| Etapa | Entrega | Criterio para avanzar |
|---|---|---|
| 1. Bloqueos | S01, S02, F01, T02 y T06; actualizar dependencias avisadas | Reproducciones convertidas en pruebas que niegan el comportamiento incorrecto; verify y SQL desde checkout limpio |
| 2. Producto de consultorio | B01, marca configurable, retiro funcional de café, perfil público, seguimiento seguro de citas | Una clínica sin café opera de punta a punta sin textos, rutas ni endpoints de café activos |
| 3. Preparación del piloto | Alta repetible, paginación, gestión de contexto, auditoría de lecturas y restauración | Prueba de dos clínicas, revocación, fallo de red, concurrencia y recuperación documentada |
| 4. Validación comercial | Pilotos acotados, soporte y métricas de uso/cobro | Evidencia de que usuarios ajenos al desarrollo completan el trabajo y perciben valor suficiente para pagar |
| 5. Escala y comercialización | Automatizar suscripciones y autoservicio que ya se validaron | Retención, costo de soporte y operación conocidos; exportación/cierre de cuenta definidos |

No añadir ahora videollamadas, IA sobre notas clínicas, marketplace ni facturación compleja para aparentar amplitud. Son inversiones a valorar cuando un piloto identifique una necesidad pagable. El trabajo prioritario es confiabilidad y repetibilidad del consultorio.

## Métricas que faltan para tomar decisiones de negocio

- Embudo: visita → inicio de reserva → solicitud válida → confirmación → asistencia → cobro.
- Tiempo de confirmación y solicitudes vencidas sin revisión.
- Ocupación por especialista/sucursal y periodo; distinguir capacidad disponible de horas de calendario.
- Ausencias, cancelaciones y reagendados con motivos operativos no clínicos.
- Tiempo de alta de una clínica, tiempo hasta la primera cita y carga de soporte por cliente.
- Ingreso recurrente, bajas y margen de contribución cuando existan clientes; no presentar números simulados como resultados.

Definir eventos con privacidad desde el diseño. El identificador de servicio o la ruta de terapia puede revelar contexto de salud aunque no incluya nombre: minimizar granularidad y no exportar identificadores clínicos innecesarios.

## Limitaciones y siguiente validación

No se inspeccionaron paneles de proveedores, planes, backups reales, región, dominio, secretos, protecciones de ramas ni configuración de despliegue efectivo. No se verificó funcionamiento visual en navegador por el fallo de conexión. No se hizo auditoría completa de licencias ni benchmark de competidores o precios. Tampoco se certifica cumplimiento normativo: el borrador de privacidad y el flujo de consentimiento requieren revisión competente antes de operar con datos reales.

Mi recomendación central es convertir lo que ya existe en un SaaS clínico pequeño y sólido antes de ampliar funciones. El principal obstáculo identificado no es falta de pantallas: son las transiciones incompletas entre autenticación, contexto de clínica, escritura de datos y evidencia de lo ocurrido.
