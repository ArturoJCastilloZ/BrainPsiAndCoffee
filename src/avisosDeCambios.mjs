// Que decir despues de guardar: compara la lista de antes con la de
// despues y lo dice en palabras ("Cita confirmada", "2 servicios
// eliminados"). Puro, para poder probarlo sin pantalla.

const porId = (lista) => new Map((lista || []).map((x) => [x.id, x]));

// Altas, bajas y cambios entre dos listas con id.
export const diferencias = (antes, despues) => {
  const a = porId(antes);
  const d = porId(despues);
  const nuevos = [...d.values()].filter((x) => !a.has(x.id));
  const quitados = [...a.values()].filter((x) => !d.has(x.id));
  const cambiados = [...d.values()].filter((x) => a.has(x.id) && JSON.stringify(a.get(x.id)) !== JSON.stringify(x));
  return { nuevos, quitados, cambiados, antes: a };
};

// { uno: 'Servicio', varios: 'servicios', femenino: false }
export const describirLista = (antes, despues, { uno, varios, femenino = false }) => {
  const { nuevos, quitados, cambiados } = diferencias(antes, despues);
  const o = femenino ? 'a' : 'o';
  const tipos = [nuevos.length, quitados.length, cambiados.length].filter(Boolean).length;
  if (tipos === 0) return '';
  if (tipos > 1) return 'Cambios guardados.';
  const [n, verbo] = nuevos.length ? [nuevos.length, `agregad${o}`]
    : quitados.length ? [quitados.length, `eliminad${o}`]
      : [cambiados.length, `guardad${o}`];
  return n === 1 ? `${uno} ${verbo}.` : `${n} ${varios} ${verbo}s.`;
};

const CITA_ESTADO = {
  confirmed: 'Cita confirmada.',
  completed: 'Cita marcada como completada.',
  requested: 'Cita marcada como solicitud por confirmar.',
};

export const describirCitas = (antes, despues) => {
  const { nuevos, quitados, cambiados, antes: previas } = diferencias(antes, despues);
  if (nuevos.length) return nuevos.length === 1 ? 'Cita creada.' : `${nuevos.length} citas creadas.`;
  if (quitados.length) return quitados.length === 1 ? 'Cita eliminada.' : `${quitados.length} citas eliminadas.`;
  if (cambiados.length !== 1) return cambiados.length ? 'Citas actualizadas.' : '';
  const ahora = cambiados[0];
  const antes1 = previas.get(ahora.id);
  if (ahora.status !== antes1.status) {
    if (ahora.status === 'cancelled') return antes1.status === 'requested' ? 'Solicitud rechazada: el horario quedó libre.' : 'Cita cancelada.';
    return CITA_ESTADO[ahora.status] || 'Cita actualizada.';
  }
  if (ahora.date !== antes1.date || ahora.time !== antes1.time) {
    const dia = new Date(`${ahora.date}T12:00:00`).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    return `Cita reagendada al ${dia} a las ${ahora.time}.`;
  }
  return 'Cita actualizada.';
};

const PEDIDO_ESTADO = {
  preparing: 'Pedido en preparación.',
  ready: 'Pedido listo para entregar.',
  delivered: 'Pedido entregado.',
  cancelled: 'Pedido cancelado.',
  received: 'Pedido recibido.',
};

export const describirPedidos = (antes, despues) => {
  const { nuevos, quitados, cambiados, antes: previos } = diferencias(antes, despues);
  if (nuevos.length) return nuevos.length === 1 ? 'Pedido creado.' : `${nuevos.length} pedidos creados.`;
  if (quitados.length) return quitados.length === 1 ? 'Pedido eliminado.' : `${quitados.length} pedidos eliminados.`;
  if (cambiados.length !== 1) return cambiados.length ? 'Pedidos actualizados.' : '';
  const ahora = cambiados[0];
  return ahora.status !== previos.get(ahora.id).status
    ? (PEDIDO_ESTADO[ahora.status] || 'Pedido actualizado.')
    : 'Pedido actualizado.';
};
