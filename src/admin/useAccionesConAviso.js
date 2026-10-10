import { useMemo } from 'react';
import { avisar } from '../components/Avisos';
import { describirCitas, describirLista, describirPedidos } from '../avisosDeCambios.mjs';

// Los guardados del panel, con aviso de exito.
//
// Todo cambio de catalogo, cita o pedido pasa por los setX de
// useSupabaseCrud, que devuelven { ok }. Envolverlos AQUI da el aviso a
// cada pantalla de una vez, sin que cada boton tenga que acordarse: ese
// olvido es justo el que dejaba al dueño sin saber si se guardo.
//
// Solo se avisa del EXITO: los errores ya los muestra el aviso rojo de
// App (y la pantalla que los atrapa).
const CATALOGOS = {
  setServices: { uno: 'Servicio', varios: 'servicios' },
  setSpecialties: { uno: 'Especialidad', varios: 'especialidades', femenino: true },
  setTherapists: { uno: 'Especialista', varios: 'especialistas' },
  setOffers: { uno: 'Promoción', varios: 'promociones', femenino: true },
  setProductOptions: { uno: 'Opción', varios: 'opciones', femenino: true },
  setLocations: { uno: 'Sucursal', varios: 'sucursales', femenino: true },
};
const FIJOS = {
  setMenu: 'Menú guardado.',
  setSettings: 'Datos del negocio guardados.',
};

const resolver = (previo, siguiente) => (typeof siguiente === 'function' ? siguiente(previo) : siguiente);

const conAviso = (fn, previo, describir) => async (siguiente) => {
  const nuevo = resolver(previo, siguiente);
  const r = await fn(nuevo);
  if (r?.ok !== false) avisar.exito(describir(previo, nuevo) || 'Cambios guardados.');
  return r;
};

export function useAccionesConAviso({ bookings, setBookings, orders, setOrders, catalogs, catalogActions }) {
  return useMemo(() => {
    const acciones = { ...catalogActions };
    for (const [nombre, sujeto] of Object.entries(CATALOGOS)) {
      const clave = nombre.replace(/^set/, '').replace(/^./, (c) => c.toLowerCase());
      if (catalogActions?.[nombre]) acciones[nombre] = conAviso(catalogActions[nombre], catalogs?.[clave] || [], (a, d) => describirLista(a, d, sujeto));
    }
    for (const [nombre, texto] of Object.entries(FIJOS)) {
      if (catalogActions?.[nombre]) acciones[nombre] = conAviso(catalogActions[nombre], null, () => texto);
    }
    return {
      catalogActions: acciones,
      setBookings: setBookings ? conAviso(setBookings, bookings || [], describirCitas) : setBookings,
      setOrders: setOrders ? conAviso(setOrders, orders || [], describirPedidos) : setOrders,
    };
  }, [bookings, setBookings, orders, setOrders, catalogs, catalogActions]);
}

// Para acciones sueltas que no pasan por los setX: corre la accion y, si
// no lanzo, avisa.
export const hechoConAviso = (fn, texto) => async (...args) => {
  const r = await fn(...args);
  avisar.exito(typeof texto === 'function' ? texto(r, ...args) : texto);
  return r;
};
