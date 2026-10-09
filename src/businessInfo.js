// Datos de RELLENO: todavia no son los del negocio. El schema (jsonLd.mjs)
// los descarta aunque el panel los guarde tal cual.
export const BUSINESS_PLACEHOLDERS = {
  legalName: 'Brainpsi Coffee',
  phone: '8112345678',
  whatsapp: '528112345678',
  email: 'hola@brainpsicoffee.com',
  instagram: 'https://instagram.com/brainpsicoffee',
};

// Respaldo si el panel no tiene datos. Direccion, mapa y horario ya son
// los reales (perfil de Google del negocio, oct 2026).
export const BUSINESS = {
  name: 'Brainpsi Coffee',
  city: 'Monterrey, Nuevo León',
  address: 'Av Abraham Lincoln 1600, Real Cumbres, 64346 Monterrey, N.L.',
  ...BUSINESS_PLACEHOLDERS,
  mapsUrl: 'https://maps.app.goo.gl/MKXhQKpXZjewqaka9',
  // Enlace de Google para dejar una resena ("Pedir resenas" en el Perfil
  // de Negocio). Vacio: el boton no se muestra.
  reviewUrl: '',
  hours: [
    'Martes a viernes: 7:00 a 20:00',
    'Sábado: 9:00 a 17:00',
    'Domingo y lunes: cerrado',
  ],
};

export const businessFromSettings = (settings) => ({
  ...BUSINESS,
  ...(settings || {}),
  hours: Array.isArray(settings?.hours) && settings.hours.length ? settings.hours : BUSINESS.hours,
});

export const whatsappUrl = (message = 'Hola, quiero información de Brainpsi Coffee.', business = BUSINESS) => (
  `https://wa.me/${business.whatsapp}?text=${encodeURIComponent(message)}`
);
