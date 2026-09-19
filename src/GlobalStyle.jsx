import React from 'react';

// Fuente UNICA del sistema visual: el mapa de tokens por tema y la hoja
// global. Vivia dentro de App.jsx, que ademas rutea y carga datos, asi que
// cualquier pantalla que quisiera montarse fuera del arbol de App tenia que
// COPIAR los tokens — el mismo defecto que M4 acaba de quitar de AdminApp y
// DoctorApp. Se extrae para que el especimen de desarrollo consuma los
// mismos valores en vez de duplicarlos.
//
// themeVars() sigue devolviendo propiedades personalizadas INLINE, tal como
// estaban: no es una reescritura, es un cambio de domicilio.
export function themeVars(isDark) {
  return {
      '--bp-sage': isDark ? '#8FBF9F' : '#7A9E7E',
      '--bp-sage-dark': isDark ? '#8FBF9F' : '#7A9E7E',
      '--bp-sage-deep': isDark ? '#E8D9C5' : '#5A3E2B',
      '--bp-sage-light': isDark ? '#CBBBAA' : '#7A9E7E',
      '--bp-sage-pale': isDark ? '#453A33' : '#E8D9C5',
      '--bp-cream': isDark ? '#F5EFE6' : '#FFFFFF',
      '--bp-cream-light': isDark ? '#332C27' : '#E8D9C5',
      '--bp-ivory': isDark ? '#1E1B18' : '#F5EFE6',
      '--bp-brown': isDark ? '#F5EFE6' : '#2E2A27',
      '--bp-brown-mid': isDark ? '#CBBBAA' : '#6B5E55',
      '--bp-brown-light': isDark ? '#A39280' : '#8B5E3C',
      '--bp-caramel': isDark ? '#C08A4D' : '#C08A4D',
      '--bp-caramel-light': isDark ? '#D9A96A' : '#D9A96A',
      '--bp-rust': isDark ? '#D97A7A' : '#B85C5C',
      // Rust CUANDO ES TEXTO. El --bp-rust de arriba tambien pinta bordes y
      // fondos (rust-alpha-*), donde el contraste de texto no aplica; sobre
      // cream (#E8D9C5) daba 3.21:1, por debajo del 4.5:1 que pide AA, y el
      // mensaje de error terminaba siendo lo menos legible de la pantalla.
      // En oscuro el mismo tono ya daba 4.58:1, asi que solo cambia el claro.
      '--bp-rust-text': isDark ? '#D97A7A' : '#973F3F',
      '--bp-surface': isDark ? '#332C27' : '#FFFFFF',
      '--bp-surface-2': isDark ? '#2A2521' : '#E8D9C5',
      '--bp-primary': isDark ? '#C08A4D' : '#5A3E2B',
      '--bp-primary-hover': isDark ? '#D9A96A' : '#4A3223',
      '--bp-primary-contrast': isDark ? '#1E1B18' : '#FFFFFF',
      '--bp-badge-bg': isDark ? '#453A33' : '#F5EFE6',
      '--bp-badge-text': isDark ? '#F5EFE6' : '#6B5E55',
      '--bp-brown-alpha-30': isDark ? 'rgba(192,138,77,0.25)' : 'rgba(90,62,43,0.3)',
      '--bp-sage-deep-alpha-30': isDark ? 'rgba(232,217,197,0.14)' : 'rgba(90,62,43,0.22)',
      '--bp-caramel-light-alpha-30': isDark ? 'rgba(217,169,106,0.18)' : 'rgba(217,169,106,0.3)',
      '--bp-caramel-light-alpha-40': isDark ? 'rgba(217,169,106,0.24)' : 'rgba(217,169,106,0.4)',
      '--bp-sage-pale-alpha-80': isDark ? 'rgba(69,58,51,0.8)' : 'rgba(232,217,197,0.8)',
      '--bp-rust-alpha-20': isDark ? 'rgba(217,122,122,0.2)' : 'rgba(184,92,92,0.2)',
      '--bp-rust-alpha-30': isDark ? 'rgba(217,122,122,0.3)' : 'rgba(184,92,92,0.3)',
      '--bp-rust-alpha-40': isDark ? 'rgba(217,122,122,0.4)' : 'rgba(184,92,92,0.4)',
      '--bp-sage-dark-alpha-50': isDark ? 'rgba(143,191,159,0.35)' : 'rgba(122,158,126,0.5)'
  };
}

export default function GlobalStyle() {
  return (
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600;9..144,700;9..144,800&family=Outfit:wght@300;400;500;600;700&family=Caveat:wght@500;700&display=swap');
        * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
        body { margin: 0; }
        .font-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; letter-spacing: -0.02em; }
        .font-script { font-family: 'Caveat', cursive; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes brandLoaderSpin { from { transform: rotate(0deg) scale(1); } 50% { transform: rotate(180deg) scale(1.06); } to { transform: rotate(360deg) scale(1); } }
        .animate-fade-up { animation: fadeUp 0.5s ease-out forwards; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .animate-slide-in { animation: slideIn 0.3s ease-out forwards; }
        .animate-pulse-slow { animation: pulse 2s ease-in-out infinite; }
        .grain { background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E"); }
        .brand-loader-spin { animation: brandLoaderSpin 1.1s ease-in-out infinite; transform-origin: center; }
        [data-theme="dark"] { color-scheme: dark; }
        [data-theme="dark"] button { color-scheme: dark; }

        /* ==================================================================
           ESCALA — Fase 2 / M1. Una sola definicion para toda la app.
           Antes habia 141 valores sueltos repartidos en los componentes.
           ================================================================== */
        :root {
          --bp-text-xs: 11px;
          --bp-text-sm: 12.5px;
          --bp-text-md: 14px;
          --bp-text-lg: 16px;
          --bp-text-xl: 20px;
          --bp-text-2xl: 28px;

          --bp-radius-sm: 6px;
          --bp-radius-md: 10px;
          --bp-radius-lg: 14px;
          --bp-radius-pill: 999px;

          /* Base 4. */
          --bp-space-1: 4px;
          --bp-space-2: 8px;
          --bp-space-3: 12px;
          --bp-space-4: 16px;
          --bp-space-6: 24px;
          --bp-space-8: 32px;
          --bp-space-12: 48px;

          /* Anillo de foco unico: >=3:1 sobre las cuatro superficies. */
          --bp-focus-ring: #5F8A66;

          /* Pisos medidos sobre el CONTENIDO, no sobre modelos de telefono.
             520 = fila de cita (512) y horario (490) · 720 = maestro-detalle
             (704) · 900 = sidebar + contenido (888) · 1280.
             OJO: CSS no admite variables dentro de @media. Estan aqui como
             fuente unica para que M2 y M3 usen EXACTAMENTE estos numeros. */
          --bp-bp-row: 520px;
          --bp-bp-split: 720px;
          --bp-bp-sidebar: 900px;
          --bp-bp-wide: 1280px;
        }

        /* ==================================================================
           TOKENS DEL ADMIN — Fase 2 / M4. Estaban duplicados BYTE A BYTE en
           AdminApp.jsx y DoctorApp.jsx. Ninguno de los dos era la fuente, asi
           que cada arreglo de contraste habia que hacerlo dos veces y bastaba
           olvidar uno para que las dos pantallas divergieran.
           ================================================================== */
        [data-theme] {
          --admin-bg: #F5EFE6;
          --admin-sidebar: #FFFDF8;
          --admin-surface: #FFFFFF;
          --admin-surface-soft: #F8F1E7;
          --admin-border: var(--bp-cream-light);
          --admin-border-soft: #EFE2D1;
          --admin-text: var(--bp-brown);
          --admin-muted: var(--bp-brown-mid);
          --admin-subtle: var(--bp-brown-light);
          --admin-row-text: var(--bp-brown-mid);
          /* ARREGLO Fase 1: era var(--bp-sage-dark) = #7A9E7E, 2.99:1 sobre
             blanco. No se toca --bp-sage-dark porque ese tambien pinta bordes
             y fondos, donde el contraste de texto no aplica — mismo criterio
             que --bp-rust-text. Un token por ROL, no por color. */
          --admin-accent-text: #59735C;
          --admin-on-accent: #1E1B18;
          /* Borde INTERACTIVO: el 3:1 de WCAG 1.4.11 aplica cuando el borde
             es el unico identificador del control. El filete decorativo
             (--admin-border) no lo necesita y NO se toca. */
          --admin-border-interactive: #9B9184;
        }
        [data-theme="dark"] {
          --admin-bg: #0F1410;
          --admin-sidebar: #0A0F09;
          --admin-surface: #1A2118;
          --admin-surface-soft: #10170F;
          --admin-border: #2A332A;
          --admin-border-soft: #1A2118;
          --admin-text: var(--bp-cream);
          --admin-muted: #7A8C77;
          /* ARREGLO Fase 1: era #5A6B57, 2.88:1. */
          --admin-subtle: #7D8A7A;
          --admin-row-text: #9AAA97;
          --admin-accent-text: var(--bp-sage-light);
          --admin-on-accent: #1E1B18;
          --admin-border-interactive: #666C66;
        }

        .admin-card { background: var(--admin-surface); border: 1px solid var(--admin-border); }
        .admin-input { background: var(--admin-surface); border: 1px solid var(--admin-border); color: var(--admin-text); }
        .admin-input::placeholder { color: var(--admin-subtle); }

        /* ==================================================================
           FOCO — Fase 2 / M1. Antes de esto la app tenia CERO indicacion de
           foco: ni :focus ni :focus-visible aparecian una sola vez en src/.
           Quien navega con teclado no sabia donde estaba parado.
           :focus-visible y no :focus para no pintar el anillo al hacer clic.
           ================================================================== */
        :focus-visible {
          outline: 2px solid var(--bp-focus-ring);
          outline-offset: 2px;
        }

        /* ==================================================================
           FILA DE CITA — Fase 2 / M2.
           A partir de 520px cabe en una linea: 76 (hora) + 1fr (paciente y
           servicio) + auto (estado y acciones). Por debajo NO cabe, y el
           grid no desborda: APLASTA. Medido en el especimen a 375px, la
           celda del nombre quedaba en 30px de ancho para un texto de 217 —
           "Maria Fernanda Villalobos Trevino" se leia "M...".
           Truncar el nombre de un paciente a dos letras no es un defecto
           estetico: en una agenda clinica es una identificacion ambigua.
           Por eso debajo de 520 las acciones bajan a su propio renglon y el
           nombre recupera el ancho completo.
           ================================================================== */
        .cita-fila {
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          padding: 12px 2px;
        }
        .cita-acciones {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        @media (max-width: 519px) {
          .cita-fila {
            grid-template-columns: 76px minmax(0, 1fr);
            grid-template-areas: "hora datos" "acciones acciones";
            row-gap: 10px;
          }
          .cita-hora     { grid-area: hora; }
          .cita-datos    { grid-area: datos; }
          .cita-acciones { grid-area: acciones; justify-content: flex-start; }
        }

        /* ==================================================================
           "POR COBRAR" — Fase 2 / M2.
           Es un <table> real de 5 columnas. Medido en el especimen a 375px:
           386px de ancho IRREDUCIBLE — una tabla no se pliega, y empujaba el
           viewport de 375 a 427. Era el unico desborde que quedaba en el
           admin tras quitar minWidth:900.
           Debajo de 520 deja de ser tabla y pasa a tarjetas, como define
           "Cada tabla, su forma": no es una rejilla de datos, es una lista
           de pendientes con UNA accion. El saldo manda (es el numero por el
           que se entra) y "Cobrar" toma el ancho completo.
           La cabecera no se pinta: al volverse display:block la asociacion
           fila/columna se pierde igual, asi que cada celda lleva su propia
           etiqueta desde data-etiqueta.
           ================================================================== */
        @media (max-width: 519px) {
          .tabla-cobrar,
          .tabla-cobrar tbody,
          .tabla-cobrar tr,
          /* box-sizing y NO width:100% en la celda: display:block ya la hace
             llenar. Con width:100% la celda medía el ancho de contenido del
             tr e ignoraba su padding, desbordando exactamente 26px
             (2x12 de padding + 2x1 de borde). Medido, no supuesto. */
          .tabla-cobrar td { display: block; box-sizing: border-box; }
          .tabla-cobrar,
          .tabla-cobrar tbody,
          .tabla-cobrar tr { width: 100%; }

          .tabla-cobrar thead { display: none; }

          .tabla-cobrar tr {
            border: 1px solid var(--admin-border);
            border-radius: var(--bp-radius-md);
            padding: var(--bp-space-3);
            margin-bottom: var(--bp-space-2);
          }

          .tabla-cobrar td {
            text-align: left !important;
            border: none !important;
            padding: 2px 0 !important;
          }
          .tabla-cobrar td::before {
            content: attr(data-etiqueta);
            display: block;
            font-size: var(--bp-text-xs);
            font-weight: 800;
            letter-spacing: 1px;
            text-transform: uppercase;
            color: var(--admin-row-text);
          }
          .tabla-cobrar td.celda-accion::before { content: none; }

          .tabla-cobrar .celda-concepto { font-weight: 600; }
          .tabla-cobrar .celda-saldo    { font-size: var(--bp-text-xl); font-weight: 700; }

          .tabla-cobrar .celda-accion { margin-top: var(--bp-space-2); }
          .tabla-cobrar .celda-accion button { width: 100%; justify-content: center; }
        }

        /* ==================================================================
           PANEL DOCTOR · maestro-detalle — Fase 2 / M2 (P2.2 de la auditoria).
           Era minmax(230px,0.3fr) minmax(420px,1fr) + gap 24 = piso de 674px
           en DOS columnas fijas, sin auto-fit: no colapsaba jamas. A 375px
           hay 327 disponibles, o sea 206% de desbordamiento — y es la
           pantalla donde se LEEN NOTAS CLINICAS.
           720 es el piso medido del maestro-detalle (contenido 704).
           ================================================================== */
        .doctor-maestro-detalle {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--bp-space-6);
          align-items: start;
        }
        @media (min-width: 720px) {
          .doctor-maestro-detalle {
            grid-template-columns: minmax(230px, 0.3fr) minmax(420px, 1fr);
          }
        }

        /* ==================================================================
           REJILLA DE TARJETAS — Fase 2 / M2b. Reportado por el dev: las
           tarjetas de desglose "se desalinean" al 100%% de zoom.
           Causa medida: repeat(auto-fit, minmax(320px,1fr)) con CUATRO
           tarjetas da 3 pistas mientras el contenedor mide entre 1000 y
           1339px, asi que la cuarta cae sola con DOS celdas vacias al lado.
           Fuera de esa banda no se nota (2x2 por debajo de 1000, 4x1 desde
           1340), y un portatil de 1280 cae justo dentro.
           auto-fit no puede arreglarlo: reparte en pistas iguales y el
           sobrante deja hueco. Con flex el sobrante CRECE y ocupa el
           renglon, asi que la ultima tarjeta se lee como decision y no como
           huerfano — verificado con 2, 3 y 4 tarjetas, sin hueco en ningun
           ancho.
           --rejilla-min es la base por tarjeta; equivale al minmax anterior.
           ================================================================== */
        .rejilla-tarjetas {
          display: flex;
          flex-wrap: wrap;
          align-items: stretch;
        }
        .rejilla-tarjetas > * {
          flex: 1 1 var(--rejilla-min, 320px);
          min-width: 0;
        }

        /* ==================================================================
           NAVEGACION MOVIL DEL ADMIN — Fase 2 / M3.
           Antes la barra inferior aplanaba los DOS ejes en una sola lista:
           13 destinos a minWidth 72 con gap 8 = 1064px dentro de una barra de
           375, o sea 689px de scroll DENTRO de la navegacion. Una barra que
           hay que desplazar para encontrar el destino no es una barra de
           navegacion.
           Ahora: CONTEXTO (que negocio) en el header como control segmentado,
           SECCION (que pantalla) en la barra inferior, filtrada por contexto.
           ================================================================== */
        /* El armazon del admin es flex en FILA (sidebar | contenido). El
           header movil es HERMANO de <main>, asi que en fila no se pone
           ENCIMA del contenido: se pone AL LADO. Era el P2.4 de la auditoria,
           marcado como inferencia; quitar minWidth:900 lo destapo y se
           confirmo renderizando. Debajo de 768 la fila pasa a columna.
           Se retiro tambien el 'main { height: calc(100vh - 65px) }' que
           vivia en AdminApp: era un selector de ETIQUETA global con
           !important y un 65 escrito a mano que no se derivaba de nada —
           y el header ahora tiene dos renglones, asi que el numero ya
           mentia. La columna reparte la altura sola. */
        .admin-shell {
          display: flex;
          height: 100vh;
          min-width: 0;
        }
        .admin-main {
          flex: 1;
          min-width: 0;
          min-height: 0;
          overflow: auto;
          padding: var(--bp-space-6);
          padding-bottom: 100px;
          box-sizing: border-box;
        }
        @media (max-width: 767px) {
          .admin-shell { flex-direction: column; }
        }

        .admin-contexto {
          display: flex;
          gap: 2px;
          padding: 3px;
          background: var(--admin-surface-soft);
          border: 1px solid var(--admin-border);
          border-radius: var(--bp-radius-lg);
        }
        .admin-contexto button {
          flex: 1 1 0;
          min-width: 0;
          min-height: 36px;
          padding: 0 10px;
          border: 1px solid transparent;
          border-radius: 9px;
          background: transparent;
          color: var(--admin-muted);
          font-family: inherit;
          font-size: var(--bp-text-sm);
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .admin-contexto button.es-activa {
          background: var(--admin-surface);
          border-color: var(--admin-border);
          color: var(--admin-text);
          font-weight: 700;
        }

        .admin-barra-inferior {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 40;
          display: flex;
          gap: var(--bp-space-2);
          padding: 10px 16px 20px;
          background: var(--admin-sidebar);
          border-top: 1px solid var(--admin-border-soft);
        }
        /* flex:1 y NO un ancho minimo fijo. Consultorio tiene CINCO destinos
           (Citas, Servicios, Doctores, Especialidades, Horarios): a 72px
           fijos serian 424px y seguirian sin caber en 375. Repartiendo el
           ancho, cinco dan 62px cada uno y cuatro dan 80 — por encima del
           objetivo tactil de 44 en las dos dimensiones, y sin scroll. */
        .admin-barra-inferior button {
          flex: 1 1 0;
          min-width: 0;
          min-height: 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 4px 2px;
          background: none;
          border: none;
          cursor: pointer;
          font-family: inherit;
          color: var(--admin-subtle);
        }
        .admin-barra-inferior button.es-activo { color: var(--admin-accent-text); }
        .admin-barra-inferior button > span {
          font-size: 10px;
          font-weight: 600;
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
  );
}
