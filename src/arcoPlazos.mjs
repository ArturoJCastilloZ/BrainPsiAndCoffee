// Derechos ARCO: tipos, estados y el plazo para responder.
//
// La base calcula el plazo de verdad (add_business_days en 0039); esto es
// la MISMA cuenta para mostrarlo — al visitante tras enviar, y al staff
// como "vence en N dias". Si una cambia, tests/front/arco.test.mjs y
// tests/tenancy/0029 lo notan.

export const PLAZO_DIAS_HABILES = 20;

export const TIPOS_ARCO = [
  { id: 'acceso', nombre: 'Acceso', explica: 'Saber qué datos tuyos tenemos y para qué los usamos.' },
  { id: 'rectificacion', nombre: 'Rectificación', explica: 'Corregir datos que estén mal o incompletos.' },
  { id: 'cancelacion', nombre: 'Cancelación', explica: 'Que eliminemos tus datos cuando ya no sean necesarios.' },
  { id: 'oposicion', nombre: 'Oposición', explica: 'Que dejemos de usar tus datos para algún fin concreto.' },
  { id: 'revocacion', nombre: 'Revocar consentimiento', explica: 'Retirar el permiso que nos diste para tratar tus datos.' },
];

export const ESTADOS_ARCO = {
  recibida: 'Recibida',
  verificando_identidad: 'Verificando identidad',
  en_proceso: 'En proceso',
  respondida: 'Respondida',
  improcedente: 'Improcedente',
};

export const CERRADOS = new Set(['respondida', 'improcedente']);

// Lunes a viernes; los feriados no se descuentan (igual que la base).
export function sumarDiasHabiles(desde, dias) {
  const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  let n = 0;
  while (n < dias) {
    d.setDate(d.getDate() + 1);
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) n += 1;
  }
  return d;
}

// Dias habiles que faltan hasta el vencimiento (negativo si ya vencio).
export function diasHabilesRestantes(vence, hoy = new Date()) {
  const fin = new Date(`${vence}T12:00:00`);
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
  const signo = fin >= inicio ? 1 : -1;
  const [a, b] = signo === 1 ? [inicio, fin] : [fin, inicio];
  let n = 0;
  const d = new Date(a);
  while (d < b) {
    d.setDate(d.getDate() + 1);
    const dia = d.getDay();
    if (dia !== 0 && dia !== 6) n += 1;
  }
  return signo * n;
}
