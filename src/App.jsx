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
