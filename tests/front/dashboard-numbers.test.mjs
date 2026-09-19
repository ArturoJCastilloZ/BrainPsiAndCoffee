// El Dashboard no inventa numeros, y el dinero sale del motor probado.
//
// Existe por tres defectos reales que convivian en la misma pantalla:
//
//   1. '+12%' y '+5' escritos a mano. Eran los UNICOS numeros inventados
//      de la app, y se leian igual que los reales.
//   2. "Ingresos estimados" sumaba los DOS negocios en una cifra. RLS los
//      aisla por area desde 0027; la pantalla los volvia a mezclar.
//   3. El importe por cita salia del precio ACTUAL del catalogo. La 0027
//      congela appointments.price justamente para que subir el catalogo no
//      reescriba el historial.
//
// Y un cuarto, de cableado: si AdminApp deja de pasarle `contabilidad`, el
// Dashboard muestra $0.00 SIN UN SOLO ERROR. Es la misma familia que
// mapAppointmentFromDb sin mapear `price`: el puente falta y todo suma
// cero en silencio.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dash = readFileSync('src/admin/AdminDashboard.jsx', 'utf8');
const adminApp = readFileSync('src/admin/AdminApp.jsx', 'utf8');

// Se mira el CODIGO, no los comentarios. La primera version de este guard
// se disparo con el comentario que explica los literales viejos: un guard
// que castiga documentar el defecto empuja a no documentarlo.
const sinComentarios = (texto) => texto
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const dashCodigo = sinComentarios(dash);

// 1 · Ningun literal con pinta de metrica ('+12%', '-5', '+5').
const inventados = [...dashCodigo.matchAll(/'([+-]\d+(?:\.\d+)?%?)'/g)].map((m) => m[1]);
assert.deepEqual(inventados, [],
  `el Dashboard tiene literales con pinta de metrica; un numero escrito a mano se lee igual que uno medido: ${inventados.join(', ')}`);

// 2 · El dinero viene de accounting.mjs, no de una suma local.
assert.ok(/from '\.\.\/accounting\.mjs'/.test(dashCodigo),
  'el Dashboard no importa accounting.mjs: el dinero se estaria recalculando aparte del motor probado');
assert.ok(/\bcollected\s*\(/.test(dashCodigo),
  'el Dashboard no usa collected(): estaria mostrando lo facturado con el nombre de lo cobrado');
assert.ok(/\bvariation\s*\(/.test(dashCodigo),
  'el Dashboard no usa variation(): la comparativa volveria a ser un literal');

// 3 · Las dos areas se muestran por separado, no sumadas.
assert.ok(/\bCONSULTORIO\b/.test(dashCodigo) && /\bCAFETERIA\b/.test(dashCodigo),
  'el Dashboard no separa consultorio y cafeteria: volveria a mezclar los dos negocios en una cifra');

// 4 · El importe de una cita NO sale del catalogo.
assert.ok(!/services\.find\([^)]*\)[^\n]*\.price/.test(dashCodigo),
  'el Dashboard lee el precio del catalogo para una cita; 0027 congela appointments.price para que el historial no se reescriba');

// 5 · El puente existe: sin `contabilidad` el Dashboard suma cero callado.
const montaje = adminApp.match(/<AdminDashboard[^>]*\/>/);
assert.ok(montaje, 'no se encontro el montaje de <AdminDashboard> en AdminApp');
assert.ok(/\bcontabilidad=\{/.test(montaje[0]),
  'AdminApp monta <AdminDashboard> sin pasarle `contabilidad`: los cobros llegarian vacios y el panel mostraria $0.00 sin ningun error');

console.log('dashboard-numbers: sin literales inventados, dinero del motor, areas separadas y puente cableado');
