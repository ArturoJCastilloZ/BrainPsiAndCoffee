import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { businessFromSettings, whatsappUrl } from '../businessInfo';
import { activeOffers } from '../offerUtils.mjs';
import { enlaceReserva, proximosHorarios } from '../nextSlots.mjs';
import { localDate } from '../utils.jsx';
import { trackEvent } from '../monitoring';
import Pizarron, { precio } from './Pizarron';

const etiquetaDia = (iso) => localDate(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });

export default function UserHome({ catalogs, dataLoading }) {
  const services = (catalogs?.services || []).filter((s) => s.active !== false);
  const therapists = (catalogs?.therapists || []).filter((t) => t.active !== false);
  const business = businessFromSettings(catalogs?.settings);
  const combo = activeOffers(catalogs?.offers || []).find((o) => o.kind === 'combo');
  const menu = catalogs?.menu || {};
  const bebidas = [...(menu.hot?.items || []), ...(menu.cold?.items || [])]
    .filter((i) => i.active !== false).slice(0, 5);

  // Los proximos horarios del primer servicio que alguien atiende. Con el
  // catalogo vacio (o sin horarios) no se pinta nada: un atajo que no
  // lleva a ningun horario es peor que no tenerlo.
  const servicioConAgenda = services.find((s) => therapists.some((t) => t.services?.includes(s.id)));
  const horarios = useMemo(() => proximosHorarios({
    serviceId: servicioConAgenda?.id,
    services, therapists, schedules: catalogs?.schedules || [], bookings: catalogs?.busy || [],
  }), [servicioConAgenda?.id, services, therapists, catalogs?.schedules, catalogs?.busy]);

  const cargando = dataLoading && services.length === 0;

  return (
    <>
      <section className="pub-hero">
        <div className="pub-wrap pub-hero-grid">
          <div>
            <h1 className="pub-hero-title">Un cafecito y lo hablamos.</h1>
            <p className="pub-hero-lead">
              Psicología y neuropsicología infantil en Monterrey. <strong>Precio a la vista</strong>,
              {' '}solicitud en línea y un café para quien acompaña mientras su hijo o hija está en sesión.
            </p>
            <div className="pub-actions">
              <Link to="/reservar" className="pub-btn pub-btn-primary">Ver horarios disponibles</Link>
              <a className="pub-btn pub-btn-ghost" target="_blank" rel="noreferrer"
                href={whatsappUrl('Hola, quiero información para agendar una cita.', business)}
                onClick={() => trackEvent('whatsapp_click', { source: 'home_hero' })}>
                Prefiero escribir por WhatsApp
              </a>
            </div>

            {horarios.length > 0 && (
              <div className="pub-slots">
                <p className="pub-slots-title">Próximos horarios para {servicioConAgenda.name.toLowerCase()}:</p>
                <ul className="pub-slots-list">
                  {horarios.map((h) => (
                    <li key={`${h.date}-${h.time}`}>
                      <Link className="pub-slot" to={enlaceReserva({ serviceId: servicioConAgenda.id, date: h.date, time: h.time })}
                        onClick={() => trackEvent('home_slot_click', { date: h.date, time: h.time })}>
                        {etiquetaDia(h.date)} <strong>{h.time}</strong>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <Pizarron
            id="pizarron-consulta"
            titulo="La consulta"
            nota="Lo que dura y lo que cuesta, antes de pedir nada."
            items={services.map((s) => ({
              id: s.id,
              nombre: s.name,
              tiempo: `${s.duration} min`,
              precio: precio(s.price),
              detalle: s.desc,
              href: enlaceReserva({ serviceId: s.id }),
            }))}
            vacio={cargando ? 'Cargando el pizarrón…' : 'Todavía no hay servicios publicados. Escríbenos por WhatsApp y te contamos.'}
            pie="Pagas en el consultorio el día de tu cita. Sin cobros en línea."
          />
        </div>
      </section>

      <section className="pub-section" aria-label="Por qué Brainpsi">
        <div className="pub-wrap">
          <ul className="pub-facts">
            {/* "Especialistas con cedula verificable" queda pendiente: la vista
                publica no expone la cedula (decision de 0005), y afirmarlo sin
                mostrarla seria prometer algo que la pagina no cumple. */}
            <li className="pub-fact"><strong>Precio a la vista</strong><span>Duración y costo antes de dejar ningún dato.</span></li>
            <li className="pub-fact"><strong>Consultorio privado</strong><span>La sesión es a puerta cerrada; el café, afuera.</span></li>
            <li className="pub-fact"><strong>Pagas en sitio</strong><span>Nada se cobra por internet.</span></li>
            <li className="pub-fact"><strong>Te confirmamos por WhatsApp</strong><span>Una persona revisa cada solicitud.</span></li>
          </ul>
        </div>
      </section>

      <section className="pub-section pub-section-alt">
        <div className="pub-wrap pub-two">
          <div>
            <h2 className="pub-h2">Mientras está en sesión, tú te tomas un café.</h2>
            <p className="pub-lead">
              Pídelo al solicitar tu cita y lo tenemos listo diez minutos antes de que llegues.
              Cada bebida lleva el nombre de un estado de ánimo: elige el tuyo.
            </p>
            <Link to="/cafeteria" className="pub-btn pub-btn-ghost">Ver la cafetería</Link>
          </div>
          <Pizarron
            id="pizarron-cafe"
            titulo="Para quien acompaña"
            items={bebidas.map((b) => ({
              id: b.id, nombre: b.name, precio: precio(b.price), detalle: b.sub, href: '/cafeteria',
            }))}
            vacio={dataLoading ? 'Cargando el menú…' : 'El menú se publica muy pronto.'}
            pie={combo ? `${combo.name}: ${precio(combo.price)}. ${combo.desc || ''}`.trim() : null}
          />
        </div>
      </section>

      <section className="pub-section">
        <div className="pub-wrap">
          <h2 className="pub-h2">Cómo se pide una cita</h2>
          <ol className="pub-steps">
            <li className="pub-step">
              <h3 className="pub-h3">Eliges servicio y horario</h3>
              <p>Ves la duración y el precio antes de dejar ningún dato.</p>
            </li>
            <li className="pub-step">
              <h3 className="pub-h3">Envías tu solicitud</h3>
              <p>Nombre, correo y WhatsApp. Nada clínico: eso se platica en consulta.</p>
            </li>
            <li className="pub-step">
              <h3 className="pub-h3">Te confirmamos</h3>
              <p>Por WhatsApp. Tu horario queda apartado 24 horas mientras lo revisamos.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="pub-section pub-section-alt">
        <div className="pub-wrap">
          <p className="pub-quote">Que ir a terapia sea tan cotidiano como ir por un café.</p>
          <p style={{ margin: '20px 0 0' }}><Link className="pub-link" to="/nosotros">Quiénes somos y por qué lo hacemos así</Link></p>
        </div>
      </section>
    </>
  );
}
