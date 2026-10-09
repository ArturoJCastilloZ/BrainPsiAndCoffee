// Fase 5 de la auditoria del 2026-10-09: arquitectura.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValueSubject } from '../../src/lib/valueSubject.mjs';

const SRC = fileURLToPath(new URL('../../src/', import.meta.url));
const archivos = [];
const recorrer = (dir) => {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) recorrer(ruta);
    else if (/\.(jsx?|mjs)$/.test(nombre)) archivos.push(ruta);
  }
};
recorrer(SRC);
const relativo = (ruta) => ruta.slice(SRC.length).replace(/\\/g, '/');
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// 1 · supabase-js NO entra en el paquete inicial (M1): nadie lo importa
//     de forma estatica; solo supabaseClient.js, con import() dinamico.
{
  const estaticos = archivos.filter((r) => /from\s+['"]@supabase\/supabase-js['"]/.test(sinComentarios(readFileSync(r, 'utf8'))));
  assert.deepEqual(estaticos.map(relativo), [], 'supabase-js volvio a importarse de forma estatica: entra en la portada');
  const cliente = readFileSync(join(SRC, 'api/supabaseClient.js'), 'utf8');
  assert.match(cliente, /import\('@supabase\/supabase-js'\)/);

  // Nadie toma un cliente "ya creado" al importar: hay que pedirlo.
  const sincronos = archivos.filter((r) => /import\s*\{[^}]*\bsupabase\b[^}]*\}\s*from\s*['"][./]*api\/supabaseClient/.test(readFileSync(r, 'utf8')));
  assert.deepEqual(sincronos.map(relativo), [], 'alguien importa el cliente como valor: se cargaria al arrancar');

  // La portada lee el catalogo por REST, sin la libreria.
  const catalogos = sinComentarios(readFileSync(join(SRC, 'api/catalogs.js'), 'utf8'));
  const carga = catalogos.slice(catalogos.indexOf('export const loadCatalogs'), catalogos.indexOf('\n};', catalogos.indexOf('export const loadCatalogs')));
  assert.ok(!/conCliente\(\)|getSupabase\(\)/.test(carga), 'loadCatalogs volvio a pedir supabase-js: la portada lo descargaria');
}

// 2 · Sin rxjs: era todo el paquete por tres BehaviorSubject.
{
  const conRxjs = archivos.filter((r) => /from\s+['"]rxjs/.test(readFileSync(r, 'utf8')));
  assert.deepEqual(conRxjs.map(relativo), []);
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies.rxjs, undefined, 'rxjs sigue en dependencies');

  // El sustituto cumple el contrato que usaban los hooks.
  const s = new ValueSubject(1);
  const vistos = [];
  const sub = s.subscribe((v) => vistos.push(v));
  s.next(2);
  sub.unsubscribe();
  s.next(3);
  assert.deepEqual(vistos, [1, 2], 'subscribe debe avisar el valor actual, los cambios, y nada tras unsubscribe');
  assert.equal(s.value, 3);
}

// 3 · La capa de datos esta partida por dominio y la fachada solo re-exporta.
{
  const fachada = sinComentarios(readFileSync(join(SRC, 'api/supabaseData.js'), 'utf8')).trim();
  assert.ok(fachada.split('\n').every((l) => /^export \* from '\.\/[a-z]+';$/.test(l.trim())),
    'supabaseData.js volvio a tener codigo: cada dominio va en su modulo');
  for (const m of ['catalogs', 'appointments', 'orders', 'clinical', 'accounting', 'access']) {
    const lineas = readFileSync(join(SRC, `api/${m}.js`), 'utf8').split('\n').length;
    assert.ok(lineas < 400, `api/${m}.js ya mide ${lineas} lineas`);
  }
}

// 4 · Al cerrar sesion, las citas y los pedidos se borran de memoria (M4).
{
  const crud = readFileSync(join(SRC, 'hooks/useSupabaseCrud.js'), 'utf8');
  assert.match(crud, /if \(!canLoadAppointments\) setBookingsRaw\(\[\]\)/);
  assert.match(crud, /if \(!canLoadOrders\) setOrdersRaw\(\[\]\)/);
}

console.log('architecture: ok');
