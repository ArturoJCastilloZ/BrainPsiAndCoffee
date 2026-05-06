import React from 'react';
import { Brain } from 'lucide-react';
import { C } from '../theme';

export default function BrandMark({ size = 40 }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      background: `linear-gradient(135deg, ${C.caramelLight}, ${C.caramel})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `inset 0 -2px 4px rgba(0,0,0,0.1)`,
      position: 'relative', overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 50%)` }} />
      <Brain size={size * 0.55} color={C.brown} strokeWidth={1.5} style={{ position: 'relative', zIndex: 1 }} />
    </div>
  );
}

// ============ USER HOME ============
