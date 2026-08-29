import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { C } from '../theme';
import { saveTherapistAgendaPrefs, saveTherapistSchedules } from '../api/supabaseData';
import { useConfirm } from '../components/ConfirmDialog';
import { fromMinutes, timeSlotStates, toMinutes } from '../agenda.mjs';

// weekday 0 = domingo, igual que getDay() y que la columna en la base.
const DIAS = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
  { id: 0, label: 'Domingo' },
];

export default function AdminSchedules({ catalogs, reload, lockedTherapistId = null }) {
  const therapists = useMemo(
    () => (catalogs?.therapists || []).filter((t) => !lockedTherapistId || t.id === lockedTherapistId),
    [catalogs?.therapists, lockedTherapistId],
  );
  const [therapistId, setTherapistId] = useState(lockedTherapistId || '');
  const [blocks, setBlocks] = useState([]);
  const [prefs, setPrefs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const { confirmar, dialogo } = useConfirm();

  useEffect(() => {
    if (!therapistId && therapists[0]) setTherapistId(therapists[0].id);
  }, [therapists, therapistId]);

  const therapist = therapists.find((t) => t.id === therapistId);

  // El borrador se recarga al CAMBIAR de doctor, no cada vez que los
  // catalogos se refrescan: si dependiera del arreglo, cualquier recarga
  // en segundo plano borraria lo que el usuario esta escribiendo.
  const cargadoPara = useRef(null);
  useEffect(() => {
    if (!therapist) return;
    if (cargadoPara.current === therapist.id) return;
    cargadoPara.current = therapist.id;
    setBlocks((catalogs?.schedules || [])
      .filter((b) => b.therapistId === therapist.id)
      .map((b) => ({ ...b })));
    setPrefs({
      bufferBefore: therapist.bufferBefore ?? 0,
      bufferAfter: therapist.bufferAfter ?? 30,
      slotInterval: therapist.slotInterval ?? 0,
      minimumNotice: therapist.minimumNotice ?? 1440,
      bookingWindowDays: therapist.bookingWindowDays ?? 90,
      maxBookingsPerDay: therapist.maxBookingsPerDay ?? 12,
    });
    setError('');
    setNotice('');
  }, [catalogs?.schedules, therapist]);

  // Varios bloques el mismo dia son a proposito: asi se expresa una agenda
  // partida y la hora de comida queda fuera. Pero uno nuevo debe empezar
  // DESPUES del ultimo, no encima: apilar cinco bloques identicos no es
  // una agenda, es un error de dedo que la validacion despues rechaza.
  const addBlock = (weekday) => setBlocks((b) => {
    const delDia = b
      .filter((x) => x.weekday === weekday)
      .sort((x, y) => toMinutes(x.startTime) - toMinutes(y.startTime));
    const ultimo = delDia[delDia.length - 1];
    // Una hora de separacion tras el bloque anterior: es el hueco de
    // comida, que es para lo que sirve partir el dia.
    const inicio = ultimo ? toMinutes(ultimo.endTime) + 60 : 9 * 60;
    const fin = Math.min(inicio + 240, 23 * 60 + 59);
    if (inicio >= fin) return b;
    return [
      ...b,
      {
        id: `nuevo-${weekday}-${b.length}-${Math.round(performance.now())}`,
        therapistId, weekday,
        startTime: fromMinutes(inicio),
        endTime: fromMinutes(fin),
        active: true,
      },
    ];
  });

  // Cuando el dia ya llega al final, agregar otro bloque no cabe.
  const cabeOtroBloque = (weekday) => {
    const delDia = blocks
      .filter((x) => x.weekday === weekday)
      .sort((x, y) => toMinutes(x.startTime) - toMinutes(y.startTime));
    const ultimo = delDia[delDia.length - 1];
    return !ultimo || toMinutes(ultimo.endTime) + 60 < 23 * 60 + 59;
  };

  const updateBlock = (id, campo, valor) =>
    setBlocks((b) => b.map((x) => (x.id === id ? { ...x, [campo]: valor } : x)));

  const removeBlock = (id) => setBlocks((b) => b.filter((x) => x.id !== id));

  // Se valida aqui lo mismo que la base: un bloque invertido o encimado no
  // tiene sentido, y decirlo antes de guardar es mas util que un error de
  // constraint.
  const problemas = useMemo(() => {
    const fallas = [];
    for (const dia of DIAS) {
      const delDia = blocks
        .filter((b) => b.weekday === dia.id)
        .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
      for (const b of delDia) {
        if (toMinutes(b.endTime) <= toMinutes(b.startTime)) {
          fallas.push(`${dia.label}: el bloque ${b.startTime}–${b.endTime} termina antes de empezar.`);
        }
      }
      for (let i = 1; i < delDia.length; i += 1) {
        if (toMinutes(delDia[i].startTime) < toMinutes(delDia[i - 1].endTime)) {
          fallas.push(`${dia.label}: los bloques ${delDia[i - 1].startTime}–${delDia[i - 1].endTime} y ${delDia[i].startTime}–${delDia[i].endTime} se encinan.`);
        }
      }
    }
    return fallas;
  }, [blocks]);

  const guardar = async () => {
    if (problemas.length) return;
    // Guardar sin bloques BORRA el horario. Es una opcion legitima —cerrar
    // toda la semana— pero tambien lo que pasa si la lista no alcanzo a
    // cargar, y en ese caso el borrado seria accidental y silencioso.
    if (!blocks.length && !(await confirmar({
      titulo: 'Sin días de atención',
      mensaje: 'No hay ningún bloque: el doctor quedaría sin días de atención y nadie podría agendar con él.',
      aceptar: 'Guardar así',
      destructivo: true,
    }))) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await saveTherapistSchedules(therapistId, blocks);
      await saveTherapistAgendaPrefs(therapistId, prefs);
      setNotice('Horario y preferencias guardados.');
      cargadoPara.current = null;
      await reload?.();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el horario.');
    } finally {
      setBusy(false);
    }
  };

  if (!therapists.length) {
    return (
      <div>
        {dialogo}
        <Encabezado />
        <div className="admin-card" style={{ borderRadius: 16, padding: 30, textAlign: 'center' }}>
          <p style={{ color: 'var(--admin-muted)', margin: 0, fontSize: 13 }}>
            No hay doctores dados de alta. Créalos primero en Doctores.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {dialogo}
      <Encabezado />

      {error && <Aviso tono="error">{error}</Aviso>}
      {notice && <Aviso tono="ok">{notice}</Aviso>}

      {!lockedTherapistId && (
        <div style={{ marginBottom: 14 }}>
          <span style={etiqueta}>DOCTOR</span>
          <select value={therapistId} onChange={(e) => setTherapistId(e.target.value)} style={{ ...campo, width: '100%', marginTop: 6 }}>
            {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      )}

      {/* auto-fit apila en una sola columna cuando no caben dos, sin
          media queries: la version movil es el caso base y la de
          escritorio es la que se gana cuando hay espacio. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        gap: 14,
        alignItems: 'start',
      }}>
        <div className="admin-card" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Clock size={16} color={C.sageDeep} />
            <strong style={{ fontSize: 13, color: 'var(--admin-text)' }}>Días y horas de trabajo</strong>
          </div>

          {DIAS.map((dia) => {
            const delDia = blocks.filter((b) => b.weekday === dia.id);
            return (
              <div key={dia.id} style={{ padding: '10px 0', borderTop: '1px solid var(--admin-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: delDia.length ? 8 : 0 }}>
                  <span style={{ fontSize: 13, color: delDia.length ? 'var(--admin-text)' : 'var(--admin-muted)', fontWeight: delDia.length ? 700 : 400 }}>
                    {dia.label}{!delDia.length && ' · cerrado'}
                  </span>
                  <button
                    type="button"
                    onClick={() => addBlock(dia.id)}
                    disabled={!cabeOtroBloque(dia.id)}
                    title={cabeOtroBloque(dia.id) ? 'Agregar un bloque, por ejemplo para partir el día' : 'Ya no cabe otro bloque este día'}
                    style={{ ...botonChico, opacity: cabeOtroBloque(dia.id) ? 1 : 0.4 }}
                  >
                    <Plus size={12} /> Bloque
                  </button>
                </div>

                {delDia.map((b) => (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                    <input type="time" value={b.startTime} onChange={(e) => updateBlock(b.id, 'startTime', e.target.value)} style={{ ...campo, flex: '1 1 110px', minWidth: 0 }} />
                    <span style={{ color: 'var(--admin-muted)', fontSize: 12 }}>a</span>
                    <input type="time" value={b.endTime} onChange={(e) => updateBlock(b.id, 'endTime', e.target.value)} style={{ ...campo, flex: '1 1 110px', minWidth: 0 }} />
                    <button type="button" onClick={() => removeBlock(b.id)} style={{ ...botonChico, color: C.rust }} title="Quitar bloque">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })}

          {/* Dos bloques el mismo dia dejan la comida fuera sin campo aparte. */}
          <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '12px 0 0' }}>
            Para dejar la hora de comida fuera, pon dos bloques ese día: por ejemplo 09:00–14:00 y 15:00–19:00.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div className="admin-card" style={{ borderRadius: 16, padding: 16 }}>
            <strong style={{ fontSize: 13, color: 'var(--admin-text)', display: 'block', marginBottom: 12 }}>Ritmo de las citas</strong>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
              gap: '0 12px',
              alignItems: 'start',
            }}>
            <Campo etiquetaTexto="DESCANSO DESPUÉS DE CADA CITA (MIN)"
              valor={prefs?.bufferAfter} onChange={(v) => setPrefs({ ...prefs, bufferAfter: v })}
              ayuda="Tiempo bloqueado tras la sesión, para notas y retrasos." />

            <Campo etiquetaTexto="PREPARACIÓN ANTES (MIN)"
              valor={prefs?.bufferBefore} onChange={(v) => setPrefs({ ...prefs, bufferBefore: v })} />

            <div style={{ marginTop: 10, gridColumn: '1 / -1' }}>
              <span style={etiqueta}>CÓMO SE OFRECEN LOS HORARIOS</span>
              <select
                value={prefs?.slotInterval === 0 ? 'auto' : 'fijo'}
                onChange={(e) => setPrefs({ ...prefs, slotInterval: e.target.value === 'auto' ? 0 : 15 })}
                style={{ ...campo, width: '100%', marginTop: 6 }}
              >
                <option value="auto">Encadenados (uno tras otro)</option>
                <option value="fijo">Rejilla fija</option>
              </select>
              {prefs?.slotInterval > 0 && (
                <Campo etiquetaTexto="CADA CUÁNTOS MINUTOS"
                  valor={prefs.slotInterval} onChange={(v) => setPrefs({ ...prefs, slotInterval: v })} />
              )}
            </div>

            <Campo etiquetaTexto="ANTICIPACIÓN MÍNIMA (MIN)"
              valor={prefs?.minimumNotice} onChange={(v) => setPrefs({ ...prefs, minimumNotice: v })}
              ayuda="1440 = un día. Aplica a la reserva en línea." />

            <Campo etiquetaTexto="SE PUEDE RESERVAR HASTA (DÍAS)"
              valor={prefs?.bookingWindowDays} onChange={(v) => setPrefs({ ...prefs, bookingWindowDays: v })} />

            <Campo etiquetaTexto="MÁXIMO DE CITAS POR DÍA"
              valor={prefs?.maxBookingsPerDay} onChange={(v) => setPrefs({ ...prefs, maxBookingsPerDay: v })} />
            </div>
          </div>

          <VistaPrevia therapist={therapist && prefs ? { ...therapist, ...prefs } : null} blocks={blocks} catalogs={catalogs} />
        </div>
      </div>

      {problemas.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <Aviso tono="error">
            {problemas.map((p) => <div key={p}>{p}</div>)}
          </Aviso>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          onClick={() => { cargadoPara.current = null; reload?.(); }}
          disabled={busy}
          style={botonChico}
        >
          <RefreshCw size={12} /> Descartar
        </button>
        <button type="button" onClick={guardar} disabled={busy || problemas.length > 0} style={{
          ...botonChico,
          background: C.sageDeep,
          color: C.ivory,
          border: `1px solid ${C.sageDeep}`,
          opacity: busy || problemas.length ? 0.45 : 1,
          padding: '9px 14px',
        }}>
          <Save size={13} /> Guardar horario
        </button>
      </div>
    </div>
  );
}

// Muestra los horarios que quedarian con la configuracion actual, antes de
// guardar. Es la forma mas directa de ver el efecto del descanso: el
// numero suelto no dice nada, la lista si.
function VistaPrevia({ therapist, blocks, catalogs }) {
  const service = (catalogs?.services || [])[0];

  const { dia, horarios } = useMemo(() => {
    if (!therapist || !blocks.length) return { dia: null, horarios: [] };
    const primero = [...blocks].sort((a, b) => a.weekday - b.weekday)[0];
    // Se busca una fecha real con ese dia de la semana, para no inventar
    // una que el motor tenga que interpretar.
    const base = new Date();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      if (d.getDay() !== primero.weekday) continue;
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return {
        dia: primero,
        // now en el pasado: la vista previa muestra la forma del dia, no
        // que quede libre a esta hora.
        horarios: timeSlotStates({
          schedules: blocks, therapist, service, date: iso,
          bookings: [], services: catalogs?.services || [], now: new Date(0),
        }).map((s) => s.time),
      };
    }
    return { dia: primero, horarios: [] };
  }, [blocks, catalogs?.services, service, therapist]);

  if (!dia) return null;

  return (
    <div className="admin-card" style={{ borderRadius: 16, padding: 16 }}>
      <strong style={{ fontSize: 13, color: 'var(--admin-text)', display: 'block', marginBottom: 4 }}>
        Así quedarían los horarios
      </strong>
      <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '0 0 10px' }}>
        {DIAS.find((d) => d.id === dia.weekday)?.label}
        {service ? ` · ${service.name} (${service.duration} min)` : ''}
        {therapist?.bufferAfter ? ` · ${therapist.bufferAfter} min de descanso` : ''}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {horarios.length
          ? horarios.map((h) => (
              <span key={h} style={{
                padding: '4px 8px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)',
                color: 'var(--admin-text)',
              }}>{h}</span>
            ))
          : <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>Ningún horario cabe con esta configuración.</span>}
      </div>
    </div>
  );
}

function Encabezado() {
  return (
    <>
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        Horarios
      </h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 20 }}>
        Cuándo trabaja cada doctor y cuánto descanso deja entre citas
      </p>
    </>
  );
}

function Campo({ etiquetaTexto, valor, onChange, ayuda }) {
  return (
    <div style={{ marginTop: 10 }}>
      <span style={etiqueta}>{etiquetaTexto}</span>
      <input
        type="number"
        value={valor ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ...campo, width: '100%', marginTop: 6 }}
      />
      {/* Alto minimo para que un campo con ayuda no empuje al de al lado
          y las filas queden alineadas. */}
      <p style={{ fontSize: 11, color: 'var(--admin-muted)', margin: '4px 0 0', minHeight: 15 }}>{ayuda || ''}</p>
    </div>
  );
}

function Aviso({ tono, children }) {
  const esError = tono === 'error';
  return (
    <div style={{
      margin: '0 0 14px', padding: '10px 12px', borderRadius: 10, fontSize: 13,
      border: '1px solid ' + (esError ? C.rustAlpha40 : 'var(--admin-border)'),
      background: esError ? C.rustAlpha20 : 'var(--admin-surface-soft)',
      color: esError ? C.rust : 'var(--admin-text)',
    }}>{children}</div>
  );
}

const etiqueta = { color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 };
const campo = {
  background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)',
  borderRadius: 9, padding: '8px 10px', color: 'var(--admin-text)',
  fontFamily: 'inherit', fontSize: 13,
  // Sin box-sizing, un width 100% mas el padding desborda el contenedor:
  // es lo que descuadraba el formulario.
  boxSizing: 'border-box', maxWidth: '100%',
};
const botonChico = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  background: 'transparent', border: '1px solid var(--admin-border)',
  color: 'var(--admin-accent-text)', borderRadius: 8, padding: '6px 9px',
  cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
};
