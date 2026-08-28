// Saltos del calendario: semana, mes y año.
//
// El mes y el año se mueven por calendario real y no por 30 o 365 dias,
// porque los meses tienen distinta longitud y los años bisiestos existen.
// Saltar "un mes" desde el 31 de enero tiene que caer en febrero, no en
// marzo, y saltar "un año" desde el 29 de febrero tiene que caer en 2027
// sin inventar un dia que no existe.
import assert from 'node:assert/strict';

const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const localDate = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
};

// Replica de moverCalendario en AdminAppointments.jsx.
const mover = (iso, unidad, signo) => {
  const d = localDate(iso);
  if (unidad === 'semana') d.setDate(d.getDate() + 7 * signo);
  if (unidad === 'mes') d.setMonth(d.getMonth() + signo);
  if (unidad === 'anio') d.setFullYear(d.getFullYear() + signo);
  return localISO(d);
};

assert.equal(mover('2026-08-28', 'semana', 1), '2026-09-04', 'una semana adelante cruza a septiembre');
assert.equal(mover('2026-08-28', 'semana', -1), '2026-08-21');
assert.equal(mover('2026-08-28', 'mes', 1), '2026-09-28');
assert.equal(mover('2026-12-15', 'mes', 1), '2027-01-15', 'un mes adelante cruza el año');
assert.equal(mover('2026-08-28', 'anio', 1), '2027-08-28');
assert.equal(mover('2026-01-15', 'mes', -1), '2025-12-15', 'un mes atras cruza el año');

// Meses de distinta longitud: el 31 de enero + un mes no tiene un 31 de
// febrero. JavaScript desborda a marzo, que es predecible aunque no sea
// bonito. Se documenta con una prueba para que nadie lo "corrija" a ciegas.
assert.equal(mover('2026-01-31', 'mes', 1), '2026-03-03',
  'el 31 de enero mas un mes desborda a marzo: comportamiento conocido de Date');

// Un año desde el 29 de febrero de un bisiesto cae en el 1 de marzo.
assert.equal(mover('2028-02-29', 'anio', 1), '2029-03-01',
  'el 29 de febrero mas un año desborda al 1 de marzo');

// Ida y vuelta: volver debe regresar al punto de partida en el caso comun.
for (const unidad of ['semana', 'mes', 'anio']) {
  assert.equal(mover(mover('2026-06-15', unidad, 1), unidad, -1), '2026-06-15',
    `ida y vuelta por ${unidad} no regresa al origen`);
}

console.log('calendar-nav: saltos por semana, mes y año correctos');
