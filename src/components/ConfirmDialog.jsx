import React, { useCallback, useEffect, useRef, useState } from 'react';
import { C } from '../theme';

// Dialogo de confirmacion con el diseño de la aplicacion.
//
// Sustituye a window.confirm y window.prompt, que se ven como el navegador
// y no como el producto, no se pueden estilizar, y en el caso de prompt
// piden escribir a mano un id que el sistema ya conoce.
//
// Se usa como hook para poder esperar la respuesta:
//
//   const { confirmar, dialogo } = useConfirm();
//   if (!(await confirmar({ mensaje: '...' }))) return;
//   ...y renderizar {dialogo} en el arbol.
export function useConfirm() {
  const [estado, setEstado] = useState(null);
  const resolver = useRef(null);

  const confirmar = useCallback((opciones) => new Promise((resolve) => {
    resolver.current = resolve;
    setEstado({ seleccion: opciones.opciones?.[0]?.id ?? null, ...opciones });
  }), []);

  const cerrar = useCallback((valor) => {
    setEstado(null);
    resolver.current?.(valor);
    resolver.current = null;
  }, []);

  const dialogo = estado ? (
    <Dialogo
      {...estado}
      onSeleccion={(seleccion) => setEstado((e) => ({ ...e, seleccion }))}
      onCancelar={() => cerrar(estado.opciones ? null : false)}
      onAceptar={() => cerrar(estado.opciones ? estado.seleccion : true)}
    />
  ) : null;

  return { confirmar, dialogo };
}

function Dialogo({
  titulo, mensaje, aceptar = 'Aceptar', cancelar = 'Cancelar',
  destructivo = false, opciones, seleccion, onSeleccion, onCancelar, onAceptar,
}) {
  const aceptarRef = useRef(null);

  useEffect(() => {
    aceptarRef.current?.focus();
    // Escape cancela y Enter acepta, como en cualquier dialogo del
    // sistema: quitarle esa costumbre al usuario es peor que no tener
    // dialogo propio.
    const onKey = (e) => {
      if (e.key === 'Escape') onCancelar();
      if (e.key === 'Enter' && !opciones) onAceptar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onAceptar, onCancelar, opciones]);

  const puedeAceptar = !opciones || Boolean(seleccion);

  return (
    <div
      role="presentation"
      onClick={onCancelar}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo || 'Confirmación'}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          background: 'var(--admin-surface)',
          border: '1px solid var(--admin-border)',
          borderRadius: 16, padding: 20,
          boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
        }}
      >
        {titulo && (
          <h2 className="font-display" style={{
            margin: '0 0 8px', fontSize: 20, fontWeight: 500,
            color: 'var(--admin-text)', letterSpacing: '-0.01em',
          }}>{titulo}</h2>
        )}

        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--admin-muted)' }}>
          {mensaje}
        </p>

        {opciones && (
          <select
            value={seleccion || ''}
            onChange={(e) => onSeleccion(e.target.value)}
            style={{
              width: '100%', marginTop: 14, boxSizing: 'border-box',
              background: 'var(--admin-surface-soft)',
              border: '1px solid var(--admin-border)',
              borderRadius: 9, padding: '9px 10px',
              color: 'var(--admin-text)', fontFamily: 'inherit', fontSize: 13,
            }}
          >
            <option value="">Elige una opción…</option>
            {opciones.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        )}

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          marginTop: 18, flexWrap: 'wrap',
        }}>
          <button type="button" onClick={onCancelar} style={boton()}>{cancelar}</button>
          <button
            ref={aceptarRef}
            type="button"
            onClick={onAceptar}
            disabled={!puedeAceptar}
            style={{
              ...boton(destructivo ? 'peligro' : 'primario'),
              opacity: puedeAceptar ? 1 : 0.45,
              cursor: puedeAceptar ? 'pointer' : 'not-allowed',
            }}
          >{aceptar}</button>
        </div>
      </div>
    </div>
  );
}

function boton(tipo) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    borderRadius: 9, padding: '9px 14px', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
    border: '1px solid var(--admin-border)',
    background: 'transparent', color: 'var(--admin-accent-text)',
  };
  if (tipo === 'primario') {
    return { ...base, background: C.sageDeep, borderColor: C.sageDeep, color: C.ivory };
  }
  if (tipo === 'peligro') {
    return { ...base, background: C.rustAlpha20, borderColor: C.rustAlpha40, color: C.rust };
  }
  return base;
}
