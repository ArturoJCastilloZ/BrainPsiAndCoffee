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
import PendingInvitations from './components/PendingInvitations';
import { myPendingInvitations, acceptTenantInvitation, declineTenantInvitation } from './api/supabaseData';
import GlobalStyle, { themeVars } from './GlobalStyle';

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
  // Pasaba ya con TenantPicker antes de esta sesion. Este marco es el
  // mismo contenedor, para que una puerta se pinte igual que el resto.
  const Marco = ({ children }) => (
    <div data-theme={theme} style={{
      background: C.ivory,
      minHeight: '100vh',
      fontFamily: "'Outfit', system-ui, sans-serif",
      ...themeVars(isDark),
    }}>
      <GlobalStyle />
      {children}
    </div>
  );

  if (session?.user?.mustChangePassword) {
    // Suspense porque SetPassword es lazy (linea 21) y este return sale
    // ANTES del <Suspense> del arbol de rutas. Sin el, React lanza al
    // montar — un fallo que el build no ve, porque compilar no es
    // funcionar.
    return (
      <Marco>
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
      <Marco>
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
      <Marco>
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
      fontFamily: "'Outfit', system-ui, sans-serif",
      ...themeVars(isDark)
    }}>
      <GlobalStyle />

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
              <AdminApp bookings={bookings} setBookings={setBookings} orders={orders} setOrders={setOrders} switchToUser={goUser} logout={logout} session={session} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} catalogActions={catalogActions} dataLoading={dataLoading} />
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
