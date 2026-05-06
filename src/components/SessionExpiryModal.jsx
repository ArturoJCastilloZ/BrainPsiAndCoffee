import React from 'react';
import { Clock } from 'lucide-react';
import { authService } from '../auth/authService';
import { C } from '../theme';

export default function SessionExpiryModal({ visible }) {
  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 2000,
      display: 'grid',
      placeItems: 'center',
      background: 'rgba(30, 27, 24, 0.72)',
      padding: 20
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: 'var(--bp-surface)',
        color: C.brown,
        border: `1px solid ${C.sagePale}`,
        borderRadius: 20,
        padding: 22,
        boxShadow: '0 24px 70px rgba(0,0,0,0.28)'
      }}>
        <Clock size={28} color={C.caramel} />
        <h2 className="font-display" style={{ margin: '12px 0 6px', fontSize: 24 }}>Tu sesión está por caducar</h2>
        <p style={{ margin: '0 0 18px', color: C.brownMid, fontSize: 14, lineHeight: 1.5 }}>
          Por seguridad se cerrará automáticamente por inactividad. Puedes reactivar el tiempo para continuar trabajando.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={() => authService.logout('expired-by-user')} style={{
            background: 'transparent',
            color: C.rust,
            border: `1px solid ${C.rustAlpha40}`,
            borderRadius: 999,
            padding: '10px 14px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 700
          }}>Cerrar sesión</button>
          <button onClick={() => authService.refreshActivity()} style={{
            background: 'var(--bp-primary)',
            color: 'var(--bp-primary-contrast)',
            border: 'none',
            borderRadius: 999,
            padding: '10px 16px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontWeight: 700
          }}>Reactivar tiempo</button>
        </div>
      </div>
    </div>
  );
}
