import React from 'react';
import { AlertTriangle, FileText, ShieldCheck } from 'lucide-react';
import { C } from '../theme';
import { businessFromSettings, whatsappUrl } from '../businessInfo';

export default function PrivacyPage({ settings }) {
  const business = businessFromSettings(settings);
  return (
    <div style={{ padding: '36px 20px 70px', maxWidth: 880, margin: '0 auto' }}>
      <span style={{ fontSize: 11, color: C.sageDark, fontWeight: 800, letterSpacing: 2 }}>PRIVACIDAD</span>
      <h1 className="font-display" style={{ fontSize: 38, color: C.brown, margin: '4px 0 14px', fontWeight: 600 }}>Aviso de privacidad y uso responsable</h1>
      <p style={{ fontSize: 15, color: C.brownMid, lineHeight: 1.65 }}>
        Esta version del sitio usa tus datos de contacto solo para responder solicitudes, confirmar citas y dar seguimiento operativo. No compartas detalles clinicos sensibles en formularios publicos.
      </p>

      <InfoBlock icon={ShieldCheck} title="Datos que podemos solicitar">
        Nombre, correo, telefono, servicio de interes, fecha y hora solicitada. Para temas clinicos o de emergencia, utiliza contacto directo con el profesional o servicios de emergencia.
      </InfoBlock>
      <InfoBlock icon={AlertTriangle} title="Informacion sensible">
        Evita escribir diagnosticos, antecedentes, crisis, medicamentos o informacion de terceros en campos libres. El primer contacto puede hacerse por WhatsApp para orientar el siguiente paso.
      </InfoBlock>
      <InfoBlock icon={FileText} title="Importante">
        Este sitio no sustituye atencion psicologica, medica ni servicios de emergencia. Si estas en una situacion de riesgo, contacta a emergencias locales o acude a una unidad de atencion inmediata.
      </InfoBlock>

      <div style={{ marginTop: 22, padding: 18, borderRadius: 16, background: C.sagePale, color: C.sageDeep, fontSize: 13, lineHeight: 1.6 }}>
        Responsable: {business.legalName}. Para ejercer derechos relacionados con tus datos o solicitar mas informacion, escribe a <a href={`mailto:${business.email}`} style={{ color: C.sageDeep, fontWeight: 800 }}>{business.email}</a> o por <a href={whatsappUrl('Hola, quiero informacion sobre privacidad de mis datos.', business)} style={{ color: C.sageDeep, fontWeight: 800 }}>WhatsApp</a>.
      </div>
    </div>
  );
}

function InfoBlock({ icon: Icon, title, children }) {
  return (
    <div style={{ background: C.creamLight, border: `1px solid ${C.sagePale}`, borderRadius: 16, padding: 18, marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, color: C.brown, fontWeight: 800 }}>
        <Icon size={18} color={C.sageDark} /> {title}
      </div>
      <div style={{ fontSize: 13, color: C.brownMid, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}
