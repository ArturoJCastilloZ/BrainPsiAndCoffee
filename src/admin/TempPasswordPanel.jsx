import React from 'react';
import { Check, Copy, KeyRound } from 'lucide-react';
import { C } from '../theme';

// La contraseña temporal de un alta de personal.
//
// Vive en su propio archivo por una razon concreta: es el UNICO sitio de
// la aplicacion donde se muestra una credencial en claro, y estaba
// embebido en AdminAccess, que habla con Supabase al montarse y por eso
// no se puede abrir en el banco de pruebas. Una tarjeta que enseña una
// contraseña es la ultima que uno querria entregar sin haberla visto.
//
// Se muestra UNA vez. Guardarla para poder reconsultarla seria dejar una
// contraseña en claro esperando a que alguien la lea.
export default function TempPasswordPanel({ alta, copiado, onCopiar, onCerrar }) {
  if (!alta) return null;

  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <KeyRound size={16} color={C.sageDeep} aria-hidden="true" />
        <strong style={{ fontSize: 13, color: 'var(--admin-text)' }}>
          Contraseña temporal de {alta.email}
        </strong>
      </div>

      <p style={{ fontSize: 12, color: 'var(--admin-text)', margin: '0 0 10px' }}>
        Anotala ahora: no se vuelve a mostrar. Entregasela en persona, no por correo ni por chat.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <code style={{
          flex: '1 1 220px', padding: '12px 14px', borderRadius: 10,
          background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)',
          fontSize: 18, letterSpacing: 1, color: 'var(--admin-text)', wordBreak: 'break-all',
        }}>{alta.clave}</code>
        <button type="button" onClick={onCopiar} style={boton}>
          {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copiado ? 'Copiada' : 'Copiar'}
        </button>
        <button type="button" onClick={onCerrar} style={{ ...boton, background: 'transparent', color: 'var(--admin-text)', border: '1px solid var(--admin-border)' }}>
          Listo
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '10px 0 0' }}>
        Caduca el {new Date(alta.caduca).toLocaleString('es-MX')}. Hasta que la cambie, esa cuenta no puede
        ver ni hacer nada.
      </p>
    </div>
  );
}

const tarjeta = {
  background: 'var(--admin-surface)',
  border: `1px solid ${C.sageDeep}`,
  borderRadius: 14,
  padding: 16,
  marginTop: 14,
};

const boton = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  padding: '0 14px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--bp-primary)',
  color: 'var(--bp-primary-contrast)',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};
