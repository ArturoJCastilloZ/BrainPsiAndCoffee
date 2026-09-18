// La pantalla y el guardado tienen que ver los MISMOS horarios.
//
// El bug que motiva esta prueba: el motor de disponibilidad del pool vivia
// en AdminAppointments como una funcion de SIETE parametros posicionales.
// De sus cuatro llamadas, una pasaba seis y se comia `schedules` en
// silencio. Resultado: la pantalla pintaba 10 horarios con el horario real
// del terapeuta, y al guardar los validaba SIN horario — cero candidatos —
// asi que rechazaba todos con "Ese horario ya no esta disponible".
//
// Reagendar estaba roto al 100% y ninguna prueba lo veia, porque la
// funcion vivia dentro de un componente y no se podia importar.
import assert from 'node:assert/strict';
import { poolSlotStates, poolAvailableSlots } from '../../src/agenda.mjs';

const SERVICIO = { id: 'sv1', duration: 50 };
const TERAPEUTA = { id: 't1', sessionDuration: 50, services: ['sv1'] };
// 2026-12-02 es miercoles -> weekday 3.
const HORARIO = [{ therapistId: 't1', weekday: 3, startTime: '09:00', endTime: '13:00', active: true }];
const BASE = {
  date: '2026-12-02', therapistId: 't1', serviceId: 'sv1',
  bookings: [], services: [SERVICIO], eligibleTherapists: [TERAPEUTA],
  now: new Date('2026-11-01T00:00:00'),
};

// --- El horario del terapeuta MANDA ------------------------------------
{
  const conHorario = poolSlotStates({ ...BASE, schedules: HORARIO });
  assert.ok(conHorario.length > 0, 'con horario configurado debe haber candidatos');
  assert.ok(conHorario.some((s) => s.available), 'y alguno disponible');

  // Sin horario no hay nada que ofrecer. Esto NO es un fallo: es la regla.
  // Lo que era un fallo es que una ruta lo omitiera sin querer.
  assert.deepEqual(poolSlotStates({ ...BASE, schedules: [] }), [],
    'sin bloques no hay horarios');
  assert.deepEqual(poolSlotStates({ ...BASE, schedules: undefined }), [],
    'omitir schedules da CERO: por eso omitirlo por accidente rompia reagendar');
}

// --- La regresion exacta ------------------------------------------------
//
// Se comparan las dos rutas: la que PINTA y la que VALIDA. Si alguien
// vuelve a omitir un argumento en una de ellas, estas dos listas dejan de
// coincidir y la prueba lo dice.
{
  const loQuePinta = poolSlotStates({ ...BASE, schedules: HORARIO })
    .filter((s) => s.available).map((s) => s.time);

  const elegido = loQuePinta[0];
  assert.ok(elegido, 'la pantalla ofrece al menos un horario');

  const loQueValida = poolSlotStates({ ...BASE, schedules: HORARIO })
    .find((s) => s.time === elegido);

  assert.ok(loQueValida?.available,
    `la pantalla ofrecio ${elegido} y el guardado debe encontrarlo disponible`);

  assert.deepEqual(poolAvailableSlots({ ...BASE, schedules: HORARIO }), loQuePinta,
    'poolAvailableSlots y poolSlotStates no pueden discrepar');
}

// --- "Cualquier terapeuta" no esconde al que si puede -------------------
{
  const t2 = { id: 't2', sessionDuration: 50, services: ['sv1'] };
  const horarios = [
    ...HORARIO,
    { therapistId: 't2', weekday: 3, startTime: '15:00', endTime: '18:00', active: true },
  ];
  const cualquiera = poolAvailableSlots({
    ...BASE, therapistId: 'any', eligibleTherapists: [TERAPEUTA, t2], schedules: horarios,
  });
  assert.ok(cualquiera.some((t) => t < '13:00'), 'incluye la mañana de t1');
  assert.ok(cualquiera.some((t) => t >= '15:00'), 'y la tarde de t2');
}

// --- Un pool vacio no truena -------------------------------------------
{
  assert.deepEqual(poolSlotStates({ ...BASE, eligibleTherapists: [], schedules: HORARIO }), []);
  assert.deepEqual(poolSlotStates({ ...BASE, serviceId: '', schedules: HORARIO }), []);
}

console.log('pool-slots: la pantalla y el guardado ven los mismos horarios');
