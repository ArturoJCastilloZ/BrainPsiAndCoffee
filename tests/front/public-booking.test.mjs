// Fase 4: la reserva publica ofrece horarios reales y sabe para quien es.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enlaceReserva, proximosHorarios } from '../../src/nextSlots.mjs';
import { etiquetaPaciente, nombrePaciente } from '../../src/appointmentStatus.mjs';
import { fuenteCapaDeDatos } from './_capaDeDatos.mjs';

// validation.js es ESM dentro de un paquete "commonjs" (Vite lo trata como
// modulo; Node no). Se carga como modulo desde su texto.
const { validateAppointment } = await import(`data:text/javascript,${encodeURIComponent(
  readFileSync(new URL('../../src/validation.js', import.meta.url), 'utf8'))}`);

const leer = (rel) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8')
  .replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

// Lunes 12 de octubre de 2026, 8:00 local. Martes y miercoles atiende.
const desde = new Date(2026, 9, 12, 8, 0);
const services = [{ id: 'sv', duration: 50, active: true }];
const therapists = [{
  id: 'tt', active: true, services: ['sv'], bufferBefore: 0, bufferAfter: 10, slotInterval: 0, minimumNotice: 1440,
}];
const schedules = [2, 3].map((weekday) => ({ therapistId: 'tt', weekday, startTime: '10:00', endTime: '13:00', active: true }));

// 1 · Proximos horarios: respetan el aviso minimo, lo ocupado y el tope.
{
  const libres = proximosHorarios({ serviceId: 'sv', services, therapists, schedules, desde, max: 4, porDia: 2 });
  assert.deepEqual(libres, [
    { date: '2026-10-13', time: '10:00' }, { date: '2026-10-13', time: '11:00' },
    { date: '2026-10-14', time: '10:00' }, { date: '2026-10-14', time: '11:00' },
  ]);

  // Lo que busy_slots marca ocupado no se ofrece.
  const ocupado = [{ therapistId: 'tt', date: '2026-10-13', time: '10:00', durationMinutes: 50, status: 'confirmed' }];
  const conOcupado = proximosHorarios({ serviceId: 'sv', services, therapists, schedules, bookings: ocupado, desde, max: 1 });
  assert.deepEqual(conOcupado, [{ date: '2026-10-13', time: '11:00' }], 'se ofrecio un horario ocupado');

  // Aviso minimo: a las 8:00 del lunes, el martes 10:00 esta a 26 h.
  // Con 24 h de aviso se ofrece (arriba); con 48 h ya no.
  const conAviso = proximosHorarios({
    serviceId: 'sv', services, schedules, desde, max: 1,
    therapists: [{ ...therapists[0], minimumNotice: 48 * 60 }],
  });
  assert.deepEqual(conAviso, [{ date: '2026-10-14', time: '10:00' }], 'se ofrecio un horario dentro del aviso minimo');

  assert.deepEqual(proximosHorarios({ serviceId: 'sv', services, therapists, schedules: [], desde }), [],
    'sin horario configurado no hay atajos que ofrecer');
  assert.deepEqual(proximosHorarios({ serviceId: null, services, therapists, schedules, desde }), []);
}

// 2 · El enlace del atajo lleva todo, escapado.
assert.equal(enlaceReserva({ serviceId: 'psi infantil', date: '2026-10-13', time: '10:00' }),
  '/reservar?servicio=psi+infantil&fecha=2026-10-13&hora=10%3A00');
assert.equal(enlaceReserva(), '/reservar');

// 3 · Cita para un menor: su nombre es obligatorio; para un adulto no.
{
  const base = { name: 'Mamá', email: 'm@ex.mx', phone: '81 1234 5678', serviceId: 'sv', therapistId: 'tt', date: '2026-10-13', time: '10:00' };
  assert.ok(validateAppointment({ ...base, forMinor: true, patientName: ' ' }).patientName);
  assert.equal(validateAppointment({ ...base, forMinor: true, patientName: 'Leo' }).patientName, undefined);
  assert.equal(validateAppointment({ ...base, forMinor: false }).patientName, undefined);
}

// La agenda nombra a quien se atiende, no a quien reservo.
{
  const cita = { name: 'Mamá Pérez', forMinor: true, patientName: 'Leo Pérez' };
  assert.equal(nombrePaciente(cita), 'Leo Pérez');
  assert.equal(etiquetaPaciente(cita), 'Leo Pérez (con Mamá Pérez)');
  assert.equal(nombrePaciente({ name: 'Ana' }), 'Ana');
}

// 4 · La capa de datos manda for_minor y patient_name, y el visitante
//     lee los horarios y lo ocupado.
{
  const datos = fuenteCapaDeDatos().replace(/\/\/.*$/gm, '');
  assert.match(datos, /for_minor:\s*Boolean\(item\.forMinor\)/);
  assert.match(datos, /patient_name:\s*item\.forMinor \?/);
  assert.ok(!/sessionData\?\.session\s*\n?\s*\?\s*supabase\.from\('therapist_schedules'\)/.test(datos),
    'el visitante volvio a quedarse sin horarios: la reserva publica no tendria nada que ofrecer');
  assert.match(datos, /restRpc\('busy_slots'/);
}

// 5 · La reserva pregunta para quien es, y el boton no se apaga sin decir por que.
{
  const reserva = leer('user/BookingFlow.jsx');
  assert.match(reserva, /¿Para quién es la cita\?/);
  assert.match(reserva, /placeholder="81 1234 5678"/, 'el ejemplo de telefono debe ser de Monterrey');
  assert.ok(!/outline:\s*'none'/.test(reserva.replace(/tituloRef[^\n]*/g, '')), 'un campo apago el anillo de foco');
  assert.match(reserva, /aria-invalid/);
}

// 6 · "Mis citas" no muestra citas ajenas ni ofrece cambios que no se guardan.
{
  const mias = leer('user/MyBookings.jsx');
  assert.match(mias, /misCitas\.includes\(b\.id\)/, 'Mis citas volvio a listar todas las citas que haya en memoria');
  assert.ok(!/setBookings/.test(mias), 'Mis citas volvio a ofrecer cambios que sin sesion no se guardan');
}

// 7 · Ningun control apaga el anillo de foco (auditoria, mejora 2). Solo
//     lo llevan los contenedores que reciben foco por programa
//     (tabIndex={-1}), que no son controles.
{
  const { readdirSync, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const archivos = [];
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.jsx?$/.test(nombre)) archivos.push(ruta);
    }
  };
  recorrer(fileURLToPath(new URL('../../src/', import.meta.url)));
  const culpables = archivos.flatMap((ruta) => readFileSync(ruta, 'utf8').split('\n')
    .filter((l) => /outline:\s*'none'/.test(l) && !/tabIndex=\{-1\}/.test(l))
    .map((l) => `${ruta}: ${l.trim().slice(0, 80)}`));
  assert.deepEqual(culpables, [], `controles sin anillo de foco:\n${culpables.join('\n')}`);
}

console.log('public-booking: ok');
