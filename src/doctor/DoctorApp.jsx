import React from 'react';
import { Calendar as CalendarIcon, LogOut, Settings } from 'lucide-react';
import { C } from '../theme';
import BrandMark from '../components/BrandMark';
import AdminAppointments from '../admin/AdminAppointments';

export default function DoctorApp({ bookings, setBookings, catalogs, session, logout, theme, toggleTheme }) {
  const isDark = theme === 'dark';
  const therapistId = session?.user?.therapistId;
  const therapist = catalogs.therapists.find((item) => item.id === therapistId);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--admin-bg)',
      color: 'var(--admin-text)',
      '--admin-bg': isDark ? '#0F1410' : '#F5EFE6',
      '--admin-sidebar': isDark ? '#0A0F09' : '#FFFDF8',
      '--admin-surface': isDark ? '#1A2118' : '#FFFFFF',
      '--admin-surface-soft': isDark ? '#10170F' : '#F8F1E7',
      '--admin-border': isDark ? '#2A332A' : '#E8D9C5',
      '--admin-border-soft': isDark ? '#1A2118' : '#EFE2D1',
      '--admin-text': isDark ? C.cream : C.brown,
      '--admin-muted': isDark ? '#7A8C77' : C.brownMid,
      '--admin-subtle': isDark ? '#5A6B57' : C.brownLight,
      '--admin-row-text': isDark ? '#9AAA97' : C.brownMid,
      '--admin-accent-text': isDark ? C.sageLight : C.sageDark,
      '--admin-on-accent': '#1E1B18'
    }}>
      <style>{`
        .admin-card { background: var(--admin-surface); border: 1px solid var(--admin-border); }
        .admin-input { background: var(--admin-surface); border: 1px solid var(--admin-border); color: var(--admin-text); }
        .admin-input::placeholder { color: var(--admin-subtle); }
      `}</style>
      <header style={{
        background: 'var(--admin-sidebar)',
        borderBottom: '1px solid var(--admin-border-soft)',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BrandMark size={36} />
          <div>
            <div className="font-display" style={{ fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{therapist?.name || session.user.name}</div>
            <div style={{ color: 'var(--admin-accent-text)', fontSize: 10, letterSpacing: 1, fontWeight: 800 }}>PANEL DOCTOR</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={toggleTheme} style={topButtonStyle}>
            <Settings size={14} /> Modo {theme === 'dark' ? 'claro' : 'oscuro'}
          </button>
          <button onClick={logout} style={{ ...topButtonStyle, color: C.rust }}>
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
      </header>
      <main style={{ padding: 24, maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <CalendarIcon size={20} color="var(--admin-accent-text)" />
          <div>
            <h1 className="font-display" style={{ margin: 0, color: 'var(--admin-text)', fontSize: 30 }}>Mis citas</h1>
            <p style={{ margin: '2px 0 0', color: 'var(--admin-muted)', fontSize: 13 }}>Solo puedes administrar las citas asignadas a tu usuario.</p>
          </div>
        </div>
        <AdminAppointments bookings={bookings} setBookings={setBookings} catalogs={catalogs} lockedTherapistId={therapistId} />
      </main>
    </div>
  );
}

const topButtonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  background: 'transparent',
  border: '1px solid var(--admin-border)',
  color: 'var(--admin-accent-text)',
  borderRadius: 999,
  padding: '8px 12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 700
};

