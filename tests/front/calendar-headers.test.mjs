// Los encabezados del calendario deben corresponder a los dias reales.
//
// La rejilla de disponibilidad empieza HOY y avanza 35 dias, sin alinear
// a semanas: la primera columna es el dia de hoy, sea cual sea. Con un
// arreglo fijo de encabezados solo acertaba si hoy era martes.
//
// El caso real: el 28/08/2026 —viernes— la columna rotulada 'V' contenia
// el lunes 31. Un usuario que confia en el encabezado agenda el dia
// equivocado, y el error no se nota hasta que el paciente no llega.
import assert from 'node:assert/strict';

const NOMBRES_DIA = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
const weekdayLabelsFrom = (firstDay) => {
  const inicio = firstDay instanceof Date ? firstDay.getDay() : 0;
  return Array.from({ length: 7 }, (_, i) => NOMBRES_DIA[(inicio + i) % 7]);
};

// El caso que lo destapo.
{
  const viernes = new Date(2026, 7, 28);
  const labels = weekdayLabelsFrom(viernes);
  assert.equal(labels[0], 'Vi', '28/08/2026 es viernes: la primera columna debe decir Vi');
  assert.deepEqual(labels, ['Vi', 'Sa', 'Do', 'Lu', 'Ma', 'Mi', 'Ju']);
}

// La propiedad general: para CUALQUIER dia de inicio, la etiqueta de cada
// columna coincide con el dia real de esa columna.
for (let offset = 0; offset < 7; offset += 1) {
  const inicio = new Date(2026, 7, 24 + offset);
  const labels = weekdayLabelsFrom(inicio);
  for (let col = 0; col < 7; col += 1) {
    const real = new Date(inicio);
    real.setDate(inicio.getDate() + col);
    assert.equal(
      labels[col],
      NOMBRES_DIA[real.getDay()],
      `empezando ${inicio.toDateString()}, la columna ${col + 1} rotula ${labels[col]} pero contiene ${real.toDateString()}`,
    );
  }
}

// Sin dias todavia (primer render) no debe reventar.
assert.equal(weekdayLabelsFrom(undefined).length, 7);

console.log('calendar-headers: encabezados alineados con los dias reales');
