import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, Plus, Check, X, DollarSign, ChevronRight } from 'lucide-react';
import { C } from '../theme';
import { addDays, todayISO, uid, weekdayLabelsFrom, localDate } from '../utils.jsx';
import { localISO } from '../localDay.mjs';
// timeSlotStates faltaba: agendar con "cualquier especialista" tronaba con
// un ReferenceError al guardar (lo encontro el linter, 2026-10-09).
import { atiendeEnSucursal, bloquesDeSucursal, isWorkingDay, poolAvailableSlots, poolSlotStates, timeSlotStates } from '../agenda.mjs';
import { validateAppointment } from '../validation';
import PaymentDialog from '../components/PaymentDialog';
import { paymentStatus, STATUS_LABEL } from '../payments.mjs';
import { formatMoney } from '../accounting.mjs';
import { cuentaComoFacturada, solicitudVencida, etiquetaPaciente, nombrePaciente } from '../appointmentStatus.mjs';
import CitaPanel, { EstadoCita, ESTILOS_CITAS, HORARIO_OCUPADO } from './CitaPanel';

export default function AdminAppointments({
  bookings, setBookings, catalogs, lockedTherapistId = null,
  // Cobros. Por defecto NO se puede cobrar: DoctorApp renderiza esta misma
  // pantalla y ninguna policy de 0027 incluye al doctor, asi que el valor
  // por omision falla cerrado en vez de ofrecer un boton que la base niega.
  payments = [], canRecordPayments = false, onRegistrarCobro = null,
  // El panel doctor ya pinta su propio titulo antes de incrustar esta
  // pantalla. Sin esto salen DOS encabezados peleandose el mismo rol:
  // "Mis citas" y debajo "Citas / Gestiona reservaciones...".
  embedded = false,
}) {
  // VACIO y no []: un [] nuevo en cada render cambiaba las dependencias de
  // los memos y efectos de abajo en cada pasada, mientras el catalogo no
  // habia llegado. Es la clase de defecto que ya produjo un bucle aqui.
  const services = catalogs?.services || VACIO;
  const therapists = catalogs?.therapists || VACIO;
  const todosLosHorarios = catalogs?.schedules || VACIO;
  // Sucursales (0040): con varias, la cita nueva elige donde y la lista
  // filtra por sucursal. Cada cita nombra su sucursal siempre que la tenga.
  const todasLasSucursales = catalogs?.locations || VACIO;
  const sucursales = useMemo(() => todasLasSucursales.filter((l) => l.active !== false), [todasLasSucursales]);
  const variasSucursales = sucursales.length > 1;
  const nombreSucursal = (id) => todasLasSucursales.find((l) => l.id === id)?.name || '';
  const [filtroSucursal, setFiltroSucursal] = useState('');
  const [filter, setFilter] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  // La cita abierta en el panel lateral: { id, date } (por id: el objeto
  // cambia al guardar; date: a donde volver si la cita desaparece).
  const [abierta, setAbierta] = useState(null);
  // A donde vuelve el foco al cerrar el panel: la fila puede ya no estar.
  const focoTras = useRef(null);
  const listaRef = useRef(null);
  // Resultado de la ultima accion del panel, para el lector de pantalla.
  // Vive fuera del panel: el panel se cierra al guardar.
  const [anuncio, setAnuncio] = useState('');
  const [formError, setFormError] = useState('');
  // Los "Campo requerido" salen despues de intentar guardar: el
  // formulario no abre en rojo, y el boton nunca se apaga sin razon.
  const [intento, setIntento] = useState(false);
  const [cobrando, setCobrando] = useState(null);
  const [draft, setDraft] = useState({
    serviceId: services[0]?.id || '',
    therapistId: lockedTherapistId || 'any',
    date: todayISO(),
    time: '09:00',
    name: '',
    email: '',
    phone: '',
    notes: '',
    wantsCoffee: false,
    locationId: '',
  });
  // Con una sola sucursal, ahi; con varias, la elegida en el formulario.
  const sucursalDeLaCita = variasSucursales ? draft.locationId : (sucursales[0]?.id || '');
  useEffect(() => {
    if (variasSucursales && !draft.locationId && sucursales[0]) {
      // Un especialista fijado (portal doctor) arranca donde atiende.
      const suya = lockedTherapistId && sucursales.find((l) => atiendeEnSucursal(todosLosHorarios, lockedTherapistId, l.id));
      setDraft((d) => ({ ...d, locationId: (suya || sucursales[0]).id }));
    }
  }, [variasSucursales, draft.locationId, sucursales, lockedTherapistId, todosLosHorarios]);
  // Los horarios que valen para la cita nueva: los de su sucursal.
  const schedules = useMemo(() => bloquesDeSucursal(todosLosHorarios, sucursalDeLaCita), [todosLosHorarios, sucursalDeLaCita]);
  const eligibleTherapists = useMemo(() => therapists.filter(therapist => (!lockedTherapistId || therapist.id === lockedTherapistId)
    && (!draft.serviceId || therapist.services?.includes(draft.serviceId))
    && (!sucursalDeLaCita || atiendeEnSucursal(todosLosHorarios, therapist.id, sucursalDeLaCita))),
  [draft.serviceId, lockedTherapistId, therapists, sucursalDeLaCita, todosLosHorarios]);
  // Desde donde arranca la rejilla. Empieza en hoy y se mueve con los
  // controles; no esta alineada a meses, asi que la primera columna es
  // siempre el dia de inicio y los encabezados se derivan de el.
  //
  // Se guarda el ISO y no un Date para que el useMemo compare por valor:
  // un Date nuevo con la misma fecha recalcularia todo en cada render.
  const [calendarStart, setCalendarStart] = useState(() => localISO(new Date()));

  // El "hoy" se congela al montar. Sin esto, una pestaña abierta que cruce
  // la medianoche seguiria tratando como hoy el dia anterior — y la
  // primera columna seria un dia que ya paso.
  const [hoy, setHoy] = useState(() => localISO(new Date()));
  useEffect(() => {
    const id = setInterval(() => {
      const ahora = localISO(new Date());
      setHoy((previo) => (previo === ahora ? previo : ahora));
    }, 60000);
    return () => clearInterval(id);
  }, []);

  const calendarDays = useMemo(() => {
    const inicio = localDate(calendarStart);
    return Array.from({ length: 35 }, (_, index) => {
      const date = addDays(inicio, index);
      const iso = localISO(date);
      const slots = poolAvailableSlots({
        date: iso, therapistId: draft.therapistId, serviceId: draft.serviceId,
        bookings, eligibleTherapists, services, schedules,
      });
      // Navegar hacia atras es util para consultar, pero no se agenda en
      // el pasado.
      const pasado = iso < hoy;
      // Un dia es laboral si ALGUN terapeuta elegible tiene bloques ese
      // dia: ya no hay una semana fija para toda clinica.
      const laboral = eligibleTherapists.some((t) => isWorkingDay(schedules, t.id, iso));
      return {
        iso,
        date,
        slots,
        pasado,
        disabled: pasado || !laboral || slots.length === 0,
      };
    });
  }, [bookings, calendarStart, draft.serviceId, draft.therapistId, eligibleTherapists, hoy, schedules, services]);

  // Saltos de la rejilla. Semana y mes y año, como se pidio; el mes y el
  // año se mueven por calendario real (no por 30 o 365 dias) para que
  // caer en el mismo numero de dia sea predecible.
  const moverCalendario = (unidad, signo) => {
    const d = localDate(calendarStart);
    if (unidad === 'semana') d.setDate(d.getDate() + 7 * signo);
    if (unidad === 'mes') d.setMonth(d.getMonth() + signo);
    if (unidad === 'anio') d.setFullYear(d.getFullYear() + signo);
    setCalendarStart(localISO(d));
  };
  const availableDates = useMemo(() => calendarDays.filter(day => !day.disabled).map(day => day.iso), [calendarDays]);
  const availableSlots = useMemo(() => poolSlotStates({
    date: draft.date, therapistId: draft.therapistId, serviceId: draft.serviceId,
    bookings, eligibleTherapists, services, schedules,
  }), [bookings, draft.date, draft.serviceId, draft.therapistId, eligibleTherapists, schedules, services]);
  const selectedSlot = availableSlots.find(slot => slot.time === draft.time);
  // validateAppointment habla al paciente ("Escribe tu nombre"); aqui
  // quien escribe es el personal, sobre el paciente.
  const erroresParaPersonal = (d) => {
    const e = validateAppointment(d);
    const vacio = (v) => !String(v || '').trim();
    if (e.name) e.name = 'Escribe el nombre del paciente.';
    if (e.email) e.email = vacio(d.email) ? 'Escribe el correo del paciente.' : 'Revisa el correo: no parece válido.';
    if (e.phone) e.phone = vacio(d.phone) ? 'Escribe el teléfono del paciente.' : 'Revisa el teléfono: deben ser 10 dígitos.';
    return e;
  };
  const erroresCita = intento ? erroresParaPersonal(draft) : {};

  useEffect(() => {
    if (!draft.serviceId && services[0]?.id) {
      setDraft(current => ({ ...current, serviceId: services[0].id }));
    }
  }, [draft.serviceId, services]);

  // Con un doctor FIJADO su identidad no se negocia, y el retorno
  // temprano va ANTES de la caida a 'any' a proposito.
  //
  // Los dos bloques se peleaban: si el doctor no figuraba como apto para
  // el servicio del borrador, el de abajo lo mandaba a 'any' y el de
  // arriba lo devolvia al doctor, sin parar. React tiraba "Maximum update
  // depth exceeded" en bucle nada mas abrir el panel doctor.
  //
  // Se disparaba porque el doctor no puede leer therapy_services (ver
  // is_clinic_staff en 0005): su catalogo cae al hardcodeado de data.js,
  // cuyos ids no casan con therapist_services, asi que NINGUN terapeuta
  // resultaba apto. Aqui se corta el ciclo; el hueco de lectura es aparte.
  useEffect(() => {
    if (lockedTherapistId) {
      if (draft.therapistId !== lockedTherapistId) {
        setDraft(current => ({ ...current, therapistId: lockedTherapistId }));
      }
      return;
    }
    if (draft.therapistId !== 'any' && !eligibleTherapists.some(therapist => therapist.id === draft.therapistId)) {
      setDraft(current => ({ ...current, therapistId: 'any' }));
    }
  }, [draft.therapistId, eligibleTherapists, lockedTherapistId]);

  useEffect(() => {
    if (!availableDates.length) return;
    if (!availableDates.includes(draft.date)) {
      setDraft(current => ({ ...current, date: availableDates[0], time: '' }));
    }
  }, [availableDates, draft.date]);

  useEffect(() => {
    const freeSlots = availableSlots.filter(slot => slot.available).map(slot => slot.time);
    if (!freeSlots.length) return;
    if (!freeSlots.includes(draft.time)) {
      setDraft(current => ({ ...current, time: freeSlots[0] }));
    }
  }, [availableSlots, draft.time]);

  const porConfirmar = useMemo(
    () => bookings.filter(b => b.status === 'requested' && !solicitudVencida(b)
      && (!lockedTherapistId || b.therapistId === lockedTherapistId)).length,
    [bookings, lockedTherapistId],
  );

  const filtered = useMemo(() => {
    let list = [...bookings];
    if (lockedTherapistId) list = list.filter(b => b.therapistId === lockedTherapistId);
    if (filter === 'upcoming') list = list.filter(b => b.status !== 'cancelled' && new Date(b.date + 'T' + b.time) >= new Date());
    else if (filter === 'requested') list = list.filter(b => b.status === 'requested');
    else if (filter === 'past') list = list.filter(b => new Date(b.date + 'T' + b.time) < new Date());
    else if (filter === 'cancelled') list = list.filter(b => b.status === 'cancelled');

    if (filtroSucursal) list = list.filter(b => b.locationId === filtroSucursal);
    if (search) list = list.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.email.toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
  }, [bookings, filter, lockedTherapistId, search, filtroSucursal]);

  const updateStatus = (id, status) => setBookings(bookings.map(b => b.id === id ? { ...b, status } : b));
  // Se reagenda en la MISMA sucursal y con el mismo especialista.
  const horarioLibre = (booking, date, time) => {
    const serviceTherapists = therapists.filter(therapist => therapist.id === booking.therapistId && therapist.services?.includes(booking.serviceId));
    // schedules va SIEMPRE. Sin el, blocksForDate no encuentra bloques,
    // no hay candidatos, y este find devuelve undefined: reagendar
    // rechazaba TODOS los horarios que la propia pantalla acababa de
    // ofrecer.
    const slot = poolSlotStates({
      date, therapistId: booking.therapistId, serviceId: booking.serviceId,
      bookings: bookings.filter(item => item.id !== booking.id),
      eligibleTherapists: serviceTherapists, services, schedules: bloquesDeSucursal(todosLosHorarios, booking.locationId),
    }).find(item => item.time === time);
    return Boolean(slot?.available);
  };
  // Una sola escritura por accion del panel. El spread conserva status y
  // createdAt: reagendar una solicitud la deja por confirmar.
  const aplicarCambio = async (booking, patch) => {
    const r = await setBookings(bookings.map(i => i.id === booking.id ? { ...i, ...patch } : i));
    const ok = r?.ok !== false;
    if (ok) setAnuncio(anuncioDeCambio(booking, patch));
    return { ok };
  };
  // Una vencida ya no aparta su horario: antes de confirmarla se revisa que
  // siga libre. Si no, no se confirma y se abre su panel con el error.
  const confirmarDesdeFila = (b) => {
    if (solicitudVencida(b) && !horarioLibre(b, b.date, b.time)) {
      setAnuncio('');
      setAbierta({ id: b.id, date: b.date, error: HORARIO_OCUPADO });
      return;
    }
    updateStatus(b.id, 'confirmed');
  };
  const citaAbierta = abierta ? bookings.find(b => b.id === abierta.id) : null;
  // Si la cita abierta desaparece (recarga, otra sesion la borro), el panel
  // ya no se pinta: se cierra de verdad para que no se reabra solo si la
  // cita vuelve, y el foco cae en su dia o en la lista.
  useEffect(() => {
    if (abierta && !citaAbierta) {
      focoTras.current = abierta;
      setAbierta(null);
    }
  }, [abierta, citaAbierta]);
  // Al cerrar el panel, el foco vuelve a la fila de la cita; si ya no
  // esta (cambio de filtro), al encabezado de su dia; si no, a la lista.
  useEffect(() => {
    const destino = focoTras.current;
    const lista = listaRef.current;
    if (abierta || !destino || !lista) return;
    focoTras.current = null;
    const fila = [...lista.querySelectorAll('[data-cita-abrir]')].find(el => el.dataset.citaAbrir === String(destino.id));
    const dia = [...lista.querySelectorAll('h2[data-dia]')].find(el => el.dataset.dia === destino.date);
    (fila || dia || lista).focus();
  }, [abierta]);

  const createBooking = () => {
    setIntento(true);
    const nextErrors = erroresParaPersonal(draft);
    if (Object.keys(nextErrors).length) {
      setFormError(Object.values(nextErrors)[0]);
      return;
    }

    if (!selectedSlot?.available) {
      setFormError('Ese horario ya no está disponible. Selecciona otro horario.');
      return;
    }
    // Con "cualquiera" se asigna al primero que de verdad tenga ese
    // horario libre segun SU horario y SU buffer, no segun una regla fija.
    const assignedTherapistId = draft.therapistId === 'any'
      ? eligibleTherapists.find((therapist) => timeSlotStates({
          schedules,
          therapist,
          service: services.find((x) => x.id === draft.serviceId),
          date: draft.date,
          bookings,
          services,
        }).some((slot) => slot.time === draft.time && slot.available))?.id
      : draft.therapistId;
    if (!assignedTherapistId) {
      setFormError('Ese horario ya no está disponible. Selecciona otro horario.');
      return;
    }

    setFormError('');
    // Igual que en el flujo publico: la duracion real viaja con la cita para
    // que la BD pueda impedir el encimado de sesiones.
    const assignedTherapist = therapists.find((item) => item.id === assignedTherapistId);
    const durationMinutes = Number(assignedTherapist?.sessionDuration)
      || Number(services.find((item) => item.id === draft.serviceId)?.duration)
      || 50;

    setBookings([...bookings, {
      id: uid(),
      ...draft,
      therapistId: assignedTherapistId,
      locationId: sucursalDeLaCita,
      durationMinutes,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      reminderSent: false,
    }]);
    setDraft({ ...draft, name: '', email: '', phone: '', notes: '', wantsCoffee: false });
    setIntento(false);
    setCreating(false);
  };

  return (
    <div>
      <style>{ESTILOS_CITAS}</style>
      <p role="status" className="solo-lector">{anuncio}</p>
      {!embedded && (
        <>
          <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Citas</h1>
          <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 24 }}>Gestiona reservaciones, confirma o reprograma</p>
        </>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={() => setCreating(!creating)} style={{
          background: 'var(--admin-accent)', color: 'var(--admin-on-accent)', border: 'none', borderRadius: 999,
          padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700
        }}>
          {creating ? <X size={14} /> : <Plus size={14} />} {creating ? 'Cancelar' : 'Nueva cita'}
        </button>
      </div>

      {creating && (
        <div className="admin-card" style={{ borderRadius: 14, padding: 22, marginBottom: 20 }}>
          {/* auto-fit con min(100%, …) para que en el celular se apile en vez
              de desbordar; alignItems start para que un aviso bajo un campo
              no descuadre a sus vecinos de fila. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '18px 14px', alignItems: 'start' }}>
            <AdminField label="Nombre" value={draft.name} error={erroresCita.name} autoComplete="off" onChange={name => { setFormError(''); setDraft({ ...draft, name }); }} required />
            <AdminField label="Correo" value={draft.email} error={erroresCita.email} autoComplete="off" spellCheck={false} onChange={email => { setFormError(''); setDraft({ ...draft, email }); }} type="email" required />
            <AdminField label="Teléfono" value={draft.phone} error={erroresCita.phone} type="tel" inputMode="tel" autoComplete="off" onChange={phone => { setFormError(''); setDraft({ ...draft, phone }); }} required />
            {variasSucursales && (
              <label style={fieldWrap}>
                <span style={fieldLabel}>SUCURSAL</span>
                <select value={draft.locationId} onChange={e => { setFormError(''); setDraft({ ...draft, locationId: e.target.value, time: '' }); }} className="admin-input" style={fieldInput}>
                  {sucursales.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
            <label style={fieldWrap}>
              <span style={fieldLabel}>SERVICIO</span>
              <select value={draft.serviceId} onChange={e => { setFormError(''); setDraft({ ...draft, serviceId: e.target.value }); }} required className="admin-input" style={{ ...fieldInput, borderColor: intento && !draft.serviceId ? C.rust : undefined }}>
                <option value="">Elige el servicio…</option>
                {services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
              {intento && !draft.serviceId && <span style={requiredHint}>Elige el servicio.</span>}
            </label>
            {!lockedTherapistId && (
              <label style={fieldWrap}>
                <span style={fieldLabel}>PROFESIONAL</span>
                <select value={draft.therapistId} onChange={e => { setFormError(''); setDraft({ ...draft, therapistId: e.target.value }); }} required className="admin-input" style={fieldInput}>
                  <option value="any">Asignación automática</option>
                  {eligibleTherapists.map(therapist => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}
                </select>
              </label>
            )}
            <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>FECHA DISPONIBLE</span>
              <AvailabilityCalendar
                days={calendarDays}
                selectedDate={draft.date}
                onSelect={date => { setFormError(''); setDraft({ ...draft, date, time: '' }); }}
                onMove={moverCalendario}
                onToday={() => setCalendarStart(hoy)}
                enHoy={calendarStart === hoy}
              />
              {intento && !draft.date && <span style={requiredHint}>Elige una fecha con horarios.</span>}
            </div>
            <div style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>HORARIO DISPONIBLE</span>
              <TimeSlotGrid slots={availableSlots} selectedTime={draft.time} onSelect={time => { setFormError(''); setDraft({ ...draft, time }); }} />
              {intento && !draft.time && <span style={requiredHint}>Elige un horario.</span>}
            </div>
            <label style={{ ...fieldWrap, gridColumn: '1 / -1' }}>
              <span style={fieldLabel}>NOTAS</span>
              <input value={draft.notes || ''} maxLength={280} onChange={e => setDraft({ ...draft, notes: e.target.value })} className="admin-input" style={fieldInput} />
              {erroresCita.notes && <span style={requiredHint}>{erroresCita.notes}</span>}
            </label>
          </div>
          {formError && (
            <div role="alert" style={{
              marginTop: 14,
              color: C.rust,
              background: C.rustAlpha20,
              border: `1px solid ${C.rustAlpha40}`,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: 700
            }}>
              {formError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={createBooking} style={{
              background: 'var(--admin-accent)', color: 'var(--admin-on-accent)', border: 'none', borderRadius: 9,
              padding: '9px 14px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
            }}>Guardar cita</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { id: 'upcoming', label: 'Próximas' },
          // Las solicitudes de la web esperan una decision: confirmar o
          // rechazar. El contador dice cuantas hay sin abrir el filtro.
          { id: 'requested', label: porConfirmar ? `Por confirmar (${porConfirmar})` : 'Por confirmar' },
          { id: 'past', label: 'Pasadas' },
          { id: 'cancelled', label: 'Canceladas' },
          { id: 'all', label: 'Todas' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            background: filter === f.id ? 'var(--admin-accent)' : 'transparent',
            color: filter === f.id ? 'var(--admin-on-accent)' : 'var(--admin-muted)',
            border: '1px solid ' + (filter === f.id ? 'var(--admin-accent)' : 'var(--admin-border)'),
            padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
          }}>{f.label}</button>
        ))}
      </div>

      {variasSucursales && (
        <select value={filtroSucursal} onChange={e => setFiltroSucursal(e.target.value)} aria-label="Filtrar por sucursal" className="admin-input"
          style={{ padding: '9px 12px', borderRadius: 10, fontSize: 13, marginBottom: 10, fontFamily: 'inherit' }}>
          <option value="">Todas las sucursales</option>
          {sucursales.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      )}
      <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o correo…" aria-label="Buscar citas por nombre o correo" className="admin-input" style={{
        width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, fontFamily: 'inherit', boxSizing: 'border-box'
      }} />

      {/* tabIndex -1: destino del foco si la cita del panel sale de la lista. */}
      <div ref={listaRef} tabIndex={-1} role="region" aria-label="Lista de citas">
      {filtered.length === 0 ? (
        /* El vacio dice que hacer, y distingue "no hay nada" de "tu
           filtro no encontro nada": son dos situaciones distintas y la
           salida de cada una es distinta. */
        <div style={{ maxWidth: 380, padding: '56px 0', margin: '0 auto', textAlign: 'center' }}>
          <CalendarIcon size={28} color="var(--admin-subtle)" strokeWidth={1.5} style={{ margin: '0 auto 12px', display: 'block' }} />
          <p style={{ fontSize: 14, color: 'var(--admin-text)', margin: '0 0 6px', fontWeight: 600 }}>
            {search.trim()
              ? `Ningún resultado para “${search.trim()}”`
              : filter === 'upcoming' ? 'No hay citas próximas'
                : filter === 'requested' ? 'No hay solicitudes por confirmar'
                : filter === 'cancelled' ? 'Ninguna cita cancelada'
                  : filter === 'past' ? 'Todavía no hay citas pasadas'
                    : 'Aún no hay citas'}
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--admin-muted)', margin: 0, lineHeight: 1.55 }}>
            {search.trim()
              ? 'Revisa el nombre o el correo, o limpia la búsqueda.'
              : filter === 'upcoming' ? 'Las citas ya atendidas están en “Pasadas”.'
                : 'Agenda la primera con “Nueva cita”.'}
          </p>
          {search.trim() && (
            <button onClick={() => setSearch('')} style={{
              marginTop: 14, background: 'transparent', border: '1px solid var(--admin-border)',
              color: 'var(--admin-text)', borderRadius: 9, minHeight: 36, padding: '0 14px',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
            }}>Limpiar búsqueda</button>
          )}
        </div>
      ) : (
        /* Agrupadas por dia. Antes era una lista plana de tarjetas: el
           dia solo se leia en un cuadro por fila, asi que para saber
           "que tengo el jueves" habia que ir sumando con la vista. */
        <div style={{ display: 'grid', gap: 26 }}>
          {agruparPorDia(filtered).map(([dia, citas]) => (
            <section key={dia}>
              <div style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                gap: 12, padding: '0 2px 8px',
                borderBottom: '1px solid var(--admin-border-soft)', marginBottom: 2,
              }}>
                <h2 data-dia={dia} tabIndex={-1} style={{
                  margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--admin-text)',
                }}>
                  {etiquetaDia(dia)}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
                  {citas.length} {citas.length === 1 ? 'cita' : 'citas'}
                </span>
              </div>

              {citas.map(b => {
                const s = services.find(sv => sv.id === b.serviceId);
                const t = therapists.find(th => th.id === b.therapistId);
                const detalle = [s?.name, t?.name || 'Sin asignar', nombreSucursal(b.locationId), b.phone].filter(Boolean).join(' · ');
                return (
                  <div key={b.id} style={{ borderBottom: '1px solid var(--admin-border-soft)' }}>
                    <div className={abierta?.id === b.id ? 'cita-fila cita-fila--abierta' : 'cita-fila'} style={{
                      opacity: b.status === 'cancelled' ? 0.55 : 1,
                    }}>
                      {/* Columna de hora fija: es lo que hace que la lista
                          se lea en vertical de un vistazo. tabular-nums
                          evita que los digitos bailen de fila en fila. */}
                      <div className="cita-hora">
                        <div style={{
                          fontSize: 14.5, fontWeight: 600, color: 'var(--admin-text)',
                          fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
                        }}>{b.time}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--admin-muted)', marginTop: 1 }}>
                          {b.durationMinutes || s?.duration || 50} min
                        </div>
                      </div>

                      <div className="cita-datos" style={{ minWidth: 0 }}>
                        {/* La fila abre la cita. El boton es el unico control
                            de apertura; su ::after cubre toda la fila para el
                            raton (.cita-abrir en GlobalStyle). El nombre no se
                            trunca sin mas: en contexto clinico una
                            identificacion a medias es un riesgo, asi que
                            lleva title. */}
                        <button type="button" className="cita-abrir" data-cita-abrir={b.id}
                          aria-haspopup="dialog"
                          aria-label={`Abrir cita de ${nombrePaciente(b)}, ${b.time}`}
                          aria-describedby={`cita-estado-${b.id}`}
                          onClick={() => { setAnuncio(''); setAbierta({ id: b.id, date: b.date }); }}>
                          <span title={etiquetaPaciente(b)} className="cita-nombre">{etiquetaPaciente(b)}</span>
                        </button>
                        {/* En celular envuelve a dos renglones (.cita-detalle);
                            si aun asi no cabe, title da el valor completo. */}
                        <div className="cita-detalle" title={detalle} style={{ fontSize: 12, color: 'var(--admin-muted)', marginTop: 2 }}>
                          {detalle}
                        </div>
                      </div>

                      <div className="cita-acciones">
                        <EstadoCita id={`cita-estado-${b.id}`} status={b.status} vencida={solicitudVencida(b)} />
                        {/* Una solicitud por confirmar todavia no se cobra:
                            no es un servicio acordado. */}
                        {canRecordPayments && cuentaComoFacturada(b) && (
                          <CobroChip booking={b} payments={payments} onCobrar={() => setCobrando(b)} />
                        )}
                        {/* La decision pendiente se queda en la fila, con
                            texto: confirmar le promete al paciente una cita.
                            Rechazar, reagendar y lo demas viven en el panel. */}
                        {b.status === 'requested' && (
                          <button type="button" className="cita-boton cita-boton--principal"
                            aria-label={`Confirmar la solicitud de ${nombrePaciente(b)}`}
                            onClick={() => confirmarDesdeFila(b)}>
                            <Check size={13} aria-hidden="true" /> Confirmar
                          </button>
                        )}
                      </div>
                      <span className="cita-chevron" aria-hidden="true"><ChevronRight size={16} /></span>
                    </div>

                    {b.notes && (
                      <div style={{
                        margin: '0 0 12px', padding: '8px 12px', borderRadius: 8,
                        background: 'var(--admin-surface-soft)',
                        borderLeft: `2px solid ${C.caramel}`,
                        fontSize: 12, color: 'var(--admin-row-text)', lineHeight: 1.5,
                      }}>
                        {b.notes}
                      </div>
                    )}

                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
      </div>

      {citaAbierta && (
        <CitaPanel
          key={citaAbierta.id}
          booking={citaAbierta}
          bookings={bookings}
          therapists={therapists}
          services={services}
          schedules={bloquesDeSucursal(todosLosHorarios, citaAbierta.locationId)}
          nombreSucursal={nombreSucursal(citaAbierta.locationId)}
          errorInicial={abierta.error}
          validarHorario={(date, time) => horarioLibre(citaAbierta, date, time)}
          onGuardar={(patch) => aplicarCambio(citaAbierta, patch)}
          onCerrar={() => { focoTras.current = { id: citaAbierta.id, date: citaAbierta.date }; setAbierta(null); }}
        />
      )}

      {cobrando && (
        <PaymentDialog
          kind="cita"
          doc={cobrando}
          payments={payments}
          canRecord={canRecordPayments}
          descripcion={`${cobrando.name || 'Cita'} · ${cobrando.date} ${cobrando.time || ''}`.trim()}
          onGuardar={onRegistrarCobro}
          onCerrar={() => setCobrando(null)}
        />
      )}
    </div>
  );
}

// Lo que se anuncia tras guardar desde el panel de la cita.
function anuncioDeCambio(booking, patch) {
  if (patch.status === 'confirmed') return 'Cita confirmada.';
  if (patch.status === 'cancelled') return booking.status === 'requested' ? 'Solicitud rechazada.' : 'Cita cancelada.';
  if (patch.status === 'completed') return 'Cita marcada como completada.';
  return 'Cambios guardados.';
}

// Agrupa por fecha conservando el orden que trae la lista filtrada.
function agruparPorDia(citas) {
  const mapa = new Map();
  citas.forEach((c) => {
    const dia = String(c.date || '').slice(0, 10);
    if (!mapa.has(dia)) mapa.set(dia, []);
    mapa.get(dia).push(c);
  });
  // Dentro del dia, por hora: una agenda se lee de la mañana a la noche.
  mapa.forEach((filas) => filas.sort((a, b) => String(a.time).localeCompare(String(b.time))));
  return Array.from(mapa.entries());
}

// "Hoy" y "Mañana" primero, la fecha despues: es lo que ahorra el calculo
// mental de a que dia corresponde un 19.
function etiquetaDia(iso) {
  const d = localDate(iso);
  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const dias = Math.round((d - hoy) / 86400000);
  // Solo la primera letra. textTransform:'capitalize' ponia mayuscula en
  // cada palabra y producia "Sábado, 19 De Septiembre".
  const crudo = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  const fecha = crudo.charAt(0).toUpperCase() + crudo.slice(1);
  if (dias === 0) return `Hoy · ${fecha}`;
  if (dias === 1) return `Mañana · ${fecha}`;
  if (dias === -1) return `Ayer · ${fecha}`;
  return fecha;
}

const VACIO = [];

// El estado de cobro de la cita, y el boton que la cobra.
//
// Va FUERA del bloque de status === 'confirmed': una cita ya completada es
// justo la que se cobra, y dejarla sin boton ahi habria reproducido el
// agujero que este trabajo vino a cerrar.
function CobroChip({ booking, payments, onCobrar }) {
  const e = paymentStatus(booking, payments, 'cita');
  const pagado = e.estado === 'pagado';
  const sinImporte = e.estado === 'sin-importe';

  return (
    <button
      onClick={onCobrar}
      disabled={pagado || sinImporte}
      aria-label={`Registrar cobro de la cita de ${booking.name || 'paciente'}`}
      title={
        sinImporte ? 'Sin precio congelado: revisa el precio del servicio'
          : pagado ? `Cobrada por completo (${formatMoney(e.total)})`
            : `${STATUS_LABEL[e.estado]} · faltan ${formatMoney(e.saldo)}`
      }
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
        padding: '5px 9px', borderRadius: 999, cursor: pagado || sinImporte ? 'default' : 'pointer',
        background: pagado ? 'var(--admin-border)' : 'var(--admin-surface-soft)',
        border: `1px solid ${pagado ? 'var(--admin-border)' : C.rust}`,
        color: pagado ? 'var(--admin-accent-text)' : C.rustText,
        opacity: sinImporte ? 0.55 : 1,
      }}
    >
      <DollarSign size={11} aria-hidden="true" />
      {pagado ? 'COBRADA' : sinImporte ? 'SIN IMPORTE' : `COBRAR ${formatMoney(e.saldo)}`}
    </button>
  );
}

const fieldWrap = { display: 'grid', gap: 6 };
const fieldLabel = { color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 };
const fieldInput = { width: '100%', minHeight: 40, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, fontFamily: 'inherit' };

// error: el mensaje de validateAppointment para este campo, ya filtrado
// por "intento" en quien llama. Sin error no se pinta nada: el formulario
// no abre en rojo.
function AdminField({ label, value, onChange, type = 'text', required = false, error = '', inputMode, autoComplete, spellCheck }) {
  return (
    <label style={{ ...fieldWrap, alignContent: 'start' }}>
      <span style={fieldLabel}>{label.toUpperCase()}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} type={type} required={required}
        inputMode={inputMode} autoComplete={autoComplete} spellCheck={spellCheck} aria-invalid={Boolean(error)}
        className="admin-input" style={{ ...fieldInput, borderColor: error ? C.rust : undefined }} />
      {error && <span style={requiredHint}>{error}</span>}
    </label>
  );
}

const requiredHint = { color: C.rustText, fontSize: 12, fontWeight: 700 };

function AvailabilityCalendar({ days, selectedDate, onSelect, onMove, onToday, enHoy }) {
  const primero = days[0]?.date;
  const ultimo = days[days.length - 1]?.date;
  // El rango se rotula con lo que la rejilla realmente contiene, que
  // puede cruzar dos meses o dos años.
  const rango = primero && ultimo
    ? `${primero.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – ${ultimo.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : '';

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, marginBottom: 8, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => onMove('anio', -1)} style={navBtn} title="Un año atrás">«</button>
          <button type="button" onClick={() => onMove('mes', -1)} style={navBtn} title="Un mes atrás">‹‹</button>
          <button type="button" onClick={() => onMove('semana', -1)} style={navBtn} title="Una semana atrás">‹</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--admin-muted)', fontSize: 11, fontWeight: 700 }}>{rango}</span>
          {!enHoy && (
            <button type="button" onClick={onToday} style={{ ...navBtn, width: 'auto', padding: '0 10px' }}>Hoy</button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button type="button" onClick={() => onMove('semana', 1)} style={navBtn} title="Una semana adelante">›</button>
          <button type="button" onClick={() => onMove('mes', 1)} style={navBtn} title="Un mes adelante">››</button>
          <button type="button" onClick={() => onMove('anio', 1)} style={navBtn} title="Un año adelante">»</button>
        </div>
      </div>
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
      gap: 6,
      background: 'var(--admin-surface-soft)',
      border: '1px solid var(--admin-border)',
      borderRadius: 12,
      padding: 10,
    }}>
      {/* Se derivan del primer dia real de la rejilla: esta empieza hoy y
          no en lunes, asi que un arreglo fijo solo acierta un dia de cada
          siete. */}
      {weekdayLabelsFrom(days[0]?.date).map((label, index) => (
        <div key={`${label}-${index}`} style={{ color: 'var(--admin-subtle)', fontSize: 10, fontWeight: 800, textAlign: 'center' }}>{label}</div>
      ))}
      {days.map(day => {
        const selected = selectedDate === day.iso;
        const disabled = day.disabled;
        return (
          <button key={day.iso} type="button" disabled={disabled} onClick={() => onSelect(day.iso)} title={disabled ? 'Sin horarios disponibles' : `${day.slots.length} horarios disponibles`} style={{
            minHeight: 42,
            borderRadius: 10,
            border: `1px solid ${selected ? 'var(--admin-accent)' : 'var(--admin-border)'}`,
            background: selected ? 'var(--admin-accent)' : (disabled ? 'transparent' : 'var(--admin-surface)'),
            color: selected ? 'var(--admin-on-accent)' : (disabled ? 'var(--admin-subtle)' : 'var(--admin-text)'),
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.35 : 1,
            fontFamily: 'inherit',
            display: 'grid',
            placeItems: 'center',
            gap: 1,
          }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{day.date.getDate()}</span>
            <span style={{ fontSize: 9, color: selected ? 'var(--admin-on-accent)' : 'var(--admin-accent-text)' }}>{disabled ? '-' : day.slots.length}</span>
          </button>
        );
      })}
    </div>
    </div>
  );
}

const navBtn = {
  width: 30,
  height: 26,
  borderRadius: 8,
  border: '1px solid var(--admin-border)',
  background: 'var(--admin-surface)',
  color: 'var(--admin-accent-text)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
};

function TimeSlotGrid({ slots, selectedTime, onSelect }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))',
      gap: 8,
      background: 'var(--admin-surface-soft)',
      border: '1px solid var(--admin-border)',
      borderRadius: 12,
      padding: 10,
    }}>
      {slots.map(slot => {
        const selected = selectedTime === slot.time;
        return (
          <button key={slot.time} type="button" disabled={!slot.available} onClick={() => onSelect(slot.time)} title={slot.available ? 'Disponible' : slot.reason} style={{
            minHeight: 38,
            borderRadius: 10,
            border: `1px solid ${selected ? 'var(--admin-accent)' : 'var(--admin-border)'}`,
            background: selected ? 'var(--admin-accent)' : (slot.available ? 'var(--admin-surface)' : 'transparent'),
            color: selected ? 'var(--admin-on-accent)' : (slot.available ? 'var(--admin-text)' : 'var(--admin-subtle)'),
            cursor: slot.available ? 'pointer' : 'not-allowed',
            opacity: slot.available ? 1 : 0.35,
            textDecoration: slot.available ? 'none' : 'line-through',
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 800,
          }}>{slot.time}</button>
        );
      })}
    </div>
  );
}

// Estas dos delegan en src/agenda.mjs, que es donde vive la aritmetica y
// donde se puede probar. Aqui solo se resuelve QUE terapeutas entran:
// con "cualquiera", un horario esta disponible si al menos uno puede.
// ============ ADMIN ORDERS ============
