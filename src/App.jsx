import React from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { C } from './theme';
import { useStorage } from './hooks/useStorage';
import { useSupabaseCrud } from './hooks/useSupabaseCrud';
import UserApp from './user/UserApp';
import AdminApp from './admin/AdminApp';
import DoctorApp from './doctor/DoctorApp';
import Login from './components/Login';
import SetPassword from './components/SetPassword';
import GlobalLoader from './components/GlobalLoader';
import { authService } from './auth/authService';
import { useAuthSession, useInactivityTracking, useSessionWarning } from './auth/useAuth';
import SessionExpiryModal from './components/SessionExpiryModal';

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

  const isDark = theme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');
  const goUser = () => navigate('/');
  const logout = () => {
    authService.logout();
    navigate('/');
  };
  useInactivityTracking(Boolean(session));

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

      <Routes>
        <Route path="/" element={<UserApp bookings={bookings} setBookings={setBookings} orders={orders} setOrders={setOrders} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} dataLoading={dataLoading} />} />
        <Route path="/login" element={<Login onLogin={(nextSession) => navigate(nextSession?.user.role === 'doctor' ? '/doctor' : '/admin', { replace: true })} onCancel={goUser} theme={theme} toggleTheme={toggleTheme} />} />
        <Route path="/set-password" element={<SetPassword session={session} onComplete={() => navigate(session?.user.role === 'doctor' ? '/doctor' : '/admin', { replace: true })} theme={theme} toggleTheme={toggleTheme} />} />
        <Route path="/admin" element={
          session?.user.role === 'admin' ? (
            <AdminApp bookings={bookings} setBookings={setBookings} orders={orders} setOrders={setOrders} switchToUser={goUser} logout={logout} session={session} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} catalogActions={catalogActions} dataLoading={dataLoading} seedCatalogs={seedCatalogs} />
          ) : session?.user.role === 'doctor' ? (
            <Navigate to="/doctor" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        } />
        <Route path="/doctor" element={
          session?.user.role === 'doctor' ? (
            <DoctorApp bookings={bookings} setBookings={setBookings} logout={logout} session={session} theme={theme} toggleTheme={toggleTheme} catalogs={catalogs} />
          ) : session?.user.role === 'admin' ? (
            <Navigate to="/admin" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <SessionExpiryModal visible={Boolean(session && showSessionWarning)} />
      <GlobalLoader />
    </div>
  );
}

// ============ USER APP ============
