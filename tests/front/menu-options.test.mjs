// El precio que ve el cliente sale de datos editables, asi que se prueba.
import assert from 'node:assert/strict';
import { groupOptions, optionsTotal, describeSelection } from '../../src/menuOptions.mjs';

const OPCIONES = [
  { id: 'milk-entera', kind: 'milk', name: 'Entera', priceDelta: 0, sortOrder: 10, active: true },
  { id: 'milk-desl', kind: 'milk', name: 'Deslactosada', priceDelta: 0, sortOrder: 20, active: true },
  { id: 'flavor-vainilla', kind: 'flavor', name: 'Vainilla', priceDelta: 5, sortOrder: 10, active: true },
  { id: 'flavor-pistacho', kind: 'flavor', name: 'Pistacho', priceDelta: 5, sortOrder: 20, active: true },
  { id: 'flavor-premium', kind: 'flavor', name: 'Premium', priceDelta: 12, sortOrder: 30, active: false },
  { id: 'addon-shot', kind: 'addon', name: 'Shot extra', priceDelta: 10, sortOrder: 10, active: true },
];

// --- Agrupado ---------------------------------------------------------
{
  const g = groupOptions(OPCIONES);
  assert.equal(g.milks.length, 2);
  assert.equal(g.addons.length, 1);
  assert.equal(g.flavors.length, 2, 'un sabor inactivo no se le ofrece al cliente');
  assert.deepEqual(g.flavors.map((f) => f.name), ['Vainilla', 'Pistacho'], 'respeta el orden del admin');
}

// El orden lo manda sort_order, no el orden de llegada de la consulta.
{
  const desordenado = [
    { id: 'b', kind: 'flavor', name: 'Bravo', priceDelta: 5, sortOrder: 30, active: true },
    { id: 'a', kind: 'flavor', name: 'Alfa', priceDelta: 5, sortOrder: 10, active: true },
  ];
  assert.deepEqual(groupOptions(desordenado).flavors.map((f) => f.name), ['Alfa', 'Bravo']);
}

// Sin modificadores configurados no truena: simplemente no se ofrece nada.
{
  const g = groupOptions([]);
  assert.deepEqual([g.milks.length, g.flavors.length, g.addons.length], [0, 0, 0]);
  assert.deepEqual(groupOptions(undefined).flavors, []);
}

// --- Precio -----------------------------------------------------------
const { flavors, addons } = groupOptions(OPCIONES);
const vainilla = flavors[0];
const shot = addons[0];

assert.equal(optionsTotal(30), 30, 'sin modificadores el precio es el del producto');
assert.equal(optionsTotal(30, { flavor: vainilla }), 35);
assert.equal(optionsTotal(30, { addons: [shot] }), 40);
assert.equal(optionsTotal(30, { flavor: vainilla, addons: [shot] }), 45);

// El recargo sale del DATO, no de un 5 escrito en el codigo: subirlo en
// el admin tiene que cambiar el total.
{
  const caro = { ...vainilla, priceDelta: 9 };
  assert.equal(optionsTotal(30, { flavor: caro }), 39,
    'cambiar el precio del sabor en el admin debe cambiar el total');
}

// Centavos: los deltas pueden traer decimales y el total no puede salir
// con la basura binaria del float.
assert.equal(optionsTotal(30, { flavor: { priceDelta: 5.1 }, addons: [{ priceDelta: 10.2 }] }), 45.3);

// Valores rotos no rompen la caja: se ignoran en vez de dar NaN.
assert.equal(optionsTotal(30, { flavor: { priceDelta: 'abc' } }), 30);
assert.equal(optionsTotal(30, { flavor: null, addons: null }), 30);
assert.equal(optionsTotal('no-es-numero'), 0);

// --- Descripcion ------------------------------------------------------
assert.deepEqual(
  describeSelection({ milk: { name: 'Entera' }, flavor: { name: 'Vainilla' }, addons: [{ name: 'Shot extra' }] }),
  ['Entera', 'Vainilla', 'Shot extra'],
);
assert.deepEqual(describeSelection({ milk: { name: 'Entera' } }), ['Entera']);
assert.deepEqual(describeSelection(), []);

console.log('menu-options: el precio sale del dato editable, no del codigo');
