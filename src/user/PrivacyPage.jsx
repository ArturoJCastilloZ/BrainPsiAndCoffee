import React from 'react';
import { Link } from 'react-router-dom';
import { businessFromSettings } from '../businessInfo';
import { AVISO_PRIVACIDAD, completar } from '../legal/avisoPrivacidad.mjs';

// El texto sale de src/legal/avisoPrivacidad.mjs: el mismo que queda
// ligado, por version y hash, a cada consentimiento.
export default function PrivacyPage({ settings }) {
  const negocio = businessFromSettings(settings);
  const fecha = new Date(`${AVISO_PRIVACIDAD.fecha}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <>
      <section className="pub-hero" style={{ paddingBottom: 24 }}>
        <div className="pub-wrap" style={{ maxWidth: 760 }}>
          <h1 className="pub-hero-title">Aviso de privacidad</h1>
          <p className="pub-hero-lead">
            Cómo usamos y protegemos tus datos personales. Versión {AVISO_PRIVACIDAD.version}, del {fecha}.
          </p>
          {AVISO_PRIVACIDAD.estado === 'borrador' && (
            <p className="pub-notice">Versión preliminar: este aviso está en revisión legal y puede cambiar antes de abrir el servicio.</p>
          )}
        </div>
      </section>

      <section className="pub-section pub-section-alt">
        <div className="pub-wrap" style={{ maxWidth: 760 }}>
          {AVISO_PRIVACIDAD.secciones.map((s, i) => (
            <section key={s.titulo} style={{ marginTop: i ? 32 : 0 }}>
              <h2 className="pub-h3">{s.titulo}</h2>
              {s.parrafos.map((p) => <p key={p.slice(0, 40)} style={{ maxWidth: '65ch' }}>{completar(p, negocio)}</p>)}
            </section>
          ))}
          <p style={{ marginTop: 32 }}>
            <Link to="/derechos-arco" className="pub-btn pub-btn-primary">Ejercer mis derechos ARCO</Link>
          </p>
        </div>
      </section>
    </>
  );
}
