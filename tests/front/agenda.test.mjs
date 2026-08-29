// Motor de disponibilidad: horario del terapeuta, duracion y buffer.
//
// Se prueba aqui y no a ojo porque la aritmetica de buffers es donde se
// cuela el error, y un horario mal ofrecido manda al paciente a una hora
// que la base va a rechazar.
import assert from 'node:assert/strict';
import {
  blocksForDate, isWorkingDay, slotCandidates, timeSlotStates, fromMinutes, toMinutes,
} from '../../src/agenda.mjs';

const SV = { id: 'sv', duration: 50 };
const DRA = {
  id: 'dra', sessionDuration: 50, bufferBefore: 0, bufferAfter: 30,
  slotInterval: 0, minimumNotice: 0,
};
// 2026-12-01 es martes (weekday 2).
const MARTES = '2026-12-01';
const HORARIO = [{ therapistId: 'dra', weekday: 2, startTime: '13:00', endTime: '19:00', active: true }];
const AYER = new Date('2026-11-01T00:00:00');

const horarios = (extra = {}) => timeSlotStates({
  schedules: HORARIO, therapist: { ...DRA, ...extra.therapist },
  service: SV, date: extra.date || MARTES,
  bookings: extra.bookings || [], services: [SV], now: extra.now || AYER,
});

// El caso que pidio el dev: 50 de sesion y 30 de descanso encadenados.
{
  const t = horarios().map((s) => s.time);
  assert.deepEqual(t, ['13:00', '14:20', '15:40', '17:00'],
    'con 50+30 encadenado los horarios son 13:00, 14:20, 15:40, 17:00');
}

// Una cita ocupa la sesion MAS el descanso.
{
  const t = horarios({
    bookings: [{ date: MARTES, time: '13:00', status: 'confirmed', therapistId: 'dra',
                 serviceId: 'sv', durationMinutes: 50, bufferAfter: 30 }],
  });
  assert.equal(t.find((s) => s.time === '13:00').available, false, '13:00 esta ocupado');
  assert.equal(t.find((s) => s.time === '14:20').available, true,
    '14:20 debe quedar libre: es justo cuando el descanso termina');
}

// Una cita cancelada no ocupa nada.
{
  const t = horarios({
    bookings: [{ date: MARTES, time: '13:00', status: 'cancelled', therapistId: 'dra',
                 serviceId: 'sv', durationMinutes: 50, bufferAfter: 30 }],
  });
  assert.equal(t.find((s) => s.time === '13:00').available, true, 'una cita cancelada libera el horario');
}

// Rejilla fija cuando el consultorio la prefiere.
{
  const t = horarios({ therapist: { slotInterval: 15 } }).map((s) => s.time);
  assert.deepEqual(t.slice(0, 4), ['13:00', '13:15', '13:30', '13:45']);
}

// La cita tiene que caber COMPLETA en el bloque. Con 50 minutos el ultimo
// inicio que termina antes de las 19:00 seria 18:10, pero la rejilla de 15
// arranca en 13:00 y 18:10 no cae en ella: el ultimo candidato real es
// 18:00. Las dos condiciones se aplican, no solo la de caber.
{
  const t = horarios({ therapist: { slotInterval: 15 } }).map((s) => s.time);
  assert.equal(t[t.length - 1], '18:00', 'el ultimo horario debe caber Y caer en la rejilla');
  assert.ok(!t.includes('18:15'), '18:15 mas 50 minutos pasaria de las 19:00');
}

// Agenda partida: la comida queda fuera sin campo especial.
{
  const partido = [
    { therapistId: 'dra', weekday: 2, startTime: '09:00', endTime: '14:00', active: true },
    { therapistId: 'dra', weekday: 2, startTime: '15:00', endTime: '19:00', active: true },
  ];
  const t = timeSlotStates({
    schedules: partido, therapist: { ...DRA, slotInterval: 60 }, service: SV,
    date: MARTES, bookings: [], services: [SV], now: AYER,
  }).map((s) => s.time);
  assert.ok(t.includes('13:00'), 'la mañana llega hasta las 13:00');
  assert.ok(!t.includes('14:00'), 'las 14:00 caen en la comida y no deben ofrecerse');
  assert.ok(t.includes('15:00'), 'la tarde arranca a las 15:00');
}

// Un dia sin bloques no es laboral.
{
  assert.equal(isWorkingDay(HORARIO, 'dra', '2026-12-02'), false, 'el miercoles no tiene bloques');
  assert.equal(isWorkingDay(HORARIO, 'dra', MARTES), true);
  assert.equal(horarios({ date: '2026-12-02' }).length, 0, 'un dia no laboral no ofrece horarios');
}

// La anticipacion minima descarta lo que ya no da tiempo de preparar.
{
  const t = horarios({
    therapist: { minimumNotice: 1440 },
    now: new Date('2026-11-30T18:00:00'),
  });
  assert.ok(t.every((s) => !s.available), 'con 24h de anticipacion, mañana ya no se puede reservar');
  assert.match(t[0].reason, /anticipaci/i);
}

// Los buffers negativos (solape intencional) no rompen el motor.
{
  const t = horarios({
    therapist: { bufferAfter: -10, slotInterval: 0 },
  }).map((s) => s.time);
  assert.equal(t[0], '13:00');
  assert.equal(t[1], '13:40', 'con buffer -10 los horarios se encabalgan a proposito');
}

// Conversion de minutos, ida y vuelta.
assert.equal(fromMinutes(toMinutes('09:05')), '09:05');
assert.equal(fromMinutes(toMinutes('18:40')), '18:40');

console.log('agenda: motor de disponibilidad correcto');
