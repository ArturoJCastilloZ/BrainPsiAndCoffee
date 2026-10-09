import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadAppointments,
  loadCatalogs,
  loadOrders,
  saveAppointments,
  saveMenu,
  saveOffers,
  saveProductOptions,
  saveOrders,
  saveSpecialties,
  saveSettings,
  saveServices,
  saveTherapists,
} from '../api/supabaseData';
import { BUSINESS } from '../businessInfo';
import { supabase } from '../api/supabaseClient';
import { canManageAppointments, canManageOrders } from '../auth/permissions';

const resolveNext = (value, next) => (typeof next === 'function' ? next(value) : next);

// Estado local que se guarda en la base.
//
// Antes el guardado se lanzaba DENTRO del updater de setState (impuro: con
// StrictMode se guardaria dos veces), y si fallaba la pantalla conservaba
// el cambio: decia "listo" sobre algo que la base habia rechazado. Tampoco
// se usaba lo que la base devolvia (el patient_id que pone el trigger), y
// un error se quedaba en pantalla para siempre aunque el siguiente
// guardado saliera bien.
//
// Ahora setAndSave devuelve una promesa con { ok, value | error }:
//   · aplica el cambio en pantalla de inmediato (la UI no espera a la red),
//   · si la base lo rechaza, lo DESHACE — salvo que la lista ya haya vuelto
//     a cambiar, en cuyo caso deshacer pisaria un cambio posterior,
//   · si sale bien, adopta lo que la base guardo y limpia el error.
// Quien necesite saber si se guardo (la reserva, el carrito) hace await.
const useRemoteState = (initialValue, saveRemote) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState(null);
  const valueRef = useRef(initialValue);

  const commit = useCallback((next) => {
    valueRef.current = next;
    setValue(next);
  }, []);

  const setLocal = useCallback((next) => commit(resolveNext(valueRef.current, next)), [commit]);

  const setAndSave = useCallback(async (next) => {
    const previous = valueRef.current;
    const resolved = resolveNext(previous, next);
    commit(resolved);
    try {
      const saved = await saveRemote(resolved, previous);
      if (saved !== undefined && valueRef.current === resolved) commit(saved);
      setError(null);
      return { ok: true, value: saved };
    } catch (err) {
      console.error(err);
      if (valueRef.current === resolved) commit(previous);
      setError(err);
      return { ok: false, error: err };
    }
  }, [commit, saveRemote]);

  return [value, setLocal, setAndSave, error];
};

export const useSupabaseCrud = (session) => {
  // De la sesion solo salen PRIMITIVOS, nunca el objeto.
  //
  // refreshActivity() emite una sesion NUEVA cada 30 segundos de
  // actividad —click, tecla, movimiento del raton— para reponer el
  // temporizador de inactividad. Si el objeto entra en las dependencias
  // de reload, cada pulsacion recrea el callback, el efecto vuelve a
  // pedir todos los catalogos, y las pantallas que derivan su borrador de
  // catalogs pierden lo que el usuario estaba escribiendo.
  const canLoadAppointments = canManageAppointments(session?.user?.role) || session?.user?.role === 'doctor';
  const canLoadOrders = canManageOrders(session?.user?.role);
  const tenantId = session?.user?.tenantId || null;
  // TODOS arrancan VACIOS. Antes arrancaban con los datos de data.js, que
  // se pintaban antes de que la consulta volviera: el catalogo de demo era
  // el placeholder de carga, y un placeholder con PRECIOS es un
  // placeholder que miente.
  //
  // Es la misma regla que ya se habia aplicado a los modificadores del
  // menu —"inventarlos seria ofrecerle al cliente un sabor que el negocio
  // no tiene"— y que no se habia extendido a los demas catalogos.
  //
  // El catalogo de ejemplo de data.js ya no existe: no hay de donde
  // sacar nada que no sea la base.
  const [services, setServicesRaw, setServices, servicesError] = useRemoteState([], saveServices);
  const [specialties, setSpecialtiesRaw, setSpecialties, specialtiesError] = useRemoteState([], saveSpecialties);
  const [therapists, setTherapistsRaw, setTherapists, therapistsError] = useRemoteState([], saveTherapists);
  const [menu, setMenuRaw, setMenu, menuError] = useRemoteState({}, saveMenu);
  const [offers, setOffersRaw, setOffers, offersError] = useRemoteState([], saveOffers);
  const [productOptions, setProductOptionsRaw, setProductOptions, productOptionsError] = useRemoteState([], saveProductOptions);
  const [settings, setSettingsRaw, setSettings, settingsError] = useRemoteState(BUSINESS, saveSettings);
  const [schedules, setSchedules] = useState([]);
  // Rangos ocupados para la reserva publica (0038). Sin datos de nadie.
  const [busy, setBusy] = useState([]);
  const [bookings, setBookingsRaw, setBookings, bookingsError] = useRemoteState([], saveAppointments);
  const [orders, setOrdersRaw, setOrders, ordersError] = useRemoteState([], saveOrders);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState(null);
  // Numero de la ultima carga pedida. Una respuesta que llega despues de
  // otra mas nueva se descarta: si no, una consulta lenta pisaba con datos
  // viejos lo que una rapida acababa de traer.
  const cargaRef = useRef(0);

  const reload = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const carga = ++cargaRef.current;
    const vigente = () => carga === cargaRef.current;
    setLoading(true);
    try {
      // Aqui vivia la SIEMBRA AUTOMATICA, y era un defecto de producto:
      // canSeed es isSuperAdmin, o sea el dueño de CUALQUIER clinica. El
      // dueño de un consultorio nuevo entraba por primera vez, su
      // catalogo estaba vacio, y la app le escribia sola —sin boton y sin
      // confirmacion— el menu de cafeteria de BrainPsi y cuatro
      // psicologas ficticias con cedulas inventadas, dentro de SU clinica.
      //
      // Asi es como llegaron a la base del tenant #1, y le habria pasado a
      // cada cliente nuevo. Sembrar el catalogo real de un cliente dentro
      // de la clinica de otro no es un detalle de arranque: son datos
      // incorrectos en un producto clinico.
      //
      // Una clinica nueva arranca VACIA. El admin ya tiene CRUD de los
      // cinco catalogos y las pantallas publicas dicen que todavia no hay
      // nada publicado.
      const catalogs = await loadCatalogs();
      if (!vigente()) return;

      // VACIO ES VACIO, tambien para el visitante.
      //
      // Antes, si el catalogo venia sin filas y no habia sesion, se le
      // sustituian los datos de demostracion para que la pagina publica no
      // se viera vacia. Con la 0028 el precio de la cita lo fija el
      // SERVIDOR desde el catalogo real, asi que ese adorno le enseñaba al
      // paciente un precio que no se le iba a cobrar — y los ids de demo
      // ('psi-adultos', 't1') no existen en la base, de modo que la
      // reserva tampoco podia completarse.
      //
      // Una pagina vacia que lo dice es honesta; uno con precios de
      // mentira, no. Para que no se vea vacia esta la SIEMBRA, que el
      // dueño dispara desde el admin y escribe datos REALES en la base.
      setServicesRaw(catalogs.services);
      setSpecialtiesRaw(catalogs.specialties);
      setTherapistsRaw(catalogs.therapists);
      setMenuRaw(catalogs.menu || {});
      setOffersRaw(catalogs.offers);
      setProductOptionsRaw(catalogs.productOptions || []);
      setSettingsRaw(catalogs.settings || BUSINESS);
      setSchedules(catalogs.schedules || []);
      setBusy(catalogs.busy || []);

      if (canLoadAppointments || canLoadOrders) {
        const [remoteBookings, remoteOrders] = await Promise.all([
          canLoadAppointments ? loadAppointments() : Promise.resolve([]),
          canLoadOrders ? loadOrders() : Promise.resolve([]),
        ]);
        if (!vigente()) return;
        if (canLoadAppointments) setBookingsRaw(remoteBookings);
        if (canLoadOrders) setOrdersRaw(remoteOrders);
      }

      setLoadError(null);
    } catch (error) {
      console.error(error);
      if (vigente()) setLoadError(error);
    } finally {
      if (vigente()) setLoading(false);
    }
  }, [canLoadAppointments, canLoadOrders, setBookingsRaw, setMenuRaw, setOffersRaw, setOrdersRaw, setProductOptionsRaw, setServicesRaw, setSettingsRaw, setSpecialtiesRaw, setTherapistsRaw]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Feed de pedidos en tiempo real.
  //
  // Antes cada evento recargaba TODO (nueve catalogos, citas y pedidos), y
  // llega un evento por fila: un pedido de tres lineas eran cuatro
  // recargas completas, unas 44 consultas por cada pestaña de admin
  // abierta. Ahora:
  //   · solo se recargan los PEDIDOS,
  //   · los eventos de una misma rafaga se agrupan (400 ms),
  //   · y el canal se acota a la clinica activa (RLS ya filtra el
  //     contenido; el filtro evita recibir eventos ajenos de entrada).
  const ordenRef = useRef(0);
  useEffect(() => {
    if (!supabase || !canLoadOrders || !tenantId) return undefined;

    let espera = null;
    const recargarPedidos = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(async () => {
        const turno = ++ordenRef.current;
        try {
          const remotos = await loadOrders();
          if (turno === ordenRef.current) setOrdersRaw(remotos);
        } catch (error) {
          console.error(error);
        }
      }, 400);
    };
    const filtro = `tenant_id=eq.${tenantId}`;

    const channel = supabase
      .channel(`coffee-orders-feed:${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: filtro }, recargarPedidos)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: filtro }, recargarPedidos)
      .subscribe();

    return () => {
      window.clearTimeout(espera);
      supabase.removeChannel(channel);
    };
  }, [canLoadOrders, setOrdersRaw, tenantId]);

  const error = loadError || servicesError || specialtiesError || therapistsError || menuError || offersError || productOptionsError || settingsError || bookingsError || ordersError;

  return useMemo(() => ({
    bookings,
    setBookings,
    orders,
    setOrders,
    catalogs: { services, specialties, therapists, menu, offers, productOptions, settings, schedules, busy },
    catalogActions: { setServices, setSpecialties, setTherapists, setMenu, setOffers, setProductOptions, setSettings, reload },
    loading,
    error,
    reload,
  }), [bookings, services, specialties, therapists, menu, offers, productOptions, settings, schedules, busy, error, loading, orders, reload, setBookings, setMenu, setOffers, setOrders, setProductOptions, setServices, setSettings, setSpecialties, setTherapists]);
};

const hasMenuItems = (menu) => Object.values(menu || {}).some((section) => section.items?.length);
