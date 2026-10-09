// Fuente UNICA de las rutas publicas y de su <head>.
//
// La leen dos lados que antes no se hablaban:
//   · el build (scripts/prerender.mjs), que escribe un index.html POR RUTA
//     con su titulo, descripcion, canonical y un texto que el buscador lee
//     sin ejecutar JavaScript;
//   · la app (src/seo/useRouteHead.js), que actualiza el <head> al navegar.
//
// Antes todas las URLs servian el mismo index.html: mismo titulo, misma
// descripcion y canonical a "/" en todas — para Google eran una sola
// pagina repetida — y el HTML venia vacio hasta que corria el JS.
//
// Sin JSX ni imports del navegador: Node lo importa en el build.

export const SITE_NAME = 'Brainpsi Coffee';

// Lo que el buscador ve sin JavaScript: un parrafo de verdad por pagina y
// los enlaces a las demas. Sin precios: esos viven en la base y cambian;
// un precio congelado en el build seria uno que miente.
export const PUBLIC_ROUTES = [
  {
    path: '/',
    title: 'Brainpsi Coffee · Psicología y neuropsicología infantil en Monterrey',
    description: 'Consultorio de psicología y neuropsicología infantil con cafetería en Monterrey. Precios a la vista, solicita tu cita en línea y tómate un café mientras esperas.',
    h1: 'Un cafecito y lo hablamos',
    text: 'Psicología y neuropsicología infantil en Monterrey, con precios a la vista y una cafetería para quien acompaña. Solicita tu cita en línea y te confirmamos por WhatsApp.',
    priority: '1.0',
  },
  {
    path: '/terapia',
    title: 'Terapia infantil y evaluación neuropsicológica · Brainpsi Coffee',
    description: 'Psicología infantil, neuropsicología infantil y evaluación neuropsicológica completa en Monterrey. Duración y precio de cada servicio antes de pedir la cita.',
    h1: 'Terapia con precio a la vista',
    text: 'Psicología infantil, neuropsicología infantil y evaluación neuropsicológica completa. Cada servicio dice cuánto dura y cuánto cuesta antes de que pidas la cita.',
    priority: '0.9',
  },
  {
    path: '/cafeteria',
    title: 'Cafetería · Brainpsi Coffee',
    description: 'Café de especialidad, bebidas frías y postres en Monterrey. Pide tu café para que esté listo cuando llegues a tu cita.',
    h1: 'La cafetería',
    text: 'Bebidas calientes y frías, y postres. Si vienes a una cita, pide tu café y lo tenemos listo diez minutos antes.',
    priority: '0.8',
  },
  {
    path: '/reservar',
    title: 'Solicitar cita · Brainpsi Coffee',
    description: 'Elige servicio, especialista y horario. Tu solicitud aparta el horario y el consultorio te confirma por WhatsApp.',
    h1: 'Solicita tu cita',
    text: 'Elige el servicio, el especialista y un horario libre. Tu solicitud aparta el horario 24 horas y el consultorio te confirma por WhatsApp.',
    priority: '0.9',
  },
  {
    path: '/nosotros',
    title: 'Quiénes somos · Brainpsi Coffee',
    description: 'Un consultorio con cafetería para que ir a terapia sea algo cotidiano, cercano y sin estigma.',
    h1: 'Quiénes somos',
    text: 'Creamos un espacio donde la salud mental se vive de forma cercana: atención psicológica y neuropsicológica, y una cafetería que invita a hacer una pausa.',
    priority: '0.6',
  },
  {
    path: '/contacto',
    title: 'Contacto y ubicación · Brainpsi Coffee',
    description: 'Dirección, horario y formas de contacto de Brainpsi Coffee en Monterrey.',
    h1: 'Contacto',
    text: 'Dudas sobre terapia, citas o pedidos de la cafetería: aquí están la dirección, el horario y cómo contactarnos.',
    priority: '0.7',
  },
  {
    path: '/privacidad',
    title: 'Aviso de privacidad · Brainpsi Coffee',
    description: 'Qué datos pedimos, para qué los usamos y cómo ejercer tus derechos.',
    h1: 'Aviso de privacidad',
    text: 'Usamos tus datos de contacto solo para responder, confirmar citas y dar seguimiento. No pidas ni envíes información clínica por formularios públicos.',
    priority: '0.3',
  },
  {
    path: '/derechos-arco',
    title: 'Derechos ARCO · Brainpsi Coffee',
    description: 'Solicita acceso, rectificación, cancelación u oposición sobre tus datos personales, o revoca tu consentimiento.',
    h1: 'Tus derechos sobre tus datos',
    text: 'Puedes pedir acceso, corrección o cancelación de tus datos, oponerte a su uso o revocar tu consentimiento. Respondemos en un máximo de 20 días hábiles.',
    priority: '0.2',
  },
];

// Rutas que existen pero que un buscador no debe indexar: son personales
// (carrito, mis citas) o son la puerta del personal. Antes /admin,
// /doctor y /login eran indexables.
export const PRIVATE_ROUTES = [
  { path: '/carrito', title: 'Tu pedido · Brainpsi Coffee' },
  { path: '/mis-citas', title: 'Mis citas · Brainpsi Coffee' },
  { path: '/login', title: 'Acceso del personal · Brainpsi Coffee' },
  { path: '/set-password', title: 'Nueva contraseña · Brainpsi Coffee' },
  { path: '/admin', title: 'Administración · Brainpsi Coffee' },
  { path: '/doctor', title: 'Especialistas · Brainpsi Coffee' },
];

export const NOT_FOUND = {
  path: '/404',
  title: 'Página no encontrada · Brainpsi Coffee',
  description: 'Esta página no existe.',
  h1: 'Esta página no existe',
  text: 'Puede que el enlace esté mal escrito o que la página se haya movido.',
};

// Las URLs viejas, en ingles, siguen llegando por enlaces compartidos.
export const LEGACY_REDIRECTS = {
  '/therapy': '/terapia',
  '/coffee': '/cafeteria',
};

export const NAV_LINKS = [
  { path: '/terapia', label: 'Terapia' },
  { path: '/cafeteria', label: 'Cafetería' },
  { path: '/nosotros', label: 'Nosotros' },
  { path: '/contacto', label: 'Contacto' },
];

export function routeMeta(pathname) {
  const limpio = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const publica = PUBLIC_ROUTES.find((r) => r.path === limpio);
  if (publica) return { ...publica, indexable: true };
  const privada = PRIVATE_ROUTES.find((r) => r.path === limpio);
  if (privada) return { ...privada, description: PUBLIC_ROUTES[0].description, indexable: false };
  return { ...NOT_FOUND, indexable: false };
}

// "" si no hay dominio configurado: entonces NO se emite canonical. Un
// canonical a un dominio que no es el que sirve la pagina es peor que
// ninguno — le dice a Google que la pagina vive en otro lado.
export function absoluteUrl(siteUrl, path) {
  const base = String(siteUrl || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+$/.test(base)) return '';
  return `${base}${path === '/' ? '/' : path}`;
}
