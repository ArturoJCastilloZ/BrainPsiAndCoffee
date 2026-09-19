// El catalogo sale de la base. No hay catalogo en el codigo, ni siembra.
//
// Historia, porque explica por que este guard es tan estricto:
//
//   1. data.js traia un catalogo de ejemplo —servicios, doctores y menu
//      CON PRECIOS— y los componentes lo sustituian cuando la base no
//      devolvia nada. Al paciente le enseñaba precios que no se le iban a
//      cobrar; con sesion, doctores fantasma.
//   2. Cerrado eso, quedaba la SIEMBRA, que parecia el uso legitimo. No lo
//      era: `canSeed` es isSuperAdmin, o sea el dueño de CUALQUIER
//      clinica. El dueño de un consultorio nuevo entraba, su catalogo
//      estaba vacio, y la app le escribia sola —sin boton, sin
//      confirmacion— el menu de cafeteria de BrainPsi y cuatro psicologas
//      ficticias, dentro de SU clinica. Asi llegaron a la base del tenant
//      #1, y le habria pasado a cada cliente nuevo.
//
// Por eso data.js se retiro entero. Una clinica nueva arranca vacia: el
// admin tiene CRUD de los cinco catalogos y las pantallas publicas dicen
// que todavia no hay nada publicado.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// 1 · El archivo no vuelve.
assert.ok(!existsSync('src/data.js'),
  'src/data.js existe otra vez: es el catalogo de un cliente metido en el codigo, y la app lo sembraba en la clinica de los demas');

const recorre = (dir, salida = []) => {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorre(ruta, salida);
    else if (/\.(jsx?|mjs)$/.test(nombre)) salida.push(ruta);
  }
  return salida;
};
const archivos = recorre('src');

// Se mira el CODIGO, no los comentarios: si no, esta misma prueba y las
// notas que explican el defecto lo dispararian.
const sinComentarios = (texto) => texto
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

// 2 · Nadie lo importa, ni con otro nombre de ruta.
const importadores = archivos.filter((ruta) =>
  /from\s+'\.{1,2}\/data'/.test(sinComentarios(readFileSync(ruta, 'utf8'))));
assert.deepEqual(importadores, [],
  `estos archivos importan un modulo de datos local: ${importadores.join(', ')}`);

// 3 · La siembra no vuelve, ni la automatica ni la manual.
const conSiembra = archivos.filter((ruta) =>
  /\bseedDefaultCatalogs\b|\bseedCatalogs\b|\bcatalogsAreEmpty\b/.test(sinComentarios(readFileSync(ruta, 'utf8'))));
assert.deepEqual(conSiembra, [],
  `vuelve la siembra de catalogos en: ${conSiembra.join(', ')}. Era el camino por el que el catalogo de un cliente acababa en la clinica de otro`);

// 4 · Y en concreto: reload() no escribe. Es una funcion de LECTURA; que
//     escriba es como se colo la siembra automatica la primera vez.
const hook = sinComentarios(readFileSync('src/hooks/useSupabaseCrud.js', 'utf8'));
const reload = hook.slice(hook.indexOf('const reload'), hook.indexOf('useEffect(() => {'));
assert.ok(reload.length > 100, 'no se encontro el cuerpo de reload()');
for (const escritura of ['saveServices(', 'saveSpecialties(', 'saveTherapists(', 'saveMenu(', 'saveOffers(', 'saveSettings(']) {
  assert.ok(!reload.includes(escritura),
    `reload() llama a ${escritura}: cargar el catalogo no debe ESCRIBIR en el catalogo de nadie`);
}

// 5 · El estado inicial sigue vacio: es lo que se pinta antes de que
//     vuelva la consulta, y un placeholder con precios miente.
for (const [nombre, patron] of [
  ['servicios', /useRemoteState\(\[\], saveServices\)/],
  ['especialidades', /useRemoteState\(\[\], saveSpecialties\)/],
  ['terapeutas', /useRemoteState\(\[\], saveTherapists\)/],
  ['menu', /useRemoteState\(\{\}, saveMenu\)/],
  ['ofertas', /useRemoteState\(\[\], saveOffers\)/],
]) {
  assert.ok(patron.test(hook),
    `el catalogo de ${nombre} no arranca vacio: se pintaria algo inventado antes de que vuelva la consulta`);
}

console.log(`demo-catalogs: ${archivos.length} archivos barridos · sin data.js, sin siembra, reload() no escribe y el hook arranca vacio`);
