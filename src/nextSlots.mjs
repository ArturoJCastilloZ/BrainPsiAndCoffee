// Los proximos horarios libres de un servicio, para ofrecerlos en la
// portada como atajo: tocar uno abre la reserva con fecha y hora puestas.
//
// Usa el MISMO motor que la reserva y el admin (agenda.mjs). Un horario
// que aqui sale libre es uno que el paso 3 de la reserva tambien ofrece.
// Lo ocupado lo trae busy_slots (0038) — sin datos de nadie, solo rangos.

import { poolAvailableSlots } from './agenda.mjs';
import { localISO } from './localDay.mjs';

export function proximosHorarios({
  serviceId, services = [], therapists = [], schedules = [], bookings = [],
  desde = new Date(), dias = 21, max = 6, porDia = 2,
}) {
  if (!serviceId) return [];
  const elegibles = therapists.filter((t) => t.active !== false && t.services?.includes(serviceId));
  if (!elegibles.length || !schedules.length) return [];

  const salida = [];
  for (let i = 0; i < dias && salida.length < max; i += 1) {
    const dia = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + i);
    const date = localISO(dia);
    const horas = poolAvailableSlots({
      date, therapistId: 'any', serviceId, bookings, services,
      eligibleTherapists: elegibles, schedules, now: desde,
    });
    // Pocos por dia: seis horarios del mismo martes dicen menos que dos
    // martes, dos miercoles y dos jueves.
    for (const time of horas.slice(0, porDia)) {
      if (salida.length >= max) break;
      salida.push({ date, time });
    }
  }
  return salida;
}

// "/reservar?servicio=...&fecha=...&hora=..." — BookingFlow lo lee.
export const enlaceReserva = ({ serviceId, date, time } = {}) => {
  const q = new URLSearchParams();
  if (serviceId) q.set('servicio', serviceId);
  if (date) q.set('fecha', date);
  if (time) q.set('hora', time);
  const s = q.toString();
  return s ? `/reservar?${s}` : '/reservar';
};
