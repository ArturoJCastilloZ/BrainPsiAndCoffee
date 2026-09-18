// Motor de disponibilidad.
//
// Vive aparte de la interfaz para poder probarlo: la aritmetica de
// buffers y bloques es donde se cuela el error, y a ojo no se ve.
//
// Reglas, decididas con el dev y respaldadas por la investigacion:
//   · la DURACION la manda el servicio — es un hecho clinico;
//   · el BUFFER lo manda el terapeuta — es su ritmo de trabajo;
//   · un horario es una lista de bloques por dia de la semana, asi que
//     una agenda partida (mañana y tarde) deja la comida fuera sola;
//   · la cita tiene que caber COMPLETA dentro de un bloque.
//
// Ninguna de estas cifras esta fija en codigo: no existe normativa
// mexicana que las imponga, asi que las define cada consultorio.

export const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const fromMinutes = (total) => {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Los bloques que aplican a una fecha. weekday 0 = domingo, igual que
// getDay() y que la columna en la base.
export const blocksForDate = (schedules, therapistId, date) => {
  const weekday = new Date(`${date}T12:00:00`).getDay();
  return (schedules || [])
    .filter((b) => b.therapistId === therapistId && b.active !== false && b.weekday === weekday)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime));
};

export const isWorkingDay = (schedules, therapistId, date) =>
  blocksForDate(schedules, therapistId, date).length > 0;

// Cuanto dura la cita segun el servicio, con el terapeuta como respaldo.
export const durationFor = (service, therapist) =>
  Number(service?.duration || therapist?.sessionDuration || 50);

// El rango que una cita OCUPA de verdad: la sesion mas los buffers. Es lo
// mismo que la base guarda en la columna slot, y tiene que coincidir o la
// interfaz ofreceria horarios que el motor rechaza.
export const occupiedRange = (startMinutes, duration, therapist) => ({
  from: startMinutes - Number(therapist?.bufferBefore || 0),
  to: startMinutes + duration + Number(therapist?.bufferAfter || 0),
});

// Candidatos dentro de los bloques del dia: cada slotInterval, y solo si
// la cita entera cabe en el bloque. Una sesion de 50 minutos a las 18:40
// termina 19:30 y no cabe en un bloque que cierra a las 19:00.
// slotInterval = 0 significa AUTOMATICO: los horarios se encadenan, cada
// uno arranca justo cuando el anterior libera (duracion + buffer). Con 50
// de sesion y 30 de descanso da 13:00, 14:20, 15:40 — que es como trabaja
// un consultorio de verdad y lo que el sistema ya hacia.
//
// Un intervalo fijo (15, 30) da una rejilla pareja tipo Calendly: mas
// opciones al paciente, pero huecos muertos cuando la duracion no divide
// al intervalo. Los dos modos existen porque los dos son legitimos; el
// automatico es el default.
export const slotCandidates = ({ schedules, therapist, date, duration }) => {
  const intervalo = Number(therapist?.slotInterval || 0);
  const paso = intervalo > 0
    ? intervalo
    : duration + Number(therapist?.bufferBefore || 0) + Number(therapist?.bufferAfter || 0);

  const salida = [];
  for (const bloque of blocksForDate(schedules, therapist.id, date)) {
    const inicio = toMinutes(bloque.startTime);
    const fin = toMinutes(bloque.endTime);
    // Un paso de 0 o negativo colgaria el ciclo. No deberia pasar —la base
    // acota los valores— pero el front no es el lugar para confiar en eso.
    if (paso <= 0) continue;
    for (let t = inicio; t + duration <= fin; t += paso) {
      salida.push(t);
    }
  }
  return salida;
};

// Estado de cada horario del dia para un terapeuta concreto.
export const timeSlotStates = ({
  schedules, therapist, service, date, bookings, services, now = new Date(),
}) => {
  if (!therapist || !date) return [];
  const duration = durationFor(service, therapist);
  const candidatos = slotCandidates({ schedules, therapist, date, duration });

  // Lo que ya esta ocupado ese dia, con el buffer de CADA cita: dos citas
  // pueden tener buffers distintos si el terapeuta lo cambio en medio.
  const ocupados = (bookings || [])
    .filter((b) => b.date === date && b.status !== 'cancelled' && b.therapistId === therapist.id)
    .map((b) => {
      const s = (services || []).find((x) => x.id === b.serviceId);
      const d = Number(b.durationMinutes || s?.duration || therapist.sessionDuration || 50);
      return occupiedRange(toMinutes(b.time), d, {
        bufferBefore: b.bufferBefore ?? therapist.bufferBefore,
        bufferAfter: b.bufferAfter ?? therapist.bufferAfter,
      });
    });

  const minimoAviso = Number(therapist.minimumNotice || 0);
  const limite = new Date(now.getTime() + minimoAviso * 60000);

  return candidatos.map((inicio) => {
    const time = fromMinutes(inicio);
    const rango = occupiedRange(inicio, duration, therapist);

    if (new Date(`${date}T${time}:00`) < limite) {
      return { time, available: false, reason: minimoAviso ? 'Requiere más anticipación' : 'Horario pasado' };
    }
    const choca = ocupados.some((o) => rango.from < o.to && rango.to > o.from);
    return { time, available: !choca, reason: choca ? 'Ocupado' : 'Disponible' };
  });
};

export const availableSlots = (args) =>
  timeSlotStates(args).filter((s) => s.available).map((s) => s.time);

// --- Disponibilidad de un POOL de terapeutas --------------------------
//
// Vivia dentro de AdminAppointments como una funcion de SIETE parametros
// POSICIONALES, y eso costo un bug en produccion: una de las cuatro
// llamadas pasaba seis y se comia `schedules` en silencio. La pantalla
// pintaba horarios con el horario real y el guardado los validaba SIN el,
// asi que rechazaba todos con "Ese horario ya no esta disponible".
//
// Con argumentos NOMBRADOS un olvido sigue siendo posible, pero ya no es
// invisible: la clave falta a la vista en el sitio de llamada, en vez de
// esconderse en la septima posicion de una lista.
//
// Un horario aparece si ALGUNO del pool lo ofrece, y queda disponible si
// alguno lo tiene libre: "cualquier terapeuta" no debe esconder la
// disponibilidad del que si puede atender.
export const poolSlotStates = ({
  date, therapistId, serviceId, bookings, eligibleTherapists, services, schedules, now,
}) => {
  if (!date || !serviceId) return [];

  const pool = therapistId === 'any'
    ? eligibleTherapists
    : (eligibleTherapists || []).filter((t) => t.id === therapistId);
  if (!pool.length) return [];

  const service = (services || []).find((x) => x.id === serviceId);

  const porHora = new Map();
  for (const therapist of pool) {
    for (const slot of timeSlotStates({
      schedules, therapist, service, date, bookings, services, ...(now ? { now } : {}),
    })) {
      const previo = porHora.get(slot.time);
      if (!previo || (!previo.available && slot.available)) porHora.set(slot.time, slot);
    }
  }

  return [...porHora.values()].sort((a, b) => a.time.localeCompare(b.time));
};

export const poolAvailableSlots = (args) =>
  poolSlotStates(args).filter((s) => s.available).map((s) => s.time);
