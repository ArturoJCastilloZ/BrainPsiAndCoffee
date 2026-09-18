import React, { useEffect, useMemo, useRef, useState } from 'react';
import { C } from '../theme';
import { formatMoney } from '../accounting.mjs';
import {
  PAYMENT_METHODS, METHOD_LABEL,
  paymentStatus, validatePayment, toPaymentRow,
} from '../payments.mjs';

// Registrar un cobro.
//
// Hasta ahora `savePayment` existia en la capa de datos y ninguna pantalla
// la llamaba: "Cobrado" era siempre $0.00 y "Por cobrar" nunca bajaba.
// Este dialogo es el unico camino para crear un cobro, y lo comparten las
// tres pantallas que pueden hacerlo (citas, pedidos y el panel) para que
// la regla no se escriba tres veces y se separe en dos.
//
// El METODO es obligatorio: 0027 lo declara not null. Lo que el efectivo
// implica para la deduccion del paciente se dice en el panel de
// Contabilidad, sobre el total del periodo, y no aqui: al registrar cobro
// por cobro el aviso se vuelve un sobresalto en cada captura.
export default function PaymentDialog({
  kind,            // 'cita' | 'pedido'
  doc,             // la cita o el pedido que se cobra
  payments = [],   // todos los cobros: de aqui sale el saldo
  canRecord,       // capacidad ya resuelta (permissions.canRecordPayment)
  descripcion,     // que se esta cobrando, en palabras
  onGuardar,       // async (fila) => void
  onCerrar,
}) {
  const estado = useMemo(() => paymentStatus(doc, payments, kind), [doc, payments, kind]);

  const [draft, setDraft] = useState(() => ({
    kind,
    docId: doc?.id,
    // Arranca en el saldo, que es el caso normal: se cobra lo que falta.
    // Se puede bajar para registrar un abono; subirlo lo rechaza la
    // validacion, porque cobrar de mas descuadra el libro sin dejar dicho
    // por que.
    amount: estado.saldo > 0 ? String(estado.saldo) : '',
    // Sin preseleccionar, a proposito: el metodo es dato fiscal y con un
    // valor puesto se registraria por inercia el que trajera el formulario
    // en vez del que de verdad se cobro.
    method: '',
    paidAt: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
  }));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const primeroRef = useRef(null);

  useEffect(() => { primeroRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !guardando) onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCerrar, guardando]);

  const enviar = async (e) => {
    e.preventDefault();
    const fallo = validatePayment(draft, { doc, payments, canRecord });
    if (fallo) { setError(fallo); return; }
    setGuardando(true);
    try {
      await onGuardar(toPaymentRow(draft));
      onCerrar();
    } catch (err) {
      // El error de la base se muestra tal cual y el dialogo NO se cierra:
      // si una policy rechaza el insert, cerrar en silencio dejaria creer
      // que el cobro quedo registrado.
      setError(err?.message || 'No se pudo registrar el cobro.');
      setGuardando(false);
    }
  };

  return (
    <div
      role="presentation"
      onClick={() => !guardando && onCerrar()}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Registrar cobro"
        onClick={(e) => e.stopPropagation()}
        onSubmit={enviar}
        style={{
          width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--admin-surface)', border: '1px solid var(--admin-border)',
          borderRadius: 16, padding: 20, boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
        }}
      >
        <h2 className="font-display" style={{
          margin: '0 0 4px', fontSize: 20, fontWeight: 500,
          color: 'var(--admin-text)', letterSpacing: '-0.01em',
        }}>
          Registrar cobro
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--admin-muted)' }}>
          {descripcion}
        </p>

        <Saldo estado={estado} />

        {estado.estado === 'sin-importe' ? (
          // Sin importe no se cobra a ciegas. Es justo el caso de la cita
          // que salio en $0.00: registrar un cobro inventado ahi taparia
          // el problema en vez de mostrarlo.
          <Aviso tono="error">
            {kind === 'cita'
              ? 'Esta cita no tiene precio congelado, así que no hay importe que cobrar. Revisa el precio del servicio en el catálogo antes de cobrarla.'
              : 'Este pedido no tiene importe. Revísalo antes de cobrarlo.'}
          </Aviso>
        ) : estado.saldo <= 0 ? (
          <Aviso tono="ok">Ya está cobrado por completo. No hay saldo pendiente.</Aviso>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 12 }}>
              <Campo etiqueta="IMPORTE" ayuda={`Saldo pendiente: ${formatMoney(estado.saldo)}`}>
                <input
                  ref={primeroRef}
                  className="admin-input" type="number" required
                  min="0.01" step="0.01" max={String(estado.saldo)}
                  value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  style={input}
                />
              </Campo>

              <Campo etiqueta="MÉTODO DE PAGO *" ayuda="Obligatorio. Es dato fiscal.">
                <select
                  className="admin-input" required
                  value={draft.method}
                  onChange={(e) => setDraft({ ...draft, method: e.target.value })}
                  style={input}
                >
                  <option value="">Elige uno…</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </Campo>

              <Campo etiqueta="FECHA DEL COBRO">
                <input
                  className="admin-input" type="date" required
                  value={draft.paidAt}
                  onChange={(e) => setDraft({ ...draft, paidAt: e.target.value })}
                  style={input}
                />
              </Campo>

              <Campo etiqueta="REFERENCIA" ayuda="Folio, autorización o últimos dígitos.">
                <input
                  className="admin-input"
                  value={draft.reference}
                  onChange={(e) => setDraft({ ...draft, reference: e.target.value })}
                  style={input}
                />
              </Campo>
            </div>
          </>
        )}

        {error && <Aviso tono="error">{error}</Aviso>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          <button type="button" onClick={onCerrar} disabled={guardando} style={boton()}>
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || estado.saldo <= 0}
            style={{
              ...boton('primario'),
              opacity: guardando || estado.saldo <= 0 ? 0.45 : 1,
              cursor: guardando || estado.saldo <= 0 ? 'not-allowed' : 'pointer',
            }}
          >
            {guardando ? 'Registrando…' : 'Registrar cobro'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Saldo({ estado }) {
  const filas = [
    ['Importe', estado.total],
    ['Ya cobrado', estado.pagado],
    ['Pendiente', estado.saldo],
  ];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
      padding: 12, marginBottom: 14, borderRadius: 12,
      background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)',
    }}>
      {filas.map(([label, valor], i) => (
        <div key={label}>
          <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: 'var(--admin-row-text)' }}>
            {label.toUpperCase()}
          </div>
          <div style={{
            fontSize: 15, fontVariantNumeric: 'tabular-nums', marginTop: 2,
            color: i === 2 && valor > 0 ? C.rustText : 'var(--admin-text)',
          }}>
            {formatMoney(valor)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Campo({ etiqueta, ayuda, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 9.5, fontWeight: 800, letterSpacing: 1, color: 'var(--admin-row-text)', marginBottom: 4 }}>
        {etiqueta}
      </span>
      {children}
      {ayuda && (
        <span style={{ display: 'block', fontSize: 11, color: 'var(--admin-muted)', marginTop: 4 }}>
          {ayuda}
        </span>
      )}
    </label>
  );
}

function Aviso({ tono, children }) {
  const error = tono === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      style={{
        marginTop: 14, padding: '10px 12px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.5,
        background: error ? C.rustAlpha30 : 'var(--admin-surface-soft)',
        border: `1px solid ${error ? C.rust : 'var(--admin-border)'}`,
        color: error ? C.rustText : 'var(--admin-muted)',
      }}
    >
      {children}
    </div>
  );
}

const input = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)',
  borderRadius: 9, padding: '9px 10px',
  color: 'var(--admin-text)', fontFamily: 'inherit', fontSize: 13,
};

function boton(tipo) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    borderRadius: 9, padding: '9px 14px', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
    border: '1px solid var(--admin-border)',
  };
  if (tipo === 'primario') {
    return { ...base, background: C.sageDark, borderColor: C.sageDark, color: 'var(--admin-on-accent)' };
  }
  return { ...base, background: 'transparent', color: 'var(--admin-text)' };
}
