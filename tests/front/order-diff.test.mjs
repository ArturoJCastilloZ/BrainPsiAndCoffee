// Un guardado de pedidos escribe lo que cambio, y nada mas.
//
// El defecto: saveOrders reescribia TODOS los pedidos cargados en cada
// guardado. Cambiar el estado de uno reinsertaba las lineas de todos los
// demas, historial incluido. Fue la causa raiz de DOS ciclos de auditoria:
// antes de la 0026 un pedido podia quedar con cero lineas (el delete
// pasaba, el insert tronaba, sin un solo error visible); con la 0026
// cualquier guardado fallaba al topar el primer pedido cerrado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cambiosDePedidos, huellaPedido, huellaLineas } from '../../src/orderDiff.mjs';

const pedido = (id, extra = {}) => ({
  id, status: 'received', customerName: 'A', total: 100, subtotal: 100,
  items: [{ id: 'p1', name: 'Cafe', qty: 1, price: 100 }],
  ...extra,
});

// 1 · Nada cambio: no se escribe nada. Es el caso que rompia el historial.
{
  const antes = [pedido('1'), pedido('2', { status: 'delivered' })];
  const r = cambiosDePedidos(antes.map((o) => ({ ...o })), antes);
  assert.deepEqual(r.aPersistir, [], 'no cambio nada y aun asi persistia pedidos');
  assert.deepEqual(r.conLineasCambiadas, [], 'no cambio nada y aun asi reescribia lineas');
  assert.equal(r.sinCambio.length, 2);
}

// 2 · Cambia el ESTADO de uno: se persiste ese, y NO se tocan las lineas
//     de nadie. Este es el flujo del barista, el mas frecuente.
{
  const antes = [pedido('1'), pedido('2', { status: 'delivered' })];
  const ahora = [{ ...pedido('1'), status: 'ready' }, pedido('2', { status: 'delivered' })];
  const r = cambiosDePedidos(ahora, antes);
  assert.deepEqual(r.aPersistir.map((o) => o.id), ['1']);
  assert.deepEqual(r.conLineasCambiadas, [],
    'cambiar el estado no debe reescribir lineas: ahi estaba la perdida de datos');
  assert.deepEqual(r.sinCambio.map((o) => o.id), ['2'],
    'el pedido entregado del historial tiene que quedar intacto');
}

// 3 · Cambian las LINEAS: se reescriben solo las de ese pedido.
{
  const antes = [pedido('1'), pedido('2')];
  const ahora = [{ ...pedido('1'), items: [{ id: 'p1', name: 'Cafe', qty: 2, price: 100 }] }, pedido('2')];
  const r = cambiosDePedidos(ahora, antes);
  assert.deepEqual(r.conLineasCambiadas.map((o) => o.id), ['1']);
  assert.deepEqual(r.sinCambio.map((o) => o.id), ['2']);
}

// 4 · Un pedido nuevo entra entero.
{
  const r = cambiosDePedidos([pedido('1'), pedido('9')], [pedido('1')]);
  assert.deepEqual(r.nuevos.map((o) => o.id), ['9']);
  assert.deepEqual(r.conLineasCambiadas.map((o) => o.id), ['9']);
}

// 5 · El orden de las claves de un objeto no cuenta como cambio. Sin JSON
//     estable, {a,b} y {b,a} se verian distintos y reescribirian lineas
//     identicas — justo lo que este modulo existe para evitar.
{
  const a = pedido('1', { items: [{ id: 'p1', name: 'C', qty: 1, price: 10, customizations: { leche: 'entera', shot: 1 } }] });
  const b = pedido('1', { items: [{ id: 'p1', name: 'C', qty: 1, price: 10, customizations: { shot: 1, leche: 'entera' } }] });
  assert.equal(huellaLineas(a), huellaLineas(b), 'el orden de claves no es un cambio');
  assert.deepEqual(cambiosDePedidos([b], [a]).conLineasCambiadas, []);
}

// 6 · La comparacion es sobre el DOMINIO, no sobre la fila mapeada:
//     mapOrderToDb pone updated_at = ahora, asi que comparar filas diria
//     siempre "cambio" y no arreglaria nada.
{
  const capa = readFileSync('src/api/supabaseData.js', 'utf8');
  assert.ok(/updated_at: new Date\(\)\.toISOString\(\)/.test(capa),
    'mapOrderToDb ya no sella updated_at; revisa si la comparacion por dominio sigue siendo necesaria');
  const saveOrders = capa.slice(capa.indexOf('export const saveOrders'), capa.indexOf('export const', capa.indexOf('export const saveOrders') + 10));
  assert.ok(/cambiosDePedidos\(/.test(saveOrders),
    'saveOrders no usa cambiosDePedidos: volveria a reescribir todos los pedidos en cada guardado');
  assert.ok(!/for \(const order of itemsToPersist\)/.test(saveOrders),
    'saveOrders vuelve a recorrer TODOS los pedidos persistidos para reescribir lineas');
}

console.log('order-diff: sin cambios no se escribe, el estado no toca lineas, y el historial queda intacto');
