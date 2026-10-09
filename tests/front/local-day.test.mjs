// "Que dia es" se calcula en hora LOCAL, nunca con toISOString().
//
// El defecto: la reserva publica guardaba el dia en UTC. En Monterrey, a
// las 19:30 del jueves 9 el boton decia "9" y la cita se guardaba el 10.
// La misma clase de error movia cobros y gastos al dia siguiente, hacia
// que el "hoy" del Dashboard fuera mañana y vencia promociones seis
// horas antes.
//
// Se corre en un proceso con TZ fijada: en una maquina en UTC el fallo no
// aparece y la prueba pasaria por la razon equivocada.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const modulo = (rel) => pathToFileURL(join(raiz, rel)).href;

const enMonterrey = (codigo) => JSON.parse(execFileSync(
  process.execPath,
  ['--input-type=module', '-e', `${codigo}`],
  { env: { ...process.env, TZ: 'America/Monterrey' } },
).toString());

// Jueves 9 de octubre de 2026, 19:30 en Monterrey = 01:30 UTC del 10.
const TARDE = `new Date(2026, 9, 9, 19, 30)`;

// 1 · La forma vieja SI falla en esta zona: si no, la prueba no probaria nada.
assert.equal(
  enMonterrey(`process.stdout.write(JSON.stringify(${TARDE}.toISOString().split('T')[0]))`),
  '2026-10-10',
  'la condicion del defecto no se reprodujo: la prueba no estaria probando nada',
);

// 2 · localISO y todayISO dan el dia local.
assert.equal(
  enMonterrey(`import { localISO, todayISO } from '${modulo('src/localDay.mjs')}';
    process.stdout.write(JSON.stringify([localISO(${TARDE}), todayISO(${TARDE})]))`).join(),
  '2026-10-09,2026-10-09',
);

// 3 · Una promocion que termina el 9 sigue viva a las 19:30 del 9.
assert.equal(
  enMonterrey(`import { isOfferLive } from '${modulo('src/offerUtils.mjs')}';
    process.stdout.write(JSON.stringify(isOfferLive({ endsAt: '2026-10-09' }, ${TARDE})))`),
  true,
  'la promocion vencia seis horas antes',
);

// 4 · Guard: ningun archivo de src/ vuelve a sacar el dia de toISOString().
const archivos = (dir) => readdirSync(dir).flatMap((nombre) => {
  const ruta = join(dir, nombre);
  return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
}).filter((ruta) => /\.(jsx?|mjs)$/.test(ruta));

const culpables = archivos(join(raiz, 'src')).filter((ruta) => {
  const codigo = readFileSync(ruta, 'utf8').replace(/\/\/.*$/gm, '');
  return /toISOString\(\)\s*\.(split\(\s*['"]T['"]\s*\)|slice\(\s*0\s*,\s*10\s*\))/.test(codigo);
});
assert.deepEqual(culpables, [], `el dia sale de toISOString() en: ${culpables.join(', ')}`);

console.log('local-day: ok');
