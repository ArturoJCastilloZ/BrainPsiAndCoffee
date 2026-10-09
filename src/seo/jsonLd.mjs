// Datos estructurados del negocio (schema.org, JSON-LD).
//
// Regla: SOLO lo que es verdad. Un schema con el telefono de ejemplo o
// "Direccion por confirmar" no es un schema incompleto, es uno falso — y
// Google penaliza lo que no coincide con la pagina. Por eso cada campo
// entra solo si el consultorio lo capturo (no es el valor de relleno de
// businessInfo.js).
//
// Sin imports: lo usan el build y la app.

const LOCALIDAD = { addressLocality: 'Monterrey', addressRegion: 'Nuevo León', addressCountry: 'MX' };

export function businessJsonLd({ settings = null, defaults = {}, siteUrl = '', services = [] } = {}) {
  const real = (campo) => {
    const valor = settings?.[campo];
    if (valor === undefined || valor === null || String(valor).trim() === '') return null;
    return valor === defaults[campo] ? null : String(valor).trim();
  };

  const negocio = {
    // Las dos cosas que es: consultorio y cafeteria.
    '@type': ['MedicalClinic', 'CafeOrCoffeeShop'],
    '@id': siteUrl ? `${siteUrl}/#negocio` : '#negocio',
    name: real('name') || 'Brainpsi Coffee',
    areaServed: { '@type': 'City', name: 'Monterrey' },
    // isAcceptingNewPatients: la reserva publica esta abierta.
    isAcceptingNewPatients: true,
  };
  if (siteUrl) negocio.url = `${siteUrl}/`;
  const telefono = real('phone');
  if (telefono) negocio.telephone = telefono;
  const correo = real('email');
  if (correo) negocio.email = correo;
  const direccion = real('address');
  negocio.address = { '@type': 'PostalAddress', ...LOCALIDAD, ...(direccion ? { streetAddress: direccion } : {}) };
  const instagram = real('instagram');
  if (instagram && /^https:\/\//.test(instagram)) negocio.sameAs = [instagram];

  // Los servicios con precio, como catalogo de ofertas: es exactamente lo
  // que la pagina muestra en el pizarron.
  const activos = services.filter((s) => s && s.active !== false && s.name);
  if (activos.length) {
    negocio.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'Servicios',
      itemListElement: activos.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'MedicalTherapy', name: s.name, ...(s.desc ? { description: s.desc } : {}) },
        ...(Number(s.price) > 0 ? { price: Number(s.price).toFixed(2), priceCurrency: 'MXN' } : {}),
      })),
    };
  }

  return { '@context': 'https://schema.org', ...negocio };
}

// JSON dentro de <script>: "</script>" en un dato cerraria la etiqueta.
export function serializeJsonLd(objeto) {
  return JSON.stringify(objeto).replace(/</g, '\\u003c');
}
