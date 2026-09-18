// Una fecha 'YYYY-MM-DD' se lee en hora LOCAL, no en UTC.
//
// El bug se vio en pantalla: la lista de Citas pintaba "18 SEP" para una
// cita del 2026-09-19, mientras el panel de Contabilidad —que no pasa por
// Date— mostraba el 19. new Date('2026-09-19') parsea como UTC, y leerle
// getDate() en cualquier zona al oeste de Greenwich devuelve el dia
// anterior.
//
// La prueba NO se corre en la zona de la maquina: se fija TZ, porque en
// una maquina en UTC el fallo no aparece y la prueba pasaria por la razon
// equivocada.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const enZona = (tz, codigo) => JSON.parse(execFileSync(
  process.execPath, ['-e', `process.stdout.write(JSON.stringify(${codigo}))`],
  { env: { ...process.env, TZ: tz } },
).toString());

const LOCAL_DATE = `(iso => { const [y,m,d] = String(iso).split('-').map(Number); return new Date(y, m-1, d, 12, 0, 0); })`;

// Monterrey (UTC-6) es donde vive el consultorio y donde se vio el fallo.
{
  const tz = 'America/Monterrey';

  // La forma ingenua, la que estaba en el codigo: se adelanta un dia.
  assert.equal(
    enZona(tz, `new Date('2026-09-19').getDate()`), 18,
    'confirma que en esta zona el parseo UTC SI corrompe el dia (si no, la prueba no probaria nada)',
  );

  // La forma correcta.
  assert.equal(enZona(tz, `${LOCAL_DATE}('2026-09-19').getDate()`), 19);
  assert.equal(enZona(tz, `${LOCAL_DATE}('2026-09-19').getMonth() + 1`), 9);
  assert.equal(enZona(tz, `${LOCAL_DATE}('2026-01-01').getFullYear()`), 2026);

  // Primero de mes: la forma ingenua se va al mes ANTERIOR.
  assert.equal(enZona(tz, `new Date('2026-09-01').getMonth() + 1`), 8, 'el fallo tambien cambia el mes');
  assert.equal(enZona(tz, `${LOCAL_DATE}('2026-09-01').getMonth() + 1`), 9);
  assert.equal(enZona(tz, `${LOCAL_DATE}('2026-01-01').getFullYear()`), 2026, 'y el año en año nuevo');
}

// Al este de Greenwich no se adelanta, pero la version correcta tampoco
// se atrasa: el mediodia deja margen a los dos lados.
for (const tz of ['Asia/Tokyo', 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  assert.equal(enZona(tz, `${LOCAL_DATE}('2026-09-19').getDate()`), 19, `dia estable en ${tz}`);
  assert.equal(enZona(tz, `${LOCAL_DATE}('2026-03-01').getDate()`), 1, `primero de mes estable en ${tz}`);
}

// Y el helper del repo es EXACTAMENTE esa forma. utils.jsx es JSX, asi que
// no se puede importar desde node --test: se compara el texto, igual que
// hace admin-nav.test.mjs con permissions.js.
{
  const utils = readFileSync('src/utils.jsx', 'utf8');
  const fn = utils.slice(utils.indexOf('export const localDate'));
  const cuerpo = fn.slice(0, fn.indexOf('};'));
  assert.match(cuerpo, /split\('-'\)\.map\(Number\)/, 'parte la cadena, no la pasa a new Date');
  assert.match(cuerpo, /new Date\(year, month - 1, day, 12/, 'construye local y a mediodia');
  assert.ok(!/new Date\(iso\)/.test(cuerpo), 'nunca pasa la cadena completa a Date');
}

// Ninguna pantalla vuelve a pasar una fecha 'YYYY-MM-DD' directo a Date.
// Es el guard que impide que el defecto reaparezca en la proxima pantalla.
{
  const archivos = execFileSync('git', ['ls-files', 'src/*.jsx', 'src/**/*.jsx']).toString().trim().split('\n');
  const culpables = [];
  for (const f of archivos) {
    const texto = readFileSync(f, 'utf8');
    texto.split('\n').forEach((linea, i) => {
      if (/new Date\([a-zA-Z_$][\w.$]*\.(date|spentAt|paidAt)\)/.test(linea)) {
        culpables.push(`${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(culpables, [], 'usa localDate() para fechas YYYY-MM-DD, no new Date()');
}

console.log('local-date: una fecha sin hora se lee local, y ninguna pantalla la pasa cruda a Date');
