// Una URL que viene de un humano no entra a un href sin pasar por aqui.
//
// El defecto: "GOOGLE MAPS URL" e "INSTAGRAM URL" son campos libres del
// admin y su valor ocupaba el href ENTERO en ContactPage. Un admin podia
// servirle un esquema ejecutable a todo visitante de la pagina publica.
//
// MEDIDO EN EL NAVEGADOR, y corrige el informe de auditoria: React 19 ya
// bloquea por su cuenta el esquema ejecutable clasico — sustituye el href
// por un stub que lanza. O sea que el payload que el informe describia NO
// se ejecutaba. Lo que React NO bloquea, comprobado en la pantalla real
// con el saneado quitado:
//
//   - 'data:text/html,...'  entra al href TAL CUAL.
//   - '//evil.example/x'    resuelve a http://evil.example/x, o sea que el
//                           visitante pulsa "Instagram" y aterriza en el
//                           dominio de otro. Eso es phishing servido desde
//                           el sitio del consultorio.
//
// Por eso el arreglo sigue valiendo, y por eso no se apoya en React: la
// proteccion de React es una red heredada que su propio equipo anuncia
// retirar, y solo cubre uno de los tres casos.
//
// Esta prueba NO se limita a la forma que motivo el arreglo. Un guard que
// solo se ejercita con el caso original no dice nada sobre el siguiente:
// aqui van las variantes que un atacante probaria para ESQUIVARLO —
// mayusculas mezcladas, espacios delante, y caracteres de control metidos
// dentro del esquema, que los navegadores ignoran y por eso navegan igual.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeUrl, hrefSeguro, esExterna, normalizaUrl } from '../../src/safeUrl.mjs';

const EJECUTABLE = 'java' + 'script:';
const TAB = String.fromCharCode(9);
const SALTO = String.fromCharCode(10);
const RETORNO = String.fromCharCode(13);
const NULO = String.fromCharCode(0);

const DEBEN_CAER = [
  ['directa', EJECUTABLE + 'alert(1)'],
  ['mayusculas mezcladas', 'JaVaScRiPt:alert(1)'],
  ['espacios delante', '   ' + EJECUTABLE + 'alert(1)'],
  ['tabulador dentro del esquema', 'java' + TAB + 'script:alert(1)'],
  ['salto de linea dentro', 'java' + SALTO + 'script:alert(1)'],
  ['retorno de carro dentro', 'java' + RETORNO + 'script:alert(1)'],
  ['byte nulo delante', NULO + EJECUTABLE + 'alert(1)'],
  ['data con html', 'data:text/html,<img src=x onerror=alert(1)>'],
  ['vbscript', 'vbscript:msgbox(1)'],
  ['protocolo-relativa', '//evil.example'],
  ['entidad html sin decodificar', 'java' + 'script&#58;alert(1)'],
  ['vacia', ''],
  ['solo espacios', '   '],
  ['nula', null],
  ['indefinida', undefined],
  ['numero', 12345],
];

for (const [nombre, payload] of DEBEN_CAER) {
  assert.equal(safeUrl(payload), null,
    `paso una url que debia caer (${nombre}): ${JSON.stringify(String(payload))}`);
  assert.equal(hrefSeguro(payload), undefined,
    `hrefSeguro devolvio algo pintable para (${nombre})`);
}

const DEBEN_PASAR = [
  ['maps', 'https://www.google.com/maps/search/?api=1&query=Brainpsi'],
  ['instagram', 'https://instagram.com/brainpsicoffee'],
  ['http simple', 'http://ejemplo.mx'],
  ['con espacios alrededor', '  https://ejemplo.mx/a  '],
];

for (const [nombre, url] of DEBEN_PASAR) {
  const salida = safeUrl(url);
  assert.ok(salida, `se rechazo una url legitima (${nombre}): ${url}`);
  assert.ok(/^https?:/.test(salida), `la salida de (${nombre}) no es http(s): ${salida}`);
  assert.equal(esExterna(salida), true, `(${nombre}) deberia contar como externa`);
}

// Lo que sale es lo PARSEADO, no la cadena cruda: el navegador va a usar
// esa forma, asi que es la que hay que devolver.
assert.equal(safeUrl('  https://ejemplo.mx/a  '), 'https://ejemplo.mx/a');
assert.equal(normalizaUrl('  https://ejemplo.mx  '), 'https://ejemplo.mx');
assert.equal(esExterna(undefined), false);

// --- Y el sumidero de verdad lo usa ----------------------------------
//
// Que el saneador exista y este probado no sirve de nada si la pantalla
// no lo llama. Es el mismo patron que la pantalla inalcanzable: el codigo
// estaba, nadie lo invocaba.
const contacto = readFileSync('src/user/ContactPage.jsx', 'utf8');
assert.ok(/from '\.\.\/safeUrl\.mjs'/.test(contacto),
  'ContactPage no importa safeUrl.mjs: los href volverian a salir crudos');
assert.ok(!/href:\s*business\.(mapsUrl|instagram)\b/.test(contacto),
  'ContactPage sigue metiendo business.mapsUrl o business.instagram crudo en un href');

console.log(`safe-url: ${DEBEN_CAER.length} formas de evasion rechazadas, ${DEBEN_PASAR.length} urls legitimas aceptadas, y el sumidero lo usa`);
