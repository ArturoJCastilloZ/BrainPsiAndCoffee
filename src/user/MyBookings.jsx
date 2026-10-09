import React from 'react';
import { Link } from 'react-router-dom';
import { businessFromSettings, hayWhatsapp, whatsappUrl } from '../businessInfo';
import { fullDayLabel, localDate } from '../utils.jsx';
import { solicitudVencida } from '../appointmentStatus.mjs';

// Lo que la pantalla le dice al paciente sobre su cita. Una solicitud
// (0036) no es una cita confirmada, y una que nadie confirmo a tiempo
// tampoco: decirle "confirmada" lo haria presentarse a una cita que no hay.
const etiquetaEstado = (booking, isPast) => {
  if (booking.status === 'cancelled') return 'Cancelada';
  if (booking.status === 'requested') {
    return solicitudVencida(booking) || isPast ? 'No se confirmó' : 'Por confirmar';
  }
  return isPast ? 'Completada' : 'Confirmada';
};

// Solo las citas pedidas DESDE ESTE NAVEGADOR en esta visita (misCitas).
//
// Antes listaba todo lo que hubiera en `bookings`: para un visitante era
// lo suyo, pero un admin con sesion que abria el sitio publico veia aqui
// las citas de TODA la clinica, con nombres. Y ofrecia "Cancelar" y
// "Reagendar", que sin sesion la base no permite: el visitante veia un
// aviso de exito y la clinica lo seguia esperando (auditoria C3). Los
// cambios van por WhatsApp hasta que exista un enlace de gestion seguro.
export default function MyBookings({ bookings, misCitas = [], catalogs }) {
  const services = catalogs?.services || [];
  const therapists = catalogs?.therapists || [];
  const business = businessFromSettings(catalogs?.settings);
  const conWhatsapp = hayWhatsapp(business);
  const mias = (bookings || [])
    .filter((b) => misCitas.includes(b.id))
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  return (
    <>
      <section className="pub-hero" style={{ paddingBottom: 24 }}>
        <div className="pub-wrap" style={{ maxWidth: 760 }}>
          <h1 className="pub-hero-title">Mis citas</h1>
          <p className="pub-hero-lead">
            Aquí ves las solicitudes que hiciste desde este dispositivo mientras la página esté abierta.
            Para cambiar o cancelar una cita, {conWhatsapp ? 'escríbenos por WhatsApp' : <Link className="pub-link" to="/contacto">contáctanos</Link>}.
          </p>
        </div>
      </section>

      <section className="pub-wrap" style={{ maxWidth: 760, paddingBottom: 56 }}>
        {mias.length === 0 ? (
          <div className="bk-empty">
            <p style={{ margin: '0 0 16px' }}>No hay solicitudes en esta visita.</p>
            <div className="pub-actions" style={{ justifyContent: 'center' }}>
              <Link to="/reservar" className="pub-btn pub-btn-primary">Solicitar una cita</Link>
              {conWhatsapp && (
                <a className="pub-btn pub-btn-ghost" target="_blank" rel="noreferrer"
                  href={whatsappUrl('Hola, quiero consultar mi cita.', business)}>
                  Consultar por WhatsApp
                </a>
              )}
            </div>
          </div>
        ) : (
          <ul className="bk-options">
            {mias.map((b) => {
              const service = services.find((s) => s.id === b.serviceId);
              const therapist = therapists.find((t) => t.id === b.therapistId);
              const isPast = new Date(`${b.date}T${b.time}`) < new Date();
              const dia = fullDayLabel(localDate(b.date));
              const para = b.forMinor ? b.patientName : b.name;
              return (
                <li key={b.id} className="bk-summary" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <h2 className="pub-h3" style={{ margin: 0 }}>{service?.name || 'Cita'}</h2>
                    <strong>{etiquetaEstado(b, isPast)}</strong>
                  </div>
                  <dl>
                    <dt>Para</dt><dd>{para}</dd>
                    <dt>Día</dt><dd>{dia}</dd>
                    <dt>Hora</dt><dd>{b.time} h</dd>
                    <dt>Con</dt><dd>{therapist?.name || 'Por asignar'}</dd>
                  </dl>
                  {conWhatsapp && !isPast && b.status !== 'cancelled' && (
                    <p style={{ margin: '14px 0 0' }}>
                      <a className="pub-link" target="_blank" rel="noreferrer"
                        href={whatsappUrl(`Hola, quiero cambiar o cancelar la cita de ${service?.name || 'terapia'}${b.forMinor ? ` de ${para}` : ''} del ${dia} a las ${b.time}.`, business)}>
                        Cambiar o cancelar por WhatsApp
                      </a>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
