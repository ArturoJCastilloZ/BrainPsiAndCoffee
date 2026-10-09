// Catalogos: servicios, especialistas, menu, ofertas, ajustes y horarios.
import { conCliente } from './supabaseClient';
import { haySesion, restMaybeSingle, restRpc, restSelect } from './rest';
import { menuVacio } from '../menuCategorias.mjs';
import { todayISO } from '../localDay.mjs';
import { productosDelMenu, opcionesConPosicion } from '../listDiff.mjs';
import { throwIfError, guardarLista } from './shared';
import { mapServiceFromDb, mapServiceToDb, mapTherapistFromDb, mapScheduleFromDb, mapScheduleToDb, mapTherapistToDb, mapSpecialtyFromDb, mapSpecialtyToDb, mapProductFromDb, mapProductToDb, mapProductOptionFromDb, mapProductOptionToDb, mapOfferFromDb, mapOfferToDb, mapSettingsFromDb, mapSettingsToDb, mapBusySlotFromDb } from './mappers';

export const loadCatalogs = async () => {
  // Por REST plano, no por supabase-js: es la lectura de la PORTADA y no
  // debe obligar a descargar la libreria (M1). Con sesion viaja el token
  // del usuario y RLS filtra igual que antes.
  const conSesion = await haySesion();

  // El publico anonimo lee la vista therapists_public, que no expone email,
  // cedula profesional ni user_id. El personal autenticado si lee la tabla,
  // y RLS decide que filas le corresponden.
  const therapistsSource = conSesion ? 'therapists' : 'therapists_public';

  const [servicesResult, therapistsResult, specialtiesResult, linksResult, productsResult, optionsResult, offersResult, settingsResult, schedulesResult, busyResult] = await Promise.all([
    restSelect('therapy_services', { order: ['created_at'] }),
    restSelect(therapistsSource, { order: ['created_at'] }),
    restSelect('specialties', { order: ['created_at'] }),
    restSelect('therapist_services'),
    restSelect('products', { order: ['category', 'sort_order', 'created_at'] }),
    restSelect('product_options', { order: ['kind', 'sort_order', 'created_at'] }),
    restSelect('offers', { order: ['created_at'] }),
    // Ya no es el singleton 'main': hay una fila por clinica y RLS
    // devuelve solo la del tenant activo.
    restMaybeSingle('business_settings'),
    // Los horarios de atencion los lee TAMBIEN el visitante (policy de
    // 0029). Antes, sin sesion se devolvia vacio: la reserva publica no
    // tenia un solo horario que ofrecer, aunque la base ya lo permitia.
    restSelect('therapist_schedules', { order: ['weekday', 'start_time'] }),
    // Lo ocupado, sin datos de nadie (0038). Solo hace falta sin sesion:
    // el personal ya lee las citas completas.
    conSesion
      ? Promise.resolve({ data: [], error: null })
      : restRpc('busy_slots', { p_from: todayISO(), p_days: 42 }),
  ]);

  [servicesResult, therapistsResult, specialtiesResult, linksResult, productsResult, offersResult].forEach(throwIfError);

  // product_options se trata aparte, y solo para UN caso: que la tabla
  // todavia no exista porque la migracion 0021 no se ha aplicado.
  //
  // Propagarlo como los demas tumbaba la carga ENTERA del catalogo — la
  // agenda y los servicios de terapia incluidos — porque falta una tabla
  // del cafe. El cafe es un modulo que ademas esta en salida del producto;
  // no puede llevarse por delante la parte clinica.
  //
  // Solo se tolera PGRST205 ('no existe la tabla'). Cualquier otro error
  // —permisos, red, RLS— si se propaga: la diferencia entre "todavia no
  // desplegada" y "rota" importa, y taparla seria el fallo mudo que este
  // codigo evita en todos lados.
  if (optionsResult.error && optionsResult.error.code !== 'PGRST205') {
    throwIfError(optionsResult);
  }
  if (settingsResult.error) throw settingsResult.error;

  const linksByTherapist = (linksResult.data || []).reduce((acc, link) => {
    acc[link.therapist_id] = [...(acc[link.therapist_id] || []), link.service_id];
    return acc;
  }, {});

  // El esqueleto de secciones sale de la taxonomia del producto, no de un
  // catalogo en el codigo. Los PRODUCTOS que las llenan salen de la base.
  const menu = menuVacio();

  (productsResult.data || []).forEach((row) => {
    const section = menu[row.category] || { title: row.category, items: [] };
    menu[row.category] = {
      ...section,
      items: [...section.items, mapProductFromDb(row)],
    };
  });

  return {
    services: (servicesResult.data || []).map(mapServiceFromDb),
    therapists: (therapistsResult.data || []).map((row) => mapTherapistFromDb(row, linksByTherapist[row.id] || [])),
    // Si esta consulta falla, la agenda se queda sin dias y la pantalla
    // muestra todo "cerrado" sin decir por que. Se propaga.
    schedules: (throwIfError(schedulesResult) || schedulesResult.data || []).map(mapScheduleFromDb),
    specialties: (specialtiesResult.data || []).map(mapSpecialtyFromDb),
    productOptions: (optionsResult.error ? [] : (optionsResult.data || [])).map(mapProductOptionFromDb),
    menu,
    offers: (offersResult.data || []).map(mapOfferFromDb),
    settings: mapSettingsFromDb(settingsResult.data),
    // Si busy_slots aun no existe (0038 sin aplicar) o falla, la reserva
    // sigue: el choque lo detecta la base al enviar, como antes. No se
    // tumba el catalogo entero por un atajo.
    busy: (busyResult.error ? [] : (busyResult.data || [])).map(mapBusySlotFromDb),
  };
};

export const saveServices = async (items, previousItems = []) => {
  await guardarLista('therapy_services', items, previousItems, mapServiceToDb);
  return items;
};

export const saveTherapists = async (items, previousItems = []) => {
  const supabase = await conCliente();
  const cambios = await guardarLista('therapists', items, previousItems, mapTherapistToDb);
  if (!cambios.aPersistir.length && !cambios.eliminados.length) return items;

  throwIfError(await supabase.from('therapist_services').delete().not('therapist_id', 'is', null));
  const links = items.flatMap((item) => (item.services || []).map((serviceId) => ({ therapist_id: item.id, service_id: serviceId })));
  if (links.length) throwIfError(await supabase.from('therapist_services').insert(links));
  await syncDoctorAccess(items);
  return items;
};

export const saveSpecialties = async (items, previousItems = []) => {
  await guardarLista('specialties', items, previousItems, mapSpecialtyToDb);
  return items;
};

export const saveProductOptions = async (options, previousOptions = []) => {
  await guardarLista(
    'product_options',
    opcionesConPosicion(options),
    opcionesConPosicion(previousOptions),
    ({ item, index }) => mapProductOptionToDb(item, index),
  );
  return options;
};

export const saveMenu = async (menu, previousMenu = {}) => {
  await guardarLista(
    'products',
    productosDelMenu(menu),
    productosDelMenu(previousMenu),
    ({ category, item, index }) => mapProductToDb(category, item, index),
  );
  return menu;
};

export const saveOffers = async (items, previousItems = []) => {
  await guardarLista('offers', items, previousItems, mapOfferToDb);
  return items;
};

export const saveSettings = async (settings) => {
  const supabase = await conCliente();
  throwIfError(await supabase.from('business_settings').upsert(mapSettingsToDb(settings)));
  return settings;
};

const syncDoctorAccess = async (therapists) => {
  const supabase = await conCliente();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;

  const payload = {
    redirectTo: `${window.location.origin}/set-password`,
    therapists: therapists.map((therapist) => ({
      id: therapist.id,
      name: therapist.name,
      email: therapist.email,
      active: therapist.active !== false,
    })),
  };
  const result = await supabase.functions.invoke('sync-doctor-access', { body: payload });
  if (result.error) {
    // Antes esto solo hacia console.warn y el guardado seguia como si nada:
    // un doctor podia quedarse sin acceso sin que nadie se enterara.
    const error = new Error('Los especialistas se guardaron, pero no se pudo sincronizar su acceso al sistema. Revisa la lista de accesos e intenta de nuevo.');
    error.cause = result.error;
    throw error;
  }
};

// ---------------------------------------------------------------
// Horarios de trabajo.
// ---------------------------------------------------------------
export const loadTherapistSchedules = async () => {
  const supabase = await conCliente();
  const result = await supabase
    .from('therapist_schedules')
    .select('*')
    .order('weekday')
    .order('start_time');
  throwIfError(result);
  return (result.data || []).map(mapScheduleFromDb);
};

export const saveTherapistSchedules = async (therapistId, blocks) => {
  const supabase = await conCliente();
  if (!therapistId) throw new Error('No hay un especialista seleccionado.');
  // Se reemplaza el horario completo del terapeuta: es mas simple de
  // razonar que un diff, y RLS ya acota el borrado a su clinica.
  //
  // El borrado va DESPUES de validar el destinatario: guardar con la
  // lista vacia por un fallo de carga —y no por decision de nadie—
  // borraba el horario existente sin aviso.
  throwIfError(await supabase.from('therapist_schedules').delete().eq('therapist_id', therapistId));
  if (!blocks.length) return [];
  const result = await supabase
    .from('therapist_schedules')
    .insert(blocks.map((b) => mapScheduleToDb({ ...b, therapistId })))
    .select();
  throwIfError(result);
  return (result.data || []).map(mapScheduleFromDb);
};

export const saveTherapistAgendaPrefs = async (therapistId, prefs) => {
  const supabase = await conCliente();
  if (!therapistId) throw new Error('No hay un especialista seleccionado.');
  // Por RPC y no por update directo: los buffers viven en therapists,
  // donde el doctor solo tiene SELECT. La funcion autoriza las dos vias
  // —la clinica sobre cualquiera de sus fichas, el doctor sobre la suya—
  // y escribe unicamente los campos de agenda.
  const result = await supabase.rpc('set_agenda_prefs', {
    p_therapist_id: therapistId,
    p_buffer_before_minutes: Number(prefs.bufferBefore ?? 0),
    p_buffer_after_minutes: Number(prefs.bufferAfter ?? 30),
    p_slot_interval_minutes: Number(prefs.slotInterval ?? 0),
    p_minimum_notice_minutes: Number(prefs.minimumNotice ?? 0),
    p_booking_window_days: Number(prefs.bookingWindowDays ?? 90),
    p_max_bookings_per_day: Number(prefs.maxBookingsPerDay ?? 12),
  });
  throwIfError(result);
  // Sin .single(): cuando el update no encuentra la fila, PostgREST
  // responde "Cannot coerce the result to a single JSON object", que no
  // dice nada al usuario. Se revisa el conteo y se explica.
  if (!result.data) throw new Error(`No se pudo guardar la agenda del especialista "${therapistId}".`);
  return mapTherapistFromDb(result.data);
};
