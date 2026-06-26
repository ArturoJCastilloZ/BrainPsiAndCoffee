import React from 'react';
import { Calendar as CalendarIcon, HeartHandshake, Laptop, MapPin, MessageCircle, ShieldCheck } from 'lucide-react';
import { C } from '../theme';
import { THERAPISTS, THERAPY_SERVICES } from '../data';
import { businessFromSettings, whatsappUrl } from '../businessInfo';
import { formatMXN } from '../utils.jsx';

export default function TherapyPage({ catalogs, setPage }) {
  const services = (catalogs?.services || THERAPY_SERVICES).filter((item) => item.active !== false);
  const therapists = (catalogs?.therapists || THERAPISTS).filter((item) => item.active !== false);
  const business = businessFromSettings(catalogs?.settings);

  return (
    <div style={{ paddingBottom: 70 }}>
      <section style={{ padding: '54px 20px 42px', background: `linear-gradient(180deg, ${C.creamLight}, ${C.ivory})` }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <span style={{ fontSize: 11, color: C.sageDark, fontWeight: 800, letterSpacing: 2 }}>TERAPIA PSICOLOGICA</span>
          <h1 className="font-display" style={{ fontSize: 'clamp(38px, 8vw, 62px)', color: C.brown, lineHeight: 1.02, margin: '8px 0 14px', fontWeight: 600 }}>
            Acompanamiento profesional, claro y confidencial.
          </h1>
          <p style={{ fontSize: 16, color: C.brownMid, lineHeight: 1.65, maxWidth: 680, margin: '0 0 22px' }}>
            Agenda una primera sesion de psicologia o neuropsicologia. Para proteger tu privacidad, el formulario solo solicita datos de contacto y agenda.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setPage('book')} style={primaryButton}>
              <CalendarIcon size={17} /> Solicitar cita
            </button>
            <a href={whatsappUrl('Hola, quiero informacion sobre terapia psicologica.', business)} style={secondaryButton}>
              <MessageCircle size={17} /> WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          <TrustItem icon={ShieldCheck} title="Privacidad primero" body="No solicitamos detalles clinicos en formularios publicos." />
          <TrustItem icon={MapPin} title="Presencial" body={`${business.city}. Confirma ubicacion y disponibilidad por contacto directo.`} />
          <TrustItem icon={Laptop} title="En linea" body="La modalidad en linea puede confirmarse segun servicio y profesional." />
        </div>
      </section>

      <section style={{ maxWidth: 980, margin: '0 auto', padding: '8px 20px 28px' }}>
        <SectionHeading eyebrow="Servicios" title="Opciones de atencion" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
          {services.map((service) => (
            <div key={service.id} style={card}>
              <div className="font-display" style={{ fontSize: 20, color: C.brown, fontWeight: 700, lineHeight: 1.2 }}>{service.name}</div>
              <p style={{ color: C.brownMid, fontSize: 13, lineHeight: 1.55 }}>{service.desc}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: C.sageDark, fontWeight: 800, fontSize: 13 }}>
                <span>{service.duration} min</span>
                <span>{formatMXN(service.price)}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 980, margin: '0 auto', padding: '8px 20px 34px' }}>
        <SectionHeading eyebrow="Profesionales" title="Equipo" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>
          {therapists.map((therapist) => (
            <div key={therapist.id} style={card}>
              <div style={{ width: 42, height: 42, borderRadius: 999, background: therapist.color || C.sageDark, color: '#1E1B18', display: 'grid', placeItems: 'center', fontWeight: 900, marginBottom: 10 }}>
                {therapist.name.split(' ').slice(0, 2).map((part) => part[0]).join('')}
              </div>
              <div className="font-display" style={{ fontSize: 18, color: C.brown, fontWeight: 700 }}>{therapist.name}</div>
              <div style={{ color: C.brownMid, fontSize: 13, marginTop: 4 }}>{therapist.specialty}</div>
              <div style={{ color: C.brownLight, fontSize: 12, marginTop: 8 }}>Ced. {therapist.cedula || 'por confirmar'}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ maxWidth: 980, margin: '0 auto', padding: '0 20px 42px' }}>
        <div style={{ background: C.sagePale, borderRadius: 16, padding: 18, color: C.sageDeep, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <HeartHandshake size={20} style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Este sitio no sustituye atencion de emergencia. Si estas en una situacion de riesgo, contacta servicios de emergencia locales o una unidad de atencion inmediata.
          </div>
        </div>
      </section>
    </div>
  );
}

function TrustItem({ icon: Icon, title, body }) {
  return (
    <div style={card}>
      <Icon size={20} color={C.sageDark} />
      <div style={{ color: C.brown, fontWeight: 800, marginTop: 8 }}>{title}</div>
      <div style={{ color: C.brownMid, fontSize: 13, lineHeight: 1.5, marginTop: 4 }}>{body}</div>
    </div>
  );
}

function SectionHeading({ eyebrow, title }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={{ fontSize: 11, color: C.sageDark, fontWeight: 800, letterSpacing: 2 }}>{eyebrow.toUpperCase()}</span>
      <h2 className="font-display" style={{ color: C.brown, fontSize: 30, margin: '4px 0 0', fontWeight: 600 }}>{title}</h2>
    </div>
  );
}

const card = {
  background: C.creamLight,
  border: `1px solid ${C.sagePale}`,
  borderRadius: 16,
  padding: 18,
};

const primaryButton = {
  background: 'var(--bp-primary)',
  color: 'var(--bp-primary-contrast)',
  border: 'none',
  padding: '13px 20px',
  borderRadius: 999,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  fontWeight: 800,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textDecoration: 'none',
};

const secondaryButton = {
  ...primaryButton,
  background: 'transparent',
  color: C.brown,
  border: `1.5px solid ${C.brown}`,
};
