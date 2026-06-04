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
  saveServices,
  saveTherapists,
  seedDefaultCatalogs,
} from '../api/supabaseData';
import { supabase } from '../api/supabaseClient';

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
  const isAdmin = session?.user?.role === 'admin';
  const isStaff = ['admin', 'doctor'].includes(session?.user?.role);
  const [services, setServicesRaw, setServices, servicesError] = useRemoteState(THERAPY_SERVICES, saveServices);
  const [specialties, setSpecialtiesRaw, setSpecialties, specialtiesError] = useRemoteState(SPECIALTIES, saveSpecialties);
  const [therapists, setTherapistsRaw, setTherapists, therapistsError] = useRemoteState(THERAPISTS, saveTherapists);
  const [menu, setMenuRaw, setMenu, menuError] = useRemoteState(MENU, saveMenu);
  const [offers, setOffersRaw, setOffers, offersError] = useRemoteState(OFFERS, saveOffers);
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
      if (isAdmin && catalogsAreEmpty(catalogs)) {
        await seedDefaultCatalogs();
        catalogs = await loadCatalogs();
      } else if (isAdmin && catalogs.specialties.length === 0) {
        await saveSpecialties(SPECIALTIES);
        catalogs = await loadCatalogs();
      }

      setServicesRaw(catalogs.services.length ? catalogs.services : THERAPY_SERVICES);
      setSpecialtiesRaw(catalogs.specialties.length ? catalogs.specialties : SPECIALTIES);
      setTherapistsRaw(catalogs.therapists.length ? catalogs.therapists : THERAPISTS);
      setMenuRaw(hasMenuItems(catalogs.menu) ? catalogs.menu : MENU);
      setOffersRaw(catalogs.offers.length ? catalogs.offers : OFFERS);

      if (isStaff) {
        const [remoteBookings, remoteOrders] = await Promise.all([
          loadAppointments(),
          isAdmin ? loadOrders() : Promise.resolve([]),
        ]);
        setBookingsRaw(remoteBookings);
        if (isAdmin) setOrdersRaw(remoteOrders);
      }

      setLoadError(null);
    } catch (error) {
      console.error(error);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, isStaff, setBookingsRaw, setMenuRaw, setOffersRaw, setOrdersRaw, setServicesRaw, setSpecialtiesRaw, setTherapistsRaw]);

  useEffect(() => {
    reload();
  }, [reload]);

  const seedCatalogs = useCallback(async () => {
    await seedDefaultCatalogs();
    await reload();
  }, [reload]);

  const error = loadError || servicesError || specialtiesError || therapistsError || menuError || offersError || bookingsError || ordersError;

  return useMemo(() => ({
    bookings,
    setBookings,
    orders,
    setOrders,
    catalogs: { services, specialties, therapists, menu, offers },
    catalogActions: { setServices, setSpecialties, setTherapists, setMenu, setOffers },
    loading,
    error,
    reload,
    seedCatalogs,
  }), [bookings, services, specialties, therapists, menu, offers, error, loading, orders, reload, seedCatalogs, setBookings, setMenu, setOffers, setOrders, setServices, setSpecialties, setTherapists]);
};

const hasMenuItems = (menu) => Object.values(menu || {}).some((section) => section.items?.length);

const catalogsAreEmpty = (catalogs) => (
  catalogs.services.length === 0 &&
  catalogs.specialties.length === 0 &&
  catalogs.therapists.length === 0 &&
  !hasMenuItems(catalogs.menu) &&
  catalogs.offers.length === 0
);
