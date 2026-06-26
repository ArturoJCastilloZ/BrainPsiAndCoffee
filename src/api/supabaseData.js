import { MENU, OFFERS, SPECIALTIES, THERAPISTS, THERAPY_SERVICES } from '../data';
import { supabase, assertSupabaseConfigured } from './supabaseClient';
import { validateAppointment, validateOrder } from '../validation';
import { BUSINESS } from '../businessInfo';

const throwIfError = ({ error }) => {
  if (error) throw error;
};

const toNumber = (value) => Number(value || 0);

const mapServiceFromDb = (row) => ({
  id: row.id,
  name: row.name,
  desc: row.description || '',
  duration: row.duration_minutes,
  price: toNumber(row.price),
  icon: row.icon || 'heart',
  for: row.audience || '',
  active: row.active,
});

const mapServiceToDb = (item) => ({
  id: item.id,
  name: item.name,
  description: item.desc || '',
  duration_minutes: Number(item.duration || 50),
  price: Number(item.price || 0),
  icon: item.icon || 'heart',
  audience: item.for || '',
  active: item.active !== false,
  updated_at: new Date().toISOString(),
});

const mapTherapistFromDb = (row, services = []) => ({
  id: row.id,
  name: row.name,
  email: row.email || '',
  userId: row.user_id || '',
  cedula: row.cedula || '',
  specialty: row.specialty || '',
  sessionDuration: Number(row.session_duration_minutes || 50),
  color: row.color || '#7A9E7E',
  active: row.active,
  services,
});

const mapTherapistToDb = (item) => ({
  id: item.id,
  name: item.name,
  email: item.email || null,
  user_id: item.userId || null,
  cedula: item.cedula || '',
  specialty: item.specialty || '',
  session_duration_minutes: Number(item.sessionDuration || 50),
  color: item.color || '#7A9E7E',
  active: item.active !== false,
  updated_at: new Date().toISOString(),
});

const mapSpecialtyFromDb = (row) => ({
  id: row.id,
  name: row.name,
  active: row.active,
});

const mapSpecialtyToDb = (item) => ({
  id: item.id,
  name: item.name,
  active: item.active !== false,
  updated_at: new Date().toISOString(),
});

const mapProductFromDb = (row) => ({
  id: row.id,
  name: row.name,
  sub: row.subtitle || '',
  price: toNumber(row.price),
  active: row.active,
});

const mapProductToDb = (category, item, index = 0) => ({
  id: item.id,
  category,
  name: item.name,
  subtitle: item.sub || '',
  price: Number(item.price || 0),
  sort_order: index * 10 + 10,
  active: item.active !== false,
  updated_at: new Date().toISOString(),
});

const mapOfferFromDb = (row) => ({
  id: row.id,
  name: row.name,
  desc: row.description || '',
  price: toNumber(row.price),
  startsAt: row.starts_at || '',
  endsAt: row.ends_at || '',
  active: row.active,
});

const mapOfferToDb = (item) => ({
  id: item.id,
  name: item.name,
  description: item.desc || '',
  price: Number(item.price || 0),
  starts_at: item.startsAt || null,
  ends_at: item.endsAt || null,
  active: item.active !== false,
  updated_at: new Date().toISOString(),
});

const mapSettingsFromDb = (row) => ({
  ...BUSINESS,
  ...(row?.content || {}),
});

const mapSettingsToDb = (settings) => ({
  id: 'main',
  content: settings || BUSINESS,
  updated_at: new Date().toISOString(),
});

const mapAppointmentFromDb = (row) => ({
  id: row.id,
  serviceId: row.service_id,
  therapistId: row.therapist_id || 'any',
  date: row.appointment_date,
  time: String(row.appointment_time || '').slice(0, 5),
  name: row.customer_name,
  email: row.customer_email,
  phone: row.customer_phone,
  notes: row.notes || '',
  wantsCoffee: row.wants_coffee,
  status: row.status,
  reminderSent: row.reminder_sent,
  createdAt: row.created_at,
});

const mapAppointmentToDb = (item) => ({
  id: item.id,
  service_id: item.serviceId,
  therapist_id: item.therapistId === 'any' ? null : item.therapistId,
  appointment_date: item.date,
  appointment_time: item.time,
  customer_name: item.name,
  customer_email: item.email,
  customer_phone: item.phone,
  notes: String(item.notes || '').slice(0, 280),
  wants_coffee: Boolean(item.wantsCoffee),
  status: item.status || 'confirmed',
  reminder_sent: Boolean(item.reminderSent),
  updated_at: new Date().toISOString(),
});

const mapOrderFromDb = (row) => ({
  id: row.id,
  linkedBookingId: row.appointment_id,
  customerName: row.customer_name || '',
  customerPhone: row.customer_phone || '',
  status: row.status,
  total: toNumber(row.total),
  subtotal: toNumber(row.subtotal),
  comboSavings: toNumber(row.combo_savings),
  createdAt: row.created_at,
  items: (row.order_items || []).map((item) => ({
    id: item.product_id,
    name: item.name,
    qty: item.quantity,
    price: toNumber(item.unit_price),
    customizations: item.options || {},
  })),
});

const mapOrderToDb = (item) => ({
  id: item.id,
  appointment_id: item.linkedBookingId || null,
  customer_name: item.customerName || null,
  customer_phone: item.customerPhone || null,
  status: item.status || 'received',
  total: Number(item.total || 0),
  subtotal: Number(item.subtotal || item.total || 0),
  combo_savings: Number(item.comboSavings || 0),
  updated_at: new Date().toISOString(),
});

export const loadCatalogs = async () => {
  assertSupabaseConfigured();

  const [servicesResult, therapistsResult, specialtiesResult, linksResult, productsResult, offersResult, settingsResult] = await Promise.all([
    supabase.from('therapy_services').select('*').order('created_at'),
    supabase.from('therapists').select('*').order('created_at'),
    supabase.from('specialties').select('*').order('created_at'),
    supabase.from('therapist_services').select('*'),
    supabase.from('products').select('*').order('category').order('sort_order').order('created_at'),
    supabase.from('offers').select('*').order('created_at'),
    supabase.from('business_settings').select('*').eq('id', 'main').maybeSingle(),
  ]);

  [servicesResult, therapistsResult, specialtiesResult, linksResult, productsResult, offersResult].forEach(throwIfError);
  if (settingsResult.error) throw settingsResult.error;

  const linksByTherapist = (linksResult.data || []).reduce((acc, link) => {
    acc[link.therapist_id] = [...(acc[link.therapist_id] || []), link.service_id];
    return acc;
  }, {});

  const menu = Object.entries(MENU).reduce((acc, [category, section]) => ({
    ...acc,
    [category]: { ...section, items: [] },
  }), {});

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
    specialties: (specialtiesResult.data || []).map(mapSpecialtyFromDb),
    menu,
    offers: (offersResult.data || []).map(mapOfferFromDb),
    settings: mapSettingsFromDb(settingsResult.data),
  };
};

export const loadAppointments = async () => {
  assertSupabaseConfigured();
  const result = await supabase.from('appointments').select('*').order('appointment_date').order('appointment_time');
  throwIfError(result);
  return (result.data || []).map(mapAppointmentFromDb);
};

export const loadOrders = async () => {
  assertSupabaseConfigured();
  const result = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .order('created_at', { ascending: false });
  throwIfError(result);
  return (result.data || []).map(mapOrderFromDb);
};

export const saveServices = async (items) => {
  assertSupabaseConfigured();
  if (items.length) throwIfError(await supabase.from('therapy_services').upsert(items.map(mapServiceToDb)));
  await deleteMissing('therapy_services', items.map((item) => item.id));
  return items;
};

export const saveTherapists = async (items) => {
  assertSupabaseConfigured();
  if (items.length) throwIfError(await supabase.from('therapists').upsert(items.map(mapTherapistToDb)));
  await deleteMissing('therapists', items.map((item) => item.id));

  throwIfError(await supabase.from('therapist_services').delete().not('therapist_id', 'is', null));
  const links = items.flatMap((item) => (item.services || []).map((serviceId) => ({ therapist_id: item.id, service_id: serviceId })));
  if (links.length) throwIfError(await supabase.from('therapist_services').insert(links));
  await syncDoctorAccess(items);
  return items;
};

export const saveSpecialties = async (items) => {
  assertSupabaseConfigured();
  if (items.length) throwIfError(await supabase.from('specialties').upsert(items.map(mapSpecialtyToDb)));
  await deleteMissing('specialties', items.map((item) => item.id));
  return items;
};

export const saveMenu = async (menu) => {
  assertSupabaseConfigured();
  const products = Object.entries(menu).flatMap(([category, section]) => (section.items || []).map((item, index) => mapProductToDb(category, item, index)));
  if (products.length) throwIfError(await supabase.from('products').upsert(products));
  await deleteMissing('products', products.map((item) => item.id));
  return menu;
};

export const saveOffers = async (items) => {
  assertSupabaseConfigured();
  if (items.length) throwIfError(await supabase.from('offers').upsert(items.map(mapOfferToDb)));
  await deleteMissing('offers', items.map((item) => item.id));
  return items;
};

export const saveSettings = async (settings) => {
  assertSupabaseConfigured();
  throwIfError(await supabase.from('business_settings').upsert(mapSettingsToDb(settings)));
  return settings;
};

const hasAuthSession = async () => {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
};

export const saveAppointments = async (items, previousItems = []) => {
  assertSupabaseConfigured();
  const authenticated = await hasAuthSession();
  const invalid = items.find((item) => Object.keys(validateAppointment(item)).length);
  if (invalid) throw new Error('La cita tiene datos incompletos o invalidos.');

  if (authenticated) {
    if (items.length) throwIfError(await supabase.from('appointments').upsert(items.map(mapAppointmentToDb)));
    await deleteMissing('appointments', items.map((item) => item.id));
    return items;
  }

  const previousIds = new Set(previousItems.map((item) => item.id));
  const newItems = items.filter((item) => !previousIds.has(item.id));
  if (newItems.length) throwIfError(await supabase.from('appointments').insert(newItems.map(mapAppointmentToDb)));
  return items;
};

export const saveOrders = async (items, previousItems = []) => {
  assertSupabaseConfigured();
  const authenticated = await hasAuthSession();
  const invalid = items.find((item) => Object.keys(validateOrder(item)).length);
  if (invalid) throw new Error('El pedido requiere nombre y telefono validos.');
  const previousIds = new Set(previousItems.map((item) => item.id));
  const itemsToPersist = authenticated ? items : items.filter((item) => !previousIds.has(item.id));

  if (itemsToPersist.length) {
    const rows = itemsToPersist.map(mapOrderToDb);
    throwIfError(authenticated
      ? await supabase.from('orders').upsert(rows)
      : await supabase.from('orders').insert(rows));
  }
  if (authenticated) await deleteMissing('orders', items.map((item) => item.id));

  for (const order of itemsToPersist) {
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

export const seedDefaultCatalogs = async () => {
  await saveServices(THERAPY_SERVICES);
  await saveSpecialties(SPECIALTIES);
  await saveTherapists(THERAPISTS);
  await saveMenu(MENU);
  await saveOffers(OFFERS);
  await saveSettings(BUSINESS);
};

const deleteMissing = async (table, ids) => {
  if (ids.length === 0) {
    throwIfError(await supabase.from(table).delete().not('id', 'is', null));
    return;
  }

  throwIfError(await supabase.from(table).delete().not('id', 'in', `(${ids.map((id) => `"${id}"`).join(',')})`));
};

const syncDoctorAccess = async (therapists) => {
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
    console.warn('No se pudo sincronizar el acceso de doctores.', result.error);
  }
};
