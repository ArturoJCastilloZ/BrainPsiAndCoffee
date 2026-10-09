export const BUSINESS = {
  name: 'Brainpsi Coffee',
  legalName: 'Brainpsi Coffee',
  city: 'Monterrey, Nuevo León',
  address: 'Dirección por confirmar',
  phone: '8112345678',
  whatsapp: '528112345678',
  email: 'hola@brainpsicoffee.com',
  instagram: 'https://instagram.com/brainpsicoffee',
  mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Brainpsi%20Coffee%20Monterrey',
  hours: [
    'Martes a sábado: 9:00 a 19:00',
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
