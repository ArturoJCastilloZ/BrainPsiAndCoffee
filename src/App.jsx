import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { C } from './theme';
import { useStorage } from './hooks/useStorage';
import { useSupabaseCrud } from './hooks/useSupabaseCrud';
import GlobalLoader from './components/GlobalLoader';
import { authService } from './auth/authService';
import { useAuthReady, useAuthSession, useInactivityTracking, useSessionWarning } from './auth/useAuth';
import ErrorBoundary from './components/ErrorBoundary';
import SessionExpiryModal from './components/SessionExpiryModal';
import { trackPageView } from './monitoring';
import { canAccessAdmin, canAccessDoctor, isDoctor } from './auth/permissions';
import TenantPicker from './components/TenantPicker';
import PendingInvitations from './components/PendingInvitations';
import { myPendingInvitations, acceptTenantInvitation, declineTenantInvitation } from './api/supabaseData';
import GlobalStyle, { themeVars } from './GlobalStyle';
import { useRouteHead } from './seo/useRouteHead';
import { AppProviders } from './context/AppContext';
// El sitio publico va en el paquete inicial, NO lazy: es lo que ve todo
// visitante, y cargarlo aparte cambiaba el HTML prerenderizado por un
// "Cargando…" mientras llegaba el chunk. Admin y doctor siguen aparte.
import UserApp from './user/UserApp';

const AdminApp = lazy(() => import('./admin/AdminApp'));
const DoctorApp = lazy(() => import('./doctor/DoctorApp'));
const Login = lazy(() => import('./components/Login'));
const SetPassword = lazy(() => import('./components/SetPassword'));

export default function App() {
  const [theme, setTheme] = useStorage('brainpsi:theme', 'light');
  const session = useAuthSession();
  const authReady = useAuthReady();
  const [errorCerrado, setErrorCerrado] = React.useState(null);
  const crud = useSupabaseCrud(session);
  const { loading: dataLoading, error: dataError, reload: reloadData } = crud;
  const showSessionWarning = useSessionWarning();
  const navigate = useNavigate();
  const location = useLocation();
  // Titulo, descripcion y robots de CADA ruta, publica o no: entrar a
  // /login navegando dejaba el titulo y el 'index' de la portada.
  useRouteHead();

  const isDark = theme === 'dark';
  // El fondo de <html> (lo que se ve al estirar la pagina en el telefono)
  // lo puso theme-boot.js antes de pintar; se mantiene al cambiar de tema.
  React.useEffect(() => {
    document.documentElement.classList.toggle('tema-oscuro', isDark);
  }, [isDark]);
  const toggleTheme = React.useCallback(() => setTheme(isDark ? 'light' : 'dark'), [isDark, setTheme]);
  // Lo que los paneles leen con useAppData()/useTheme() (context/AppContext).
  const datos = React.useMemo(() => ({
    session,
    bookings: crud.bookings,
    setBookings: crud.setBookings,
    orders: crud.orders,
    setOrders: crud.setOrders,
    catalogs: crud.catalogs,
    catalogActions: crud.catalogActions,
    dataLoading,
    reload: reloadData,
  }), [session, crud.bookings, crud.setBookings, crud.orders, crud.setOrders, crud.catalogs, crud.catalogActions, dataLoading, reloadData]);
  const tema = React.useMemo(() => ({ theme, isDark, toggleTheme }), [theme, isDark, toggleTheme]);
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

  // Invitaciones pendientes (0032). A una clinica se entra aceptando, asi
  // que hace falta un sitio donde aceptar; sin esta pantalla las
  // invitaciones se crearian y nadie podria entrar.
  //
  // Se consulta una sola vez por sesion. Un fallo NO bloquea la entrada:
  // quien viene a trabajar tiene que poder trabajar, y una invitacion que
  // no se pudo leer se vuelve a ver la proxima vez.
  const [invitaciones, setInvitaciones] = React.useState([]);
  const [invitacionesVistas, setInvitacionesVistas] = React.useState(false);
  const cargarInvitaciones = React.useCallback(async () => {
    try {
      setInvitaciones(await myPendingInvitations());
    } catch {
      setInvitaciones([]);
    }
  }, []);
  React.useEffect(() => {
    if (!session) { setInvitaciones([]); setInvitacionesVistas(false); return; }
    cargarInvitaciones();
  }, [session, cargarInvitaciones]);

  const tieneClinica = Object.keys(session?.user?.memberships || {}).length > 0;
  const mostrarInvitaciones = Boolean(session) && invitaciones.length > 0 && !invitacionesVistas;
  React.useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  // Contraseña temporal (0033). Va ANTES que todo lo demas: quien entro
  // con una temporal no puede hacer nada hasta cambiarla, y la base ya lo
  // impone —current_tenant_id() devuelve null y las 40 policies que
  // dependen de el niegan—. Esto solo evita que vea pantallas vacias sin
  // entender por que.
  //
  // No se ofrece salida: no hay nada que pueda hacer en otro sitio.
  // Las pantallas que cortan el flujo -contraseña temporal, invitaciones,
  // elegir clinica- salen por un return ANTES del arbol principal, que es
  // donde vive el <div data-theme> con themeVars(isDark). Fuera de ese
  // div las variables --bp-* no existen, asi que todo color que venga de
  // un token queda sin valor: se veia texto negro sobre fondo negro, con
  // solo los hex literales funcionando.
  //
  // Pasaba ya con TenantPicker antes de esta sesion. Marco (abajo, fuera
  // de App) es el mismo contenedor, para que una puerta se pinte igual que
  // el resto.

  if (session?.user?.mustChangePassword) {
    // Suspense porque SetPassword es lazy (linea 21) y este return sale
    // ANTES del <Suspense> del arbol de rutas. Sin el, React lanza al
    // montar — un fallo que el build no ve, porque compilar no es
    // funcionar.
    return (
      <Marco theme={theme} isDark={isDark}>
      <Suspense fallback={<RouteFallback />}>
      <SetPassword
        session={session}
        theme={theme}
        toggleTheme={toggleTheme}
        onComplete={async () => {
          // El trigger limpia el flag en la base, pero el JWT que el
          // navegador ya tiene sigue diciendo que debe cambiarla. Sin
          // pedir un token nuevo, la persona cambia la contraseña y se
          // queda encerrada igual.
          try { await authService.refreshClaims(); } catch { authService.logout(); }
        }}
      />
      </Suspense>
      </Marco>
    );
  }

  // Va ANTES del selector de clinica: quien no tiene ninguna no llega al
  // selector, y es precisamente quien mas necesita ver la invitacion.
  if (mostrarInvitaciones) {
    return (
      <Marco theme={theme} isDark={isDark}>
      <PendingInvitations
        invitations={invitaciones}
        puedeSaltar={tieneClinica}
        theme={theme}
        onAccept={async (tenantId) => {
          await acceptTenantInvitation(tenantId);
          // El claim nuevo vive en auth.users, no en el JWT que el
          // navegador ya tiene: sin pedir un token nuevo, la clinica
          // recien aceptada no aparece hasta el proximo login.
          await authService.refreshClaims();
          await cargarInvitaciones();
        }}
        onDecline={async (tenantId) => {
          await declineTenantInvitation(tenantId);
          await cargarInvitaciones();
        }}
        onSkip={() => setInvitacionesVistas(true)}
      />
      </Marco>
    );
  }

  if (mustPickTenant) {
    return (
      <Marco theme={theme} isDark={isDark}>
      <TenantPicker
        memberships={session.user.memberships}
        theme={theme}
        // Se re-deriva la sesion para que el rol pase a ser el de la
        // clinica recien elegida.
        onSelected={() => authService.reloadSession()}
      />
      </Marco>
    );
  }

  return (
    <div data-theme={theme} style={{
      background: C.ivory,
      minHeight: '100vh',
      fontFamily: 'var(--bp-font-text)',
      ...themeVars(isDark)
    }}>
      <GlobalStyle />

      {/* Un aviso que el paciente entiende y que se puede cerrar. Antes
          decia "Error conectando con Supabase: <mensaje tecnico>" para
          todo, incluidas validaciones, y no se podia quitar. Los errores
          de una accion concreta (reservar, pedir, cancelar) ya los dice la
          pantalla que la hizo; este es para lo que no tiene dueño. */}
      {dataError && dataError !== errorCerrado && dataError.code !== 'PUBLIC_EDIT_NOT_ALLOWED' && (
        <div role="alert" style={{
          position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          display: 'flex', alignItems: 'center', gap: 10, maxWidth: 'calc(100vw - 32px)',
          background: 'var(--bp-surface)', color: C.rustText, border: `1px solid ${C.rust}`,
          borderRadius: 14, padding: '10px 12px 10px 16px',
          fontSize: 14, lineHeight: 1.4, boxShadow: '0 10px 30px rgba(0,0,0,0.18)'
        }}>
          <span>No pudimos conectar con el servidor. Algunos datos pueden no estar al día.</span>
          <button type="button" onClick={() => { setErrorCerrado(dataError); reloadData(); }} style={bannerButton}>
            Reintentar
          </button>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setErrorCerrado(dataError)} style={bannerButton}>
            ✕
          </button>
        </div>
      )}

      <AppProviders data={datos} theme={tema}>
      <ErrorBoundary resetKey={location.pathname}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login onLogin={(nextSession) => navigate(isDoctor(nextSession?.user.role) ? '/doctor' : '/admin', { replace: true })} onCancel={goUser} theme={theme} toggleTheme={toggleTheme} />} />
          <Route path="/set-password" element={<SetPassword session={session} onComplete={() => navigate(isDoctor(session?.user.role) ? '/doctor' : '/admin', { replace: true })} theme={theme} toggleTheme={toggleTheme} />} />
          {/* Mientras se lee la sesion guardada no se decide nada: antes
              session arrancaba en null, la ruta mandaba al login y quien
              recargaba /admin con sesion valida perdia la pagina. */}
          <Route path="/admin" element={
            !authReady ? <RouteFallback /> : canAccessAdmin(session?.user.role) ? (
              <AdminApp switchToUser={goUser} logout={logout} />
            ) : canAccessDoctor(session?.user.role) ? (
              <Navigate to="/doctor" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          } />
          <Route path="/doctor" element={
            !authReady ? <RouteFallback /> : canAccessDoctor(session?.user.role) ? (
              <DoctorApp logout={logout} />
            ) : canAccessAdmin(session?.user.role) ? (
              <Navigate to="/admin" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          } />
          {/* El sitio publico tiene sus propias rutas (/terapia, /reservar,
              ...) y su 404: ver user/UserApp.jsx. */}
          <Route path="/*" element={<UserApp />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
      </AppProviders>
      <SessionExpiryModal visible={Boolean(session && showSessionWarning)} />
      <GlobalLoader />
    </div>
  );
}

// Fuera de App A PROPOSITO. Definido dentro, era un tipo de componente
// NUEVO en cada render de App, y React desmontaba y volvia a montar todo
// lo de adentro: quien escribia su contraseña nueva en SetPassword perdia
// el foco y lo escrito cada vez que App se re-renderizaba (el temporizador
// de inactividad lo hace con el primer movimiento del raton).
function Marco({ theme, isDark, children }) {
  return (
    <div data-theme={theme} style={{
      background: C.ivory,
      minHeight: '100vh',
      fontFamily: 'var(--bp-font-text)',
      ...themeVars(isDark),
    }}>
      <GlobalStyle />
      {children}
    </div>
  );
}

const bannerButton = {
  background: 'transparent', border: '1px solid currentColor', color: 'inherit',
  borderRadius: 10, padding: '6px 10px', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
};

function RouteFallback() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: C.brown, fontWeight: 700 }}>
      Cargando…
    </div>
  );
}

// ============ USER APP ============
