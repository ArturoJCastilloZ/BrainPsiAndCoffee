// Saneado de URLs que vienen de un humano y terminan en un href.
//
// El agujero que cierra: "GOOGLE MAPS URL" e "INSTAGRAM URL" son campos
// libres del admin, y su valor ocupaba el href ENTERO en ContactPage. Un
// admin que escriba ahi una url con esquema ejecutable se la sirve a TODO
// visitante de la pagina publica. No hace falta un atacante externo:
// basta el admin de una clinica, y el producto es multi-tenant.
//
// Donde va el control: en el SUMIDERO, no solo en el formulario. La base
// puede tener ya un valor envenenado, guardado antes de que existiera
// ninguna validacion, y "el admin ya no puede escribirlo" no protege a
// quien lo tiene guardado. Validar la entrada es comodidad; sanear al
// pintar es el control.

// Los esquemas ejecutables (javascript:, data:, vbscript:) corren codigo.
// No hay lista negra aqui: hay lista BLANCA, porque una negra siempre se
// queda corta con el siguiente esquema que alguien recuerde.
export const ESQUEMAS_WEB = ['http:', 'https:'];

// Los navegadores IGNORAN tabuladores, saltos de linea y retornos DENTRO
// del esquema, asi que un "javascript:" partido por un tabulador navega
// igual que el directo. Por eso los caracteres de control se quitan ANTES
// de parsear, no despues.
const CONTROL = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]', 'g');

export const normalizaUrl = (valor) => String(valor ?? '').replace(CONTROL, '').trim();

// Devuelve la URL ya parseada y normalizada si su esquema esta permitido,
// o null. Nunca devuelve la cadena cruda: lo que sale es lo que el parser
// entendio, que es lo que el navegador va a usar.
export const safeUrl = (valor, esquemas = ESQUEMAS_WEB) => {
  const limpio = normalizaUrl(valor);
  if (!limpio) return null;
  let parsed;
  try {
    parsed = new URL(limpio);
  } catch {
    // Relativa o basura. Para estos campos se exige absoluta: una
    // "//evil.com" es protocolo-relativa y sale del sitio sin decirlo.
    return null;
  }
  return esquemas.includes(parsed.protocol) ? parsed.href : null;
};

// Para un href que SI se puede pintar: si no es segura, no hay enlace.
// Un enlace muerto es mejor que uno que ejecuta.
export const hrefSeguro = (valor) => safeUrl(valor) || undefined;

// Un enlace externo se abre fuera; uno vacio no abre nada. Se decide
// sobre la URL YA saneada, no sobre la cruda.
export const esExterna = (urlSegura) => Boolean(urlSegura && /^https?:/i.test(urlSegura));
