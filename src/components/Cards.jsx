import React from 'react';
import { Clock } from 'lucide-react';
import { C } from '../theme';
import { getServiceIcon } from '../utils.jsx';

export function SectionTitle({ eyebrow, title }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 11, color: C.sageDark, fontWeight: 700, letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' }}>{eyebrow}</div>
      <h2 className="font-display" style={{ fontSize: 28, fontWeight: 500, color: C.brown, margin: 0, letterSpacing: '-0.02em' }}>{title}</h2>
    </div>
  );
}

export function ServiceCard({ service, onClick, index }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--bp-surface)', border: `1px solid ${C.sagePale}`, borderRadius: 18, padding: 18,
      cursor: 'pointer', transition: 'all 0.25s ease',
      animationDelay: `${index * 0.05}s`, opacity: 0, animationFillMode: 'forwards'
    }} className="animate-fade-up"
       onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.borderColor = C.sage; }}
       onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.borderColor = C.sagePale; }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: C.sagePale, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sageDeep }}>
          {getServiceIcon(service.icon, 22)}
        </div>
        <span style={{ fontSize: 10, padding: '3px 8px', background: 'var(--bp-badge-bg)', color: 'var(--bp-badge-text)', borderRadius: 999, fontWeight: 600 }}>{service.for}</span>
      </div>
      <div className="font-display" style={{ fontSize: 17, fontWeight: 600, color: C.brown, marginBottom: 6, lineHeight: 1.3 }}>{service.name}</div>
      <div style={{ fontSize: 12, color: C.brownMid, lineHeight: 1.5, marginBottom: 14 }}>{service.desc}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${C.sagePale}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.brownLight }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={11} /> {service.duration} min</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.sageDark }}>${service.price}</div>
      </div>
    </div>
  );
}

// ============ ABOUT ============
