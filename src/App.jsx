import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { C } from './theme';
import { useStorage } from './hooks/useStorage';
import { useSupabaseCrud } from './hooks/useSupabaseCrud';
import GlobalLoader from './components/GlobalLoader';
import { authService } from './auth/authService';
import { useAuthSession, useInactivityTracking, useSessionWarning } from './auth/useAuth';
import SessionExpiryModal from './components/SessionExpiryModal';
import { trackPageView } from './monitoring';
import { canAccessAdmin, canAccessDoctor, isDoctor } from './auth/permissions';
import TenantPicker from './components/TenantPicker';

const UserApp = lazy(() => import('./user/UserApp'));
const AdminApp = lazy(() => import('./admin/AdminApp'));
const DoctorApp = lazy(() => import('./doctor/DoctorApp'));
const Login = lazy(() => import('./components/Login'));
const SetPassword = lazy(() => import('./components/SetPassword'));

export default function App() {
  const [theme, setTheme] = useStorage('brainpsi:theme', 'light');
  const session = useAuthSession();
  const {
    bookings,
    setBookings,
    orders,
    setOrders,
    catalogs,
    catalogActions,
    loading: dataLoading,
    error: dataError,
    seedCatalogs,
  } = useSupabaseCrud(session);
  const showSessionWarning = useSessionWarning();
  const navigate = useNavigate();
  const location = useLocation();

  const isDark = theme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');
  const goUser = () => navigate('/');
  const logout = () => {
    authService.logout();
    // navigate('/');
  };
  useInactivityTracking(Boolean(session));

  // Un usuario con varias clinicas y ninguna elegida no tiene rol: sin
  // saber en cual esta, no se puede decidir que puede ver. Se le pregunta
  // antes de dejarlo entrar, en vez de mostrarle un admin vacio o
  // mandarlo al login como si no tuviera permisos.
  const mustPickTenant =
    Boolean(session) && !session.user.tenantId && Object.keys(session.user.memberships || {}).length > 1;
  React.useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  if (mustPickTenant) {
    return (
      <TenantPicker
        memberships={session.user.memberships}
        theme={theme}
        // Se re-deriva la sesion para que el rol pase a ser el de la
        // clinica recien elegida.
        onSelected={() => authService.reloadSession()}
      />
    );
  }

  return (
    <div data-theme={theme} style={{
      background: C.ivory,
      minHeight: '100vh',
      fontFamily: "'Outfit', system-ui, sans-serif",
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
    }}>
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
      `}</style>

      {dataError && (
        <div style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          background: C.rust, color: 'white', borderRadius: 999, padding: '8px 14px',
          fontSize: 12, fontWeight: 700, boxShadow: '0 10px 30px rgba(0,0,0,0.18)'
        }}>
          Error conectando con Supabase: {dataError.message}
        </div>
      )}

      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<UserApp initialPage="home" bookings={bookings} setBookings={setBookings} orders={orders} setOrders={setOrders} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} dataLoading={dataLoading} />} />
          <Route path="/coffee" element={<UserApp initialPage="menu" bookings={bookings} setBookings={setBookings} orders={orders} setOrders={setOrders} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} dataLoading={dataLoading} />} />
          <Route path="/therapy" element={<UserApp initialPage="therapy" bookings={bookings} setBookings={setBookings} orders={orders} setOrders={setOrders} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} dataLoading={dataLoading} />} />
          <Route path="/contacto" element={<UserApp initialPage="contact" bookings={bookings} setBookings={setBookings} orders={orders} setOrders={setOrders} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} dataLoading={dataLoading} />} />
          <Route path="/privacidad" element={<UserApp initialPage="privacy" bookings={bookings} setBookings={setBookings} orders={orders} setOrders={setOrders} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} dataLoading={dataLoading} />} />
          <Route path="/login" element={<Login onLogin={(nextSession) => navigate(isDoctor(nextSession?.user.role) ? '/doctor' : '/admin', { replace: true })} onCancel={goUser} theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/set-password" element={<SetPassword session={session} onComplete={() => navigate(isDoctor(session?.user.role) ? '/doctor' : '/admin', { replace: true })} theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/admin" element={
            canAccessAdmin(session?.user.role) ? (
              <AdminApp bookings={bookings} setBookings={setBookings} orders={orders} setOrders={setOrders} switchToUser={goUser} logout={logout} session={session} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} catalogActions={catalogActions} dataLoading={dataLoading} seedCatalogs={seedCatalogs} />
            ) : canAccessDoctor(session?.user.role) ? (
              <Navigate to="/doctor" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          } />
          <Route path="/doctor" element={
            canAccessDoctor(session?.user.role) ? (
              <DoctorApp bookings={bookings} setBookings={setBookings} logout={logout} session={session} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} catalogActions={catalogActions} />
            ) : canAccessAdmin(session?.user.role) ? (
              <Navigate to="/admin" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          } />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <SessionExpiryModal visible={Boolean(session && showSessionWarning)} />
      <GlobalLoader />
    </div>
  );
}

function RouteFallback() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: C.brown, fontWeight: 700 }}>
      Cargando...
    </div>
  );
}

// ============ USER APP ============
