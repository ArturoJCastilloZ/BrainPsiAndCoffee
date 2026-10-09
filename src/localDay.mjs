// El DIA de una fecha, en hora LOCAL.
//
// toISOString() da el dia en UTC. En Monterrey (UTC-6), desde las 18:00
// el dia UTC ya es el siguiente: una reserva hecha a las 19:30 del 9 se
// guardaba para el 10, un cobro de la tarde caia en el dia (o el mes)
// siguiente en Contabilidad, el "hoy" del Dashboard era mañana y las
// promociones vencian seis horas antes. Todo lo que necesite "que dia
// es" pasa por aqui, nunca por toISOString().
//
// Vive en un .mjs para que las pruebas puedan importarlo sin React.
export const localISO = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const todayISO = (now = new Date()) => localISO(now);
