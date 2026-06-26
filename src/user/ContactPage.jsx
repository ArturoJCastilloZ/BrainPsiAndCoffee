import React from 'react';
import { AtSign, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { C } from '../theme';
import { businessFromSettings, whatsappUrl } from '../businessInfo';
import { trackEvent } from '../monitoring';

export default function ContactPage({ settings }) {
  const business = businessFromSettings(settings);
  const cards = [
    { icon: MessageCircle, label: 'WhatsApp', value: 'Contacto rapido para dudas, pedidos y citas.', href: whatsappUrl('Hola, quiero informacion de Brainpsi Coffee.', business) },
    { icon: MapPin, label: 'Ubicacion', value: business.address, href: business.mapsUrl },
    { icon: Phone, label: 'Telefono', value: business.phone, href: `tel:${business.phone}` },
    { icon: Mail, label: 'Correo', value: business.email, href: `mailto:${business.email}` },
    { icon: AtSign, label: 'Instagram', value: '@brainpsicoffee', href: business.instagram },
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
        {cards.map((card) => (
          <a key={card.label} href={card.href} onClick={() => trackEvent('contact_click', { channel: card.label })} target={card.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" style={{
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
          </a>
        ))}
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
