import { useCallback, useEffect, useMemo, useState } from 'react';
import { MENU, OFFERS, SPECIALTIES, THERAPISTS, THERAPY_SERVICES } from '../data';
import {
  loadAppointments,
  loadCatalogs,
  loadOrders,
  saveAppointments,
  saveMenu,
  saveOffers,
  saveOrders,
  saveSpecialties,
  saveSettings,
  saveServices,
  saveTherapists,
  seedDefaultCatalogs,
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
  const canSeed = isSuperAdmin(session?.user?.role);
  // Un BOOLEANO y no el objeto de sesion.
  //
  // refreshActivity() emite una sesion NUEVA cada 30 segundos de
  // actividad —click, tecla, movimiento del raton— para reponer el
  // temporizador de inactividad. Si el objeto entra en las dependencias
  // de reload, cada pulsacion recrea el callback, el efecto vuelve a
  // pedir todos los catalogos, y las pantallas que derivan su borrador de
  // catalogs pierden lo que el usuario estaba escribiendo.
  const hasSession = Boolean(session);
  const canLoadAppointments = canManageAppointments(session?.user?.role) || session?.user?.role === 'doctor';
  const canLoadOrders = canManageOrders(session?.user?.role);
  const [services, setServicesRaw, setServices, servicesError] = useRemoteState(THERAPY_SERVICES, saveServices);
  const [specialties, setSpecialtiesRaw, setSpecialties, specialtiesError] = useRemoteState(SPECIALTIES, saveSpecialties);
  const [therapists, setTherapistsRaw, setTherapists, therapistsError] = useRemoteState(THERAPISTS, saveTherapists);
  const [menu, setMenuRaw, setMenu, menuError] = useRemoteState(MENU, saveMenu);
  const [offers, setOffersRaw, setOffers, offersError] = useRemoteState(OFFERS, saveOffers);
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
      let catalogs = await loadCatalogs();
      if (canSeed && catalogsAreEmpty(catalogs)) {
        await seedDefaultCatalogs();
        catalogs = await loadCatalogs();
      } else if (canSeed && catalogs.specialties.length === 0) {
        await saveSpecialties(SPECIALTIES);
        catalogs = await loadCatalogs();
      }

      // Los datos de demostracion solo se muestran al VISITANTE, para que
      // la pagina publica no se vea vacia antes de que el consultorio
      // cargue su catalogo.
      //
      // Para alguien con sesion son un peligro: si la consulta devuelve
      // cero filas —porque RLS acota, porque falta una membresia o porque
      // el catalogo esta vacio de verdad— la aplicacion mostraba doctores
      // y servicios FANTASMA con ids que no existen en la base ('t1',
      // 'psi-adultos'). Todo se veia bien y cada guardado fallaba con un
      // error que no apuntaba a la causa. Vacio es vacio: las pantallas ya
      // tienen su estado vacio y dicen que crear.
      const demo = !hasSession;

      setServicesRaw(catalogs.services.length ? catalogs.services : (demo ? THERAPY_SERVICES : []));
      setSpecialtiesRaw(catalogs.specialties.length ? catalogs.specialties : (demo ? SPECIALTIES : []));
      setTherapistsRaw(catalogs.therapists.length ? catalogs.therapists : (demo ? THERAPISTS : []));
      setMenuRaw(hasMenuItems(catalogs.menu) ? catalogs.menu : (demo ? MENU : {}));
      setOffersRaw(catalogs.offers.length ? catalogs.offers : (demo ? OFFERS : []));
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
  }, [canLoadAppointments, canLoadOrders, canSeed, hasSession, setBookingsRaw, setMenuRaw, setOffersRaw, setOrdersRaw, setServicesRaw, setSettingsRaw, setSpecialtiesRaw, setTherapistsRaw]);

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

  const seedCatalogs = useCallback(async () => {
    await seedDefaultCatalogs();
    await reload();
  }, [reload]);

  const error = loadError || servicesError || specialtiesError || therapistsError || menuError || offersError || settingsError || bookingsError || ordersError;

  return useMemo(() => ({
    bookings,
    setBookings,
    orders,
    setOrders,
    catalogs: { services, specialties, therapists, menu, offers, settings, schedules },
    catalogActions: { setServices, setSpecialties, setTherapists, setMenu, setOffers, setSettings, reload },
    loading,
    error,
    reload,
    seedCatalogs,
  }), [bookings, services, specialties, therapists, menu, offers, settings, schedules, error, loading, orders, reload, seedCatalogs, setBookings, setMenu, setOffers, setOrders, setServices, setSettings, setSpecialties, setTherapists]);
};

const hasMenuItems = (menu) => Object.values(menu || {}).some((section) => section.items?.length);

const catalogsAreEmpty = (catalogs) => (
  catalogs.services.length === 0 &&
  catalogs.specialties.length === 0 &&
  catalogs.therapists.length === 0 &&
  !hasMenuItems(catalogs.menu) &&
  catalogs.offers.length === 0
);
