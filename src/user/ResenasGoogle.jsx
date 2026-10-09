import React from 'react';
import { Star } from 'lucide-react';
import { businessFromSettings } from '../businessInfo';
import { hrefSeguro } from '../safeUrl.mjs';
import { trackEvent } from '../monitoring';

// Resenas de Google: ENLACES, no las resenas copiadas. Las reglas de Google
// no permiten copiarlas a la pagina, y en la propia pagina del negocio no
// dan estrellas en el buscador. Lo que si sirve: mandar a leerlas donde
// viven y pedir una nueva en un toque.
//
// mapsUrl y reviewUrl los escribe el admin: pasan por el saneador. Sin
// ninguno seguro, no se pinta nada.
export default function ResenasGoogle({ settings, className = 'pub-section' }) {
  const business = businessFromSettings(settings);
  const ver = hrefSeguro(business.mapsUrl);
  const dejar = hrefSeguro(business.reviewUrl);
  if (!ver && !dejar) return null;

  return (
    <section className={className} aria-labelledby="resenas-titulo">
      <div className="pub-wrap">
        <h2 className="pub-h2" id="resenas-titulo">Lo que dicen de nosotros</h2>
        <p className="pub-lead">
          Nuestras reseñas están en Google. Si ya nos visitaste, nos ayuda mucho que dejes la tuya.
        </p>
        <div className="pub-choice-row">
          {ver && (
            <a className="pub-btn pub-btn-ghost" href={ver} target="_blank" rel="noreferrer"
              onClick={() => trackEvent('reviews_click', { action: 'read' })}>
              Ver reseñas en Google
            </a>
          )}
          {dejar && (
            <a className="pub-btn pub-btn-primary" href={dejar} target="_blank" rel="noreferrer"
              onClick={() => trackEvent('reviews_click', { action: 'write' })}>
              <Star size={18} aria-hidden="true" /> Déjanos tu reseña
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
