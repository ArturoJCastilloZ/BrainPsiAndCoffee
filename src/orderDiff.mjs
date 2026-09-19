// Que cambio de verdad entre dos versiones de la lista de pedidos.
//
// El defecto que cierra: saveOrders reescribia TODOS los pedidos cargados
// en cada guardado — cambiar el estado de uno reinsertaba las lineas de
// todos los demas, historial incluido. Fue la causa raiz de dos ciclos de
// auditoria seguidos:
//
//   · Antes de la 0026, el borrado de lineas pasaba y el insert podia
//     tronar: el pedido quedaba con CERO lineas. Sin un solo error a la
//     vista.
//   · Con la 0026, un pedido cerrado rechaza el borrado, asi que cualquier
//     guardado fallaba al topar el primer pedido entregado. Se parcheo con
//     un `continue`, pero eso trata el sintoma: el guardado seguia tocando
//     lo que nadie habia modificado.
//
// La regla: un guardado escribe lo que cambio, y nada mas.
//
// Se comparan los objetos de DOMINIO, no las filas mapeadas: mapOrderToDb
// pone updated_at = ahora, asi que dos filas del mismo pedido nunca son
// iguales y la comparacion diria siempre "cambio".

// JSON estable: sin esto, {a:1,b:2} y {b:2,a:1} darian huellas distintas y
// se reescribirian lineas identicas.
const estable = (valor) => {
  if (Array.isArray(valor)) return `[${valor.map(estable).join(',')}]`;
  if (valor && typeof valor === 'object') {
    return `{${Object.keys(valor).sort().map((k) => `${JSON.stringify(k)}:${estable(valor[k])}`).join(',')}}`;
  }
  return JSON.stringify(valor === undefined ? null : valor);
};

// Los campos del pedido que se persisten. Si ninguno cambio, no hay nada
// que escribir en `orders`.
const CAMPOS = [
  'linkedBookingId', 'customerName', 'customerPhone', 'status', 'source',
  'targetReadyAt', 'operationalNotes', 'total', 'subtotal', 'comboSavings',
];

export const huellaPedido = (pedido) =>
  estable(CAMPOS.map((c) => pedido?.[c] ?? null));

// Las lineas, reducidas a lo que de verdad va a order_items. Cualquier
// otra propiedad del objeto del carrito es ruido para esta decision.
export const huellaLineas = (pedido) =>
  estable((pedido?.items || []).map((linea) => [
    linea?.id ?? null,
    linea?.name ?? null,
    Number(linea?.qty || 1),
    Number(linea?.customizations?.totalPrice ?? linea?.price ?? 0),
    linea?.customizations || {},
  ]));

// Reparte los pedidos en lo que hay que escribir y lo que no.
//
//   nuevos              : no estaban antes
//   modificados         : estaban, y algun campo del pedido cambio
//   conLineasCambiadas  : hay que reescribir sus order_items
//   sinCambio           : no se tocan, que es el punto de todo esto
export const cambiosDePedidos = (items = [], previos = []) => {
  const antes = new Map((previos || []).map((p) => [p?.id, p]));
  const nuevos = [];
  const modificados = [];
  const conLineasCambiadas = [];
  const sinCambio = [];

  for (const pedido of items || []) {
    const previo = antes.get(pedido?.id);
    if (!previo) {
      nuevos.push(pedido);
      conLineasCambiadas.push(pedido);
      continue;
    }
    const cambioCabecera = huellaPedido(pedido) !== huellaPedido(previo);
    const cambioLineas = huellaLineas(pedido) !== huellaLineas(previo);
    if (cambioCabecera) modificados.push(pedido);
    if (cambioLineas) conLineasCambiadas.push(pedido);
    if (!cambioCabecera && !cambioLineas) sinCambio.push(pedido);
  }

  return { nuevos, modificados, conLineasCambiadas, sinCambio, aPersistir: [...nuevos, ...modificados] };
};
