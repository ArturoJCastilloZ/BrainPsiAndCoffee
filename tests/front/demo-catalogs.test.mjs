// Los datos de demostracion no vuelven a la pantalla.
//
// El defecto: data.js trae un catalogo de ejemplo —servicios, doctores y
// menu CON PRECIOS— y la app lo sustituia cuando la base no devolvia
// nada. Dos consecuencias distintas, las dos malas:
//
//   - Al PACIENTE le enseñaba precios que no se le iban a cobrar. Con la
//     0028 el importe de la cita lo fija el servidor desde el catalogo
//     real, asi que el numero de la pantalla y el del cobro no coincidian.
//     Y los ids de demo ('psi-adultos', 't1') no existen en la base: la
//     reserva tampoco podia completarse.
//   - Con sesion mostraba doctores FANTASMA. Todo se veia bien y cada
//     guardado fallaba con un error que no apuntaba a la causa.
//
// La decision se tomaba en DOS capas —el hook y nueve sitios de
// componente— y por eso arreglar una no bastaba. Ahora la regla es una: a
// la pantalla solo llega lo que la base devolvio.
//
// data.js NO desaparece: sigue siendo la fuente de la SIEMBRA, que es su
// uso legitimo. Lo que esta prueba vigila es que no vuelva al render.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Los unicos que pueden tocar data.js: la siembra.
const SEMBRADORES = ['src/api/supabaseData.js', 'src/hooks/useSupabaseCrud.js'];
const CATALOGOS_DEMO = ['THERAPY_SERVICES', 'THERAPISTS', 'MENU', 'OFFERS', 'SPECIALTIES'];

const recorre = (dir, salida = []) => {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorre(ruta, salida);
    else if (/\.(jsx?|mjs)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
};

const archivos = recorre('src').filter((f) => f !== 'src/data.js' && !f.endsWith('specimen.jsx'));

const culpables = [];
for (const ruta of archivos) {
  const codigo = readFileSync(ruta, 'utf8');
  const importaDeData = /import\s*\{([^}]*)\}\s*from\s*'\.\.?\/data'/.exec(codigo);
  if (!importaDeData) continue;
  const simbolos = importaDeData[1].split(',').map((x) => x.trim()).filter(Boolean);
  const demo = simbolos.filter((x) => CATALOGOS_DEMO.includes(x));
  if (demo.length && !SEMBRADORES.includes(ruta)) {
    culpables.push(`${ruta} importa ${demo.join(', ')} de data.js`);
  }
}

assert.deepEqual(culpables, [],
  `estos archivos traen el catalogo de demostracion fuera de la siembra; si acaban en un render, el paciente ve precios que no se le van a cobrar:\n  ${culpables.join('\n  ')}`);

// Y la otra forma del mismo defecto: caer al catalogo de demo con `||`
// o con un parametro por defecto. La primera version de este barrido solo
// buscaba `||` y se dejo vivo un `services = THERAPY_SERVICES` en una
// firma de funcion, asi que aqui se cubren las tres formas.
//
// Se mira el CODIGO, no los comentarios: si no, esta misma prueba y las
// notas que explican el defecto lo dispararian.
const sinComentarios = (texto) => texto
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const caidas = [];
for (const ruta of archivos) {
  if (SEMBRADORES.includes(ruta)) continue;
  const codigo = sinComentarios(readFileSync(ruta, 'utf8'));
  for (const simbolo of CATALOGOS_DEMO) {
    for (const forma of [`|| ${simbolo}`, `||${simbolo}`, `= ${simbolo}`, `${simbolo}[`]) {
      if (codigo.includes(forma)) caidas.push(`${ruta} cae a ${simbolo} (forma: ${forma.trim()})`);
    }
  }
}
assert.deepEqual(caidas, [],
  `estos sitios sustituyen el catalogo real por el de demostracion:\n  ${caidas.join('\n  ')}`);

// El hook arranca VACIO: el estado inicial es lo que se pinta antes de
// que vuelva la consulta, y un placeholder con precios es un placeholder
// que miente.
const hook = readFileSync('src/hooks/useSupabaseCrud.js', 'utf8');
for (const [nombre, patron] of [
  ['servicios', /useRemoteState\(\[\], saveServices\)/],
  ['especialidades', /useRemoteState\(\[\], saveSpecialties\)/],
  ['terapeutas', /useRemoteState\(\[\], saveTherapists\)/],
  ['menu', /useRemoteState\(\{\}, saveMenu\)/],
  ['ofertas', /useRemoteState\(\[\], saveOffers\)/],
]) {
  assert.ok(patron.test(hook),
    `el catalogo de ${nombre} no arranca vacio en useSupabaseCrud: se pintaria el de demostracion antes de que vuelva la consulta`);
}

console.log(`demo-catalogs: ${archivos.length} archivos barridos, ningun catalogo de demostracion llega al render, y el hook arranca vacio`);
