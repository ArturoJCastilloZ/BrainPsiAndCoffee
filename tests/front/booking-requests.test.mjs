// La reserva de la web es una SOLICITUD (0036).
//
// La base ya lo impone; esto vigila que la agenda, contabilidad y las
// pantallas digan lo mismo que la base: una solicitud aparta el horario,
// una vencida no, y ninguna de las dos es un servicio facturado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solicitudVencida, ocupaHorario, cuentaComoFacturada, SOLICITUD_VENCE_HORAS } from '../../src/appointmentStatus.mjs';
import { timeSlotStates } from '../../src/agenda.mjs';
import { billedClinic } from '../../src/accounting.mjs';

const AHORA = new Date('2026-11-30T12:00:00');
const hace = (horas) => new Date(AHORA.getTime() - horas * 3600 * 1000).toISOString();

// 1 · Vencimiento: 24 h exactas, y solo para solicitudes.
{
  assert.equal(SOLICITUD_VENCE_HORAS, 24);
  assert.equal(solicitudVencida({ status: 'requested', createdAt: hace(23) }, AHORA), false);
  assert.equal(solicitudVencida({ status: 'requested', createdAt: hace(25) }, AHORA), true);
  assert.equal(solicitudVencida({ status: 'confirmed', createdAt: hace(500) }, AHORA), false,
    'una cita confirmada no vence nunca');
  assert.equal(solicitudVencida({ status: 'requested' }, AHORA), false,
    'sin fecha de creacion no se puede afirmar que vencio: se sigue apartando');
}

// 2 · La agenda: la solicitud vigente ocupa, la vencida no.
{
  const SV = { id: 'sv', duration: 50 };
  const DRA = { id: 'dra', sessionDuration: 50, bufferBefore: 0, bufferAfter: 0, slotInterval: 60, minimumNotice: 0 };
  const HORARIO = [{ therapistId: 'dra', weekday: 2, startTime: '13:00', endTime: '15:00', active: true }];
  const estado = (createdAt) => timeSlotStates({
    schedules: HORARIO, therapist: DRA, service: SV, date: '2026-12-01',
    bookings: [{ therapistId: 'dra', serviceId: 'sv', date: '2026-12-01', time: '13:00', durationMinutes: 50, status: 'requested', createdAt }],
    services: [SV], now: AHORA,
  }).find((s) => s.time === '13:00');

  assert.equal(estado(hace(2)).available, false, 'una solicitud vigente debe apartar su horario');
  assert.equal(estado(hace(30)).available, true,
    'una solicitud vencida ya no aparta el horario: la base la cancela al entrar la siguiente reserva');
  assert.equal(ocupaHorario({ status: 'cancelled' }), false);
}

// 3 · Contabilidad: lo por confirmar no esta facturado.
{
  const rango = { from: '2026-12-01', to: '2026-12-31' };
  const citas = [
    { date: '2026-12-02', status: 'confirmed', price: 600 },
    { date: '2026-12-03', status: 'requested', price: 750 },
    { date: '2026-12-04', status: 'cancelled', price: 900 },
  ];
  assert.equal(billedClinic(citas, rango), 600,
    'lo facturado incluyo una solicitud sin confirmar o una cancelada');
  assert.equal(cuentaComoFacturada({ status: 'completed' }), true);
}

// 4 · La reserva publica manda 'requested' y lo dice en la pantalla.
{
  const fuente = readFileSync(new URL('../../src/user/BookingFlow.jsx', import.meta.url), 'utf8');
  assert.ok(/status:\s*'requested'/.test(fuente), 'la reserva publica debe mandarse como solicitud');
  assert.ok(!/status:\s*'confirmed'/.test(fuente), 'la reserva publica no puede presentarse como confirmada');
  assert.ok(!/panel administrativo/.test(fuente), 'jerga interna ("panel administrativo") frente al paciente');
}

console.log('booking-requests: ok');
