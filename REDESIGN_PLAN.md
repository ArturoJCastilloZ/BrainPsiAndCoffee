# BrainPsiAndCoffee — Plan de rediseño

> Documento vivo. Se actualiza al cerrar cada fase.
> **Estado: FASE 0 (auditoría) COMPLETA — esperando aprobación para la Fase 1.**

---

## Contexto

BrainPsiAndCoffee integra **dos negocios** en una sola plataforma —cafetería y consultorio
psiquiátrico— más un nivel de **dueño** que necesita verlos por separado y consolidados.

**Corrección de premisa (registrada el 18 sep 2026).** El encargo describía el proyecto como
"exclusivamente frontend en React". No lo es: hay **28 migraciones SQL**, el modelo de seguridad
vive en **RLS de Postgres**, hay **Edge Functions** en TypeScript y una suite de 35 aserciones
contra Postgres. El dev decidió **mantener RLS y migraciones dentro del alcance** de la
auditoría. La decisión importa: el bucle infinito que rompía el panel doctor tenía su causa en
un hueco de RLS, y una auditoría "solo frontend" lo habría parcheado sin verlo.

## Objetivos

Elevar UI, UX, arquitectura frontend, design system, responsive, accesibilidad, performance,
mantenibilidad y utilidad de negocio — **sin reescribir lo que funciona** y sin perder funciones.

## Estado actual (medido)

| | |
|---|---|
| LOC en `src/` | 9,531 (7,520 en `.jsx`) |
| Estructura | `src/{admin,doctor,user,components,api,auth,hooks,config}` — **por tipo de usuario, no por dominio** |
| Archivos mayores | `supabaseData.js` 980 · `AdminAppointments.jsx` 835 · `DoctorApp.jsx` 713 · `AdminAccounting.jsx` 652 |
| Estilos | **inline**, 835 `style={{`  (~1 de cada 9 líneas). Sin archivos CSS |
| Media queries | **4**, en 2 archivos |
| Bundle inicial de `/` | ~637 KB raw / **~146 KB gz** |
| Tests | 13 de front (`npm test`) + 35 aserciones de aislamiento (`tests/tenancy/run.sh`) |
| ESLint | **no existe** |
| RLS | 9 tablas, 47 funciones `security definer`, 27 policies `for all` |

---

# Problemas encontrados

Ordenados por impacto. **[V]** = verificado ejecutando o leyendo la línea; **[I]** = inferencia.

## P0 · Bugs que producen datos malos o bloquean una función

### P0.1 — Reagendar una cita falla SIEMPRE **[V, probado ejecutando]**
`AdminAppointments.jsx:179` llama a `getTimeSlotStates` con **6 argumentos**; la firma
(`:792`) tiene **7** y el que falta es `schedules`. El panel que *pinta* los horarios (`:616`)
sí lo pasa.

Prueba ejecutada sobre `agenda.mjs`: con `schedules` → **10 horarios disponibles**; sin
`schedules` → **0**. La UI ofrece horarios válidos y el guardado los rechaza todos con
*"Ese horario ya no está disponible"*.

Arreglo: añadir el 7º argumento. Causa raíz: 7 parámetros posicionales; `agenda.mjs:84` ya usa
objeto con nombres y no sufre esta clase de error.

### P0.2 — La reserva pública ignora los horarios configurados **[V]**
`grep -c "schedules" src/user/BookingFlow.jsx` → **0**. Lo mismo en `MyBookings.jsx`.

Hay **tres motores de disponibilidad** divergentes:

| # | Dónde | Horario | Días |
|---|---|---|---|
| 1 | `agenda.mjs:63-117` | `schedules` reales, buffers, intervalo, anticipación | derivados |
| 2 | `BookingFlow.jsx:486-517` | **hardcodeado 9:00–19:00**, `duration + 10` | **martes–sábado fijos** |
| 3 | `MyBookings.jsx:192-215` | idéntico al #2 | idéntico |

Un consultorio que configure lunes 8:00–13:00 **seguirá recibiendo reservas martes–sábado
9:00–19:00** desde la web. El dato ya está disponible en `catalogs.schedules`; simplemente no se
usa.

### P0.3 — La app puede mostrar al paciente precios inventados **[V]**
`useSupabaseCrud.js:55-64` inicializa los catálogos con los **datos demo hardcodeados**
(`THERAPY_SERVICES` con precios 600/550/800/900/2500, `MENU`, `OFFERS`, `BUSINESS`). Antes de
que cargue la consulta —y si falla— la página pública muestra precios ficticios. Con la `0028`
la cita se congela al precio **real**: el paciente ve un precio y se le cobra otro.

El equipo ya tomó la decisión correcta para un catálogo (`:60`: *"Inventarlos sería ofrecerle al
cliente un sabor que el negocio no tiene"*) pero no la aplicó a los demás.

**Y el fallback está roto en ambos sentidos**: 10 sitios hacen `catalogs?.X || FALLBACK`, y en JS
`[] || X === []` (verificado ejecutando). Cuando la consulta devuelve cero filas —el caso para el
que se escribió— **no entra**; cuando está `undefined` (cargando) entra y enseña datos falsos.

### P0.4 — Un fallo de carga se le presenta al doctor como un hecho clínico **[V]**
`DoctorApp.jsx:321` hace `return` con el estado vacío **antes** de que se pinte el banner de
error (`:377`). Si `loadPatients` falla, el doctor lee *"Aún no hay pacientes vinculados"*.

### P0.5 — La pantalla puede mentir sobre lo que se guardó **[V]**
`useSupabaseCrud.js:28-37`: `setAndSave` aplica el cambio local y si el guardado falla solo hace
`setError` — **el estado local conserva el cambio**. Sin rollback ni reconciliación.

## P1 · Accesibilidad

### P1.1 — Foco invisible en toda la app **[V]**
**0 reglas `:focus`** en `src/` y **16 `outline: 'none'`** sin reemplazo. Con estilos inline no
hay dónde declarar el sustituto. Fallo de **WCAG 2.4.7**.

Peor caso: los tres inputs del **Login** llevan `border:'none'` **y** `outline:'none'`. Navegarlo
con teclado es a ciegas. No es descuido general: esos mismos inputs tienen `id`, `autoComplete`,
`aria-invalid`, `aria-describedby` y `required`.

### P1.2 — Contraste que falla AA **[V, calculado y triangulado dos veces]**

| Par | Modo | Ratio | Veredicto |
|---|---|---|---|
| `--admin-accent-text` / superficie | **claro** | **2.99** | FALLA |
| `--admin-accent-text` / sidebar | **claro** | **2.94** | FALLA |
| `--admin-subtle` / superficie (placeholder) | **oscuro** | **2.88** | FALLA |
| `--bp-rust-alpha-40` + rust-text | oscuro | 2.82 | FALLA |
| `--admin-border` / superficie | ambos | 1.26–1.38 | FALLA 3:1 (WCAG 1.4.11) |

El acento en claro pinta "ADMIN", "PANEL DOCTOR", "Menú", "Volver a app", "Modo claro" y
"Cerrar sesión" — texto de 10–12 px, donde AA-large ni siquiera aplica. El mismo token en oscuro
da **8.81**: la accesibilidad del acento existe solo en modo oscuro.

### P1.3 — Objetivos táctiles por debajo de 24 px **[V]**
`BookingFlow.jsx:106` (~18 px, botón "Atrás" del flujo del paciente), `CartPage.jsx:113` (~18 px),
`SetPassword.jsx:130` (~20 px, toggle de contraseña). `Login.jsx:142` ya resuelve el mismo
componente en **44×44 con margen negativo**: el patrón correcto existe y no se copió.

### P1.4 — Botones solo-icono sin nombre accesible **[V]**
140 `<button>` y 21 `aria-label`. Al menos 7 solo-icono sin etiqueta, incluidos **los dos toggles
de contraseña**.

## P2 · Responsive

### P2.1 — `AdminApp.jsx:202` `minWidth: 900` anula TODO el responsive del admin **[V]**
| Viewport | Scroll horizontal forzado |
|---|---|
| 375 px | **573 px** — se ve el 39.6% del contenido |
| 768 px | **180 px** — se ve el 81% |

Las rejillas `auto-fit` de las pantallas **nunca se disparan**, porque el contenedor padre siempre
mide ≥900 px. Es el prerrequisito: hasta quitarlo, ningún otro arreglo responsive se nota.

### P2.2 — `DoctorApp.jsx:333` — 206% de desbordamiento en móvil **[V]**
`minmax(230px, 0.3fr) minmax(420px, 1fr)` + gap 24 = piso de **674 px**. A 375 px hay 327 px
disponibles. Dos columnas fijas sin `auto-fit`: **no colapsa jamás**. Es la pantalla donde se leen
notas clínicas.

### P2.3 — Otros pisos rígidos **[V]**
`AdminAppointments.jsx:260` `repeat(3, minmax(190px,1fr))` = **598 px** inamovibles.
`AdminSchedules.jsx:227` columna fija 104 px + columna `auto` no comprimible ≈ **478 px** por fila.
Las **4 tablas de `AdminAccounting` no tienen wrapper `overflowX`**, así que el scroll arrastra la
página entera en vez de solo la tabla.

### P2.4 — El header móvil se coloca al lado, no encima **[I, del flujo CSS]**
`AdminApp.jsx:186` es hijo de un flex-row (`:108`); `position: sticky` no lo saca del flujo.

### P2.5 — Lo que SÍ está bien
`BookingFlow.jsx` —el flujo del paciente, el más usado desde el teléfono— **no desborda**. Es el
archivo que mejor respeta el móvil.

## P3 · Sistema visual: no hay escala, hay literales **[V]**

| | Valores distintos | Sano |
|---|---|---|
| `fontSize` | **26** (402 usos) | 5–8 |
| `borderRadius` | **15** | 4–5 |
| `padding` | **100 combinaciones** | — |

28 usos de medios píxeles (`9.5`, `11.5`, `12.5`, `13.5`) son ajustes ad-hoc. `50` y `999`
conviven para el mismo concepto. El 65% de la UI vive en 10/11/12/13 px: cuatro tamaños casi
indistinguibles — de ahí la inconsistencia percibida.

**~99 hex y ~24 rgba fuera del sistema de tokens.** `MenuPage.jsx:122-134` tiene **una paleta
paralela de 13 claves** que **ya derivó** del canónico. `Login.jsx` reimplementa los `--admin-*` a
mano. `theme.js` expone 25 alias para 36 tokens: 7 quedan inalcanzables.

**El dark mode es híbrido**: la capa `--admin-*` está genuinamente diseñada (los neutros llevan
tinte verde propio, el sidebar invierte su relación con el fondo, los alpha se reducen). La capa
`--bp-*` es en buena parte inversión mecánica: `--bp-sage-deep` vale **beige** en oscuro — **la
familia "sage" deja de ser verde**, y de ahí sale el fallo de contraste P1.2.

## P4 · Arquitectura y performance

### P4.1 — Supabase completo (64 KB gz) se descarga en la landing pública **[V]**
`permissions-tHjzyxfM.js` = 241 KB raw / 64 KB gz, dependencia estática de `index`. Incluye
Realtime, que solo se suscribe con sesión de cafetería. El **code splitting sí existe y funciona**
(`App.jsx:14-18`) — eso no se toca.

### P4.2 — Dos `useMemo` que nunca cachean **[V]**
`BookingFlow.jsx:19-20` recrea `services`/`therapists` con `.filter()` en cada render; alimentan
los memos de `:371` y `:378`, que se invalidan siempre. Es `useMemo` que cuesta y no da nada.

### P4.3 — Duplicación con consecuencia **[V]**
`toMinutes`/`fromMinutes` ×4 · `localISO` ×2 · `isBusinessDay` ×2 · el botón de cobro duplicado
(`AdminOrders.jsx:295` y `AdminAppointments.jsx:578`) — **dominio de dinero, dos sitios donde
arreglar un bug de saldo**.

### P4.4 — Props drilling de 4 niveles, sin contexto **[V]**
Cero `createContext`. `App.jsx:148-152` repite el mismo bloque de 8 props en **cinco rutas**. Dos
props **muertas** (`dataLoading` pasada 5 veces y nunca destructurada; `seedCatalogs` igual) — el
síntoma de que nadie puede seguir una lista de props tan larga.

`UserApp` mantiene navegación en `useState` **en paralelo a react-router**: navegar dentro no
cambia la URL, así que no hay back del navegador ni enlace compartible.

### P4.5 — Sin ESLint **[V]**
336 imports de iconos sin usar (el mismo bloque de 37 copiado en 9 archivos). Costo de bundle
**cercano a cero** (tree-shaking funciona) — es ruido de mantenimiento que ningún linter atrapa.

## P5 · Seguridad frontend

### P5.1 — XSS almacenado vía `href` **[V]**
`AdminCatalog.jsx:498-499` (campos "INSTAGRAM URL" / "GOOGLE MAPS URL", texto libre, sin
validación) → `businessInfo.js:17-21` (spread crudo) → `ContactPage.jsx:29` (`<a href={...}>`).
Un admin puede escribir `javascript:…` y se sirve a **todo visitante público**. React no
neutraliza `javascript:` en `href`. El `startsWith('http')` de `:29` solo decide `target`, no es
defensa. Es el único XSS explotable del repo.

### P5.2 — `react-router-dom` vulnerable en el bundle de producción **[V]**
`npm audit`: **5 vulnerabilidades (1 low, 4 high)**. Las de `vite` y `nanoid` son de build. Las de
`react-router-dom` **sí viajan al cliente**, e incluyen open redirect y XSS por falta de
validación de protocolo — misma familia que P5.1. Fix disponible.

### P5.3 — Datos clínicos sin filtro redundante **[V]**
`loadPatients()` y `loadClinicalNotes()` piden **todas** las filas sin un solo `.eq()`. RLS es el
único control; el filtrado en pantalla es cosmético sobre datos ya descargados. Si una policy se
rompe, el navegador del doctor recibe el expediente completo y React lo pinta.

### P5.4 — Sin CSP **[V]** · `index.html` no tiene ninguna `<meta http-equiv>` de seguridad, con
el JWT en `localStorage`.

### P5.5 — Lo que está limpio **[V]**
0 sinks directos de XSS · 0 PII en storage · **0 PII en los 4 payloads de analítica** (exclusión
deliberada y verificada) · 0 secretos versionados · limpieza de sesión correcta · rol solo desde
`app_metadata` · error de login no enumerable · `autoComplete` correcto en los 4 campos sensibles.

## P6 · RLS y migraciones (en alcance por decisión del dev)

- 🔴 **`0028` sin aplicar**: con la anon key se crea una cita en `$0` o negativa, y un admin
  registra un cobro de cualquier cifra. Vivo en producción.
- 🔴 **El doctor no tiene policy propia en `therapy_services`, `therapist_services` ni
  `specialties`.** Sí la tiene en 9 tablas. Hay una policy pública que depende del header
  `x-tenant-id` y podría alcanzarle — **pendiente de medir en una sesión de doctor**.
- `moverCalendario` usa `setMonth`, que desborda con días 29-31 (31 ene + 1 mes = 3 mar).

---

# Oportunidades de negocio

Verificadas contra el modelo real. **Ninguna requiere migración** salvo donde se indica.

## ☕ Cafetería
| Pregunta | Estado |
|---|---|
| Ingreso por producto · evolución 6 meses | **EXISTENTE** |
| Productos más vendidos | **MEJORA** — "Núm." cuenta *líneas de pedido*, no unidades |
| Ticket promedio | **OPORTUNIDAD** — `orders.total` ya está en memoria |
| Ventas por hora y por día | **OPORTUNIDAD** — `created_at` es timestamp completo |
| Productos que se compran juntos | **OPORTUNIDAD** — cada pedido trae su canasta |
| Qué promociones funcionan | **FUTURO** — `combo_savings` dice *cuánto*, pero ninguna fila guarda *qué oferta*. Requiere `offer_id` en la línea |
| POS real (multi-línea, personalización, combos) | **OPORTUNIDAD** — hoy el alta admite **un producto sin personalización** |

## 🧠 Consultorio
| | |
|---|---|
| Ingreso por doctor (facturado) | **EXISTENTE** |
| Cobrado por doctor | **FUTURO** — `payments` no tiene `therapist_id` |
| Ocupación de agenda / huecos | **OPORTUNIDAD** — `timeSlotStates` ya los calcula, solo dentro del formulario |
| Pacientes que no regresan | **OPORTUNIDAD** — con la reserva de que el alta retecleada fragmenta identidades |
| Buscador de pacientes | **OPORTUNIDAD** — no existe ni al agendar ni en el panel doctor |

## 👑 Owner
El **Dashboard es la landing del dueño y contiene los dos únicos números inventados de la app**
(`AdminDashboard.jsx:29,31`: `'+12%'` y `'+5'` literales) más un "Ingresos estimados" que **suma
los dos negocios** — exactamente el defecto que `accounting.mjs` documenta haber venido a
corregir. Se corrigió en Contabilidad y el Dashboard se quedó con la versión vieja.

La buena vista de dueño (Contabilidad, con selector Todo/Consultorio/Cafetería y comparación
honesta contra el periodo anterior) está **enterrada** bajo "Administración general".

---

# Riesgos

| Riesgo | Mitigación |
|---|---|
| Tocar el sistema visual sin tokens rompe pantallas dispersas | Introducir escala de tipografía/espaciado/radio **antes** de cualquier cambio visual |
| Quitar `minWidth:900` destapa todos los desbordamientos a la vez | Hacerlo con una pantalla piloto, no global |
| Los tres motores de disponibilidad divergen aún más | Unificar en `agenda.mjs` **antes** de tocar UI de agenda |
| `0028` sin aplicar deja dinero expuesto | Aplicarla es independiente del rediseño; no debe esperar |
| Refactor de props → contexto rompe algo silenciosamente | No hay ESLint ni tests de componente. Añadir linter primero |

---

# Decisiones aprobadas
- RLS y migraciones **dentro** del alcance de la auditoría (dev, 18 sep 2026).
- Continuar **sin** el plugin `design`; la auditoría WCAG se hizo calculando los ratios a mano.

# Decisiones pendientes
- Dirección visual (Fase 1).
- Si se adopta escala de tokens de tipografía/espaciado o se mantiene inline.
- Si el Dashboard se reescribe o se sustituye por Contabilidad como landing del dueño.
- Cuáles oportunidades de negocio entran y en qué orden.

---

# Propuestas de diseño · Design Direction · Design System
**Pendiente — Fase 1.** No se generan hasta que la Fase 0 esté aprobada.

# Arquitectura propuesta
**Pendiente — Fase 2.**

---

# Progreso

| Fase | Estado |
|---|---|
| Selección de skills | ✅ Completa |
| **Fase 0 — Auditoría** | ✅ **Completa — esperando aprobación** |
| Fase 1 — Propuestas visuales + artifact | ⬜ Bloqueada |
| Fase 2 — Arquitectura | ⬜ |
| Fase 3 — Implementación | ⬜ |
