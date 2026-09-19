import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { canManageAppointments, canManageOrders, isSuperAdmin } from '../auth/permissions';

const resolveNext = (value, next) => (typeof next === 'function' ? next(value) : next);

const useRemoteState = (initialValue, saveRemote) => {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState(null);

  const setAndSave = useCallback((next) => {
    setValue((current) => {
      const resolved = resolveNext(current, next);
      saveRemote(resolved, current).catch((err) => {
        console.error(err);
        setError(err);
      });
      return resolved;
    });
  }, [saveRemote]);

  return [value, setValue, setAndSave, error];
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
  const canSeed = isSuperAdmin(session?.user?.role);
  const canLoadAppointments = canManageAppointments(session?.user?.role) || session?.user?.role === 'doctor';
  const canLoadOrders = canManageOrders(session?.user?.role);
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
  const [bookings, setBookingsRaw, setBookings, bookingsError] = useRemoteState([], saveAppointments);
  const [orders, setOrdersRaw, setOrders, ordersError] = useRemoteState([], saveOrders);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [loadError, setLoadError] = useState(null);

  const reload = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }

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

      if (canLoadAppointments || canLoadOrders) {
        const [remoteBookings, remoteOrders] = await Promise.all([
          canLoadAppointments ? loadAppointments() : Promise.resolve([]),
          canLoadOrders ? loadOrders() : Promise.resolve([]),
        ]);
        if (canLoadAppointments) setBookingsRaw(remoteBookings);
        if (canLoadOrders) setOrdersRaw(remoteOrders);
      }

      setLoadError(null);
    } catch (error) {
      console.error(error);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [canLoadAppointments, canLoadOrders, canSeed, setBookingsRaw, setMenuRaw, setOffersRaw, setOrdersRaw, setProductOptionsRaw, setServicesRaw, setSettingsRaw, setSpecialtiesRaw, setTherapistsRaw]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!supabase || !canLoadOrders) return undefined;

    const channel = supabase
      .channel('coffee-orders-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        reload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        reload();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canLoadOrders, reload]);

  const error = loadError || servicesError || specialtiesError || therapistsError || menuError || offersError || productOptionsError || settingsError || bookingsError || ordersError;

  return useMemo(() => ({
    bookings,
    setBookings,
    orders,
    setOrders,
    catalogs: { services, specialties, therapists, menu, offers, productOptions, settings, schedules },
    catalogActions: { setServices, setSpecialties, setTherapists, setMenu, setOffers, setProductOptions, setSettings, reload },
    loading,
    error,
    reload,
  }), [bookings, services, specialties, therapists, menu, offers, productOptions, settings, schedules, error, loading, orders, reload, setBookings, setMenu, setOffers, setOrders, setProductOptions, setServices, setSettings, setSpecialties, setTherapists]);
};

const hasMenuItems = (menu) => Object.values(menu || {}).some((section) => section.items?.length);
