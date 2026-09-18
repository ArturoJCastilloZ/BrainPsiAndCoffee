// Los numeros que ve un contador. Si estos fallan, el panel miente con
// aplomo — que es peor que no tenerlo.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  periodRange, previousRange, billedClinic, billedCafe, collected,
  receivableClinic, receivableCafe, expensesOf, profit, variation,
  byService, byTherapist, byProduct, byMethod, nonDeductibleCash,
  monthlySeries, formatMoney, CAFETERIA, CONSULTORIO,
} from '../../src/accounting.mjs';

const RANGO = { from: '2026-09-01', to: '2026-09-30' };

const CITAS = [
  { id: 'a1', date: '2026-09-05', price: 900, serviceId: 'sv1', therapistId: 'th1', status: 'confirmed' },
  { id: 'a2', date: '2026-09-20', price: 900, serviceId: 'sv1', therapistId: 'th2', status: 'completed' },
  { id: 'a3', date: '2026-09-25', price: 1500, serviceId: 'sv2', therapistId: 'th1', status: 'confirmed' },
  { id: 'a4', date: '2026-09-28', price: 900, serviceId: 'sv1', therapistId: 'th1', status: 'cancelled' },
  { id: 'a5', date: '2026-08-15', price: 900, serviceId: 'sv1', therapistId: 'th1', status: 'confirmed' },
];
const PEDIDOS = [
  { id: 'o1', createdAt: '2026-09-10T10:00:00Z', total: 45, status: 'delivered',
    items: [{ id: 'h1', name: 'Espresso', price: 45, qty: 1 }] },
  { id: 'o2', createdAt: '2026-09-11T10:00:00Z', total: 120, status: 'delivered',
    items: [{ id: 'h1', name: 'Espresso', price: 30, qty: 2 }, { id: 'p1', name: 'Pastel', price: 60, qty: 1 }] },
  { id: 'o3', createdAt: '2026-09-12T10:00:00Z', total: 30, status: 'cancelled',
    items: [{ id: 'h1', name: 'Espresso', price: 30, qty: 1 }] },
];
const PAGOS = [
  { id: 'p1', appointmentId: 'a1', amount: 900, method: 'transferencia', paidAt: '2026-09-05' },
  { id: 'p2', appointmentId: 'a2', amount: 400, method: 'efectivo', paidAt: '2026-09-20' },
  { id: 'p3', orderId: 'o1', amount: 45, method: 'efectivo', paidAt: '2026-09-10' },
];
const GASTOS = [
  { id: 'g1', area: 'consultorio', amount: 500, spentAt: '2026-09-03' },
  { id: 'g2', area: 'cafeteria', amount: 800, spentAt: '2026-09-04' },
  { id: 'g3', area: 'compartido', amount: 9000, spentAt: '2026-09-01' },
  { id: 'g4', area: 'cafeteria', amount: 100, spentAt: '2026-08-04' },
];

// --- Facturado: las canceladas NO cuentan, y el mes vecino tampoco -----
assert.equal(billedClinic(CITAS, RANGO), 3300, '900 + 900 + 1500; la cancelada y la de agosto fuera');
assert.equal(billedCafe(PEDIDOS, RANGO), 165, '45 + 120; el pedido cancelado fuera');

// --- Cobrado, y separado por area ------------------------------------
assert.equal(collected(PAGOS, RANGO), 1345);
assert.equal(collected(PAGOS, RANGO, CONSULTORIO), 1300, 'solo los pagos contra citas');
assert.equal(collected(PAGOS, RANGO, CAFETERIA), 45, 'solo los pagos contra pedidos');

// --- Por cobrar: contra los DOCUMENTOS, no contra los pagos del periodo
{
  // a1 pagada completa, a2 debe 500, a3 debe 1500 -> 2000
  assert.equal(receivableClinic(CITAS, PAGOS, RANGO), 2000);
  assert.equal(receivableCafe(PEDIDOS, PAGOS, RANGO), 120, 'o1 pagado, o2 debe 120, o3 cancelado');

  // Un pago de OTRO periodo contra una cita de ESTE si reduce lo por cobrar.
  const conPagoTardio = [...PAGOS, { id: 'px', appointmentId: 'a3', amount: 1500, paidAt: '2026-10-02' }];
  assert.equal(receivableClinic(CITAS, conPagoTardio, RANGO), 500,
    'el pago de octubre contra la cita de septiembre si salda esa cita');
}

// Un sobrepago NO genera una cuenta por cobrar negativa que tape otra deuda.
{
  const sobrepago = [{ id: 'sp', appointmentId: 'a1', amount: 5000, paidAt: '2026-09-05' }];
  assert.equal(receivableClinic(CITAS, sobrepago, RANGO), 2400,
    'a1 saldada (no -4100), a2 900 y a3 1500 siguen debiendose');
}

// --- Gastos y utilidad ------------------------------------------------
assert.equal(expensesOf(GASTOS, RANGO), 10300, 'los tres de septiembre; el de agosto fuera');
assert.equal(expensesOf(GASTOS, RANGO, CAFETERIA), 800, 'el compartido NO se asigna a un area');
assert.equal(expensesOf(GASTOS, RANGO, CONSULTORIO), 500);
assert.equal(profit(1345, 10300), -8955, 'la utilidad puede ser negativa y se dice');

// --- Comparativa: calculada, y null cuando no hay con que comparar ----
assert.deepEqual(variation(150, 100), { pct: 50, direction: 'up', comparable: true });
assert.deepEqual(variation(50, 100), { pct: -50, direction: 'down', comparable: true });
assert.equal(variation(100, 0).pct, null, 'sin base previa NO se inventa un porcentaje');
assert.equal(variation(100, 0).comparable, false);
assert.equal(variation(0, 0).pct, null);

// --- Periodos ---------------------------------------------------------
{
  const sep = periodRange('mes', new Date(2026, 8, 15));
  assert.deepEqual([sep.from, sep.to], ['2026-09-01', '2026-09-30']);

  const prev = previousRange(sep);
  assert.deepEqual([prev.from, prev.to], ['2026-08-02', '2026-08-31'],
    'el periodo anterior tiene la MISMA duracion —30 dias— y termina justo antes: no es "el mes pasado"');

  // Esta asercion es tambien la prueba de zona horaria: con toISOString()
  // el primero del mes salia como el ultimo del anterior en cualquier TZ
  // al este de UTC, y CI corre en UTC.
  assert.equal(periodRange('mes', new Date(2026, 0, 1)).from, '2026-01-01',
    'el primer dia del mes no puede depender de la zona horaria de la maquina');

  const anio = periodRange('anio', new Date(2026, 8, 15));
  assert.deepEqual([anio.from, anio.to], ['2026-01-01', '2026-12-31']);
}

// --- Desgloses --------------------------------------------------------
{
  const svc = byService(CITAS, [{ id: 'sv1', name: 'Terapia' }, { id: 'sv2', name: 'Valoración' }], RANGO);
  assert.deepEqual(svc.map((r) => [r.label, r.total, r.count]),
    [['Terapia', 1800, 2], ['Valoración', 1500, 1]], 'ordenado por total, sin la cancelada');
  assert.equal(svc[0].average, 900, 'ticket promedio');

  const ths = byTherapist(CITAS, [{ id: 'th1', name: 'Dra A' }, { id: 'th2', name: 'Dr B' }], RANGO);
  // Dra A: a1 (900) + a3 (1500) = 2400. La a4 es suya pero esta cancelada,
  // y la a5 cae en agosto.
  assert.deepEqual(ths.map((r) => [r.label, r.total, r.count]),
    [['Dra A', 2400, 2], ['Dr B', 900, 1]]);

  const prods = byProduct(PEDIDOS, RANGO);
  assert.deepEqual(prods.map((r) => [r.label, r.total]), [['Espresso', 105], ['Pastel', 60]],
    '45 + 30x2 de espresso; el pedido cancelado fuera');
}

// --- Metodo de pago y el aviso fiscal ---------------------------------
{
  const met = byMethod(PAGOS, RANGO);
  assert.equal(met.find((m) => m.key === 'efectivo').total, 445);

  // Solo el efectivo CONTRA CITAS invalida la deduccion del paciente.
  // El cafe en efectivo no le importa a nadie.
  assert.equal(nonDeductibleCash(PAGOS, RANGO), 400,
    'los 400 de la cita, no los 45 del cafe');
}

// --- Serie mensual ----------------------------------------------------
{
  const serie = monthlySeries(CITAS, PEDIDOS, PAGOS, 3, new Date(2026, 8, 15));
  assert.equal(serie.length, 3);
  assert.equal(serie[2].facturado, 3465, 'septiembre: 3300 de citas + 165 de cafe');
  assert.equal(serie[2].cobrado, 1345);
  assert.equal(serie[1].facturado, 900, 'agosto: solo la cita a5');
}

// --- Datos rotos no rompen la caja ------------------------------------
assert.equal(billedClinic([{ id: 'x', date: '2026-09-01', price: null, status: 'confirmed' }], RANGO), 0);
assert.equal(billedClinic([{ id: 'x', date: null, price: 900, status: 'confirmed' }], RANGO), 0);
assert.equal(collected([{ amount: 'abc', paidAt: '2026-09-01' }], RANGO), 0);
assert.equal(billedClinic(undefined, RANGO), 0);
assert.equal(expensesOf(undefined, RANGO), 0);

// --- Dinero en pantalla ----------------------------------------------
// formatMXN daba '$-8955', sin separador de miles y sin centavos. En el
// menu esta bien; en un estado de resultados no.
assert.equal(formatMoney(-8955), '-$8,955.00', 'el signo va ANTES del simbolo');
assert.equal(formatMoney(10300), '$10,300.00', 'separador de miles');
assert.equal(formatMoney(1234.56), '$1,234.56', 'los centavos no se pierden');
assert.equal(formatMoney(undefined), '$0.00', 'un dato roto no imprime NaN');

// --- El puente entre la base y el motor ------------------------------
//
// 0027 agrego appointments.price y el motor lo lee, pero
// mapAppointmentFromDb no lo mapeaba: llegaba undefined y TODO sumaba
// cero. El panel mostraba "2 citas" y "$0.00" a la vez, sin error alguno
// — un fallo mudo, que es el peor tipo.
//
// Lo encontro el dev mirando la pantalla, no una prueba: el motor estaba
// impecable porque las pruebas le pasaban objetos con price a mano.
{
  const src = readFileSync('src/api/supabaseData.js', 'utf8');
  const mapper = src.match(/const mapAppointmentFromDb = \(row\) => \(\{[\s\S]*?\n\}\);/)?.[0] || '';
  assert.ok(mapper.length > 50, 'no se encontro mapAppointmentFromDb');
  assert.ok(
    /price\s*:/.test(mapper),
    'mapAppointmentFromDb debe mapear price: sin el, la contabilidad suma cero sin dar error.',
  );

  // Y el motor tiene que leer esa misma llave.
  assert.equal(
    billedClinic([{ id: 'x', date: '2026-09-10', price: 900, status: 'confirmed' }], RANGO),
    900,
    'el motor lee a.price — si el mapper usara otro nombre, esto seguiria pasando y la app no',
  );
}

console.log('accounting: facturado, cobrado y por cobrar son tres cosas distintas');
