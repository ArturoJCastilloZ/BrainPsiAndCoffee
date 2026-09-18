import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, Plus, RefreshCw, Wallet } from 'lucide-react';
import { C } from '../theme';
import { uid } from '../utils.jsx';
import { useConfirm } from '../components/ConfirmDialog';
import { accountingAreas } from '../auth/permissions';
import {
  loadAccounting, savePayment, saveExpense, deleteExpense,
} from '../api/supabaseData';
import {
  periodRange, previousRange, billedClinic, billedCafe, collected,
  receivableClinic, receivableCafe, expensesOf, profit, variation,
  byService, byTherapist, byProduct, byMethod, nonDeductibleCash,
  monthlySeries, MIN_PUNTOS_GRAFICA, formatMoney, CAFETERIA, CONSULTORIO,
} from '../accounting.mjs';

const PERIODOS = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'mes-pasado', label: 'Mes pasado' },
  { id: 'anio', label: 'Año' },
];

const ETIQUETA_AREA = { todo: 'Todo', consultorio: 'Consultorio', cafeteria: 'Cafetería' };
const METODOS = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro'];

export default function AdminAccounting({ bookings = [], orders = [], catalogs = {}, session }) {
  const role = session?.user?.role;
  const areas = accountingAreas(role);
  const [area, setArea] = useState(areas[0] || 'todo');
  const [periodo, setPeriodo] = useState('mes');
  const [datos, setDatos] = useState({ payments: [], expenses: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const recargar = async () => {
    setCargando(true);
    try {
      setDatos(await loadAccounting());
      setError('');
    } catch (err) {
      setError(err.message || 'No se pudo cargar la contabilidad.');
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { recargar(); }, []);

  const rango = useMemo(() => periodRange(periodo), [periodo]);
  const previo = useMemo(() => previousRange(rango), [rango]);

  const cifras = useMemo(() => {
    const { payments, expenses } = datos;
    const soloClinica = area === CONSULTORIO;
    const soloCafe = area === CAFETERIA;

    const facturar = (r) => (
      (soloCafe ? 0 : billedClinic(bookings, r)) + (soloClinica ? 0 : billedCafe(orders, r))
    );
    const porCobrar = (r) => (
      (soloCafe ? 0 : receivableClinic(bookings, payments, r))
      + (soloClinica ? 0 : receivableCafe(orders, payments, r))
    );
    const areaPago = area === 'todo' ? null : area;
    // El gasto 'compartido' solo entra en la vista 'todo'. Asignarlo a un
    // area seria repartir la renta por nuestra cuenta.
    const gastos = (r) => expensesOf(expenses, r, area === 'todo' ? null : area);

    const cobradoAhora = collected(payments, rango, areaPago);
    const gastosAhora = gastos(rango);

    return {
      facturado: facturar(rango),
      facturadoPrev: facturar(previo),
      cobrado: cobradoAhora,
      cobradoPrev: collected(payments, previo, areaPago),
      porCobrar: porCobrar(rango),
      porCobrarPrev: porCobrar(previo),
      gastos: gastosAhora,
      gastosPrev: gastos(previo),
      utilidad: profit(cobradoAhora, gastosAhora),
      utilidadPrev: profit(collected(payments, previo, areaPago), gastos(previo)),
      efectivoNoDeducible: soloCafe ? 0 : nonDeductibleCash(payments, rango),
      metodos: byMethod(payments, rango, areaPago),
      servicios: soloCafe ? [] : byService(bookings, catalogs.services || [], rango),
      terapeutas: soloCafe ? [] : byTherapist(bookings, catalogs.therapists || [], rango),
      productos: soloClinica ? [] : byProduct(orders, rango),
      gastosLista: (expenses || []).filter((e) => {
        const d = String(e.spentAt).slice(0, 10);
        return d >= rango.from && d <= rango.to;
      }),
      serie: monthlySeries(bookings, orders, payments, 6),
    };
  }, [datos, bookings, orders, catalogs, rango, previo, area]);

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        Contabilidad
      </h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 20 }}>
        Lo facturado, lo cobrado y lo gastado. Son tres cosas distintas.
      </p>

      {error && <Aviso tono="error">{error}</Aviso>}
      {aviso && <Aviso tono="ok">{aviso}</Aviso>}

      <Controles
        areas={areas} area={area} setArea={setArea}
        periodo={periodo} setPeriodo={setPeriodo}
        rango={rango} cargando={cargando} onRecargar={recargar}
      />

      <Tarjetas c={cifras} />

      {cifras.efectivoNoDeducible > 0 && (
        <AvisoFiscal monto={cifras.efectivoNoDeducible} />
      )}

      <Tendencia serie={cifras.serie} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14, marginTop: 14 }}>
        {cifras.servicios.length > 0 && (
          <Desglose titulo="Por servicio" filas={cifras.servicios} vacio="Sin citas en el periodo." />
        )}
        {cifras.productos.length > 0 && (
          <Desglose titulo="Por producto" filas={cifras.productos} vacio="Sin pedidos en el periodo." />
        )}
        {cifras.terapeutas.length > 0 && (
          <Desglose titulo="Por terapeuta" filas={cifras.terapeutas} vacio="Sin citas en el periodo." />
        )}
        <Desglose
          titulo="Cómo se cobró"
          filas={cifras.metodos}
          vacio="Sin cobros registrados en el periodo."
        />
      </div>

      <Gastos
        filas={cifras.gastosLista}
        areas={areas}
        onGuardar={async (gasto) => {
          try {
            await saveExpense({ ...gasto, id: gasto.id || uid() });
            setAviso('Gasto registrado.');
            await recargar();
          } catch (err) { setError(err.message); }
        }}
        onBorrar={async (id) => {
          try { await deleteExpense(id); await recargar(); }
          catch (err) { setError(err.message); }
        }}
      />
    </div>
  );
}

// --- Controles --------------------------------------------------------

function Controles({ areas, area, setArea, periodo, setPeriodo, rango, cargando, onRecargar }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
      {/* El selector de area solo aparece si hay mas de una que elegir.
          Un administrador queda fijado a la suya: ofrecerle un boton que
          la base le va a negar seria mentirle. */}
      {areas.length > 1 && (
        <div role="group" aria-label="Área" style={{ display: 'flex', gap: 6 }}>
          {areas.map((a) => (
            <button key={a} onClick={() => setArea(a)} aria-pressed={area === a} style={pill(area === a)}>
              {ETIQUETA_AREA[a]}
            </button>
          ))}
        </div>
      )}

      <div role="group" aria-label="Periodo" style={{ display: 'flex', gap: 6 }}>
        {PERIODOS.map((p) => (
          <button key={p.id} onClick={() => setPeriodo(p.id)} aria-pressed={periodo === p.id} style={pill(periodo === p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
        {rango.from} al {rango.to}
      </span>

      <button onClick={onRecargar} disabled={cargando} style={{ ...pill(false), marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <RefreshCw size={13} aria-hidden="true" /> {cargando ? 'Cargando…' : 'Actualizar'}
      </button>
    </div>
  );
}

// --- Tarjetas ---------------------------------------------------------

function Tarjetas({ c }) {
  const tarjetas = [
    { label: 'Facturado', valor: c.facturado, prev: c.facturadoPrev,
      ayuda: 'Lo que se debió cobrar en el periodo.' },
    { label: 'Cobrado', valor: c.cobrado, prev: c.cobradoPrev,
      ayuda: 'Lo que de verdad entró.' },
    { label: 'Por cobrar', valor: c.porCobrar, prev: c.porCobrarPrev, invertir: true,
      ayuda: 'De lo facturado en el periodo, lo que sigue sin pagarse.' },
    { label: 'Utilidad', valor: c.utilidad, prev: c.utilidadPrev,
      ayuda: 'Cobrado menos gastos. Sobre lo cobrado, no sobre lo facturado.' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12 }}>
      {tarjetas.map((t) => <Tarjeta key={t.label} {...t} />)}
    </div>
  );
}

function Tarjeta({ label, valor, prev, ayuda, invertir = false }) {
  const v = variation(valor, prev);
  // Sin base con que comparar NO se pinta porcentaje. El Dashboard viejo
  // mostraba '+12%' escrito a mano; un numero inventado en contabilidad
  // no es un descuido, es un dato falso.
  const mejora = invertir ? v.direction === 'down' : v.direction === 'up';
  const Flecha = v.direction === 'up' ? ArrowUpRight : v.direction === 'down' ? ArrowDownRight : Minus;
  const negativo = valor < 0;

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'var(--admin-row-text)', marginBottom: 6 }}>
        {label.toUpperCase()}
      </div>
      <div className="font-display" style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.1, color: negativo ? C.rustText : 'var(--admin-text)' }}>
        {formatMoney(valor)}
      </div>
      {v.comparable ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, fontWeight: 700, color: mejora ? C.sageDark : C.rustText }}>
          <Flecha size={13} aria-hidden="true" />
          {/* El signo va en el texto, no solo en el color ni en la flecha:
              nadie deberia tener que distinguir verde de rojo para leer
              un estado de resultados. */}
          <span>{v.pct > 0 ? '+' : ''}{v.pct}% vs. periodo anterior</span>
        </div>
      ) : (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--admin-muted)' }}>
          Sin periodo anterior con qué comparar
        </div>
      )}
      <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--admin-muted)', lineHeight: 1.45 }}>{ayuda}</p>
    </div>
  );
}

// --- Aviso fiscal -----------------------------------------------------

function AvisoFiscal({ monto }) {
  return (
    <div role="note" style={{
      marginTop: 14, padding: '12px 14px', borderRadius: 12,
      background: C.rustAlpha20, border: `1px solid ${C.rustAlpha40}`,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <AlertTriangle size={16} color={C.rustText} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'var(--admin-text)' }}>
        <strong>{formatMoney(monto)} cobrados en efectivo por consultas.</strong>{' '}
        El Art. 151 de la LISR solo permite deducir honorarios médicos pagados por transferencia,
        tarjeta o cheque nominativo. Tus pacientes <strong>no podrán deducir</strong> ese monto
        aunque les expidas CFDI.
      </p>
    </div>
  );
}

// --- Tendencia --------------------------------------------------------

function Tendencia({ serie }) {
  if (!serie || serie.length < MIN_PUNTOS_GRAFICA) {
    return null;
  }
  const max = Math.max(...serie.flatMap((p) => [p.facturado, p.cobrado]), 1);
  const w = 100, h = 32;
  const punto = (i, v) => `${(i / (serie.length - 1)) * w},${h - (v / max) * h}`;
  const linea = (llave) => serie.map((p, i) => punto(i, p[llave])).join(' ');

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 16, marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'var(--admin-row-text)' }}>
          ÚLTIMOS {serie.length} MESES
        </div>
        {/* Las dos series se distinguen por ESTILO de linea, no solo por
            color: continua lo facturado, punteada lo cobrado. */}
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--admin-muted)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="20" height="4" aria-hidden="true"><line x1="0" y1="2" x2="20" y2="2" stroke={C.brownMid} strokeWidth="2" /></svg>
            Facturado
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <svg width="20" height="4" aria-hidden="true"><line x1="0" y1="2" x2="20" y2="2" stroke={C.sageDark} strokeWidth="2" strokeDasharray="3 2" /></svg>
            Cobrado
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img"
           aria-label={`Facturado y cobrado de los últimos ${serie.length} meses`}
           style={{ width: '100%', height: 110, overflow: 'visible' }}>
        <polyline points={linea('facturado')} fill="none" stroke={C.brownMid} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        <polyline points={linea('cobrado')} fill="none" stroke={C.sageDark} strokeWidth="1.2" strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* La tabla no es un extra de accesibilidad: es el dato. Quien lleva
          la contabilidad quiere el numero, no la forma de la curva. */}
      <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            <th scope="col" style={th}>Mes</th>
            <th scope="col" style={{ ...th, textAlign: 'right' }}>Facturado</th>
            <th scope="col" style={{ ...th, textAlign: 'right' }}>Cobrado</th>
          </tr>
        </thead>
        <tbody>
          {serie.map((p) => (
            <tr key={p.from}>
              <td style={td}>{p.label}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.facturado)}</td>
              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(p.cobrado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- Desglose ---------------------------------------------------------

function Desglose({ titulo, filas, vacio }) {
  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'var(--admin-row-text)', marginBottom: 10 }}>
        {titulo.toUpperCase()}
      </div>
      {filas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--admin-muted)' }}>{vacio}</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th scope="col" style={th}>Concepto</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Núm.</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Promedio</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.key}>
                <td style={td}>{f.label}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.count}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(f.average)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(f.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// --- Gastos -----------------------------------------------------------

function Gastos({ filas, areas, onGuardar, onBorrar }) {
  const { confirmar, dialogo } = useConfirm();
  const areasGasto = areas.includes('todo') ? ['consultorio', 'cafeteria', 'compartido'] : areas;
  const [draft, setDraft] = useState(null);

  const nuevo = () => setDraft({ area: areasGasto[0], category: '', amount: '', spentAt: new Date().toISOString().slice(0, 10), method: '' });

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 16, marginTop: 14 }}>
      {dialogo}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'var(--admin-row-text)' }}>GASTOS DEL PERIODO</div>
        {!draft && (
          <button onClick={nuevo} style={{ ...pill(true), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={13} aria-hidden="true" /> Registrar gasto
          </button>
        )}
      </div>

      {draft && (
        <form
          onSubmit={(e) => { e.preventDefault(); onGuardar(draft); setDraft(null); }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, alignItems: 'end', marginBottom: 14 }}
        >
          <Campo etiqueta="ÁREA">
            <select className="admin-input" value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} style={input}>
              {areasGasto.map((a) => <option key={a} value={a}>{ETIQUETA_AREA[a] || 'Compartido'}</option>)}
            </select>
          </Campo>
          <Campo etiqueta="CONCEPTO">
            <input className="admin-input" required value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} style={input} />
          </Campo>
          <Campo etiqueta="MONTO">
            <input className="admin-input" required type="number" min="0.01" step="0.01" value={draft.amount}
                   onChange={(e) => setDraft({ ...draft, amount: e.target.value })} style={input} />
          </Campo>
          <Campo etiqueta="FECHA">
            <input className="admin-input" required type="date" value={draft.spentAt}
                   onChange={(e) => setDraft({ ...draft, spentAt: e.target.value })} style={input} />
          </Campo>
          <Campo etiqueta="CÓMO SE PAGÓ">
            <select className="admin-input" value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value })} style={input}>
              <option value="">Sin especificar</option>
              {METODOS.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </Campo>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={pill(true)}>Guardar</button>
            <button type="button" onClick={() => setDraft(null)} style={pill(false)}>Cancelar</button>
          </div>
        </form>
      )}

      {filas.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--admin-muted)' }}>
          Sin gastos registrados en el periodo. La utilidad que ves arriba es cobrado menos cero.
        </p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              <th scope="col" style={th}>Fecha</th>
              <th scope="col" style={th}>Área</th>
              <th scope="col" style={th}>Concepto</th>
              <th scope="col" style={{ ...th, textAlign: 'right' }}>Monto</th>
              <th scope="col" style={{ ...th, width: 44 }}><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((g) => (
              <tr key={g.id}>
                <td style={td}>{String(g.spentAt).slice(0, 10)}</td>
                <td style={td}>{ETIQUETA_AREA[g.area] || 'Compartido'}</td>
                <td style={td}>{g.category}</td>
                <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(g.amount)}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: 'Eliminar gasto',
                        mensaje: `Se va a eliminar "${g.category}" por ${formatMoney(g.amount)}. Esta acción no se puede deshacer.`,
                      });
                      if (ok) onBorrar(g.id);
                    }}
                    aria-label={`Eliminar el gasto ${g.category} de ${formatMoney(g.amount)}`}
                    style={{ ...pill(false), minHeight: 32, padding: '4px 8px' }}
                  >
                    <Minus size={13} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// --- Piezas -----------------------------------------------------------

function Campo({ etiqueta, children }) {
  return (
    <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>{etiqueta}</span>
      {children}
    </label>
  );
}

function Aviso({ tono, children }) {
  const error = tono === 'error';
  return (
    <div role={error ? 'alert' : 'status'} style={{
      marginBottom: 14, padding: '10px 12px', borderRadius: 11, fontSize: 12.5, lineHeight: 1.5,
      background: error ? C.rustAlpha20 : 'var(--admin-surface-soft)',
      border: `1px solid ${error ? C.rustAlpha40 : 'var(--admin-border)'}`,
      color: 'var(--admin-text)',
    }}>{children}</div>
  );
}

const pill = (activo) => ({
  border: `1px solid ${activo ? C.sageDark : 'var(--admin-border)'}`,
  background: activo ? '#E8D9C5' : 'var(--admin-surface)',
  color: activo ? '#2E2A27' : 'var(--admin-row-text)',
  padding: '8px 13px', borderRadius: 999, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 12, fontWeight: 700, minHeight: 36,
});

const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit' };
const th = { textAlign: 'left', padding: '6px 8px', fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'var(--admin-row-text)', borderBottom: '1px solid var(--admin-border)' };
const td = { padding: '8px', color: 'var(--admin-text)', borderBottom: '1px solid var(--admin-border)' };
