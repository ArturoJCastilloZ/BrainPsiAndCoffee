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
export default function CitaPanel({
  booking, bookings, therapists, services,
  schedules, // ya filtrados a la sucursal de la cita
  nombreSucursal, validarHorario, onGuardar, onCerrar,
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
  const focoError = useRef(null);
  const [errores, setErrores] = useState(0);
  const idTitulo = useId();
  const idErrorHorario = useId();
  const idConfirmacion = useId();

  const [draft, setDraft] = useState({ date: booking.date, time: booking.time });
  const [confirmando, setConfirmando] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
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
  const cerrar = () => ref.current?.close();

  // Valida el borrador antes de escribirlo. Devuelve false si hay error.
  const horarioValido = () => {
    if (!draft.time) {
      fallaHorario(slots.length ? 'Elige un horario.' : 'Ese día no tiene horarios libres: elige otra fecha.');
      return false;
    }
    if (!validarHorario(draft.date, draft.time)) {
      fallaHorario('Ese horario ya no está disponible. Selecciona otro horario.');
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
      onCancel={(e) => { if (!pedirCierre()) e.preventDefault(); }}
      onClose={onCerrar}
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
