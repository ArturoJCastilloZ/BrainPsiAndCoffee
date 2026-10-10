import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

// Ventana para un formulario del panel (nuevo / editar).
//
// Antes el formulario se abria ARRIBA de la lista: al dar "Editar" en el
// ultimo servicio habia que subir para encontrarlo. En una ventana aparece
// donde estas, sin importar el scroll.
//
// <dialog> nativo con showModal, igual que MenuPage: Escape cierra, el
// foco queda atrapado dentro y vuelve al boton que la abrio, y el resto de
// la pagina queda inerte para el lector de pantalla.
export default function FormModal({ titulo, onCerrar, children, pie }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal?.();
    return () => { if (dialogo?.open) dialogo.close(); };
  }, []);

  return (
    <dialog
      ref={ref}
      className="admin-modal"
      aria-labelledby="form-modal-titulo"
      onClose={onCerrar}
      // Clic en el fondo (el propio <dialog>, fuera de la caja) cierra.
      onMouseDown={(e) => { if (e.target === ref.current) ref.current.close(); }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <h2 id="form-modal-titulo" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--admin-text)' }}>{titulo}</h2>
        <button type="button" aria-label="Cerrar" onClick={() => ref.current?.close()}
          style={{ display: 'inline-grid', placeItems: 'center', width: 36, height: 36, borderRadius: 999, border: '1px solid var(--admin-border)', background: 'transparent', color: 'var(--admin-text)', cursor: 'pointer' }}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      {children}
      {pie && <div style={{ marginTop: 16 }}>{pie}</div>}
    </dialog>
  );
}
