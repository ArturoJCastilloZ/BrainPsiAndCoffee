import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, CircleAlert, X } from 'lucide-react';
import { C } from '../theme';
import { addDays } from '../utils.jsx';
import { localISO } from '../localDay.mjs';
import { isWorkingDay, poolSlotStates } from '../agenda.mjs';
import { etiquetaPaciente, nombrePaciente, solicitudVencida } from '../appointmentStatus.mjs';

// Panel lateral de una cita: la fila de la agenda lo abre y aqui se lee
// todo el detalle y se decide (confirmar, reagendar, completar, cancelar).
//
// <dialog> nativo con showModal, como FormModal: fondo inerte, Esc y
// trampa de foco del navegador. Esc llega primero como evento 'cancel'
// (cancelable), y eso permite no perder cambios sin guardar:
// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
// El retorno de foco lo decide AdminAppointments (la fila puede ya no existir).
export const HORARIO_OCUPADO = 'Ese horario ya no está disponible. Selecciona otro horario.';

export default function CitaPanel({
  booking, bookings, therapists, services,
  schedules, // ya filtrados a la sucursal de la cita
  nombreSucursal, validarHorario, onGuardar, onCerrar,
  // Error con el que abre el panel (Confirmar de la fila de una vencida con
  // el horario ocupado): va al aviso, que recibe el foco.
  errorInicial = '',
}) {
  const ref = useRef(null);
  const tituloRef = useRef(null);
  const fechaRef = useRef(null);
  const horarioRef = useRef(null);
  const seguroRef = useRef(null);
  const rechazarRef = useRef(null);
  const cancelarRef = useRef(null);
  const volverA = useRef(null);
  const alertaRef = useRef(null);
  // A donde va el foco tras un error ('horario' | 'alerta'); el contador
  // vuelve a disparar el efecto aunque el texto del error se repita.
  const focoError = useRef(errorInicial ? 'alerta' : null);
  const [errores, setErrores] = useState(0);
  const idTitulo = useId();
  const idErrorHorario = useId();
  const idConfirmacion = useId();

  const [draft, setDraft] = useState({ date: booking.date, time: booking.time });
  const [confirmando, setConfirmando] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState(errorInicial);
  const [errorHorario, setErrorHorario] = useState('');

  const vencida = solicitudVencida(booking);
  const editable = (booking.status === 'requested' && !vencida) || booking.status === 'confirmed';
  const dirty = editable && (draft.date !== booking.date || draft.time !== booking.time);
  const servicio = services.find((s) => s.id === booking.serviceId);
  const especialista = therapists.find((t) => t.id === booking.therapistId)?.name || 'Sin asignar';
  const fecha = fechaLarga(booking.date);

  // Misma regla que tenia el reagendado en linea: 28 dias en los que el
  // especialista de la cita atiende en esta sucursal, mas la fecha original.
  const therapistPool = therapists.filter((t) => t.id === booking.therapistId && t.services?.includes(booking.serviceId));
  const days = Array.from({ length: 28 }, (_, index) => addDays(new Date(), index))
    .map(localISO)
    .filter((iso) => isWorkingDay(schedules, booking.therapistId, iso));
  const opcionesDia = days.includes(draft.date) || !draft.date ? days : [draft.date, ...days];
  const slots = editable ? poolSlotStates({
    date: draft.date, therapistId: booking.therapistId, serviceId: booking.serviceId,
    bookings: bookings.filter((item) => item.id !== booking.id),
    eligibleTherapists: therapistPool, services, schedules,
  }).filter((slot) => slot.available) : [];

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal?.();
    // Foco inicial explicito al titulo, nunca al boton Cerrar.
    tituloRef.current?.focus();
  }, []);

  // Al abrir una confirmacion el foco va al boton seguro; al cerrarla,
  // vuelve al control que la abrio.
  useEffect(() => {
    if (confirmando) {
      seguroRef.current?.focus();
    } else if (volverA.current) {
      ({ cancelar: cancelarRef, rechazar: rechazarRef, descartar: fechaRef })[volverA.current]?.current?.focus();
      volverA.current = null;
    }
  }, [confirmando]);

  // Tras un error el foco nunca se queda en un boton (pudo estar
  // deshabilitado mientras guardaba): va al campo o al aviso, y el mensaje
  // se desplaza a la vista (con zoom quedaba fuera).
  useEffect(() => {
    if (focoError.current === 'horario') {
      horarioRef.current?.focus();
      document.getElementById(idErrorHorario)?.scrollIntoView?.({ block: 'nearest' });
    } else if (focoError.current === 'alerta') {
      alertaRef.current?.focus();
    }
    focoError.current = null;
  }, [errores, idErrorHorario]);
  const avisarError = (destino) => {
    focoError.current = destino;
    setErrores((n) => n + 1);
  };
  // Un error de horario va ligado al select; sin select (vencida), al aviso.
  const fallaHorario = (texto) => {
    if (editable) {
      setErrorHorario(texto);
      avisarError('horario');
    } else {
      setError(texto);
      avisarError('alerta');
    }
  };
  const fallaGuardado = () => {
    setError('No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
    avisarError('alerta');
  };

  const cerrarConfirmacion = () => {
    volverA.current = confirmando;
    setConfirmando(null);
  };

  // Esc (evento cancel), X y fondo pasan por aqui: true = se puede cerrar.
  const pedirCierre = () => {
    if (guardando) return false;
    if (confirmando) { cerrarConfirmacion(); return false; }
    if (dirty) { setConfirmando('descartar'); return false; }
    return true;
  };
  // Solo estos cierres son a proposito; cualquier otro (el navegador) se
  // revisa en alCerrar.
  const cerradoAdrede = useRef(false);
  const cerrar = () => {
    cerradoAdrede.current = true;
    ref.current?.close();
  };
  // Esc se corta en el keydown: Chrome ignora el preventDefault de 'cancel'
  // cuando no hubo activacion de usuario, y un segundo Esc cerraba y
  // descartaba el borrador. Asi Esc siempre pasa por pedirCierre.
  const alTeclear = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (pedirCierre()) cerrar();
  };
  // Red de seguridad: si el dialogo se cerro sin pasar por cerrar() con un
  // borrador o un guardado en curso, se reabre y nada se pierde.
  const alCerrar = () => {
    if (!cerradoAdrede.current && (dirty || guardando)) {
      ref.current?.showModal?.();
      if (dirty && !guardando) setConfirmando('descartar');
      return;
    }
    onCerrar();
  };

  // Valida el borrador antes de escribirlo. Devuelve false si hay error.
  const horarioValido = () => {
    if (!draft.time) {
      fallaHorario(slots.length ? 'Elige un horario.' : 'Ese día no tiene horarios libres: elige otra fecha.');
      return false;
    }
    if (!validarHorario(draft.date, draft.time)) {
      fallaHorario(HORARIO_OCUPADO);
      return false;
    }
    return true;
  };

  const ejecutar = async (accion, patch) => {
    setGuardando(accion);
    setError('');
    try {
      const r = await onGuardar(patch);
      if (r?.ok === false) {
        fallaGuardado();
        return;
      }
      cerrar();
    } catch {
      // Un guardado que lanza se trata igual que uno que falla: nunca una
      // promesa rechazada sin manejar.
      fallaGuardado();
    } finally {
      setGuardando(null);
    }
  };

  const guardarCambios = () => {
    setAviso('');
    if (!dirty) { setAviso('No cambiaste la fecha ni el horario.'); return; }
    if (!horarioValido()) return;
    ejecutar('guardar', { date: draft.date, time: draft.time });
  };
  // Una vencida ya no aparta su horario: se revalida aunque no cambie.
  const confirmar = () => {
    if ((dirty || vencida) && !horarioValido()) return;
    ejecutar('confirmar', { status: 'confirmed', ...(dirty && { date: draft.date, time: draft.time }) });
  };

  const cambiarFecha = (date) => {
    setDraft({ date, time: '' });
    setErrorHorario('');
    setAviso('Horario reiniciado: elige un horario.');
  };
  const cambiarHorario = (time) => {
    setDraft((d) => ({ ...d, time }));
    setErrorHorario('');
  };

  const textoBoton = (accion, texto) => (guardando === accion ? 'Guardando…' : texto);
  const ocupado = Boolean(guardando);
  const paciente = nombrePaciente(booking);
  const confirmaciones = {
    cancelar: {
      texto: `¿Cancelar la cita de ${paciente}, ${fecha} a las ${booking.time}? El horario quedará libre.`,
      si: 'Sí, cancelar cita', no: 'Conservar cita',
      alAceptar: () => ejecutar('si', { status: 'cancelled' }),
    },
    rechazar: {
      texto: `¿Rechazar la solicitud de ${paciente}, ${fecha} a las ${booking.time}? El horario quedará libre.`,
      si: 'Sí, rechazar', no: 'Conservar solicitud',
      alAceptar: () => ejecutar('si', { status: 'cancelled' }),
    },
    descartar: {
      texto: 'Cambiaste la fecha o el horario y no lo guardaste.',
      si: 'Descartar cambios', no: 'Seguir editando',
      alAceptar: cerrar,
    },
  };
  const conf = confirmando && confirmaciones[confirmando];

  let botones = null;
  if (booking.status === 'requested') {
    botones = (
      <>
        <button type="button" className="cita-boton cita-boton--principal" onClick={confirmar} disabled={ocupado}>
          <Check size={14} aria-hidden="true" /> {textoBoton('confirmar', 'Confirmar')}
        </button>
        {!vencida && (
          <button type="button" className="cita-boton" onClick={guardarCambios} disabled={ocupado}>
            {textoBoton('guardar', 'Guardar cambios')}
          </button>
        )}
        <button type="button" ref={rechazarRef} className="cita-boton cita-boton--peligro" onClick={() => setConfirmando('rechazar')} disabled={ocupado}>
          Rechazar
        </button>
      </>
    );
  } else if (booking.status === 'confirmed') {
    botones = (
      <>
        <button type="button" className="cita-boton cita-boton--principal" onClick={guardarCambios} disabled={ocupado}>
          {textoBoton('guardar', 'Guardar cambios')}
        </button>
        <button type="button" className="cita-boton" onClick={() => ejecutar('completar', { status: 'completed' })} disabled={ocupado}>
          <Check size={14} aria-hidden="true" /> {textoBoton('completar', 'Marcar completada')}
        </button>
        <button type="button" ref={cancelarRef} className="cita-boton cita-boton--peligro" onClick={() => setConfirmando('cancelar')} disabled={ocupado}>
          Cancelar cita
        </button>
      </>
    );
  }

  const textoSoloLectura = vencida
    ? 'Esta solicitud venció: pasaron más de 24 horas sin confirmarla y ya no aparta el horario.'
    : booking.status === 'completed' ? 'Esta cita ya está completada; no se puede editar.'
      : booking.status === 'cancelled' ? 'Esta cita está cancelada; no se puede editar.' : '';

  return (
    <dialog
      ref={ref}
      className="cita-panel"
      aria-modal="true"
      aria-labelledby={idTitulo}
      onKeyDown={alTeclear}
      onCancel={(e) => { if (!pedirCierre()) e.preventDefault(); }}
      onClose={alCerrar}
      // Clic en el fondo: el propio <dialog>, fuera de la caja.
      onMouseDown={(e) => { if (e.target === ref.current && pedirCierre()) cerrar(); }}
    >
      <div className="cita-panel__caja">
        <div className="cita-panel__cabeza">
          <div className="cita-panel__titular">
            <h2 id={idTitulo} ref={tituloRef} tabIndex={-1} className="cita-panel__titulo">
              <span className="solo-lector">Cita de</span>{' '}{etiquetaPaciente(booking)}
            </h2>
            <button type="button" aria-label="Cerrar" className="cita-panel__cerrar" disabled={ocupado}
              onClick={() => { if (pedirCierre()) cerrar(); }}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <p className="cita-panel__resumen">
            <EstadoCita status={booking.status} vencida={vencida} />
            <span>{capitalizar(fecha)} · {booking.time} · {booking.durationMinutes || servicio?.duration || 50} min</span>
          </p>
        </div>

        <div className="cita-panel__cuerpo">
          <dl className="cita-panel__datos">
            <dt>Servicio</dt><dd>{servicio?.name || 'Sin servicio'}</dd>
            <dt>Especialista</dt><dd>{especialista}</dd>
            {nombreSucursal && <><dt>Sucursal</dt><dd>{nombreSucursal}</dd></>}
            {booking.phone && <><dt>Teléfono</dt><dd>{booking.phone}</dd></>}
            {booking.email && <><dt>Correo</dt><dd>{booking.email}</dd></>}
          </dl>

          {editable && (
            <fieldset className="cita-panel__campos">
              <legend className="solo-lector">Fecha y horario</legend>
              <label className="cita-panel__campo">
                <span>Fecha</span>
                <select ref={fechaRef} value={draft.date} disabled={ocupado} className="admin-input"
                  onChange={(e) => cambiarFecha(e.target.value)}>
                  {opcionesDia.map((day) => (
                    <option key={day} value={day}>{capitalizar(fechaLarga(day))}{days.includes(day) ? '' : ' (fecha actual)'}</option>
                  ))}
                </select>
              </label>
              {/* El error va fuera del <label>: dentro, se sumaria al nombre. */}
              <div className="cita-panel__campo">
                <label className="cita-panel__campo">
                  <span>Horario</span>
                  <select ref={horarioRef} value={draft.time} disabled={ocupado} className="admin-input"
                    aria-invalid={errorHorario ? 'true' : undefined}
                    aria-describedby={errorHorario ? idErrorHorario : undefined}
                    onChange={(e) => cambiarHorario(e.target.value)}>
                    <option value="">Selecciona horario</option>
                    {slots.map((slot) => <option key={slot.time} value={slot.time}>{slot.time}</option>)}
                  </select>
                </label>
                {errorHorario && (
                  <p id={idErrorHorario} className="cita-panel__error">
                    <CircleAlert size={14} aria-hidden="true" />{errorHorario}
                  </p>
                )}
              </div>
            </fieldset>
          )}
          {/* Fase 2: Servicio y Notas editables van aqui. */}

          {booking.notes && <p className="cita-panel__notas">{booking.notes}</p>}
          {textoSoloLectura && <p className="cita-panel__lectura">{textoSoloLectura}</p>}

          {/* Montadas siempre: el lector anuncia el cambio de texto. */}
          <p role="status" className="solo-lector">{aviso}</p>
          <div role="alert" ref={alertaRef} tabIndex={-1} className="cita-panel__error">{error}</div>
        </div>

        {(botones || conf) && (
          <div className="cita-panel__pie" aria-busy={guardando ? 'true' : undefined}>
            {conf ? (
              <div role="group" aria-labelledby={idConfirmacion} className="cita-panel__confirmacion">
                <p id={idConfirmacion}>{conf.texto}</p>
                <div className="cita-panel__botones">
                  <button type="button" ref={seguroRef} className="cita-boton" onClick={cerrarConfirmacion} disabled={ocupado}>
                    {conf.no}
                  </button>
                  <button type="button" className="cita-boton cita-boton--peligro" onClick={conf.alAceptar} disabled={ocupado}>
                    {textoBoton('si', conf.si)}
                  </button>
                </div>
              </div>
            ) : botones}
          </div>
        )}
      </div>
    </dialog>
  );
}

function fechaLarga(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}
const capitalizar = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

// El estado normal NO lleva color.
//
// En software clinico el presupuesto de color es de seguridad, no de
// estetica: cuando todo grita, nada se lee. "Cancelada" es un hecho
// administrativo corriente y antes se pintaba en rojo, el mismo rojo que
// deberia quedar para un fallo real al guardar una nota.
//
// Ademas del color va la PALABRA, para quien no distingue los tonos.
const ESTADO_CITA = {
  // La unica que pide una decision: lleva el acento.
  requested: { texto: 'Por confirmar', acento: true },
  confirmed: { texto: 'Confirmada', acento: false },
  completed: { texto: 'Completada', acento: false },
  cancelled: { texto: 'Cancelada', acento: false },
};

export function EstadoCita({ status, vencida = false, id }) {
  // Una solicitud que nadie confirmo en 24 h ya no aparta el horario
  // (0036): dejarla como "Por confirmar" invitaria a confirmarla sobre un
  // horario que quiza ya tomo otra persona.
  const e = vencida
    ? { texto: 'Vencida', acento: false }
    : (ESTADO_CITA[status] || { texto: status, acento: false });
  return (
    <span id={id} style={{
      display: 'inline-flex', alignItems: 'center',
      height: 22, padding: '0 9px', borderRadius: 6,
      fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap',
      background: e.acento ? C.sageDarkAlpha50 : 'var(--admin-surface-soft)',
      border: `1px solid ${e.acento ? 'var(--admin-accent)' : 'var(--admin-border)'}`,
      color: e.acento ? 'var(--admin-text)' : 'var(--admin-muted)',
    }}>
      {e.texto}
    </span>
  );
}

// Estilos de la agenda: fila de cita y panel lateral. Viven aqui y no en
// GlobalStyle porque GlobalStyle va en el paquete inicial que descarga todo
// paciente del sitio publico; esto solo lo usa el personal. Los monta
// AdminAppointments (panel admin y portal doctor), asi viajan en su chunk.
export const ESTILOS_CITAS = `
        /* ==================================================================
           FILA DE CITA — Fase 2 / M2.
           A partir de 520px cabe en una linea: 76 (hora) + 1fr (paciente y
           servicio) + auto (estado y acciones). Por debajo NO cabe, y el
           grid no desborda: APLASTA. Medido en el especimen a 375px, la
           celda del nombre quedaba en 30px de ancho para un texto de 217 —
           "Maria Fernanda Villalobos Trevino" se leia "M...".
           Truncar el nombre de un paciente a dos letras no es un defecto
           estetico: en una agenda clinica es una identificacion ambigua.
           Por eso debajo de 520 las acciones bajan a su propio renglon y el
           nombre recupera el ancho completo.
           ================================================================== */
        .cita-fila {
          display: grid;
          grid-template-columns: 76px minmax(0, 1fr) auto 24px;
          align-items: center;
          gap: 14px;
          padding: 12px 2px;
          position: relative;
          border-radius: 10px;
        }
        .cita-fila:hover { background: var(--admin-surface-soft); }
        /* La fila cuya cita esta abierta en el panel (maqueta C). */
        .cita-fila--abierta { background: var(--admin-surface-soft); box-shadow: inset 3px 0 0 var(--admin-accent); }
        .cita-acciones {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
          position: relative;
          z-index: 1;
        }
        /* La fila abre la cita (panel lateral, admin/CitaPanel.jsx). El
           boton es el unico control de apertura; su ::after se estira sobre
           toda la fila para el raton, y las acciones quedan encima con
           z-index. all: unset quita el anillo global de :focus-visible, por
           eso el anillo se pinta en el ::after. */
        .cita-abrir {
          all: unset;
          display: block;
          max-width: 100%;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          color: var(--admin-text);
        }
        .cita-abrir::after { content: ''; position: absolute; inset: 0; border-radius: 10px; }
        .cita-abrir:focus-visible { outline: none; }
        .cita-abrir:focus-visible::after { outline: 2px solid var(--bp-focus-ring); outline-offset: -2px; }
        .cita-nombre { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cita-chevron { color: var(--admin-muted); display: inline-flex; justify-content: center; }
        .cita-boton {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 36px;
          padding: 0 12px;
          border-radius: 9px;
          font: inherit;
          font-size: 13px;
          font-weight: 600;
          white-space: nowrap;
          cursor: pointer;
          background: transparent;
          color: var(--admin-text);
          border: 1px solid var(--admin-border-interactive);
        }
        .cita-boton--principal { background: var(--admin-accent); color: var(--admin-on-accent); border-color: var(--admin-accent); }
        .cita-boton--peligro { border-color: transparent; color: var(--bp-rust-text); padding: 0 8px; }
        .cita-boton:disabled { cursor: default; opacity: .6; }
        /* Servicio · especialista · sucursal · telefono. Envuelve hasta dos
           renglones a cualquier ancho para que la sucursal y el telefono se
           lean (tambien entre 520 y 700 px y con zoom); solo un texto mas
           largo se corta (el div lleva title con el valor completo). */
        .cita-detalle {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: normal;
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          line-clamp: 2;
        }
        @media (max-width: 519px) {
          .cita-fila {
            grid-template-columns: 76px minmax(0, 1fr) 24px;
            grid-template-areas: "hora datos chev" "acciones acciones acciones";
            row-gap: 10px;
          }
          .cita-hora     { grid-area: hora; }
          .cita-datos    { grid-area: datos; }
          .cita-acciones { grid-area: acciones; justify-content: flex-start; }
          .cita-chevron  { grid-area: chev; }
          .cita-boton { min-height: 44px; min-width: 44px; font-size: 14px; }
        }

        /* Panel lateral de la cita (admin/CitaPanel.jsx): un <dialog> modal
           anclado a la derecha; 100% de ancho en celular. padding 0 y la
           caja al 100%: asi solo el fondo tiene target === dialog (clic
           fuera cierra). Medidas de la maqueta C. */
        .cita-panel {
          margin: 0 0 0 auto;
          padding: 0;
          height: 100vh;
          height: 100dvh;
          max-height: 100dvh;
          width: min(470px, 100vw);
          max-width: 100vw;
          box-sizing: border-box;
          border: 0;
          border-left: 1px solid var(--admin-border);
          background: var(--admin-surface);
          color: var(--admin-text);
          box-shadow: -18px 0 50px rgba(0, 0, 0, 0.35);
        }
        .cita-panel::backdrop { background: rgba(0, 0, 0, 0.55); }
        .cita-panel__caja { display: flex; flex-direction: column; height: 100%; }
        .cita-panel__cabeza { padding: 20px 20px 14px; border-bottom: 1px solid var(--admin-border-soft); }
        .cita-panel__titular { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .cita-panel__titulo { margin: 0; font-size: 17px; font-weight: 700; color: var(--admin-text); overflow-wrap: anywhere; }
        .cita-panel__titulo:focus-visible { outline-offset: 4px; }
        .cita-panel__cerrar {
          display: inline-grid;
          place-items: center;
          flex: none;
          min-width: 36px;
          min-height: 36px;
          border-radius: 999px;
          border: 1px solid var(--admin-border);
          background: transparent;
          color: var(--admin-text);
          cursor: pointer;
        }
        .cita-panel__cerrar:disabled { cursor: default; opacity: .6; }
        .cita-panel__resumen { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 6px 0 0; font-size: 12.5px; color: var(--admin-muted); }
        .cita-panel__cuerpo { flex: 1; overflow: auto; padding: 16px 20px; }
        .cita-panel__datos { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 10px 12px; margin: 0 0 16px; font-size: 13.5px; }
        .cita-panel__datos dt { color: var(--admin-muted); }
        .cita-panel__datos dd { margin: 0; overflow-wrap: anywhere; }
        .cita-panel__campos {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
          gap: 14px;
          align-items: start;
          margin: 0;
          padding: 0;
          border: 0;
          min-width: 0;
        }
        .cita-panel__campo { display: grid; gap: 6px; min-width: 0; }
        .cita-panel__campo > span { font-size: 12.5px; font-weight: 600; color: var(--admin-row-text); }
        .cita-panel__campo select {
          width: 100%;
          min-height: 40px;
          box-sizing: border-box;
          padding: 10px 12px;
          border-radius: 10px;
          border-color: var(--admin-border-interactive);
          font: inherit;
          font-size: 14px;
        }
        .cita-panel__campo select[aria-invalid="true"] { border-color: var(--bp-rust-text); }
        .cita-panel__error { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12.5px; font-weight: 600; color: var(--bp-rust-text); }
        .cita-panel__error svg { flex: none; }
        .cita-panel__notas {
          margin: 14px 0 0;
          padding: 8px 12px;
          border-radius: 8px;
          background: var(--admin-surface-soft);
          border-left: 2px solid var(--bp-caramel);
          font-size: 12.5px;
          line-height: 1.5;
          color: var(--admin-row-text);
        }
        .cita-panel__lectura { margin: 14px 0 0; font-size: 13px; line-height: 1.5; color: var(--admin-row-text); }
        /* La alerta queda montada y visible aunque este vacia (un live
           region con display:none no se anuncia); solo toma margen con texto. */
        .cita-panel__cuerpo > [role="alert"]:not(:empty) { margin-top: 14px; }
        .cita-panel__pie { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--admin-border-soft); }
        /* La accion destructiva va aparte, al extremo (>= 16 px del resto). */
        .cita-panel__pie > .cita-boton--peligro { margin-left: auto; }
        .cita-panel__confirmacion { display: grid; gap: 10px; width: 100%; }
        .cita-panel__confirmacion p { margin: 0; font-size: 13.5px; line-height: 1.5; }
        .cita-panel__botones { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
        .solo-lector {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        @media (max-width: 519px) {
          .cita-panel { width: 100vw; border-left: 0; }
          /* flex-basis auto: cada boton conserva su texto y, si no caben,
             bajan de renglon a ancho completo (maqueta C a 375 px). */
          .cita-panel__pie .cita-boton { flex: 1 1 auto; justify-content: center; }
          .cita-panel__cerrar { min-width: 44px; min-height: 44px; }
          .cita-panel__campo select { min-height: 44px; }
        }
        @media (prefers-reduced-motion: no-preference) {
          .cita-panel[open] { animation: cita-entra .18s ease-out; }
        }
        @keyframes cita-entra { from { transform: translateX(24px); opacity: 0; } }
`;
