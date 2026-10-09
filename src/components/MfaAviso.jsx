import React from 'react';
import { ShieldAlert } from 'lucide-react';

// La clinica exige verificacion en dos pasos para EXPEDIENTES y esta sesion
// no la tiene. Antes se bloqueaba el panel ENTERO: quien recien entraba no
// podia ni ver la agenda, aunque la base solo protege el expediente (las
// policies restrictivas de 0039). Ahora se avisa arriba y solo se pide en
// la pantalla que abre expedientes.
export default function MfaAviso({ onActivar }) {
  return (
    <div role="status" style={{
      display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      border: '1px solid var(--admin-accent)', background: 'var(--admin-surface-soft)',
      borderRadius: 12, padding: '12px 14px', marginBottom: 18, color: 'var(--admin-text)',
    }}>
      <ShieldAlert size={18} aria-hidden="true" style={{ flex: 'none', color: 'var(--admin-accent-text)' }} />
      <p style={{ flex: '1 1 260px', margin: 0, fontSize: 14, lineHeight: 1.5 }}>
        La clínica pide verificación en dos pasos para abrir expedientes clínicos. Lo demás lo puedes usar normal.
      </p>
      {onActivar && (
        <button type="button" onClick={onActivar} style={{
          flex: 'none', minHeight: 36, padding: '0 14px', borderRadius: 999, border: 'none',
          background: 'var(--admin-accent)', color: 'var(--admin-on-accent)', fontFamily: 'inherit',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>Activarla</button>
      )}
    </div>
  );
}
