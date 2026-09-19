import React from 'react';
import { AtSign, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { C } from '../theme';
import { businessFromSettings, whatsappUrl } from '../businessInfo';
import { esExterna, hrefSeguro } from '../safeUrl.mjs';
import { trackEvent } from '../monitoring';

export default function ContactPage({ settings }) {
  const business = businessFromSettings(settings);
  const cards = [
    // Los dos campos que el admin escribe LIBRES pasan por el saneador:
    // su valor ocupa el href entero, asi que un esquema ejecutable ahi se
    // le sirve a todo visitante. Ver src/safeUrl.mjs.
    //
    // Los demas NO lo necesitan y por eso no lo llevan: en 'tel:',
    // 'mailto:' y el de WhatsApp el esquema esta FIJO en el codigo y lo
    // del admin va detras, asi que no puede introducir uno nuevo. Marcar
    // todo por igual escondaria cual es el que de verdad decide.
    { icon: MessageCircle, label: 'WhatsApp', value: 'Contacto rapido para dudas, pedidos y citas.', href: whatsappUrl('Hola, quiero informacion de Brainpsi Coffee.', business) },
    { icon: MapPin, label: 'Ubicacion', value: business.address, href: hrefSeguro(business.mapsUrl) },
    { icon: Phone, label: 'Telefono', value: business.phone, href: `tel:${business.phone}` },
    { icon: Mail, label: 'Correo', value: business.email, href: `mailto:${business.email}` },
    { icon: AtSign, label: 'Instagram', value: '@brainpsicoffee', href: hrefSeguro(business.instagram) },
  ];

  return (
    <div style={{ padding: '36px 20px 70px', maxWidth: 920, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: 11, color: C.sageDark, fontWeight: 800, letterSpacing: 2 }}>CONTACTO</span>
        <h1 className="font-display" style={{ fontSize: 38, color: C.brown, margin: '4px 0 8px', fontWeight: 600 }}>Estamos cerca</h1>
        <p style={{ fontSize: 15, color: C.brownMid, lineHeight: 1.6, maxWidth: 620, margin: 0 }}>
          Escríbenos para confirmar disponibilidad, resolver dudas sobre terapia o pedir información de la cafetería.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginBottom: 18 }}>
        {cards.map((card) => {
          // Sin href seguro la tarjeta se pinta pero NO enlaza: la
          // direccion y el telefono siguen siendo informacion util aunque
          // el enlace no se pueda ofrecer. Un enlace muerto es mejor que
          // uno que ejecuta, y esconder el dato seria perder dos cosas.
          const Envoltura = card.href ? 'a' : 'div';
          const props = card.href
            ? {
                href: card.href,
                onClick: () => trackEvent('contact_click', { channel: card.label }),
                // Se decide sobre la url YA saneada, nunca sobre la cruda.
                // Antes era card.href.startsWith(...), que ademas reventaba
                // si el campo llegaba nulo desde la base.
                target: esExterna(card.href) ? '_blank' : undefined,
                rel: 'noreferrer',
              }
            : {};
          return (
            <Envoltura key={card.label} {...props} style={{
              background: C.creamLight,
              border: `1px solid ${C.sagePale}`,
              borderRadius: 16,
              padding: 18,
              color: C.brown,
              textDecoration: 'none',
              display: 'grid',
              gap: 8
            }}>
              <card.icon size={20} color={C.sageDark} />
              <strong style={{ fontSize: 14 }}>{card.label}</strong>
              <span style={{ fontSize: 13, color: C.brownMid, lineHeight: 1.45 }}>{card.value}</span>
            </Envoltura>
          );
        })}
      </div>

      <div style={{ background: C.creamLight, border: `1px solid ${C.sagePale}`, borderRadius: 16, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.brown, fontWeight: 800, marginBottom: 10 }}>
          <Clock size={18} color={C.caramel} /> Horarios
        </div>
        {business.hours.map((hour) => (
          <div key={hour} style={{ fontSize: 13, color: C.brownMid, marginTop: 4 }}>{hour}</div>
        ))}
      </div>
    </div>
  );
}
