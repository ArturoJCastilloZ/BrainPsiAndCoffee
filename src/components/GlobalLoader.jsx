import React, { useEffect, useState } from 'react';
import BrandMark from './BrandMark';
import { requestActivity$ } from '../api/requestActivity';
import { C } from '../theme';

export default function GlobalLoader() {
  const [activeRequests, setActiveRequests] = useState(requestActivity$.value);

  useEffect(() => {
    const subscription = requestActivity$.subscribe(setActiveRequests);
    return () => subscription.unsubscribe();
  }, []);

  if (activeRequests === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 3000,
      display: 'grid',
      placeItems: 'center',
      background: 'rgba(15, 20, 16, 0.46)',
      backdropFilter: 'blur(6px)',
      pointerEvents: 'auto'
    }}>
      <div style={{
        display: 'grid',
        placeItems: 'center',
        gap: 12,
        background: 'var(--bp-surface)',
        border: `1px solid ${C.sagePale}`,
        borderRadius: 18,
        padding: '22px 26px',
        boxShadow: '0 24px 70px rgba(0,0,0,0.24)'
      }}>
        <div className="brand-loader-spin">
          <BrandMark size={58} />
        </div>
        <div style={{ color: C.brown, fontSize: 12, fontWeight: 800, letterSpacing: 1.2 }}>
          GUARDANDO
        </div>
      </div>
    </div>
  );
}

