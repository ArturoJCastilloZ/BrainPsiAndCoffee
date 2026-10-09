import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, fullDayLabel, initials, uid, localDate, localISO } from '../utils.jsx';
import { activeOffers } from '../offerUtils.mjs';
import { validateAppointment } from '../validation';
import { businessFromSettings, hayWhatsapp, whatsappUrl } from '../businessInfo';
import { trackEvent } from '../monitoring';
import { poolAvailableSlots, poolSlotStates } from '../agenda.mjs';
import { precio } from './Pizarron';
import './booking.css';

const PASOS = ['Elige el servicio', 'Elige especialista', 'Elige día y hora', 'Tus datos', 'Revisa y envía'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^\d{2}:\d{2}$/;

export default function BookingFlow({ setPage, bookings, setBookings, setLinkedBookingId, catalogs, dataLoading }) {
  const services = (catalogs?.services || []).filter((item) => item.active !== false);
  const therapists = (catalogs?.therapists || []).filter((item) => item.active !== false);
  // El horario REAL del consultorio (policy publica de 0029).
  const schedules = catalogs?.schedules || [];
  // Lo ocupado: el visitante no lee las citas, pero si los rangos que
  // ocupan (busy_slots, 0038). Sin esto se le ofrecian horarios tomados y
  // el choque aparecia hasta el final.
  const ocupadas = useMemo(() => [...(bookings || []), ...(catalogs?.busy || [])], [bookings, catalogs?.busy]);
  const business = businessFromSettings(catalogs?.settings);
  // Sin numero no se ofrece WhatsApp: el enlace abriria un chat sin
  // destinatario. Se manda a Contacto, que muestra lo que si hay.
  const conWhatsapp = hayWhatsapp(business);
  // El precio del combo sale de la promocion VIGENTE, no de un texto.
  const comboOffer = activeOffers(catalogs?.offers || []).find((o) => o.kind === 'combo');

  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    serviceId: null, therapistId: null, date: null, time: null,
    forMinor: false, patientName: '',
    name: '', email: '', phone: '', notes: '', wantsCoffee: false, privacyAccepted: false,
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const tituloRef = useRef(null);

  const update = (k, v) => {
    setData((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: '' }));
  };
  const service = services.find((s) => s.id === data.serviceId);
  const therapist = therapists.find((t) => t.id === data.therapistId);

  // Atajo desde la portada: /reservar?servicio=..&fecha=..&hora=.. llega
  // con todo puesto y arranca en el paso del horario, para confirmarlo.
  // Se aplica UNA vez, cuando el catalogo ya llego.
  const [params] = useSearchParams();
  const aplicado = useRef(false);
  useEffect(() => {
    if (aplicado.current || services.length === 0) return;
    aplicado.current = true;
    const servicio = services.find((s) => s.id === params.get('servicio'));
    // Un servicio que nadie atiende se queda en el paso 1, donde se explica.
    if (!servicio || !therapists.some((t) => t.services?.includes(servicio.id))) return;
    const fecha = params.get('fecha');
    const hora = params.get('hora');
    if (FECHA.test(fecha || '') && HORA.test(hora || '')) {
      setData((prev) => ({ ...prev, serviceId: servicio.id, therapistId: 'any', date: fecha, time: hora }));
      setStep(3);
    } else {
      setData((prev) => ({ ...prev, serviceId: servicio.id }));
      setStep(2);
    }
  }, [params, services, therapists]);

  // Cada paso es una pantalla nueva: el foco va a su titulo para que el
  // lector de pantalla la anuncie, y la vista vuelve arriba.
  const primerPaso = useRef(true);
  useEffect(() => {
    if (primerPaso.current) { primerPaso.current = false; return; }
    window.scrollTo(0, 0);
    tituloRef.current?.focus({ preventScroll: true });
  }, [step]);

  const erroresDeDatos = () => {
    const e = validateAppointment(data);
    // Solo los campos de ESTE paso; servicio y horario ya se eligieron.
    const propios = Object.fromEntries(Object.entries(e).filter(([k]) => ['name', 'email', 'phone', 'patientName'].includes(k)));
    if (!data.privacyAccepted) propios.privacyAccepted = 'Para enviar tu solicitud, acepta el aviso de privacidad.';
    return propios;
  };

  const continuarDatos = () => {
    const e = erroresDeDatos();
    setErrors(e);
    if (Object.keys(e).length) {
      // Al primer campo con error, no a un botón deshabilitado sin razón.
      const primero = ['patientName', 'name', 'email', 'phone', 'privacyAccepted'].find((k) => e[k]);
      document.getElementById(`bk-${primero}`)?.focus();
      return;
    }
    setStep(5);
  };

  const confirmBooking = async () => {
    if (saving) return;
    const nextErrors = { ...validateAppointment(data), ...erroresDeDatos() };
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setStep(nextErrors.time || nextErrors.date ? 3 : 4);
      return;
    }
    const assignedTherapistId = data.therapistId === 'any'
      ? therapists.find((item) => item.services?.includes(data.serviceId)
          && poolAvailableSlots({
            date: data.date, therapistId: item.id, serviceId: data.serviceId,
            bookings: ocupadas, services, eligibleTherapists: [item], schedules,
          }).includes(data.time))?.id
      : data.therapistId;
    if (!assignedTherapistId) {
      setErrors({ time: 'Ese horario ya no está disponible. Elige otro.' });
      setStep(3);
      return;
    }

    // La duracion real viaja con la cita: la base calcula con ella el
    // rango que impide encimar dos sesiones del mismo especialista.
    const assignedTherapist = therapists.find((item) => item.id === assignedTherapistId);
    const durationMinutes = Number(service?.duration) || Number(assignedTherapist?.sessionDuration) || 50;

    const newBooking = {
      id: uid(),
      ...data,
      name: data.name.trim(),
      email: data.email.trim(),
      phone: data.phone.trim(),
      patientName: data.forMinor ? data.patientName.trim() : '',
      therapistId: assignedTherapistId,
      durationMinutes,
      notes: '',
      // La base la guarda como solicitud de todos modos (0036); se manda
      // asi para que la pantalla diga lo mismo que la base.
      status: 'requested',
      createdAt: new Date().toISOString(),
      reminderSent: false,
    };
    // Se avanza SOLO cuando la base acepto la cita.
    setSaving(true);
    setErrors({});
    const result = await setBookings([...bookings, newBooking]);
    setSaving(false);
    if (!result?.ok) {
      // Otra persona tomo ese horario mientras se llenaban los datos: la
      // misma hora exacta la rechaza el indice unico (23505); un rango
      // encimado, el EXCLUDE (23P01).
      if (['23P01', '23505'].includes(result?.error?.code)) {
        setErrors({ time: 'Ese horario se acaba de ocupar. Elige otro, por favor.' });
        setStep(3);
        return;
      }
      // P0429: un tope de la reserva publica (0037). El mensaje de la base
      // ya esta escrito para el paciente y dice que hacer.
      if (result?.error?.code === 'P0429') {
        setErrors({ submit: result.error.message });
        return;
      }
      setErrors({ submit: `No pudimos enviar tu solicitud. Revisa tu conexión e inténtalo de nuevo${conWhatsapp ? ', o escríbenos por WhatsApp' : ''}.` });
      return;
    }
    setLinkedBookingId(newBooking.id);
    trackEvent('appointment_requested', {
      serviceId: newBooking.serviceId,
      therapistId: newBooking.therapistId,
      wantsCoffee: newBooking.wantsCoffee,
      forMinor: newBooking.forMinor,
    });
    setData((prev) => ({ ...prev, therapistId: assignedTherapistId }));
    setStep(6);
  };

  const paraQuien = data.forMinor ? data.patientName.trim() : data.name.trim();
  const mensajeWhatsApp = `Hola, acabo de solicitar una cita de ${service?.name || 'terapia'}${data.forMinor ? ` para ${paraQuien}` : ''} el ${data.date ? fullDayLabel(localDate(data.date)) : ''} a las ${data.time}. Quiero confirmarla.`;

  if (step === 6) {
    return (
      <div className="bk bk-done">
        <h1 className="bk-title" ref={tituloRef} tabIndex={-1} style={{ outline: 'none' }}>Solicitud enviada</h1>
        <p className="pub-lead" style={{ margin: '0 auto 24px' }}>
          Te apartamos el horario 24 horas. El consultorio te confirma por WhatsApp{conWhatsapp ? '; si quieres, escríbenos tú primero' : ''}.
        </p>

        {/* El cierre como una comanda: lo que importa, grande. */}
        <div className="pub-ticket" aria-label="Resumen de tu solicitud">
          <p className="pub-ticket-sub">{service?.name} · {service?.duration} min</p>
          <p className="pub-ticket-when">
            {data.date && localDate(data.date).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
            <br />{data.time} h
          </p>
          <hr className="pub-ticket-rule" />
          <div className="pub-ticket-row"><span>Para</span><span>{paraQuien}</span></div>
          {data.forMinor && <div className="pub-ticket-row"><span>Lo trae</span><span>{data.name.trim()}</span></div>}
          <div className="pub-ticket-row"><span>Con</span><span>{therapist?.name || 'Por asignar'}</span></div>
          <div className="pub-ticket-row"><span>Pagas en sitio</span><span>{precio(service?.price)}</span></div>
          <div className="pub-ticket-row"><span>Estado</span><span>Por confirmar</span></div>
          {data.wantsCoffee && (
            <>
              <hr className="pub-ticket-rule" />
              <p className="pub-ticket-sub">Pide tu café ahora y estará listo 10 minutos antes de la cita.</p>
            </>
          )}
        </div>

        <div className="pub-actions">
          {conWhatsapp && (
            <a className="pub-btn pub-btn-primary" href={whatsappUrl(mensajeWhatsApp, business)} target="_blank" rel="noreferrer"
              onClick={() => trackEvent('whatsapp_confirm_click', { source: 'booking_success' })}>
              Confirmar por WhatsApp
            </a>
          )}
          {data.wantsCoffee && <Link className="pub-btn pub-btn-ghost" to="/cafeteria">Pedir mi café</Link>}
          <Link className="pub-btn pub-btn-ghost" to="/mis-citas">Ver mis citas</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bk">
      <button type="button" className="bk-back" onClick={() => (step > 1 ? setStep(step - 1) : setPage('home'))}>
        <ArrowLeft size={18} aria-hidden="true" /> Atrás
      </button>
      <div className="bk-progress" aria-hidden="true">
        {PASOS.map((p, i) => <span key={p} data-hecho={i < step} />)}
      </div>
      <p className="bk-step">Paso {step} de {PASOS.length}</p>
      <h1 className="bk-title" ref={tituloRef} tabIndex={-1} style={{ outline: 'none' }}>{PASOS[step - 1]}</h1>

      {step === 1 && (
        services.length === 0 ? (
          // "Cargando" y "no hay" son cosas distintas (auditoria M2).
          <p className="bk-empty" aria-live="polite">
            {dataLoading ? 'Cargando los servicios…' : `Todavía no hay servicios publicados.${conWhatsapp ? ' Escríbenos por WhatsApp y te agendamos.' : ''}`}
          </p>
        ) : (
          <ul className="bk-options">
            {services.map((s) => {
              // Sin especialista que lo atienda no hay horarios: se dice
              // AQUI, no tres pasos despues en un calendario vacio.
              const conEspecialista = therapists.some((t) => t.services?.includes(s.id));
              return (
                <li key={s.id}>
                  {conEspecialista ? (
                    <button type="button" className="bk-option" aria-pressed={data.serviceId === s.id}
                      onClick={() => { update('serviceId', s.id); setStep(2); }}>
                      <span className="bk-option-name">{s.name}</span>
                      <span className="bk-option-price">{precio(s.price)}</span>
                      <span className="bk-option-meta">{s.duration} min{s.for ? ` · ${s.for}` : ''}{s.desc ? `. ${s.desc}` : ''}</span>
                    </button>
                  ) : (
                    <div className="bk-option" style={{ cursor: 'default', opacity: 0.85 }}>
                      <span className="bk-option-name">{s.name}</span>
                      <span className="bk-option-price">{precio(s.price)}</span>
                      <span className="bk-option-meta">
                        Por ahora no se puede agendar en línea.{' '}
                        {conWhatsapp ? (
                          <><a className="pub-link" target="_blank" rel="noreferrer"
                            href={whatsappUrl(`Hola, quiero una cita de ${s.name}.`, business)}>Pídela por WhatsApp</a>.</>
                        ) : (
                          <><Link className="pub-link" to="/contacto">Contáctanos</Link> para pedirla.</>
                        )}
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}

      {step === 2 && (
        <>
          <p className="bk-intro">Si no tienes preferencia, te asignamos a quien tenga libre el horario que elijas.</p>
          <ul className="bk-options">
            <li>
              <button type="button" className="bk-option" aria-pressed={data.therapistId === 'any'}
                onClick={() => { update('therapistId', 'any'); setStep(3); }}>
                <span className="bk-option-name">Cualquier especialista</span>
                <span />
                <span className="bk-option-meta">Ves más horarios disponibles.</span>
              </button>
            </li>
            {therapists.filter((t) => !data.serviceId || t.services?.includes(data.serviceId)).map((t) => (
              <li key={t.id}>
                <button type="button" className="bk-option" aria-pressed={data.therapistId === t.id}
                  onClick={() => { update('therapistId', t.id); setStep(3); }}>
                  <span className="bk-option-name">
                    <span className="pub-avatar" aria-hidden="true" style={{ display: 'inline-grid', width: 36, height: 36, fontSize: 14, marginRight: 10, verticalAlign: 'middle' }}>{initials(t.name)}</span>
                    {t.name}
                  </span>
                  <span />
                  <span className="bk-option-meta">{t.specialty}{t.cedula ? ` · Cédula ${t.cedula}` : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {step === 3 && (
        <DateTimePicker data={data} update={update} error={errors.time} onContinue={() => setStep(4)}
          bookings={ocupadas} therapists={therapists} services={services} schedules={schedules} business={business} />
      )}

      {step === 4 && (
        <div className="bk-form">
          <fieldset className="bk-fieldset">
            <legend className="pub-label">¿Para quién es la cita?</legend>
            <div className="pub-choice-row">
              <button type="button" className="pub-choice" aria-pressed={!data.forMinor} onClick={() => update('forMinor', false)}>Para mí</button>
              <button type="button" className="pub-choice" aria-pressed={data.forMinor} onClick={() => update('forMinor', true)}>Para mi hijo o hija</button>
            </div>
          </fieldset>

          {data.forMinor && (
            <Field id="bk-patientName" label="Nombre de la niña o el niño" value={data.patientName}
              onChange={(v) => update('patientName', v)} error={errors.patientName} autoComplete="off"
              hint="Así abrimos su expediente. No escribas el motivo de consulta." />
          )}

          {data.forMinor && <h2 className="bk-subhead">Tus datos, como adulto responsable</h2>}
          <Field id="bk-name" label={data.forMinor ? 'Tu nombre completo' : 'Nombre completo'} value={data.name}
            onChange={(v) => update('name', v)} error={errors.name} autoComplete="name" />
          <Field id="bk-email" label="Correo electrónico" type="email" value={data.email}
            onChange={(v) => update('email', v)} error={errors.email} autoComplete="email" inputMode="email" />
          <Field id="bk-phone" label="WhatsApp" type="tel" value={data.phone} placeholder="81 1234 5678"
            onChange={(v) => update('phone', v)} error={errors.phone} autoComplete="tel" inputMode="tel"
            hint="Obligatorio: por aquí te confirmamos la cita." />

          <p className="pub-notice">
            Para cuidar tu privacidad, no pedimos motivos de consulta, diagnósticos ni antecedentes. Eso se platica en persona.
          </p>

          <label className="bk-check bk-panel">
            <input type="checkbox" checked={data.wantsCoffee} onChange={(e) => update('wantsCoffee', e.target.checked)} />
            <span>
              <strong>Quiero un café para ese día</strong><br />
              <span className="pub-hint">
                Al enviar te llevamos al menú y lo tenemos listo 10 minutos antes.
                {comboOffer ? ` ${comboOffer.name}: ${precio(comboOffer.price)}.` : ''}
              </span>
            </span>
          </label>

          <div className="bk-panel" data-error={Boolean(errors.privacyAccepted)}>
            <label className="bk-check">
              <input id="bk-privacyAccepted" type="checkbox" checked={data.privacyAccepted}
                onChange={(e) => update('privacyAccepted', e.target.checked)}
                aria-invalid={Boolean(errors.privacyAccepted)} aria-describedby={errors.privacyAccepted ? 'bk-privacyAccepted-error' : undefined} />
              <span>
                He leído y acepto el{' '}
                <Link className="pub-link" to="/privacidad" target="_blank">aviso de privacidad</Link>.
              </span>
            </label>
            {errors.privacyAccepted && <p id="bk-privacyAccepted-error" className="pub-error" style={{ margin: '8px 0 0' }}>{errors.privacyAccepted}</p>}
          </div>

          <button type="button" className="pub-btn pub-btn-primary bk-submit" onClick={continuarDatos}>Revisar mi solicitud</button>
        </div>
      )}

      {step === 5 && (
        <>
          <div className="bk-summary">
            <h2 className="pub-h3" style={{ margin: 0 }}>{service?.name}</h2>
            <dl>
              <dt>Para</dt><dd>{paraQuien}</dd>
              {data.forMinor && (<><dt>Adulto responsable</dt><dd>{data.name.trim()}</dd></>)}
              <dt>Especialista</dt><dd>{therapist?.name || 'Te asignamos a quien tenga el horario libre'}</dd>
              <dt>Día</dt><dd>{data.date && fullDayLabel(localDate(data.date))}</dd>
              <dt>Hora</dt><dd>{data.time} h · {service?.duration} min</dd>
              <dt>Correo</dt><dd>{data.email.trim()}</dd>
              <dt>WhatsApp</dt><dd>{data.phone.trim()}</dd>
            </dl>
            <div className="bk-total"><span>Pagas en el consultorio</span><strong>{precio(service?.price)}</strong></div>
          </div>

          <p className="pub-notice" style={{ marginBottom: 18 }}>
            Tu solicitud aparta este horario. El consultorio la revisa y te confirma por WhatsApp; si en 24 horas
            no se confirma, el horario se libera.
          </p>

          {errors.submit && <p role="alert" className="pub-error" style={{ margin: '0 0 12px' }}>{errors.submit}</p>}

          <button type="button" className="pub-btn pub-btn-primary bk-submit" style={{ marginTop: 0 }}
            onClick={confirmBooking} disabled={saving} aria-busy={saving}>
            {saving ? 'Enviando tu solicitud…' : 'Enviar solicitud'}
          </button>
        </>
      )}
    </div>
  );
}

function Field({ id, label, value, onChange, type = 'text', placeholder, error, hint, autoComplete, inputMode }) {
  const descr = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="pub-field">
      <label className="pub-label" htmlFor={id}>{label}</label>
      {hint && <span id={`${id}-hint`} className="pub-hint">{hint}</span>}
      <input id={id} className="pub-input" type={type} value={value} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} inputMode={inputMode}
        aria-invalid={Boolean(error)} aria-describedby={descr} />
      {error && <span id={`${id}-error`} className="pub-error">{error}</span>}
    </div>
  );
}

// ============ DIA Y HORA ============

function DateTimePicker({ data, update, error, onContinue, bookings, therapists, services, schedules, business }) {
  const [weekStart, setWeekStart] = useState(() => {
    // Si se llego con fecha puesta (atajo de la portada), se abre ESA semana.
    if (!data.date) return 0;
    const dias = Math.round((localDate(data.date) - new Date(new Date().setHours(0, 0, 0, 0))) / 86400000);
    return Math.max(0, Math.min(4, Math.floor(dias / 7)));
  });
  const eligibleTherapists = useMemo(
    () => therapists.filter((therapist) => !data.serviceId || therapist.services?.includes(data.serviceId)),
    [data.serviceId, therapists],
  );
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), weekStart * 7 + i)), [weekStart]);

  // Un solo motor: el mismo que usa el panel de administracion. Se calcula
  // el estado de TODOS los dias de la semana visible de una vez.
  const estadoPorDia = useMemo(() => {
    const mapa = new Map();
    for (const dia of days) {
      const iso = localISO(dia);
      mapa.set(iso, poolSlotStates({
        date: iso, therapistId: data.therapistId, serviceId: data.serviceId,
        bookings, services, eligibleTherapists, schedules,
      }));
    }
    return mapa;
  }, [days, data.therapistId, data.serviceId, bookings, services, eligibleTherapists, schedules]);

  const delDia = data.date ? (estadoPorDia.get(data.date) || []) : [];
  // Una hora que llego puesta (atajo de la portada) puede haberse ocupado
  // desde entonces. Solo se avanza con una hora que HOY esta libre.
  const horaLibre = delDia.some((s) => s.time === data.time && s.available);
  const hoy = new Date(new Date().setHours(0, 0, 0, 0));
  const rango = `${days[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} al ${days[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}`;

  return (
    <div>
      <div className="bk-week">
        <button type="button" className="pub-icon-btn" onClick={() => setWeekStart(Math.max(0, weekStart - 1))}
          disabled={weekStart === 0} aria-label="Semana anterior">
          <ChevronLeft size={20} />
        </button>
        <span className="bk-week-label" aria-live="polite">Del {rango}</span>
        <button type="button" className="pub-icon-btn" onClick={() => setWeekStart(weekStart + 1)}
          disabled={weekStart >= 4} aria-label="Semana siguiente">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="bk-days" role="group" aria-label="Día">
        {days.map((d) => {
          const iso = localISO(d);
          const isPast = d < hoy;
          const libres = (estadoPorDia.get(iso) || []).filter((s) => s.available).length;
          return (
            <button key={iso} type="button" className="bk-day" aria-pressed={data.date === iso} disabled={isPast}
              onClick={() => { update('date', iso); update('time', null); }}
              aria-label={`${fullDayLabel(d)}, ${libres ? `${libres} horarios libres` : 'sin horarios libres'}`}>
              <span className="bk-day-name">{d.toLocaleDateString('es-MX', { weekday: 'short' })}</span>
              <span className="bk-day-num">{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {!data.date && <p className="bk-empty">Elige un día para ver sus horarios.</p>}

      {data.date && (
        <>
          <h2 className="pub-label" style={{ margin: '0 0 10px' }}>Horarios del {fullDayLabel(localDate(data.date))}</h2>
          {/* Un dia sin horarios se DICE: con el horario real es normal que
              el consultorio no atienda ese dia. */}
          {delDia.length === 0 && (
            <p className="bk-empty">
              Ese día no hay horarios. Prueba con otro{hayWhatsapp(business) ? (
                <>, o{' '}<a className="pub-link" href={whatsappUrl('Hola, busco un horario para una cita.', business)} target="_blank" rel="noreferrer">escríbenos por WhatsApp</a></>
              ) : null}.
            </p>
          )}
          <div className="bk-times" role="group" aria-label="Hora">
            {delDia.map((slot) => (
              <button key={slot.time} type="button" className="bk-time" aria-pressed={data.time === slot.time}
                disabled={!slot.available} onClick={() => update('time', slot.time)}
                aria-label={slot.available ? `${slot.time} horas` : `${slot.time} horas, ${slot.reason?.toLowerCase() || 'no disponible'}`}>
                {slot.time}
              </button>
            ))}
          </div>
          {error && <p role="alert" className="pub-error" style={{ margin: '12px 0 0' }}>{error}</p>}
          {!error && data.time && !horaLibre && (
            <p role="status" className="pub-hint" style={{ margin: '12px 0 0' }}>Las {data.time} ya no está libre ese día. Elige otra hora.</p>
          )}
          <button type="button" className="pub-btn pub-btn-primary bk-submit" onClick={onContinue} disabled={!horaLibre}>
            Continuar
          </button>
        </>
      )}
    </div>
  );
}
