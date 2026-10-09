import React from 'react';
import { Link } from 'react-router-dom';
import { businessFromSettings, hayWhatsapp, whatsappUrl } from '../businessInfo';
import { enlaceReserva } from '../nextSlots.mjs';
import { initials } from '../utils.jsx';
import Pizarron, { precio } from './Pizarron';

export default function TherapyPage({ catalogs, dataLoading }) {
  const services = (catalogs?.services || []).filter((s) => s.active !== false);
  const therapists = (catalogs?.therapists || []).filter((t) => t.active !== false);
  const business = businessFromSettings(catalogs?.settings);
  // "Cargando" y "no hay" son cosas distintas, y se dicen distinto. Antes
  // esta pagina afirmaba "no hay servicios" mientras la consulta seguia en
  // camino.
  const cargando = dataLoading && services.length === 0;

  return (
    <>
      <section className="pub-hero">
        <div className="pub-wrap pub-hero-grid">
          <div>
            <h1 className="pub-hero-title">Terapia con precio a la vista.</h1>
            <p className="pub-hero-lead">
              Psicología y neuropsicología para niñas, niños y adultos. Cada servicio dice cuánto dura
              y cuánto cuesta antes de que pidas la cita; el formulario solo pide datos de contacto.
            </p>
            <div className="pub-actions">
              <Link to="/reservar" className="pub-btn pub-btn-primary">Ver horarios disponibles</Link>
              {hayWhatsapp(business) && (
                <a className="pub-btn pub-btn-ghost" target="_blank" rel="noreferrer"
                  href={whatsappUrl('Hola, quiero información sobre terapia.', business)}>
                  Preguntar por WhatsApp
                </a>
              )}
            </div>
          </div>
          <Pizarron
            id="pizarron-terapia"
            titulo="Servicios"
            items={services.map((s) => ({
              id: s.id,
              nombre: s.name,
              tiempo: `${s.duration} min`,
              precio: precio(s.price),
              detalle: [s.for, s.desc].filter(Boolean).join(' · '),
              href: enlaceReserva({ serviceId: s.id }),
            }))}
            vacio={cargando ? 'Cargando el pizarrón…' : `Todavía no hay servicios publicados.${hayWhatsapp(business) ? ' Escríbenos por WhatsApp y te contamos qué hay disponible.' : ''}`}
            pie="Pagas en el consultorio el día de tu cita."
          />
        </div>
      </section>

      <section className="pub-section pub-section-alt">
        <div className="pub-wrap">
          <h2 className="pub-h2">Quién te atiende</h2>
          {therapists.length === 0 ? (
            <p className="pub-lead">
              {dataLoading ? 'Cargando el equipo…' : 'Estamos por publicar al equipo. Mientras, escríbenos y te decimos quién atiende cada servicio.'}
            </p>
          ) : (
            <ul className="pub-people">
              {therapists.map((t) => (
                <li key={t.id} className="pub-person">
                  <span className="pub-avatar" aria-hidden="true">{initials(t.name)}</span>
                  <div>
                    <h3 className="pub-h3" style={{ margin: 0 }}>{t.name}</h3>
                    <p className="pub-person-meta">{t.specialty}</p>
                    <p className="pub-person-meta">
                      {t.cedula ? `Cédula profesional ${t.cedula}` : 'Cédula profesional por publicar'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="pub-section">
        <div className="pub-wrap pub-two">
          <div>
            <h2 className="pub-h2">Antes de la primera cita</h2>
            <p className="pub-lead">
              La primera sesión sirve para conocerse y acordar qué sigue. Si la cita es para tu hijo o
              hija, la solicitas tú a su nombre y vienen juntos.
            </p>
          </div>
          <div style={{ display: 'grid', gap: 16 }}>
            <p className="pub-notice">
              Por privacidad, el formulario no pide motivos de consulta, diagnósticos ni antecedentes.
              Eso se platica en persona.
            </p>
            <p className="pub-notice">
              Este sitio no atiende emergencias. Si hay riesgo inmediato, llama al 911 o a la Línea de la
              Vida, 800 911 2000, gratuita y disponible las 24 horas.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
