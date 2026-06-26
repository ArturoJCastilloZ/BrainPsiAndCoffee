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
  if (!isNonEmpty(data.name)) errors.name = 'Ingresa tu nombre.';
  if (!isValidEmail(data.email)) errors.email = 'Ingresa un correo valido.';
  if (!isValidPhone(data.phone)) errors.phone = 'Ingresa un telefono valido.';
  if (!isNonEmpty(data.serviceId)) errors.serviceId = 'Selecciona un servicio.';
  if (!isNonEmpty(data.therapistId)) errors.therapistId = 'Selecciona un profesional.';
  if (!isNonEmpty(data.date)) errors.date = 'Selecciona una fecha.';
  if (!isNonEmpty(data.time)) errors.time = 'Selecciona un horario.';
  if (String(data.notes || '').length > 280) errors.notes = 'Usa maximo 280 caracteres.';
  return errors;
};

export const validateOrder = (data) => {
  const errors = {};
  if (!isNonEmpty(data.customerName)) errors.customerName = 'Ingresa el nombre del cliente.';
  if (!isValidPhone(data.customerPhone)) errors.customerPhone = 'Ingresa un telefono valido.';
  return errors;
};
