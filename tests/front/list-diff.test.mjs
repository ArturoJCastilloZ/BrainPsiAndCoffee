// Un guardado borra SOLO lo que el usuario quito.
//
// El defecto: saveAppointments (y los catalogos) hacian upsert de toda la
// lista local y despues `delete ... notIn(ids locales)`. Recepcion abre
// Citas a las 9:00, un paciente reserva en la web a las 10:00, recepcion
// cambia el estado de OTRA cita a las 10:05: la reserva del paciente se
// borraba, sin un solo error. Con la lista vacia el borrado era la tabla
// entera de la clinica.
import assert from 'node:assert/strict';
import { fuenteCapaDeDatos } from './_capaDeDatos.mjs';
import { cambiosDeLista, productosDelMenu, opcionesConPosicion } from '../../src/listDiff.mjs';

const cita = (id, extra = {}) => ({ id, status: 'confirmed', name: 'A', date: '2026-10-09', time: '10:00', ...extra });

// 1 · El escenario real: la pantalla nunca vio la reserva web, y cambiar
//     otra cita no puede borrarla. Solo se escribe la que cambio.
{
  const foto = [cita('a'), cita('b')];                 // lo que cargo recepcion
  const ahora = [cita('a', { status: 'cancelled' }), cita('b')];
  const r = cambiosDeLista(ahora, foto);
  assert.deepEqual(r.eliminados, [], 'cambiar una cita no debe borrar nada');
  assert.deepEqual(r.aPersistir.map((c) => c.id), ['a'], 'solo se escribe la cita que cambio');
}

// 2 · Quitar una cita de la lista SI la borra — y solo esa.
{
  const r = cambiosDeLista([cita('a')], [cita('a'), cita('b')]);
  assert.deepEqual(r.eliminados, ['b']);
  assert.deepEqual(r.aPersistir, []);
}

// 3 · Lista vacia contra lista vacia: no se borra nada. Antes esto era
//     `delete().not('id','is',null)`, o sea la tabla entera.
{
  const r = cambiosDeLista([], []);
  assert.deepEqual(r.eliminados, []);
  assert.deepEqual(r.aPersistir, []);
}

// 4 · Alta: es nueva, se persiste, no borra nada.
{
  const r = cambiosDeLista([cita('a'), cita('n')], [cita('a')]);
  assert.deepEqual(r.nuevos.map((c) => c.id), ['n']);
  assert.deepEqual(r.eliminados, []);
}

// 5 · Mismo contenido con las llaves en otro orden no cuenta como cambio.
{
  const r = cambiosDeLista([{ time: '10:00', id: 'a', status: 'confirmed', name: 'A', date: '2026-10-09' }], [cita('a')]);
  assert.deepEqual(r.aPersistir, []);
}

// 6 · Menu: mover un producto de posicion o de categoria es un cambio.
{
  const antes = { cafe: { items: [{ id: 'p1', name: 'Latte' }, { id: 'p2', name: 'Moka' }] } };
  const ahora = { cafe: { items: [{ id: 'p2', name: 'Moka' }, { id: 'p1', name: 'Latte' }] } };
  const r = cambiosDeLista(productosDelMenu(ahora), productosDelMenu(antes));
  assert.deepEqual(r.aPersistir.map((p) => p.id).sort(), ['p1', 'p2']);
  assert.deepEqual(r.eliminados, []);
  const sinCambio = cambiosDeLista(productosDelMenu(antes), productosDelMenu(antes));
  assert.deepEqual(sinCambio.aPersistir, []);
}

// 7 · Opciones con posicion.
{
  const r = cambiosDeLista(opcionesConPosicion([{ id: 'o1' }]), opcionesConPosicion([{ id: 'o1' }, { id: 'o2' }]));
  assert.deepEqual(r.eliminados, ['o2']);
}

// 8 · Guard del sumidero: que el modulo exista y este probado no sirve si
//     el guardado no lo usa. Ningun guardado puede volver a borrar "todo
//     lo que no este en la lista".
{
  const fuente = fuenteCapaDeDatos()
    .replace(/\/\/.*$/gm, '');
  assert.ok(!/\bdeleteMissing\b/.test(fuente), 'deleteMissing volvio a supabaseData.js');
  assert.ok(!/\.notIn\(/.test(fuente), 'un borrado por notIn borra lo que la pantalla nunca vio');
  assert.ok(!/delete\(\)\s*\.not\(\s*['"]id['"]/.test(fuente), 'un delete().not("id"...) borra la tabla entera');
  assert.ok(/cambiosDeLista/.test(fuente), 'los guardados deben decidir con cambiosDeLista');
}

console.log('list-diff: ok');
