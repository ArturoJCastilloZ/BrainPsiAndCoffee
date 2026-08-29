// Agregar bloques a un dia.
//
// Varios bloques el mismo dia son a proposito —asi se expresa una agenda
// partida y la comida queda fuera— pero uno nuevo tiene que empezar
// DESPUES del ultimo. Antes nacian todos en 09:00-14:00, asi que pulsar
// el boton cinco veces dejaba cinco bloques encimados que la validacion
// rechazaba despues, sin explicar que habia pasado.
import assert from 'node:assert/strict';
import { fromMinutes, toMinutes } from '../../src/agenda.mjs';

// Replica de addBlock en AdminSchedules.jsx.
const agregar = (bloques, weekday) => {
  const delDia = bloques
    .filter((x) => x.weekday === weekday)
    .sort((x, y) => toMinutes(x.startTime) - toMinutes(y.startTime));
  const ultimo = delDia[delDia.length - 1];
  const inicio = ultimo ? toMinutes(ultimo.endTime) + 60 : 9 * 60;
  const fin = Math.min(inicio + 240, 23 * 60 + 59);
  if (inicio >= fin) return bloques;
  return [...bloques, { weekday, startTime: fromMinutes(inicio), endTime: fromMinutes(fin) }];
};

const seEnciman = (bloques, weekday) => {
  const delDia = bloques
    .filter((x) => x.weekday === weekday)
    .sort((x, y) => toMinutes(x.startTime) - toMinutes(y.startTime));
  return delDia.some((b, i) => i > 0 && toMinutes(b.startTime) < toMinutes(delDia[i - 1].endTime));
};

// El primero arranca a las 09:00.
{
  const b = agregar([], 2);
  assert.deepEqual(b[0], { weekday: 2, startTime: '09:00', endTime: '13:00' });
}

// El segundo deja una hora de hueco: es la comida, que es para lo que
// sirve partir el dia.
{
  const b = agregar(agregar([], 2), 2);
  assert.equal(b[1].startTime, '14:00', 'el segundo bloque empieza una hora despues del primero');
  assert.ok(!seEnciman(b, 2), 'dos bloques seguidos no deben encimarse');
}

// Pulsar el boton muchas veces no debe producir bloques encimados —el
// sintoma que reporto el dev— ni crecer sin limite.
{
  let b = [];
  for (let i = 0; i < 10; i += 1) b = agregar(b, 2);
  assert.ok(!seEnciman(b, 2), `diez pulsaciones dejaron bloques encimados: ${JSON.stringify(b)}`);
  assert.ok(b.length < 10, 'el dia se llena y deja de aceptar bloques nuevos');
  assert.ok(b.every((x) => toMinutes(x.endTime) <= 23 * 60 + 59), 'ningun bloque pasa de las 23:59');
}

// Cada dia es independiente.
{
  let b = agregar([], 2);
  b = agregar(b, 4);
  assert.equal(b.filter((x) => x.weekday === 4)[0].startTime, '09:00',
    'un dia nuevo empieza en 09:00 aunque otro ya tenga bloques');
}

console.log('schedule-blocks: los bloques se agregan sin encimarse');
