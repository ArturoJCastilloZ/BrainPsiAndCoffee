# BrainPsiAndCoffee — Plan de rediseño

> Documento vivo. Se actualiza al cerrar cada fase.
> **Estado: FASE 2 — M1, M4 y M2 implementados y verificados. M3 (navegación) pendiente.**

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
| El responsive con estilos inline es imposible: no hay media queries | Las reglas de breakpoint exigen añadirlas al `<style>` global. Es el mismo cambio estructural que pide el anillo de foco |
| Quitar `minWidth:900` destapa todos los desbordamientos a la vez | Hacerlo con una pantalla piloto, no global |
| Los tres motores de disponibilidad divergen aún más | Unificar en `agenda.mjs` **antes** de tocar UI de agenda |
| `0028` sin aplicar deja dinero expuesto | Aplicarla es independiente del rediseño; no debe esperar |
| Refactor de props → contexto rompe algo silenciosamente | No hay ESLint ni tests de componente. Añadir linter primero |

---

# Decisiones aprobadas

## ✅ DIRECCIÓN VISUAL APROBADA (dev, 18 sep 2026)

**Propuesta A · «Oficio»**, con:
- **Acento por contexto**: caramelo `#C08A4D` cafetería · sage consultorio · tostado `#8B7355`
  dueño. El acento **marca** (barra, punto, chip), **nunca escribe** — el caramelo da 3.01:1
  sobre blanco.
- **Barra inferior filtrada por contexto** en lugar de la tira de 13 destinos. Contexto en el
  header como control segmentado; secciones en la barra inferior según ese contexto.

**Pendiente de implementar. Nada de esto está en el código todavía.**

- RLS y migraciones **dentro** del alcance de la auditoría (dev, 18 sep 2026).
- Continuar **sin** el plugin `design`; la auditoría WCAG se hizo calculando los ratios a mano.

# Decisiones pendientes
- **Propuesta A u B.**
- **Si el acento por contexto entra** o el contexto se queda solo en la navegación.
- Si la barra inferior filtrada por contexto sustituye a la tira de 13 destinos.
- Si se adopta escala de tokens de tipografía/espaciado o se mantiene inline.
- Si el Dashboard se reescribe o se sustituye por Contabilidad como landing del dueño.
- Cuáles oportunidades de negocio entran y en qué orden.

---

# Propuestas de diseño · Design Direction

**Artifact interactivo:** https://claude.ai/artifact/APwnzmCf7uQNrzwe3Hnt53
(actual vs propuesta · claro vs oscuro · cafetería / consultorio / dueño)

## Conclusión de la Fase 1

**La identidad no está rota; lo que falta es el sistema.** La paleta da 12–17:1 en el texto
principal y la decisión de usar texto oscuro sobre el acento está medida y es correcta. Cambiarla
sería resolver el problema equivocado. Lo que no existe es una escala, y hay cuatro colores que
fallan AA.

## Los cuatro arreglos de color (medidos, verificados dos veces)

Cada reemplazo es el **desplazamiento mínimo** desde el color de marca que cumple el umbral.

| Token | Modo | Hoy | Propuesto | Ratios |
|---|---|---|---|---|
| `accent-text` | claro | `#7A9E7E` 2.99 ❌ | `#59735C` | 5.21 / 5.12 / 4.56 |
| `subtle` | oscuro | `#5A6B57` 2.88 ❌ | `#7D8A7A` | 4.54 / 5.03 |
| `border` interactivo | claro | `#E8D9C5` 1.38 ❌ | `#9B9184` | 3.10 |
| `border` interactivo | oscuro | `#2A332A` 1.26 ❌ | `#666C66` | 3.06 |
| `focus-ring` | ambos | no existe | `#5F8A66` | ≥3 en las 4 superficies |

**Dos bordes, no uno.** El 3:1 de WCAG 1.4.11 aplica cuando el borde es el único medio de
identificar un componente. Se mantiene el filete suave para separar y el accesible solo para
controles: subirlos todos dejaría la interfaz como un wireframe.

## Escala: de 141 valores a 17

- **Tipografía, 6 pasos** (hoy 26): 11 / 12.5 / 14 / 16 / 20 / 28
- **Radio, 4 pasos** (hoy 15): 6 / 10 / 14 / 999
- **Espaciado, base 4** (hoy 100 combinaciones): 4 / 8 / 12 / 16 / 24 / 32 / 48

## Propuesta A · «Oficio» — RECOMENDADA

Conserva la calidez y le pone debajo el sistema que falta. El contexto se lee por el acento usando
las **dos familias que la paleta ya tiene**: caramelo (cafetería), sage (consultorio), tostado
neutro (consolidado del dueño).

**El caramelo marca, no escribe.** Da 3.01:1 sobre blanco, así que se usa como barra, punto o chip
— nunca como texto. Señalar el contexto no puede costar la accesibilidad.

El estado normal deja de llevar color: «Cancelada» ya no es roja (fatiga de alarma como riesgo de
seguridad del paciente).

## Propuesta B · «Estación»

Misma paleta y mismas correcciones, pero densidad de estación de trabajo y sin serif. Gana filas
por pantalla; pierde lo que distingue al producto y choca con el uso desde teléfono.

**No hay una tercera.** Sería cambiar la paleta (contradice el diagnóstico) o separar los negocios
en dos temas (dejaría de sentirse como un solo producto). Inventarla para llegar a tres sería
relleno.

## Lo que la Fase 1 NO arregla

El `minWidth: 900`, el Dashboard del dueño, las paletas paralelas de MenuPage y Login. Son cambios
de layout y de arquitectura: Fase 2. El anillo de foco **sí** exige un cambio estructural — añadir
reglas al `<style>` global, porque con estilos inline `:focus-visible` no se puede declarar.

## Responsive — requisito de primer nivel (añadido por el dev, 18 sep 2026)

El dev señaló que la propuesta era de escritorio con una nota al pie sobre móvil. Tenía razón.
El responsive pasa a ser parte del diseño, no una adaptación posterior.

### Breakpoints derivados del CONTENIDO

Se midió el **piso real** de cada pieza. Ningún corte viene de un nombre de dispositivo.

| Pieza | Piso medido | Corte | Qué pasa debajo |
|---|---|---|---|
| Fila de cita | 512px | **520** | Dos líneas: hora + estado arriba, paciente + servicio abajo |
| Fila de horario | 490px | **520** | El día sube como encabezado, los bloques se apilan |
| Maestro-detalle de pacientes | 704px | **720** | Una columna: lista → detalle con volver |
| Sidebar + contenido útil | 888px | **900** | Sidebar fuera; el contexto sube al header |
| Cuatro tarjetas de KPI | 836px | **900 / 720** | 2×2, y luego una línea por KPI |
| — | — | **1280** | El ancho extra va a más información, no a renglones más largos |

### La decisión de navegación

Hoy en móvil los tres encabezados de sección desaparecen y el dueño ve **13 destinos** en una tira
horizontal sin saber en qué negocio está. El arreglo **no** es una hamburguesa: es **separar el eje
de contexto del eje de sección**. Contexto en el header (control segmentado), secciones en la barra
inferior **filtradas por ese contexto**. De 13 destinos a 4.

### Cada tabla, su forma

| Tabla | Qué es | En móvil |
|---|---|---|
| Citas | Una agenda | Fila de dos líneas; la fila entera es el objetivo táctil |
| Por cobrar | Lista de pendientes con una acción | Tarjetas: saldo grande + «Cobrar» de ancho completo |
| Gastos | Registro histórico | Lista; área y borrar en hoja inferior |
| Por servicio / producto / terapeuta | Un **ranking**, no una tabla | Barra proporcional; núm. y promedio al tocar |
| Últimos 6 meses | Una tendencia | La gráfica se queda; la tabla colapsa en acordeón |

### Mobile-first vs desktop-first, por módulo

- **Mobile-first:** reserva del paciente, pedidos de mostrador, leer la agenda del día.
- **Tablet-first:** pacientes y notas (leer la última nota en teléfono sí; escribir una larga, no).
- **Desktop-first:** agendar (necesita la rejilla de 35 días), catálogos, horarios, y contabilidad
  para analizar — aunque en móvil debe responder *una* pregunta, no replicar el panel.

### Verificado, y su límite

Medido en el espécimen real a 375 / 768 / 990: sidebar fuera, barra inferior en `grid`, switcher en
`flex`, fila de 61px → 95px, objetivo táctil de 63px, **cero desbordamiento**.

**Límite honesto:** el panel del navegador no baja de 650px, así que no pude emular un teléfono
físico. Los anchos se forzaron sobre el contenedor del espécimen (container queries), que es
equivalente para el layout pero **no** prueba teclado virtual, safe areas ni gestos reales.

# Design System
**Pendiente — se formaliza al aprobar A o B.**

# Arquitectura propuesta — Fase 2

> **Estado: PROPUESTA. Nada implementado.** Análisis del 18 sep 2026 (noche), medido sobre
> `fbc6935`. Pruebas en verde al empezar: `npm test` 14/14 y `tests/tenancy/run.sh`
> «TODAS LAS PRUEBAS PASARON» (80 aserciones `ok`).

## A2.0 · Lo que la auditoría de Fase 2 corrige del plan anterior

Tres afirmaciones que arrastrábamos y que **la medición desmiente**. Importan porque una de
ellas cambia el costo de todo el rediseño.

| Afirmación previa | Medido hoy | Consecuencia |
|---|---|---|
| «No hay media queries posibles con estilos inline» | **Falso.** Hay 4 media queries vivas, en `AdminCatalog.jsx:343,351` y `AdminApp.jsx:240,244` | El mecanismo **ya existe**: bloques `<style>` inyectados por componente. No hay que inventar infraestructura |
| «`minWidth: 900` está en `AdminApp.jsx:193`» | Está en **`AdminApp.jsx:202`**. La 193 es un `<div>` del header móvil | Apuntar al lugar correcto |
| «No hay `:focus-visible` posible» | El *posible* es falso (ver arriba); el **hecho** se confirma: **cero ocurrencias** de `:focus` o `:focus-visible` en todo `src/` | El anillo de foco es trabajo nuevo, pero barato |

> **Corrección propia, 18 sep (noche).** En la primera versión de este análisis afirmé que los dos
> bloques de tokens `--admin-*` **habían divergido**. Era falso: `diff` de los dos bloques sale
> **vacío**, son idénticos byte a byte. Lo presenté como medición cuando era inferencia — el
> defecto exacto que el canon nombra en `verdict-gate`. La recomendación de unificarlos no cambia
> (un valor declarado en dos archivos sigue exigiendo arreglarlo dos veces), pero el hecho sí.

**Por qué importa:** la Fase 2 se había presupuestado como «hay que introducir CSS real antes de
poder tocar nada». No es cierto. El patrón de `<style>` por componente ya está en producción y
funcionando — lo que falta es **una hoja global**, no una capacidad nueva.

## A2.1 · El prerrequisito, con el número derivado

`AdminApp.jsx:202` — `<div style={{ minWidth: 900 }}>` envuelve **las 13 pantallas del admin**.

El desbordamiento se deriva del propio código, no hace falta emular nada:

```
main (AdminApp.jsx:201)  padding: '24px'        →  24 + 24  =  48 px
div  (AdminApp.jsx:202)  minWidth: 900          →            900 px
                                                   ancho mínimo = 948 px
viewport de teléfono                             →            375 px
                                       desbordamiento = 948 − 375 = 573 px
```

**573px de scroll horizontal**, que es exactamente la cifra del plan. Queda confirmada por
aritmética sobre las dos líneas, no por recuerdo.

Y el efecto colateral que hace inútil todo lo demás: con el contenedor fijo en 900px, **ningún
`repeat(auto-fit, …)` puede plegarse** — `auto-fit` resuelve contra el ancho disponible, y el
ancho disponible nunca baja de 900. Hay **11 rejillas `auto-fit`/`auto-fill`** en el admin
escritas para ser fluidas y neutralizadas por esa línea.

> Es el mismo patrón que el handoff ya nombró dos veces: código escrito correctamente y anulado
> por una decisión de un solo renglón en otro archivo. Compila, pasa las pruebas, y no sirve.

## A2.2 · La barra inferior móvil, medida

`navItems` (`AdminApp.jsx:75`) es el `flatMap` de las tres secciones. Para el **dueño**, que las
ve todas: 4 (general) + 4 (cafetería) + 5 (consultorio) = **13 destinos**.

La barra (`AdminApp.jsx:220-236`) los pone todos en un `flex` con `overflowX: 'auto'`, cada botón
con `minWidth: 72` y `gap: 8`:

```
13 botones × 72 px            = 936 px
12 huecos  ×  8 px            =  96 px
padding del contenedor 16 × 2 =  32 px
                        total = 1064 px  en una barra de 375 px
                → 689 px de scroll horizontal DENTRO de la navegación
```

Una barra de navegación que hay que **desplazar para encontrar el destino** no es una barra de
navegación: es una lista horizontal disfrazada. Esto es la evidencia dura detrás del «de 13
destinos a 4» ya aprobado.

## A2.3 · Hallazgo nuevo — la media query global que pisa por nombre de etiqueta

`AdminApp.jsx:244-246` inyecta:

```css
@media (max-width: 767px) { main { height: calc(100vh - 65px) !important; } }
```

El selector es **`main` a secas**: no está acotado a una clase ni a un contenedor. Es una regla
global con `!important` sobre una etiqueta que otro panel también usa — `DoctorApp.jsx:149`.

**Honestidad sobre el alcance: hoy NO es un bug vivo.** Verifiqué el ruteo en `App.jsx:148-166`:
`AdminApp` y `DoctorApp` cuelgan de rutas distintas y nunca se montan a la vez, así que la regla
solo existe mientras el admin está en pantalla. Es un **riesgo latente**, no un defecto
observable, y lo reporto como tal.

Lo que sí es seguro: el `65px` está escrito a mano y no corresponde a ninguna medida derivada del
header móvil (`padding: '16px 20px'` más contenido). Es un número mágico que se desincroniza al
primer cambio de header.

## A2.4 · Los tokens están duplicados — idénticos, y por eso peligrosos

Dos bloques de variables `--admin-*` definidos por separado: `AdminApp.jsx:89-100` y
`DoctorApp.jsx:105-116`. El handoff los daba por «duplicados literalmente» y **lo verifiqué**:

```
$ diff <(sed -n '89,100p' admin/AdminApp.jsx | sort) \
       <(sed -n '106,117p' doctor/DoctorApp.jsx | sort)
IDENTICOS (diff vacio)
```

Idénticos byte a byte — y los bloques `<style>` con `.admin-card` / `.admin-input` también.

**Que sean idénticos no los hace inofensivos: los hace una trampa.** Ninguno de los dos es la
fuente. Aquí vive el arreglo de color ya aprobado — `AdminApp.jsx:97` tiene
`'--admin-subtle': isDark ? '#5A6B57' : …`, exactamente el token de 2.88:1 que la Fase 1 mandó
subir a `#7D8A7A`— y está en **dos** archivos. Arreglarlo en uno deja el otro roto, y como hoy
son iguales, nada avisa: las dos pantallas simplemente empiezan a verse distinto.

**Conclusión de arquitectura:** mientras los tokens vivan dentro de los componentes, cada arreglo
de contraste es un arreglo por duplicado que depende de que alguien recuerde el segundo sitio.

## A2.5 · La propuesta

Cuatro movimientos, en orden de dependencia. Cada uno es verificable por separado.

### M1 · Una hoja de estilos global, en `App.jsx`

`App.jsx:111-134` ya tiene el bloque `<style>` global, y ya declara `[data-theme="dark"]`. Es el
lugar natural. Entra ahí:

- Los **tokens de color** (una sola definición, bajo `:root` y `[data-theme="dark"]`), incluidos
  los cuatro arreglos aprobados de la Fase 1.
- La **escala** aprobada: tipografía 11/12.5/14/16/20/28 · radio 6/10/14/999 · espaciado 4.
- El **anillo de foco único** `#5F8A66` como `:focus-visible`, que hoy no existe en ninguna parte.
- Los **breakpoints** medidos: 520 · 720 · 900 · 1280.

Los componentes siguen con estilos inline; lo que cambia es **de dónde sacan los valores**. No es
una reescritura, es mover las constantes a un solo sitio.

### M2 · Quitar `minWidth: 900` — pero no a secas

Borrar la línea desbloquea las 11 rejillas, y **destapa** lo que estaba oculto detrás del scroll:
las tablas anchas (Citas, Contabilidad) quedarían apretadas en lugar de desbordadas.

Por eso M2 no es «borrar la línea», es **borrarla y darle forma a cada tabla**, que es justo lo
que la sección «Cada tabla, su forma» de la Fase 1.5 ya definió. Borrarla sola sería cambiar un
defecto medido por otro sin medir.

### M3 · Separar los dos ejes de navegación

Ya aprobado. Con los números de A2.2 detrás: contexto (cafetería / consultorio / general) al
header como control segmentado; sección a la barra inferior, **filtrada por contexto** — de 13
destinos simultáneos a 4, que a 72px caben en 375px sin scroll (4 × 72 + 3 × 8 + 32 = **344 px**).

### M4 · Unificar los tokens `--admin-*`

Consecuencia de M1: `DoctorApp` y `AdminApp` dejan de declararlos y los consumen. Cierra la
divergencia de A2.4 y hace que el arreglo de `--admin-subtle` se aplique una vez.

## A2.6 · Orden propuesto y cómo se verifica cada paso

| # | Movimiento | Evidencia de que funcionó |
|---|---|---|
| M1 | Hoja global: tokens, escala, foco, breakpoints | Tabular el contraste de los 4 tokens arreglados; ver el anillo de foco navegando con Tab |
| M4 | Unificar `--admin-*` | `grep` devuelve **una** definición; las dos pantallas se ven igual |
| M2 | Quitar `minWidth: 900` + dar forma a las tablas | A 375px: **cero** scroll horizontal, medido en el navegador con la app corriendo |
| M3 | Separar los dos ejes de navegación | 4 destinos visibles sin desplazar, en los tres contextos y con los tres roles |

**M1 y M4 primero porque no cambian el layout**: si algo se rompe, se sabe que fue el token. M2
antes que M3 porque la barra inferior nueva se diseña contra un ancho que ya sea real.

## A2.6b · Resultado medido de M1 · M4 · M2 (18 sep 2026, noche)

**M1 · hoja global** (`src/GlobalStyle.jsx`, nuevo). Escala, anillo de foco y breakpoints. Los
once contrastes salieron exactamente como la Fase 1 los aprobó: `accent-text` claro 2.99 → **5.21**,
`subtle` oscuro 2.88 → **4.54**, bordes interactivos **3.10** y **3.06**, y el anillo `#5F8A66`
sobre las cuatro superficies: 3.46 / 3.95 / 4.17 / 4.71 — todos ≥3:1. El anillo se comprobó
**pintando**: `rgb(95,138,102)`, 2px, offset 2px sobre el elemento enfocado.

**M4 · tokens unificados.** El mapa de tokens y la hoja salieron de `App.jsx` a `GlobalStyle.jsx`.
Verificado comparando **88 valores computados** (44 tokens × 2 temas) antes y después:
**cero diferencias**. Es un cambio de domicilio, no una reescritura.

**M2 · el piso de 900 retirado, y las dos tablas que lo escondían.**

| Pantalla | A 375px, antes | Ahora |
|---|---|---|
| Citas | Celda del nombre en **30px** para un texto de 217 → «M…» | Restack bajo 520: **233px**, los 4 nombres enteros |
| Contabilidad · Por cobrar | `<table>` de 5 columnas, **386px irreducibles**; empujaba el viewport de 375 a **427** | Tarjetas bajo 520; viewport estable en 375 |
| Pedidos · Dashboard · Horarios | — | Limpias sin tocarlas: el `minWidth` era todo el problema |

Barrido final a 375px en las cinco pantallas: **cero desborde de documento, cero elementos más
anchos que su contenedor, cero elementos apretados** — salvo la línea secundaria de la fila de
cita (servicio · terapeuta · teléfono), truncada con elipsis **a propósito** por el código.

Conmutación verificada en los cuatro pisos: a 519 la fila son 2 columnas apiladas y la tabla son
tarjetas; a 520, 900 y 1280 vuelven a 3 columnas y a `display: table` con cabecera. Sin regresión.

**Dos cosas que solo se vieron midiendo, no leyendo:**

- El `td` con `width: 100%` **ignoraba el padding de su `tr`** y desbordaba exactamente 26px
  (2×12 de padding + 2×1 de borde). Se corrigió con `box-sizing` en vez de `width`.
- Quitar `minWidth: 900` **no produce desbordamiento sino aplastamiento**. Es la razón de que M2
  nunca pudiera ser «borrar la línea»: el grid reparte el poco ancho que hay en vez de rebasar,
  así que el defecto se vuelve invisible para una prueba de scroll y solo se ve mirando.

**M2b · las tarjetas de desglose se desalineaban (reportado por el dev, con sesión real).**
`repeat(auto-fit, minmax(320px,1fr))` con **cuatro** tarjetas da 3 pistas mientras el contenedor
mide entre **1000 y 1339px**: la cuarta cae sola con dos celdas vacías al lado. Fuera de esa banda
no se nota (2×2 por debajo de 1000, 4×1 desde 1340) — y un portátil de 1280 cae justo dentro.

`auto-fit` no puede arreglarlo: reparte en pistas iguales y el sobrante deja hueco. Con
`flex-wrap` el sobrante **crece** y ocupa el renglón. Nueva clase compartida `.rejilla-tarjetas`
con `--rejilla-min`, aplicada a las dos rejillas de Contabilidad (desglose y KPIs) porque son el
mismo defecto de clase. Verificado sobre el componente real en 10 anchos de 900 a 1700: **sin
hueco en ninguno**, con 2, 3 y 4 tarjetas.

**Vecinos medidos y NO tocados** (misma familia `auto-fit`, conteo variable, a decisión del dev):
`AdminDashboard:43,72` · `AdminCatalog:519` · `AdminOrders:172` · `AdminSchedules:207,312` ·
`AdminAccounting:541`.

**P2.2 también cerrado.** El maestro-detalle de `DoctorApp.jsx:317` era
`minmax(230px,0.3fr) minmax(420px,1fr)` + gap 24 = piso de **674px** en dos columnas fijas sin
`auto-fit`: no colapsaba jamás, con 206% de desbordamiento a 375px, y es la pantalla donde se
**leen notas clínicas**. Ahora una columna por debajo de 720 (el piso medido del maestro-detalle).
Conmutación verificada: 375 → una columna de 327px · 719 → una de 671px · 720 → `230px 420px`.

**Límite honesto:** los paneles admin y doctor **no se pudieron abrir con sesión real** — exigen
credenciales del dev. En el caso de `DoctorApp` lo verificado es la **regla CSS**, no la pantalla:
se inyectó un elemento con la clase y se midió su conmutación. Es evidencia del mecanismo, no del
resultado en vivo. Lo medido corre sobre `specimen.html`, un banco de desarrollo donde el
COMPONENTE es el real (ninguno de los medidos hace llamadas de red) y lo reproducido es su
contenedor. `AdminAccess` no se pudo medir en absoluto: consulta Supabase al montar.

## A2.6c · Resultado medido de M3 — los dos ejes de navegación

La barra inferior aplanaba **contexto** y **sección** en una sola lista de 13 destinos: a
`minWidth:72` con `gap:8` medían **1064px dentro de una barra de 375**, o sea 689px de scroll
*dentro de la navegación*. Ahora el contexto vive en el header como control segmentado y la
sección en la barra, filtrada.

**El contexto no es estado nuevo.** Los ids de página ya lo codifican (`general-`, `cafe-`,
`clinic-`), así que se deriva de `page` con un `split('-')`. Un `useState` paralelo habría sido
una segunda fuente de verdad capaz de desincronizarse; una derivación no puede.

Medido a 375px, con los tres contextos:

| Contexto | Destinos | Ancho c/u | Scroll en la barra |
|---|---|---|---|
| General | 4 | 80px | **0** |
| Cafetería | 4 | 80px | **0** |
| Consultorio | **5** | 62px | **0** |

Consultorio tiene **cinco** destinos, no cuatro: a los 72px fijos de antes habrían sido 424px y
seguirían sin caber en 375. Por eso los botones son `flex:1` y reparten el ancho en vez de
declarar un mínimo. Alto 48px, ancho mínimo 62 — por encima del objetivo táctil de 44 en las dos
dimensiones. Sin regresión a 1280: vuelve el sidebar, la barra inferior desaparece y el armazón
vuelve a fila.

**P2.4 confirmado y cerrado, de paso.** La auditoría lo tenía marcado como inferencia: el header
móvil es **hermano** de `<main>` dentro de un flex en FILA, así que no se ponía encima del
contenido sino **al lado**. `minWidth:900` lo tapaba; quitarlo lo destapó y se vio renderizando.
Debajo de 768 el armazón pasa a columna. Se retiró también el `main { height: calc(100vh - 65px) }`
que vivía en `AdminApp`: selector de etiqueta global con `!important` y un 65 escrito a mano que
además ya mentía, porque el header ahora tiene dos renglones.

**Guard nuevo, ejercitado contra el defecto que existe para atrapar.** Derivar el contexto del id
crea un invariante: una entrada con id `clinic-…` dentro de la sección de Cafetería desaparecería
de la barra **sin error ni pantalla en blanco**. `tests/front/admin-nav.test.mjs` lo vigila; se
verificó inyectando el desajuste —confirmando primero que la inyección había entrado— y el guard
nombró las cuatro entradas afectadas.

## A2.7 · Lo que esta fase deliberadamente NO toca

Está en la auditoría, es grave, y **no es rediseño** — repintarlo sería esconderlo:

- El **Dashboard del dueño** y sus dos números inventados (`AdminDashboard.jsx:29,31`). Hay que
  reescribirlo con `accounting.mjs`. Es trabajo de datos, no de layout.
- Los **catálogos DEMO** de `useSupabaseCrud.js:55-64` y el `[] || X === []` roto en ambos
  sentidos.
- El **estado vacío antes del banner de error** de `DoctorApp.jsx:321`.
- El **XSS almacenado** `AdminCatalog.jsx:498` → `ContactPage.jsx:29` y las 4 vulnerabilidades
  high de `react-router-dom`.

Merecen su propia fase, con una prueba que reproduzca cada uno antes del arreglo.

---

# Progreso

| Fase | Estado |
|---|---|
| Selección de skills | ✅ Completa |
| **Fase 0 — Auditoría** | ✅ Completa y aprobada |
| **Fase 0.5 — Bugs de producción** | ✅ Reagendar (`a89529b`) y reserva pública (`9af996e`) |
| **Fase 1 — Propuestas visuales + artifact** | ✅ Completa |
| **Fase 1.5 — Responsive como requisito** | ✅ Completa · A «Oficio» **aprobada** por el dev |
| **Fase 2 — Arquitectura y layout** | ✅ **M1, M4, M2 y M3 implementados y verificados** |
| Fase 3 — Implementación | ⬜ |
