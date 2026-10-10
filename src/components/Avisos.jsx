import React, { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';

// Avisos del panel: "se guardo", "se elimino", "cita confirmada".
//
// Antes cada pantalla ponia su mensaje arriba de todo, y quien guardaba
// desde el boton de abajo no lo veia: parecia que no habia pasado nada.
// Este aviso sale SIEMPRE en el mismo lugar, fijo en pantalla, sin
// importar el scroll.
//
// Es un emisor de modulo y no un contexto a proposito: cualquier pantalla
// (o el envoltorio de los guardados, useAccionesConAviso) avisa con una
// llamada, sin pasar props, y en las pruebas sin <Avisos/> montado no
// pasa nada.
const oyentes = new Set();
let siguiente = 1;

const publicar = (tono, texto) => {
  if (!texto) return;
  const aviso = { id: siguiente++, tono, texto };
  oyentes.forEach((fn) => fn(aviso));
};

export const avisar = {
  exito: (texto) => publicar('exito', texto),
};

const DURACION = 4500;

export default function Avisos() {
  const [lista, setLista] = useState([]);

  useEffect(() => {
    const oir = (aviso) => {
      // El mismo texto dos veces seguidas (un guardado que toca dos
      // tablas) es un solo aviso.
      setLista((prev) => (prev.some((a) => a.texto === aviso.texto) ? prev : [...prev.slice(-2), aviso]));
      window.setTimeout(() => setLista((prev) => prev.filter((a) => a.id !== aviso.id)), DURACION);
    };
    oyentes.add(oir);
    return () => { oyentes.delete(oir); };
  }, []);

  return (
    // Siempre montada y vacia: un aria-live que aparece junto con su
    // mensaje no se anuncia en todos los lectores de pantalla.
    <div role="status" aria-live="polite" className="admin-avisos" style={{
      position: 'fixed', right: 16, left: 16, zIndex: 1200,
      display: 'grid', justifyItems: 'end', gap: 8, pointerEvents: 'none',
    }}>
      {lista.map((a) => (
        <div key={a.id} style={{
          pointerEvents: 'auto', maxWidth: 440, display: 'flex', gap: 10, alignItems: 'flex-start',
          background: 'var(--admin-text)', color: 'var(--admin-bg)',
          borderRadius: 12, padding: '12px 12px 12px 14px', fontSize: 14, lineHeight: 1.45,
          boxShadow: '0 12px 32px rgba(0,0,0,0.3)',
        }}>
          <CheckCircle2 size={18} aria-hidden="true" style={{ flex: 'none', marginTop: 1 }} />
          <span style={{ flex: 1 }}>{a.texto}</span>
          <button type="button" aria-label="Cerrar aviso" onClick={() => setLista((prev) => prev.filter((x) => x.id !== a.id))}
            style={{ flex: 'none', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2, display: 'inline-grid' }}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
