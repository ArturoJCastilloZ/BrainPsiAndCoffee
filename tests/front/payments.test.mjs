// El registro de cobros: el saldo, la validacion y la fila que sale a la
// base. Es la pieza que faltaba para que "Cobrado" dejara de ser $0.00.
//
// Las filas se arman como las escribe la APP (mapPaymentFromDb devuelve
// appointmentId / orderId / amount / paidAt), no con una forma comoda
// para la prueba.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PAYMENT_METHODS, CASH_WARNING, needsCashWarning,
  paidFor, amountOf, balanceOf, paymentStatus,
  validatePayment, toPaymentRow, KINDS,
} from '../../src/payments.mjs';

const CITA = { id: 'cita-1', price: 550, status: 'confirmed', date: '2026-09-18' };
const PEDIDO = { id: 'ped-1', total: 120, status: 'delivered', createdAt: '2026-09-18' };

const pago = (extra) => ({
  id: 'p', appointmentId: null, orderId: null,
  amount: 0, method: 'transferencia', paidAt: '2026-09-18T10:00:00Z',
  reference: '', notes: '', ...extra,
});

// --- Saldo ------------------------------------------------------------
{
  assert.equal(amountOf(CITA, 'cita'), 550);
  assert.equal(amountOf(PEDIDO, 'pedido'), 120);

  // Un cobro de la OTRA cita no cuenta, y uno de pedido tampoco.
  const pagos = [
    pago({ appointmentId: 'cita-1', amount: 200 }),
    pago({ appointmentId: 'cita-2', amount: 999 }),
    pago({ orderId: 'cita-1', amount: 999 }),
  ];
  assert.equal(paidFor(pagos, 'cita', 'cita-1'), 200, 'solo suma los cobros de ESA cita');
  assert.equal(balanceOf(CITA, pagos, 'cita'), 350);

  // Sin id no hay saldo que calcular, y no truena.
  assert.equal(paidFor(pagos, 'cita', null), 0);
  assert.equal(paidFor(undefined, 'cita', 'cita-1'), 0);
}

// Cobrar de mas es saldo a favor, no una deuda en negativo: mismo criterio
// que receivableClinic, para que el formulario y las tarjetas no discrepen.
{
  const pagos = [pago({ appointmentId: 'cita-1', amount: 900 })];
  assert.equal(balanceOf(CITA, pagos, 'cita'), 0);
  assert.equal(paymentStatus(CITA, pagos, 'cita').saldo, 0);
}

// --- Estado de la fila ------------------------------------------------
{
  assert.equal(paymentStatus(CITA, [], 'cita').estado, 'pendiente');
  assert.equal(
    paymentStatus(CITA, [pago({ appointmentId: 'cita-1', amount: 200 })], 'cita').estado,
    'parcial',
  );
  assert.equal(
    paymentStatus(CITA, [pago({ appointmentId: 'cita-1', amount: 550 })], 'cita').estado,
    'pagado',
  );

  // La cita que salio en $0.00 NO se pinta como pagada: no tiene importe.
  // Decir "pagada" ahi seria afirmar un hecho falso sobre dinero.
  const sinPrecio = { id: 'cita-0', price: null, status: 'confirmed' };
  assert.equal(paymentStatus(sinPrecio, [], 'cita').estado, 'sin-importe');
  assert.equal(paymentStatus({ id: 'c', price: 0 }, [], 'cita').estado, 'sin-importe');
}

// --- Validacion -------------------------------------------------------
const ok = { kind: 'cita', docId: 'cita-1', amount: 550, method: 'transferencia', paidAt: '2026-09-18' };
const ctx = { doc: CITA, payments: [], canRecord: true };

assert.equal(validatePayment(ok, ctx), null, 'el cobro completo y bien formado pasa');

// El metodo es OBLIGATORIO: 0027 lo declara not null con check de cinco
// valores. Un formulario que lo deje pasar produce un insert rechazado.
assert.match(validatePayment({ ...ok, method: '' }, ctx), /método de pago es obligatorio/);
assert.match(validatePayment({ ...ok, method: undefined }, ctx), /método de pago es obligatorio/);
assert.match(validatePayment({ ...ok, method: 'paypal' }, ctx), /no existe/);

// check (amount > 0)
assert.match(validatePayment({ ...ok, amount: 0 }, ctx), /mayor que cero/);
assert.match(validatePayment({ ...ok, amount: -5 }, ctx), /mayor que cero/);
assert.match(validatePayment({ ...ok, amount: 'abc' }, ctx), /mayor que cero/);

// payments_un_solo_destino: sin destino no hay cobro.
assert.match(validatePayment({ ...ok, docId: '' }, ctx), /Elige la cita/);
assert.match(validatePayment({ ...ok, kind: 'pedido', docId: '' }, ctx), /Elige el pedido/);
assert.match(validatePayment({ ...ok, kind: 'otra-cosa' }, ctx), /a qué se aplica/);

// El rol se vuelve a verificar al enviar, no solo al dibujar el boton: un
// formulario abierto sobrevive a un cambio de rol.
assert.match(validatePayment(ok, { ...ctx, canRecord: false }), /rol no puede registrar/);

// No se cobra de mas, y no se cobra dos veces lo mismo.
assert.match(validatePayment({ ...ok, amount: 551 }, ctx), /excede el saldo/);
{
  const saldado = { ...ctx, payments: [pago({ appointmentId: 'cita-1', amount: 550 })] };
  assert.match(validatePayment(ok, saldado), /ya está cobrado/);
  // Pero el abono sobre un saldo vivo SI pasa.
  const abonado = { ...ctx, payments: [pago({ appointmentId: 'cita-1', amount: 200 })] };
  assert.equal(validatePayment({ ...ok, amount: 350 }, abonado), null);
  assert.match(validatePayment({ ...ok, amount: 351 }, abonado), /excede el saldo/);
}

// La cita sin precio congelado no se cobra a ciegas: se avisa que le falta
// el precio en vez de registrar un importe inventado.
assert.match(
  validatePayment({ ...ok, docId: 'cita-0' }, { ...ctx, doc: { id: 'cita-0', price: null } }),
  /no tiene precio congelado/,
);

// --- Aviso de efectivo ------------------------------------------------
//
// Art. 151 LISR: en efectivo el paciente no deduce. Es del CONSULTORIO;
// un cafe en efectivo no tiene nada que ver y avisarlo ahi enseña a
// ignorar el aviso cuando si importa.
assert.equal(needsCashWarning('efectivo', 'cita'), true);
assert.equal(needsCashWarning('efectivo', 'pedido'), false);
assert.equal(needsCashWarning('transferencia', 'cita'), false);
assert.match(CASH_WARNING, /151/);

// --- La fila que sale a la base ---------------------------------------
{
  const fila = toPaymentRow(ok);
  assert.equal(fila.appointmentId, 'cita-1');
  assert.equal(fila.orderId, null, 'exactamente UN destino: 0027 lo exige');
  assert.equal(fila.amount, 550);
  assert.equal(fila.method, 'transferencia');

  // El id NO viaja: lo pone gen_random_uuid(). Mandarlo en undefined
  // escribe NULL en vez de aplicar el DEFAULT — la trampa que ya costo un
  // intento al guardar un gasto.
  assert.ok(!('id' in fila), 'la clave id se omite, no se manda en undefined');
  assert.deepEqual(
    Object.keys(fila).filter((k) => fila[k] === undefined), [],
    'ninguna clave en undefined',
  );

  const filaPedido = toPaymentRow({ ...ok, kind: 'pedido', docId: 'ped-1', amount: 120 });
  assert.equal(filaPedido.orderId, 'ped-1');
  assert.equal(filaPedido.appointmentId, null);

  // Referencia y notas vacias salen como null, no como cadena vacia.
  assert.equal(toPaymentRow({ ...ok, reference: '   ' }).reference, null);
}

// --- Contrato con la base ---------------------------------------------
//
// Los metodos y los roles NO se afirman de memoria: se leen de 0027. Si
// alguien cambia el check o una policy y no toca el front, esta prueba lo
// dice en vez de descubrirlo con un insert rechazado en produccion.
{
  const sql = readFileSync('migrations/0027_accounting.sql', 'utf8');

  const check = sql.match(/method\s+text not null check \(method in \(([^)]+)\)\)/);
  assert.ok(check, 'no se encontro el check de method en 0027');
  const enLaBase = check[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(
    [...PAYMENT_METHODS].sort(), [...enLaBase].sort(),
    'los metodos del front y el check de 0027 se separaron',
  );

  // La policy de citas pide admin de consultorio o dueño; la de pedidos,
  // admin de cafe o dueño. Ninguna menciona al doctor ni al barista.
  const clinica = sql.slice(sql.indexOf('"Clinic staff manage clinic payments"'));
  assert.match(clinica.slice(0, 400), /appointment_id is not null/);
  assert.match(clinica.slice(0, 400), /is_super_admin\(\) or public\.is_clinic_admin\(\)/);

  const cafe = sql.slice(sql.indexOf('"Cafe staff manage cafe payments"'));
  assert.match(cafe.slice(0, 400), /order_id is not null/);
  assert.match(cafe.slice(0, 400), /is_super_admin\(\) or public\.is_cafe_admin\(\)/);

  assert.ok(!/is_doctor\(\)/.test(sql), 'el doctor no aparece en las policies de 0027');
}

// --- El mapeo rol -> capacidad ----------------------------------------
//
// permissions.js es CommonJS para Node ("type": "commonjs" en
// package.json), asi que no se puede importar desde un .mjs: se lee como
// texto, igual que hace admin-nav.test.mjs.
{
  const permisos = readFileSync('src/auth/permissions.js', 'utf8');
  const fn = permisos.slice(permisos.indexOf('export const canRecordPayment'));
  const cuerpo = fn.slice(0, fn.indexOf('};'));

  assert.match(cuerpo, /kind === 'cita'.*isSuperAdmin\(role\) \|\| isClinicAdmin\(role\)/s);
  assert.match(cuerpo, /kind === 'pedido'.*isSuperAdmin\(role\) \|\| isCafeAdmin\(role\)/s);
  assert.ok(!/isDoctor|isBarista/.test(cuerpo), 'ni el doctor ni el barista registran cobros');
  // Falla cerrado: cualquier otro kind es false.
  assert.match(cuerpo, /return false;/);
}

assert.deepEqual(KINDS, ['cita', 'pedido']);

console.log('payments: saldo, validacion, aviso de efectivo y contrato con 0027');
