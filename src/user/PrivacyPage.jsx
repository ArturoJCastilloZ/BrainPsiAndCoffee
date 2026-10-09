import React from 'react';
import { businessFromSettings, whatsappUrl } from '../businessInfo';

// OJO: esto NO es el aviso de privacidad integral que pide la LFPDPPP.
// Ese lo redacta un abogado (auditoria, seccion 3 · cumplimiento). Esta
// pagina dice la verdad sobre lo que el sitio hace hoy mientras tanto.
export default function PrivacyPage({ settings }) {
  const business = businessFromSettings(settings);
  return (
    <>
      <section className="pub-hero">
        <div className="pub-wrap">
          <h1 className="pub-hero-title">Aviso de privacidad</h1>
          <p className="pub-hero-lead">
            Usamos tus datos de contacto solo para responderte, confirmar tus citas y dar seguimiento a tus pedidos.
          </p>
        </div>
      </section>

      <section className="pub-section pub-section-alt">
        <div className="pub-wrap" style={{ maxWidth: 760 }}>
          <h2 className="pub-h3">Qué datos pedimos</h2>
          <p>Nombre, correo, teléfono, el servicio que te interesa y la fecha y hora que solicitas. Si la cita es para una niña o un niño, también su nombre.</p>

          <h2 className="pub-h3" style={{ marginTop: 28 }}>Qué no debes enviarnos por aquí</h2>
          <p>Diagnósticos, antecedentes, medicamentos, crisis o información de otras personas. Eso se platica en consulta, no en un formulario.</p>

          <h2 className="pub-h3" style={{ marginTop: 28 }}>Emergencias</h2>
          <p>Este sitio no sustituye la atención psicológica, médica ni de emergencia. Si hay riesgo, llama al 911 o a la Línea de la Vida, 800 911 2000.</p>

          <h2 className="pub-h3" style={{ marginTop: 28 }}>Tus derechos</h2>
          <p style={{ marginBottom: 0 }}>
            Responsable: {business.legalName}. Para acceder, corregir o cancelar tus datos, u oponerte a su uso,
            escribe a <a className="pub-link" href={`mailto:${business.email}`}>{business.email}</a> o por
            {' '}<a className="pub-link" href={whatsappUrl('Hola, quiero información sobre la privacidad de mis datos.', business)} target="_blank" rel="noreferrer">WhatsApp</a>.
          </p>
        </div>
      </section>
    </>
  );
}
