import React from 'react';
import { businessFromSettings, hayWhatsapp, tieneDato, usuarioInstagram, whatsappUrl } from '../businessInfo';
import { esExterna, hrefSeguro } from '../safeUrl.mjs';
import { trackEvent } from '../monitoring';
import ResenasGoogle from './ResenasGoogle';

export default function ContactPage({ settings, locations = [] }) {
  const business = businessFromSettings(settings);
  // Sucursales (0040). Con alguna capturada, la direccion de Negocio se
  // sustituye por la lista: cada una con su direccion y su mapa.
  const sucursales = (locations || []).filter((l) => l.active !== false);
  const canales = [
    // Los dos campos que el admin escribe LIBRES pasan por el saneador:
    // su valor ocupa el href entero, asi que un esquema ejecutable ahi se
    // le sirve a todo visitante. Ver src/safeUrl.mjs.
    //
    // Los demas NO lo necesitan y por eso no lo llevan: en 'tel:',
    // 'mailto:' y el de WhatsApp el esquema esta FIJO en el codigo y lo
    // del admin va detras, asi que no puede introducir uno nuevo. Marcar
    // todo por igual escondaria cual es el que de verdad decide.
    hayWhatsapp(business) && { label: 'WhatsApp', value: 'Dudas, citas y pedidos de la cafetería.', href: whatsappUrl('Hola, quiero información de Brainpsi Coffee.', business) },
    ...(sucursales.length
      ? sucursales.map((l) => ({
        label: sucursales.length > 1 ? l.name : 'Dirección',
        value: l.address || l.name,
        href: hrefSeguro(l.mapsUrl),
        nota: l.hasCafe && sucursales.length > 1 ? 'Con cafetería' : '',
      }))
      : [tieneDato(business.address) && { label: 'Dirección', value: business.address, href: hrefSeguro(business.mapsUrl), accion: 'Abrir en el mapa' }]),
    tieneDato(business.phone) && { label: 'Teléfono', value: business.phone, href: `tel:${business.phone}` },
    tieneDato(business.email) && { label: 'Correo', value: business.email, href: `mailto:${business.email}` },
    tieneDato(business.instagram) && { label: 'Instagram', value: usuarioInstagram(business.instagram) || 'Instagram', href: hrefSeguro(business.instagram) },
    // Solo lo que el negocio capturo: un "Telefono" sin numero se veia
    // como un hueco en la pagina.
  ].filter(Boolean);

  return (
    <>
      <section className="pub-hero">
        <div className="pub-wrap pub-hero-grid">
          <div>
            <h1 className="pub-hero-title">Contacto</h1>
            <p className="pub-hero-lead">
              {/* "Por WhatsApp respondemos mas rapido" solo si hay WhatsApp:
                  sin numero, prometia un canal que no existe. */}
              {hayWhatsapp(business)
                ? 'Escríbenos para confirmar disponibilidad, resolver dudas sobre terapia o preguntar por la cafetería. Por WhatsApp respondemos más rápido.'
                : 'Aquí están nuestro horario, dónde encontrarnos y cómo contactarnos para dudas sobre terapia o la cafetería.'}
            </p>
          </div>
          <section className="pub-board" aria-labelledby="horario">
            <h2 className="pub-board-title" id="horario">Horario</h2>
            <ul className="pub-board-list">
              {business.hours.map((h) => (
                <li key={h} className="pub-board-item"><div className="pub-board-row"><span className="pub-board-name" style={{ fontSize: 19 }}>{h}</span></div></li>
              ))}
            </ul>
            <p className="pub-board-foot">{business.city}</p>
          </section>
        </div>
      </section>

      {canales.length > 0 && <section className="pub-section pub-section-alt">
        <div className="pub-wrap">
          <h2 className="pub-h2">Dónde encontrarnos</h2>
          <ul className="pub-facts">
            {canales.map((c) => (
              <li key={c.label} className="pub-fact">
                <strong>{c.label}</strong>
                {/* Sin href seguro se muestra el dato pero NO enlaza: la
                    direccion sigue siendo util aunque el enlace no se pueda
                    ofrecer. Un enlace muerto es mejor que uno que ejecuta. */}
                {c.href ? (
                  <a className="pub-link" href={c.href}
                    onClick={() => trackEvent('contact_click', { channel: c.label })}
                    // Se decide sobre la url YA saneada, nunca sobre la cruda.
                    target={esExterna(c.href) ? '_blank' : undefined} rel="noreferrer">
                    {c.value}
                  </a>
                ) : <span>{c.value}</span>}
                {c.nota && <span className="pub-hint">{c.nota}</span>}
              </li>
            ))}
          </ul>
        </div>
      </section>}

      <ResenasGoogle settings={settings} />
    </>
  );
}
