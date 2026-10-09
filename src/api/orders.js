// Pedidos de la cafeteria.
import { conCliente } from './supabaseClient';
import { cambiosDePedidos } from '../orderDiff.mjs';
import { isBarista } from '../auth/permissions';
import { cambiosDeLista } from '../listDiff.mjs';
import { validateOrder } from '../validation';
import { throwIfError, hasAuthSession, getAuthRole, deleteRemoved } from './shared';
import { mapOrderFromDb, mapOrderToDb } from './mappers';

export const loadOrders = async () => {
  const supabase = await conCliente();
  const result = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });
  throwIfError(result);
  return (result.data || []).map(mapOrderFromDb);
};

export const saveOrders = async (items, previousItems = []) => {
  const supabase = await conCliente();
  const authenticated = await hasAuthSession();
  const role = authenticated ? await getAuthRole() : null;
  const invalid = items.find((item) => Object.keys(validateOrder(item)).length);
  if (invalid) throw new Error('El pedido requiere nombre y telefono validos.');
  // Un guardado escribe LO QUE CAMBIO, y nada mas.
  //
  // Antes reescribia todos los pedidos cargados: cambiar el estado de uno
  // reinsertaba las lineas de todos los demas, historial incluido. Fue la
  // causa raiz de dos ciclos de auditoria — un pedido podia quedar con
  // cero lineas, y despues de la 0026 cualquier guardado fallaba al topar
  // el primer pedido cerrado. El `continue` de abajo trataba el sintoma.
  const cambios = cambiosDePedidos(items, previousItems);
  // Sin sesion solo se crean pedidos nuevos: el checkout publico no edita
  // los ajenos. Con sesion, ademas, se persisten los modificados.
  const itemsToPersist = authenticated ? cambios.aPersistir : cambios.nuevos;

  if (isBarista(role)) {
    const previousById = new Map(previousItems.map((item) => [item.id, item]));
    const statusUpdates = items.filter((item) => previousById.get(item.id)?.status !== item.status);
    for (const order of statusUpdates) {
      throwIfError(await supabase
        .from('orders')
        .update({ status: order.status, updated_at: new Date().toISOString() })
        .eq('id', order.id));
    }
    return items;
  }

  if (itemsToPersist.length) {
    const rows = itemsToPersist.map(mapOrderToDb);
    throwIfError(authenticated
      ? await supabase.from('orders').upsert(rows)
      : await supabase.from('orders').insert(rows));
  }
  if (authenticated) await deleteRemoved('orders', cambiosDeLista(items, previousItems).eliminados);

  // Solo los pedidos cuyas LINEAS cambiaron. Para los demas no se toca
  // order_items, ni siquiera para reinsertar lo mismo.
  const conLineas = authenticated
    ? cambios.conLineasCambiadas
    : cambios.nuevos;

  for (const order of conLineas) {
    // Se conserva como defensa en profundidad, no como el arreglo.
    //
    // El bucle BORRA las lineas y las reinserta en dos peticiones SIN
    // transaccion: si la segunda falla, el pedido queda sin lineas. Ahora
    // solo corre cuando las lineas de verdad cambiaron, asi que la ventana
    // es mucho mas estrecha — pero sigue existiendo, y cerrarla del todo
    // pide una RPC transaccional, que es cambio de esquema.
    //
    // La inmutabilidad de 0026 rechaza tocar un pedido cerrado. Que este
    // filtro siga aqui evita pedir algo que la base va a negar.
    if (order.status === 'delivered' || order.status === 'cancelled') continue;

    if (authenticated) throwIfError(await supabase.from('order_items').delete().eq('order_id', order.id));
    const rows = (order.items || []).map((item) => ({
      order_id: order.id,
      product_id: item.id || null,
      name: item.name,
      quantity: Number(item.qty || 1),
      unit_price: Number(item.customizations?.totalPrice || item.price || 0),
      options: item.customizations || {},
    }));
    if (rows.length) throwIfError(await supabase.from('order_items').insert(rows));
  }

  return items;
};
