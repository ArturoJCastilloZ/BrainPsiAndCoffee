import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Copy, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
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

export default function AdminSchedules({ catalogs, reload, lockedTherapistId = null, embedded = false }) {
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

  // Copiar un dia a otros. Casi todas las agendas repiten el mismo horario
  // de martes a viernes, y capturarlo cuatro veces a mano es donde se
  // cuelan los errores de dedo que despues rechaza la validacion.
  //
  // REEMPLAZA los bloques del destino, no los suma: "copiar a" significa
  // "que quede igual que este dia". Sumar dejaria dias con horarios
  // encimados que el propio validador rechaza al guardar.
  const copiarDia = (origen, destinos) => setBlocks((b) => {
    if (!destinos.length) return b;
    const delOrigen = b.filter((x) => x.weekday === origen);
    const conservados = b.filter((x) => !destinos.includes(x.weekday));
    const sello = Math.round(performance.now());
    const copias = destinos.flatMap((dia) => delOrigen.map((x, i) => ({
      ...x,
      id: `copia-${dia}-${i}-${sello}`,
      weekday: dia,
    })));
    return [...conservados, ...copias];
  });

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
          fallas.push(`${dia.label}: los bloques ${delDia[i - 1].startTime}–${delDia[i - 1].endTime} y ${delDia[i].startTime}–${delDia[i].endTime} se enciman.`);
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
        <Encabezado embedded={embedded} />
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
      <Encabezado embedded={embedded} />

      {error && <Aviso tono="error">{error}</Aviso>}
      {notice && <Aviso tono="ok">{notice}</Aviso>}

      {!lockedTherapistId && (
        <div style={{ marginBottom: 14 }}>
          <span style={etiqueta}>Doctor</span>
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
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))',
        gap: 16,
        alignItems: 'start',
      }}>
        <div className="admin-card" style={{ borderRadius: 16, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Clock size={16} color={C.sageDeep} />
            <strong style={{ fontSize: 13, color: 'var(--admin-text)' }}>Días y horas de trabajo</strong>
          </div>

          {DIAS.map((dia) => {
            const delDia = blocks.filter((b) => b.weekday === dia.id);
            const abierto = delDia.length > 0;
            return (
              /* Columna del dia de ANCHO FIJO. Antes el nombre vivia en un
                 flex con space-between y los bloques colgaban debajo, asi
                 que ninguna caja de hora quedaba alineada con la de la fila
                 de arriba. Alinearlas es la mitad de la diferencia entre
                 "hecho a mano" y "producto". */
              <div key={dia.id} style={{
                display: 'grid',
                gridTemplateColumns: '104px minmax(0, 1fr) auto',
                gap: 12, alignItems: 'start',
                padding: '12px 0',
                borderTop: '1px solid var(--admin-border-soft)',
              }}>
                <div style={{
                  fontSize: 13, paddingTop: 9,
                  color: abierto ? 'var(--admin-text)' : 'var(--admin-muted)',
                  fontWeight: abierto ? 600 : 400,
                }}>
                  {dia.label}
                </div>

                <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                  {/* El dia cerrado se DICE, no se deja en blanco: un hueco
                      no distingue "no trabajo" de "se me olvido". */}
                  {!abierto && (
                    <div style={{ fontSize: 12.5, color: 'var(--admin-subtle)', paddingTop: 10 }}>
                      Cerrado
                    </div>
                  )}
                  {delDia.map((b) => (
                    <div key={b.id} style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr) auto',
                      alignItems: 'center', gap: 6,
                    }}>
                      <input
                        type="time" step={900} value={b.startTime}
                        aria-label={`${dia.label}: hora de inicio`}
                        onChange={(e) => updateBlock(b.id, 'startTime', e.target.value)}
                        style={{ ...campo, width: '100%', minWidth: 0 }}
                      />
                      <span style={{ color: 'var(--admin-muted)', fontSize: 12 }}>a</span>
                      <input
                        type="time" step={900} value={b.endTime}
                        aria-label={`${dia.label}: hora de término`}
                        onChange={(e) => updateBlock(b.id, 'endTime', e.target.value)}
                        style={{ ...campo, width: '100%', minWidth: 0 }}
                      />
                      <button
                        type="button" onClick={() => removeBlock(b.id)}
                        aria-label={`Quitar el bloque ${b.startTime}–${b.endTime} de ${dia.label}`}
                        title="Quitar bloque"
                        style={{ ...botonChico, color: 'var(--admin-muted)' }}
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => addBlock(dia.id)}
                    disabled={!cabeOtroBloque(dia.id)}
                    title={cabeOtroBloque(dia.id) ? 'Agregar un bloque, por ejemplo para partir el día' : 'Ya no cabe otro bloque este día'}
                    style={{ ...botonChico, opacity: cabeOtroBloque(dia.id) ? 1 : 0.4 }}
                  >
                    <Plus size={12} aria-hidden="true" /> Bloque
                  </button>
                  <CopiarADias dia={dia} habilitado={abierto} onCopiar={copiarDia} />
                </div>
              </div>
            );
          })}

          {/* Dos bloques el mismo dia dejan la comida fuera sin campo aparte. */}
          <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '12px 0 0' }}>
            Para dejar la hora de comida fuera, pon dos bloques ese día: por ejemplo 09:00–14:00 y 15:00–19:00.
          </p>
        </div>

        {/* Pegajosa: el editor de dias es largo, y el sentido de cambiar
            el descanso o la duracion esta en ver como cambian los horarios
            que salen. Si hay que hacer scroll para comprobarlo, se
            configura a ciegas. */}
        <div style={{ display: 'grid', gap: 14, position: 'sticky', top: 16, alignSelf: 'start' }}>
          <div className="admin-card" style={{ borderRadius: 16, padding: 16 }}>
            <strong style={{ fontSize: 13, color: 'var(--admin-text)', display: 'block', marginBottom: 12 }}>Ritmo de las citas</strong>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
              gap: '0 12px',
              alignItems: 'start',
            }}>
            <Campo etiquetaTexto="Descanso después de cada cita (min)"
              valor={prefs?.bufferAfter} onChange={(v) => setPrefs({ ...prefs, bufferAfter: v })}
              ayuda="Tiempo bloqueado tras la sesión, para notas y retrasos." />

            <Campo etiquetaTexto="Preparación antes (min)"
              valor={prefs?.bufferBefore} onChange={(v) => setPrefs({ ...prefs, bufferBefore: v })} />

            <div style={{ marginTop: 10, gridColumn: '1 / -1' }}>
              <span style={etiqueta}>Cómo se ofrecen los horarios</span>
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

            <Campo etiquetaTexto="Anticipación mínima (min)"
              valor={prefs?.minimumNotice} onChange={(v) => setPrefs({ ...prefs, minimumNotice: v })}
              ayuda="1440 = un día. Aplica a la reserva en línea." />

            <Campo etiquetaTexto="Se puede reservar hasta (días)"
              valor={prefs?.bookingWindowDays} onChange={(v) => setPrefs({ ...prefs, bookingWindowDays: v })} />

            <Campo etiquetaTexto="Máximo de citas por día"
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
// "Copiar a…" — el ahorro de tiempo de esta pantalla.
//
// Casi ninguna agenda cambia de dia en dia: se repite de martes a viernes.
// Sin esto hay que capturar el mismo par de horas cuatro veces, y es donde
// se cuelan los errores que el validador rechaza al guardar.
function CopiarADias({ dia, habilitado, onCopiar }) {
  const [abierto, setAbierto] = useState(false);
  const [elegidos, setElegidos] = useState([]);
  const otros = DIAS.filter((d) => d.id !== dia.id);

  const alternar = (id) => setElegidos((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ));

  const cerrar = () => { setAbierto(false); setElegidos([]); };

  const aplicar = () => { onCopiar(dia.id, elegidos); cerrar(); };

  if (!habilitado) {
    // Un dia cerrado no tiene nada que copiar. El boton se queda en su
    // lugar, apagado, para que la fila no cambie de forma segun el dia.
    return (
      <button type="button" disabled title="Este día no tiene horario que copiar"
        style={{ ...botonChico, opacity: 0.35, cursor: 'not-allowed' }}>
        <Copy size={12} aria-hidden="true" />
      </button>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-label={`Copiar el horario de ${dia.label} a otros días`}
        title={`Copiar el horario de ${dia.label} a otros días`}
        style={botonChico}
      >
        <Copy size={12} aria-hidden="true" />
      </button>

      {abierto && (
        <>
          {/* Clic fuera para cerrar, sin librería. */}
          <div role="presentation" onClick={cerrar} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div role="dialog" aria-label={`Copiar ${dia.label} a`} style={{
            position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 21,
            width: 210, padding: 12, borderRadius: 12,
            background: 'var(--admin-surface)', border: '1px solid var(--admin-border)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          }}>
            <div style={{ fontSize: 12.5, color: 'var(--admin-text)', fontWeight: 600, marginBottom: 2 }}>
              Copiar {dia.label} a
            </div>
            <p style={{ margin: '0 0 10px', fontSize: 11.5, color: 'var(--admin-muted)', lineHeight: 1.45 }}>
              Los días que elijas quedan con este mismo horario. Se reemplaza el que tengan.
            </p>

            <button type="button" onClick={() => setElegidos([1, 2, 3, 4, 5].filter((d) => d !== dia.id))}
              style={{ ...botonChico, width: '100%', justifyContent: 'center', marginBottom: 8 }}>
              Lunes a viernes
            </button>

            <div style={{ display: 'grid', gap: 2, marginBottom: 10 }}>
              {otros.map((d) => (
                <label key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: 12.5, color: 'var(--admin-text)', cursor: 'pointer',
                  padding: '4px 2px',
                }}>
                  <input
                    type="checkbox"
                    aria-label={`Copiar a ${d.label}`}
                    checked={elegidos.includes(d.id)}
                    onChange={() => alternar(d.id)}
                  />
                  {d.label}
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={aplicar} disabled={!elegidos.length}
                style={{ ...botonChico, flex: 1, justifyContent: 'center',
                  background: C.sageDark, borderColor: C.sageDark, color: 'var(--admin-on-accent)',
                  opacity: elegidos.length ? 1 : 0.4, cursor: elegidos.length ? 'pointer' : 'not-allowed' }}>
                Copiar
              </button>
              <button type="button" onClick={cerrar} style={{ ...botonChico, justifyContent: 'center' }}>
                Cancelar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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

function Encabezado({ embedded = false }) {
  // Incrustado en el panel doctor no se pinta: ese ya puso su titulo. Y
  // "cada doctor" era falso ahi — el doctor solo ve y edita el suyo.
  if (embedded) return null;
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

const etiqueta = { color: 'var(--admin-muted)', fontSize: 12, fontWeight: 500 };
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
