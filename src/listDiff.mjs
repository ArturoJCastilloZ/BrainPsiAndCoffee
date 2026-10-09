// Que cambio de verdad entre dos versiones de una lista que se guarda
// entera (citas, catalogos).
//
// El defecto que cierra: cada guardado hacia upsert de TODA la lista
// local y despues borraba en la base "todo lo que no este en la lista"
// (deleteMissing). La lista local es una foto tomada al cargar la
// pantalla, asi que lo que llego despues —una reserva web, un producto
// que dio de alta otra persona— no estaba en ella y se borraba al primer
// guardado de cualquier otra cosa. Con la lista vacia, el borrado era la
// tabla entera de la clinica.
//
// La regla, la misma que orderDiff.mjs ya aplica a los pedidos: un
// guardado escribe lo que cambio, y borra SOLO lo que el usuario quito —
// lo que estaba en la version anterior y ya no esta en la nueva. Lo que
// la pantalla nunca vio no se toca.
//
// Se comparan objetos de DOMINIO, no filas mapeadas: los mappers ponen
// updated_at = ahora, asi que dos filas del mismo registro nunca serian
// iguales.
import { estable } from './orderDiff.mjs';

const porDefecto = (item) => item?.id;

//   nuevos      : no estaban antes
//   modificados : estaban, y algo cambio
//   aPersistir  : nuevos + modificados, lo unico que se escribe
//   eliminados  : ids que estaban antes y ya no estan, lo unico que se borra
export const cambiosDeLista = (items = [], previos = [], idDe = porDefecto) => {
  const antes = new Map((previos || []).map((p) => [idDe(p), p]));
  const ahora = new Set();
  const nuevos = [];
  const modificados = [];

  for (const item of items || []) {
    const id = idDe(item);
    ahora.add(id);
    const previo = antes.get(id);
    if (!previo) nuevos.push(item);
    else if (estable(item) !== estable(previo)) modificados.push(item);
  }

  const eliminados = [...antes.keys()].filter((id) => id != null && !ahora.has(id));

  return { nuevos, modificados, aPersistir: [...nuevos, ...modificados], eliminados };
};

// El menu se guarda como { categoria: { items: [...] } }, pero en la base
// cada producto es una fila con su categoria y su posicion. Se aplana a
// esa forma para que mover un producto de lugar cuente como cambio.
export const productosDelMenu = (menu) =>
  Object.entries(menu || {}).flatMap(([category, section]) =>
    (section?.items || []).map((item, index) => ({ category, index, item, id: item?.id })));

// Las opciones de producto tambien guardan su posicion.
export const opcionesConPosicion = (options) =>
  (options || []).map((item, index) => ({ index, item, id: item?.id }));
