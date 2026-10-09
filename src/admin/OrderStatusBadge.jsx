import React from 'react';
import { C } from '../theme';

// Estado de un pedido, en palabras. La usan Pedidos y el Inicio del panel;
// el Inicio pintaba el codigo crudo en mayusculas (PENDING_APPOINTMENT).
export default function StatusBadge({ status }) {
  // Frase normal, no MAYUSCULAS, y color de TEXTO que pasa contraste: el
  // rust y el caramelo crudos daban 2.6-3.2:1 sobre la tarjeta.
  const config = {
    received: { label: 'Nuevo', background: C.rustAlpha20, color: C.rustText },
    pending_appointment: { label: 'Espera la cita', background: C.caramelLightAlpha30, color: 'var(--admin-text)' },
    preparing: { label: 'Preparando', background: C.caramelLightAlpha30, color: 'var(--admin-text)' },
    ready: { label: 'Listo', background: C.sageDarkAlpha50, color: 'var(--admin-text)' },
    delivered: { label: 'Entregado', background: 'var(--admin-border)', color: 'var(--admin-muted)' },
    cancelled: { label: 'Cancelado', background: C.rustAlpha20, color: C.rustText },
  }[status] || { label: String(status || ''), background: 'var(--admin-border)', color: 'var(--admin-muted)' };

  return (
    <span style={{
      fontSize: 13,
      padding: '4px 10px',
      borderRadius: 999,
      fontWeight: 700,
      background: config.background,
      color: config.color,
      whiteSpace: 'nowrap'
    }}>{config.label}</span>
  );
}
