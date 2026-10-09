export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const phonePattern = /^[0-9+\s().-]{8,20}$/;

export const isValidEmail = (value) => emailPattern.test(String(value || '').trim());
export const isValidPhone = (value) => phonePattern.test(String(value || '').trim());
export const isNonEmpty = (value) => String(value || '').trim().length > 0;
export const isValidMoney = (value) => Number.isFinite(Number(value)) && Number(value) >= 0;
export const isValidPositiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) > 0;

export const normalizePhone = (value) => String(value || '').replace(/[^\d+]/g, '');

export const validateAppointment = (data) => {
  const errors = {};
  if (!isNonEmpty(data.name)) errors.name = 'Escribe tu nombre.';
  if (!isNonEmpty(data.email)) errors.email = 'Escribe tu correo.';
  else if (!isValidEmail(data.email)) errors.email = 'Revisa el correo: falta la @ o el dominio.';
  if (!isNonEmpty(data.phone)) errors.phone = 'Escribe tu WhatsApp.';
  else if (!isValidPhone(data.phone)) errors.phone = 'Escribe un teléfono de 10 dígitos.';
  // Cita para una niña o un niño (0038): quien reserva es el adulto
  // responsable y el paciente es el menor, con su propio nombre.
  if (data.forMinor && String(data.patientName || '').trim().length < 2) {
    errors.patientName = 'Escribe el nombre de la niña o el niño.';
  }
  if (!isNonEmpty(data.serviceId)) errors.serviceId = 'Selecciona un servicio.';
  if (!isNonEmpty(data.therapistId)) errors.therapistId = 'Selecciona un profesional.';
  if (!isNonEmpty(data.date)) errors.date = 'Selecciona una fecha.';
  if (!isNonEmpty(data.time)) errors.time = 'Selecciona un horario.';
  if (String(data.notes || '').length > 280) errors.notes = 'Usa máximo 280 caracteres.';
  return errors;
};

export const validateOrder = (data) => {
  const errors = {};
  if (!isNonEmpty(data.customerName)) errors.customerName = 'Ingresa el nombre del cliente.';
  if (!isValidPhone(data.customerPhone)) errors.customerPhone = 'Escribe un teléfono de 10 dígitos.';
  if (String(data.operationalNotes || '').length > 280) errors.operationalNotes = 'Usa máximo 280 caracteres.';
  return errors;
};
