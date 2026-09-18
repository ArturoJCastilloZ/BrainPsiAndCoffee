// Motor de contabilidad.
//
// Aparte y probado, como agenda.mjs y menuOptions.mjs. Un panel contable
// cuyos numeros no estan cubiertos por pruebas es exactamente el problema
// que vino a resolver: el "Ingresos estimados" del Dashboard sumaba mal,
// mezclaba los dos negocios y nadie lo notaba.
//
// Tres cifras que NO son la misma y que la pantalla no puede confundir:
//
//   FACTURADO  lo que se debio cobrar: precio de las citas + total de los
//              pedidos del periodo.
//   COBRADO    lo que de verdad entro: los pagos registrados.
//   POR COBRAR facturado menos lo pagado CONTRA ESOS MISMOS documentos —
//              no menos los pagos del periodo. Un pago de enero contra una
//              cita de diciembre no reduce lo por cobrar de enero.

// Dinero en pantalla contable.
//
// formatMXN (utils.jsx) redondea a enteros y pega el signo despues del
// simbolo: -8955 sale como '$-8955', 10300 como '$10300' y 1234.56 pierde
// los centavos. En el menu eso esta bien —'$30' se lee mejor que
// '$30.00'— pero en un estado de resultados no: el separador de miles es
// legibilidad, los centavos son exactitud, y el signo va ANTES.
//
// Por eso es un formateador aparte y no un cambio al global: el mismo
// criterio que separar --bp-rust-text de --bp-rust. Un formato por uso.
const FORMATO_MXN = new Intl.NumberFormat('es-MX', {
  style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export const formatMoney = (n) => FORMATO_MXN.format(Number(n) || 0);

export const CAFETERIA = 'cafeteria';
export const CONSULTORIO = 'consultorio';
export const COMPARTIDO = 'compartido';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const redondea = (n) => Math.round(n * 100) / 100;

// Una cita o un pedido cancelado no se facturo.
const vive = (doc) => doc?.status !== 'cancelled';

// --- Periodos ---------------------------------------------------------

// Partes LOCALES, no toISOString().
//
// toISOString() convierte a UTC: en cualquier zona al este de Greenwich,
// el 1 de septiembre local sale como 31 de agosto, y "este mes" arrancaria
// el dia equivocado. En Monterrey (UTC-6) coincide por casualidad, asi que
// el fallo habria aparecido solo en otra maquina — el peor tipo de bug.
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Rangos con AMBOS extremos inclusivos, en fechas locales ISO.
export const periodRange = (preset, hoy = new Date()) => {
  const y = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (preset) {
    case 'mes':
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)), label: 'Este mes' };
    case 'mes-pasado':
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)), label: 'Mes pasado' };
    case 'anio':
      return { from: iso(new Date(y, 0, 1)), to: iso(new Date(y, 11, 31)), label: 'Este año' };
    case 'semana': {
      const dia = hoy.getDay();
      const lunes = new Date(y, m, hoy.getDate() - ((dia + 6) % 7));
      const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
      return { from: iso(lunes), to: iso(domingo), label: 'Esta semana' };
    }
    default:
      return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)), label: 'Este mes' };
  }
};

// El periodo inmediatamente anterior, de la MISMA duracion. Es contra lo
// que se compara; sin esto la variacion seria un numero inventado, que es
// lo que hacia el Dashboard con sus '+12%' escritos a mano.
export const previousRange = ({ from, to }) => {
  const desde = new Date(`${from}T00:00:00`);
  const hasta = new Date(`${to}T00:00:00`);
  const dias = Math.round((hasta - desde) / 86400000) + 1;
  const finPrev = new Date(desde); finPrev.setDate(desde.getDate() - 1);
  const iniPrev = new Date(finPrev); iniPrev.setDate(finPrev.getDate() - (dias - 1));
  return { from: iso(iniPrev), to: iso(finPrev) };
};

const enRango = (fecha, { from, to }) => {
  if (!fecha) return false;
  const d = String(fecha).slice(0, 10);
  return d >= from && d <= to;
};

// --- Facturado --------------------------------------------------------

export const billedClinic = (appointments = [], range) =>
  redondea(appointments
    .filter((a) => vive(a) && enRango(a.date, range))
    .reduce((s, a) => s + num(a.price), 0));

export const billedCafe = (orders = [], range) =>
  redondea(orders
    .filter((o) => vive(o) && enRango(o.createdAt, range))
    .reduce((s, o) => s + num(o.total), 0));

// --- Cobrado ----------------------------------------------------------

const esDeCafe = (p) => Boolean(p?.orderId);
const esDeClinica = (p) => Boolean(p?.appointmentId);

export const collected = (payments = [], range, area = null) =>
  redondea(payments
    .filter((p) => enRango(p.paidAt, range))
    .filter((p) => area === CAFETERIA ? esDeCafe(p) : area === CONSULTORIO ? esDeClinica(p) : true)
    .reduce((s, p) => s + num(p.amount), 0));

// --- Por cobrar -------------------------------------------------------
//
// Contra los DOCUMENTOS del periodo, no contra los pagos del periodo.
// Y nunca negativo: si a una cita le pagaron de mas, eso es un saldo a
// favor, no una cuenta por cobrar en negativo que enmascare otra deuda.

const pagadoPorDocumento = (payments = [], llave) =>
  payments.reduce((acc, p) => {
    const id = p?.[llave];
    if (!id) return acc;
    acc[id] = num(acc[id]) + num(p.amount);
    return acc;
  }, {});

export const receivableClinic = (appointments = [], payments = [], range) => {
  const pagado = pagadoPorDocumento(payments, 'appointmentId');
  return redondea(appointments
    .filter((a) => vive(a) && enRango(a.date, range))
    .reduce((s, a) => s + Math.max(0, num(a.price) - num(pagado[a.id])), 0));
};

export const receivableCafe = (orders = [], payments = [], range) => {
  const pagado = pagadoPorDocumento(payments, 'orderId');
  return redondea(orders
    .filter((o) => vive(o) && enRango(o.createdAt, range))
    .reduce((s, o) => s + Math.max(0, num(o.total) - num(pagado[o.id])), 0));
};

// --- Gastos y utilidad ------------------------------------------------

export const expensesOf = (expenses = [], range, area = null) =>
  redondea(expenses
    .filter((e) => enRango(e.spentAt, range))
    .filter((e) => area === null ? true : e.area === area)
    .reduce((s, e) => s + num(e.amount), 0));

// Utilidad sobre lo COBRADO, no sobre lo facturado: es flujo real, que es
// lo que un consultorio pequeño necesita saber. La pantalla lo dice.
export const profit = (cobrado, gastos) => redondea(num(cobrado) - num(gastos));

// --- Comparativa ------------------------------------------------------
//
// Calculada contra el periodo anterior. Si no hay base con que comparar
// devuelve null y la pantalla NO pinta un porcentaje — antes se mostraba
// '+12%' escrito a mano, que es inventar un dato.

export const variation = (actual, anterior) => {
  const a = num(actual), b = num(anterior);
  if (b === 0) return { pct: null, direction: a > 0 ? 'up' : 'flat', comparable: false };
  const pct = redondea(((a - b) / Math.abs(b)) * 100);
  return { pct, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', comparable: true };
};

// --- Desgloses --------------------------------------------------------

const agrupa = (filas, llave, etiqueta, importe) => {
  const mapa = filas.reduce((acc, f) => {
    const k = llave(f) || '—';
    if (!acc[k]) acc[k] = { key: k, label: etiqueta(f) || k, total: 0, count: 0 };
    acc[k].total += num(importe(f));
    acc[k].count += 1;
    return acc;
  }, {});
  return Object.values(mapa)
    .map((r) => ({ ...r, total: redondea(r.total), average: redondea(r.total / r.count) }))
    .sort((a, b) => b.total - a.total);
};

export const byService = (appointments = [], services = [], range) => {
  const nombre = (id) => services.find((s) => s.id === id)?.name;
  return agrupa(
    appointments.filter((a) => vive(a) && enRango(a.date, range)),
    (a) => a.serviceId, (a) => nombre(a.serviceId), (a) => a.price,
  );
};

export const byTherapist = (appointments = [], therapists = [], range) => {
  const nombre = (id) => therapists.find((t) => t.id === id)?.name;
  return agrupa(
    appointments.filter((a) => vive(a) && enRango(a.date, range) && a.therapistId),
    (a) => a.therapistId, (a) => nombre(a.therapistId), (a) => a.price,
  );
};

// Los pedidos traen sus lineas; el desglose es por PRODUCTO, no por pedido.
export const byProduct = (orders = [], range) => {
  const lineas = orders
    .filter((o) => vive(o) && enRango(o.createdAt, range))
    .flatMap((o) => (o.items || []).map((i) => ({
      id: i.id, name: i.name, importe: num(i.price) * num(i.qty || 1),
    })));
  return agrupa(lineas, (l) => l.id, (l) => l.name, (l) => l.importe);
};

// --- Metodo de pago ---------------------------------------------------
//
// No es estadistica de color: el efectivo INVALIDA la deduccion del
// paciente (Art. 151 LISR, confirmado en fuente del SAT). La pantalla
// necesita saber cuanto se cobro asi para poder advertirlo.

export const byMethod = (payments = [], range, area = null) => {
  const filtrados = payments
    .filter((p) => enRango(p.paidAt, range))
    .filter((p) => area === CAFETERIA ? esDeCafe(p) : area === CONSULTORIO ? esDeClinica(p) : true);
  return agrupa(filtrados, (p) => p.method, (p) => p.method, (p) => p.amount);
};

// Lo cobrado en efectivo CONTRA CITAS es lo que el paciente no podra
// deducir. Un cafe en efectivo no le importa a nadie.
export const nonDeductibleCash = (payments = [], range) =>
  redondea(payments
    .filter((p) => enRango(p.paidAt, range) && esDeClinica(p) && p.method === 'efectivo')
    .reduce((s, p) => s + num(p.amount), 0));

// --- Serie para la grafica -------------------------------------------
//
// Menos de 4 puntos no se grafica: con 3 meses una linea sugiere una
// tendencia que no existe. La pantalla muestra la tabla.
export const MIN_PUNTOS_GRAFICA = 4;

export const monthlySeries = (appointments = [], orders = [], payments = [], meses = 6, hoy = new Date()) => {
  const serie = [];
  for (let i = meses - 1; i >= 0; i -= 1) {
    const ref = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const range = periodRange('mes', ref);
    serie.push({
      label: ref.toLocaleDateString('es-MX', { month: 'short' }),
      from: range.from,
      facturado: redondea(billedClinic(appointments, range) + billedCafe(orders, range)),
      cobrado: collected(payments, range),
    });
  }
  return serie;
};
