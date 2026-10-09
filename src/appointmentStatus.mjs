// Que significa el estado de una cita, en un solo lugar.
//
// Desde 0036 la reserva de la web entra como 'requested' (Por confirmar):
// aparta el horario hasta que la clinica la confirma o la rechaza, y si
// en 24 horas nadie lo hace deja de apartarlo. La base aplica esa regla
// al recibir la siguiente reserva; la agenda, contabilidad y las
// pantallas la leen de aqui para decir lo mismo que la base.

export const SOLICITUD_VENCE_HORAS = 24;

export const ESTADOS = {
  requested: 'Por confirmar',
  confirmed: 'Confirmada',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

// Una solicitud que nadie confirmo a tiempo. La base la cancela cuando
// entra la siguiente reserva; mientras tanto, ya no aparta el horario.
export const solicitudVencida = (cita, ahora = new Date()) => {
  if (cita?.status !== 'requested' || !cita?.createdAt) return false;
  const creada = new Date(cita.createdAt).getTime();
  if (!Number.isFinite(creada)) return false;
  return ahora.getTime() - creada > SOLICITUD_VENCE_HORAS * 3600 * 1000;
};

// Si la cita aparta su horario en la agenda.
export const ocupaHorario = (cita, ahora = new Date()) =>
  cita?.status !== 'cancelled' && !solicitudVencida(cita, ahora);

// Si cuenta como servicio facturado. Una solicitud todavia no es un
// compromiso: contarla inflaria lo facturado con citas que quiza no pasen.
export const cuentaComoFacturada = (cita) =>
  cita?.status !== 'cancelled' && cita?.status !== 'requested';

// Para quien es la cita (0038). Si es para una niña o un niño, el
// paciente es el menor y `name` es el adulto que reservo: la agenda tiene
// que nombrar a quien se atiende, no a quien llamo.
export const nombrePaciente = (cita) =>
  (cita?.forMinor && cita?.patientName ? cita.patientName : cita?.name || '');

export const etiquetaPaciente = (cita) =>
  (cita?.forMinor && cita?.patientName ? `${cita.patientName} (con ${cita.name})` : cita?.name || '');
