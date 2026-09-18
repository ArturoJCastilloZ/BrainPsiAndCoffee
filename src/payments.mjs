// Registro de cobros.
//
// El panel de contabilidad sabia sumar los cobros desde 0027, pero NADA en
// la aplicacion podia crear uno: `savePayment` existia en la capa de datos
// y ninguna pantalla la llamaba. Resultado en pantalla: "Cobrado" siempre
// $0.00 y "Por cobrar" que nunca bajaba.
//
// Este modulo es la regla de negocio del cobro, aparte de la pantalla y
// probado — mismo criterio que accounting.mjs y menuOptions.mjs. Lo que
// decide aqui no lo puede contradecir un formulario.

import { CAFETERIA, CONSULTORIO } from './accounting.mjs';

// Los cinco metodos del check de 0027. Si esta lista y la restriccion de
// la base se separan, el formulario ofrece algo que el insert rechaza.
export const PAYMENT_METHODS = ['efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro'];

export const METHOD_LABEL = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
};

// Art. 151 LISR: el paciente solo deduce honorarios medicos pagados por
// transferencia, tarjeta o cheque nominativo. El EFECTIVO invalida la
// deduccion aunque exista CFDI. No se impide —cobrar en efectivo es legal
// y ocurre— pero no puede pasar en silencio.
export const CASH_WARNING =
  'En efectivo el paciente NO puede deducir esta consulta (Art. 151 LISR), aunque se le expida CFDI.';

// El aviso es del CONSULTORIO. Un cafe cobrado en efectivo no tiene nada
// que ver con la deduccion de honorarios medicos, y avisarlo ahi seria
// ruido que enseña a ignorar el aviso cuando si importa.
export const needsCashWarning = (method, kind) => method === 'efectivo' && kind === 'cita';

// --- A que se aplica un cobro ----------------------------------------
//
// Quien puede cobrar QUE se decide en auth/permissions.js
// (canRecordPayment), junto al resto de la matriz de roles: ahi vive
// normalizeRole, que mapea 'admin' y 'owner' a super_admin. Duplicar ese
// mapeo aqui seria abrir la puerta a que las dos copias se separen.
//
// Y no se puede importar: package.json declara "type": "commonjs", asi que
// para Node un .js es CommonJS y un .mjs no le saca exports con nombre.
// Por eso este modulo recibe la capacidad YA RESUELTA (`canRecord`) en vez
// del rol.
//
// En cualquier caso esto no es la defensa: la defensa son las policies de
// 0027, que no se esquivan. Esto decide que se dibuja y que se deja enviar.

export const KINDS = ['cita', 'pedido'];

export const areaOfKind = (kind) => (kind === 'cita' ? CONSULTORIO : CAFETERIA);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const redondea = (n) => Math.round(n * 100) / 100;

// --- Saldo ------------------------------------------------------------
//
// Lo ya pagado se suma SOLO de los cobros de ese documento. Se cuenta con
// la misma llave que usa accounting.mjs (appointmentId / orderId), para
// que el saldo del formulario y el "Por cobrar" de las tarjetas no puedan
// discrepar: una sola definicion de lo pagado.

export const paidFor = (payments = [], kind, docId) => {
  if (!docId) return 0;
  const llave = kind === 'cita' ? 'appointmentId' : 'orderId';
  return redondea((payments || []).reduce(
    (s, p) => (p && p[llave] === docId ? s + num(p.amount) : s),
    0,
  ));
};

// El importe del documento: la cita congela su `price` (trigger
// freeze_appointment_price), el pedido lleva `total` recalculado en
// servidor desde 0023.
export const amountOf = (doc, kind) => redondea(num(kind === 'cita' ? doc?.price : doc?.total));

// Lo que falta por cobrar de ESE documento. Nunca negativo: un cobro de
// mas es saldo a favor, no una deuda en negativo — mismo criterio que
// receivableClinic en accounting.mjs.
export const balanceOf = (doc, payments, kind) =>
  redondea(Math.max(0, amountOf(doc, kind) - paidFor(payments, kind, doc?.id)));

// Estado de cobro de un documento, para pintar la fila sin que cada
// pantalla lo deduzca por su cuenta (y lo deduzca distinto).
export const paymentStatus = (doc, payments, kind) => {
  const total = amountOf(doc, kind);
  const pagado = paidFor(payments, kind, doc?.id);
  const saldo = redondea(Math.max(0, total - pagado));

  // Sin importe no se puede hablar de saldo. Pasa cuando la cita quedo sin
  // precio congelado; decir "pagada" ahi seria afirmar un hecho falso.
  if (total <= 0) return { estado: 'sin-importe', total, pagado, saldo: 0 };
  if (pagado <= 0) return { estado: 'pendiente', total, pagado, saldo };
  if (saldo <= 0) return { estado: 'pagado', total, pagado, saldo: 0 };
  return { estado: 'parcial', total, pagado, saldo };
};

export const STATUS_LABEL = {
  'sin-importe': 'Sin importe',
  pendiente: 'Pendiente',
  parcial: 'Abonado',
  pagado: 'Pagado',
};

// --- Validacion -------------------------------------------------------
//
// Devuelve el error, o null si el cobro es registrable. Un solo lugar:
// la pantalla no repite la regla ni la relaja.

export const validatePayment = (draft = {}, { doc, payments = [], canRecord } = {}) => {
  const { kind, method } = draft;

  if (kind !== 'cita' && kind !== 'pedido') return 'Hay que elegir a qué se aplica el cobro.';
  if (!draft.docId) return kind === 'cita' ? 'Elige la cita que se cobra.' : 'Elige el pedido que se cobra.';

  // Se verifica aqui tambien, y no solo al dibujar el boton: un formulario
  // abierto sobrevive a un cambio de rol.
  if (!canRecord) return 'Tu rol no puede registrar este tipo de cobro.';

  // 0027 no acepta method null y el check solo admite estos cinco.
  if (!method) return 'El método de pago es obligatorio.';
  if (!PAYMENT_METHODS.includes(method)) return 'Ese método de pago no existe.';

  const monto = num(draft.amount);
  // check (amount > 0) en 0027. Un cobro de cero no es un cobro.
  if (monto <= 0) return 'El importe tiene que ser mayor que cero.';

  if (doc) {
    const { estado, saldo } = paymentStatus(doc, payments, kind);
    if (estado === 'sin-importe') {
      return kind === 'cita'
        ? 'Esta cita no tiene precio congelado. Corrige el precio antes de cobrarla.'
        : 'Este pedido no tiene importe. Revísalo antes de cobrarlo.';
    }
    if (saldo <= 0) return 'Este documento ya está cobrado por completo.';
    // Se permite el abono (monto < saldo); lo que no se permite es cobrar
    // de mas, porque eso desbalancea el libro sin dejar rastro de por que.
    if (monto > saldo) return `El importe excede el saldo pendiente (${saldo.toFixed(2)}).`;
  }

  if (!draft.paidAt) return 'Falta la fecha del cobro.';

  return null;
};

// La fila que espera savePayment / mapPaymentToDb. Exactamente UNO de los
// dos destinos va puesto: 0027 lo exige con payments_un_solo_destino.
//
// El id se OMITE, no se manda en undefined: mandarlo escribe NULL en vez
// de dejar actuar al DEFAULT — el mismo defecto que reventaba al guardar
// un gasto con un id de uid().
export const toPaymentRow = (draft) => ({
  ...(draft.kind === 'cita'
    ? { appointmentId: draft.docId, orderId: null }
    : { orderId: draft.docId, appointmentId: null }),
  amount: redondea(num(draft.amount)),
  method: draft.method,
  paidAt: draft.paidAt,
  reference: draft.reference?.trim() || null,
  notes: draft.notes?.trim() || null,
});
