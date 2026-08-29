import { MENU, OFFERS, SPECIALTIES, THERAPISTS, THERAPY_SERVICES } from '../data';
import { getSelectedTenant } from './tenant';
import { supabase, assertSupabaseConfigured } from './supabaseClient';
import { validateAppointment, validateOrder } from '../validation';
import { BUSINESS } from '../businessInfo';
import { isBarista } from '../auth/permissions';

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
  // Preferencias de agenda. La vista publica no las expone, asi que un
  // visitante cae a los defaults; para agendar solo necesita los horarios,
  // que se consultan aparte.
  bufferBefore: Number(row.buffer_before_minutes ?? 0),
  bufferAfter: Number(row.buffer_after_minutes ?? 30),
  // 0 = automatico: los horarios se encadenan a duracion + buffer.
  slotInterval: Number(row.slot_interval_minutes ?? 0),
  minimumNotice: Number(row.minimum_notice_minutes ?? 0),
  bookingWindowDays: Number(row.booking_window_days ?? 90),
  maxBookingsPerDay: Number(row.max_bookings_per_day ?? 12),
  timezone: row.timezone || 'America/Mexico_City',
});

const mapScheduleFromDb = (row) => ({
  id: row.id,
  therapistId: row.therapist_id,
  weekday: Number(row.weekday),
  startTime: String(row.start_time).slice(0, 5),
  endTime: String(row.end_time).slice(0, 5),
  active: row.active !== false,
});

const mapScheduleToDb = (item) => ({
  id: item.id || undefined,
  therapist_id: item.therapistId,
  weekday: Number(item.weekday),
  start_time: item.startTime,
  end_time: item.endTime,
  active: item.active !== false,
  updated_at: new Date().toISOString(),
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
  // tenant_id lo pone el default de la base (migracion 0007). El id se
  // conserva porque sigue siendo columna de la tabla, pero ya no es la
  // llave: la PK es tenant_id.
  id: 'main',
  content: settings || BUSINESS,
  updated_at: new Date().toISOString(),
});

const mapAppointmentFromDb = (row) => ({
  id: row.id,
  patientId: row.patient_id || '',
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
  durationMinutes: Number(row.duration_minutes || 50),
});

export const PRIVACY_NOTICE_VERSION = '2026-08-v1';

const mapAppointmentToDb = (item) => ({
  id: item.id,
  patient_id: item.patientId || null,
  service_id: item.serviceId,
  therapist_id: item.therapistId === 'any' ? null : item.therapistId,
  appointment_date: item.date,
  appointment_time: item.time,
  customer_name: item.name,
  customer_email: item.email,
  customer_phone: item.phone,
  notes: String(item.notes || '').slice(0, 280),
  wants_coffee: Boolean(item.wantsCoffee),
  duration_minutes: Number(item.durationMinutes) > 0 ? Number(item.durationMinutes) : 50,
  status: item.status || 'confirmed',
  reminder_sent: Boolean(item.reminderSent),
  updated_at: new Date().toISOString(),
});

const mapPatientFromDb = (row) => ({
  id: row.id,
  name: row.full_name,
  email: row.email,
  phone: row.phone,
  active: row.active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// La nota guarda su contenido en jsonb con secciones. Hoy solo existe
// 'texto' —seccion libre— y las plantillas del tramo 2 se apoyan en el
// mismo formato sin volver a migrar.
const mapClinicalNoteFromDb = (row) => ({
  id: row.id,
  encounterId: row.encounter_id,
  patientId: row.patient_id,
  authorUserId: row.author_id,
  content: row.content?.texto || '',
  // locked lo calcula la base a partir de signed_at: no puede divergir.
  locked: Boolean(row.locked),
  signedAt: row.signed_at,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  addenda: (row.note_addenda || []).map((a) => ({
    id: a.id,
    content: a.content?.texto || '',
    createdAt: a.created_at,
  })),
});

const mapOrderFromDb = (row) => ({
  id: row.id,
  linkedBookingId: row.appointment_id,
  customerName: row.customer_name || '',
  customerPhone: row.customer_phone || '',
  status: row.status,
  source: row.order_source || (row.appointment_id ? 'appointment' : 'public_menu'),
  targetReadyAt: row.target_ready_at || '',
  operationalNotes: row.operational_notes || '',
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
  order_source: item.source || (item.linkedBookingId ? 'appointment' : 'public_menu'),
  target_ready_at: item.targetReadyAt || null,
  operational_notes: String(item.operationalNotes || '').slice(0, 280) || null,
  total: Number(item.total || 0),
  subtotal: Number(item.subtotal || item.total || 0),
  combo_savings: Number(item.comboSavings || 0),
  updated_at: new Date().toISOString(),
});

export const loadCatalogs = async () => {
  assertSupabaseConfigured();

  // El publico anonimo lee la vista therapists_public, que no expone email,
  // cedula profesional ni user_id. El personal autenticado si lee la tabla,
  // y RLS decide que filas le corresponden.
  const { data: sessionData } = await supabase.auth.getSession();
  const therapistsSource = sessionData?.session ? 'therapists' : 'therapists_public';

  const [servicesResult, therapistsResult, specialtiesResult, linksResult, productsResult, offersResult, settingsResult, schedulesResult] = await Promise.all([
    supabase.from('therapy_services').select('*').order('created_at'),
    supabase.from(therapistsSource).select('*').order('created_at'),
    supabase.from('specialties').select('*').order('created_at'),
    supabase.from('therapist_services').select('*'),
    supabase.from('products').select('*').order('category').order('sort_order').order('created_at'),
    supabase.from('offers').select('*').order('created_at'),
    // Ya no es el singleton 'main': hay una fila por clinica y RLS
    // devuelve solo la del tenant activo.
    supabase.from('business_settings').select('*').maybeSingle(),
    // Los horarios los lee solo el personal autenticado: para el visitante
    // la disponibilidad se valida en la base, sin publicar la agenda de
    // nadie. Sin sesion se devuelve vacio en vez de fallar.
    sessionData?.session
      ? supabase.from('therapist_schedules').select('*').order('weekday').order('start_time')
      : Promise.resolve({ data: [], error: null }),
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
    schedules: (schedulesResult?.data || []).map(mapScheduleFromDb),
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

export const loadPatients = async () => {
  assertSupabaseConfigured();
  const result = await supabase
    .from('patients')
    .select('*')
    .order('full_name', { ascending: true });
  throwIfError(result);
  return (result.data || []).map(mapPatientFromDb);
};

const validarContenido = (texto) => {
  const limpio = String(texto || '').trim();
  if (!limpio) throw new Error('La nota clínica no puede estar vacía.');
  if (limpio.length > 5000) throw new Error('La nota clínica debe tener máximo 5000 caracteres.');
  return limpio;
};

export const loadClinicalNotes = async () => {
  assertSupabaseConfigured();
  const result = await supabase
    .from('clinical_notes')
    .select('*, note_addenda(*)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  throwIfError(result);
  return (result.data || []).map(mapClinicalNoteFromDb);
};

// El encuentro es la consulta que ocurrio. Se crea al documentar por
// primera vez una cita; si ya existe, se reutiliza. Una cita tiene a lo
// mas un encuentro (indice unico en 0012), asi que documentar dos veces
// la misma consulta no la duplica.
export const ensureEncounter = async ({ appointmentId, patientId, therapistId }) => {
  assertSupabaseConfigured();
  const existente = await supabase
    .from('encounters')
    .select('id')
    .eq('appointment_id', appointmentId)
    .is('deleted_at', null)
    .maybeSingle();
  throwIfError(existente);
  if (existente.data) return existente.data.id;

  const creado = await supabase
    .from('encounters')
    .insert({
      appointment_id: appointmentId,
      patient_id: patientId,
      therapist_id: therapistId,
      status: 'completed',
    })
    .select('id')
    .single();
  throwIfError(creado);
  return creado.data.id;
};

export const createClinicalNote = async ({ encounterId, patientId, content }, session) => {
  assertSupabaseConfigured();
  const result = await supabase
    .from('clinical_notes')
    .insert({
      encounter_id: encounterId,
      patient_id: patientId,
      author_id: session?.user?.id,
      content: { texto: validarContenido(content) },
    })
    .select('*, note_addenda(*)')
    .single();
  throwIfError(result);
  return mapClinicalNoteFromDb(result.data);
};

// Solo un borrador. Sobre una nota firmada la base responde con un error
// explicito, y ese mensaje se muestra tal cual: dice cuando se firmo y
// que hacer en su lugar.
export const updateClinicalNote = async (id, content) => {
  assertSupabaseConfigured();
  const result = await supabase
    .from('clinical_notes')
    .update({ content: { texto: validarContenido(content) } })
    .eq('id', id)
    .select('*, note_addenda(*)')
    .single();
  throwIfError(result);
  return mapClinicalNoteFromDb(result.data);
};

// Firmar es irreversible: despues de esto la nota no admite cambios, solo
// addenda. Quien llama debe confirmarlo con el medico antes.
export const signClinicalNote = async (id, session) => {
  assertSupabaseConfigured();
  const result = await supabase
    .from('clinical_notes')
    .update({ signed_by: session?.user?.id, signed_at: new Date().toISOString() })
    .eq('id', id)
    .select('*, note_addenda(*)')
    .single();
  throwIfError(result);
  return mapClinicalNoteFromDb(result.data);
};

export const addNoteAddendum = async (noteId, content, session) => {
  assertSupabaseConfigured();
  const result = await supabase
    .from('note_addenda')
    .insert({
      note_id: noteId,
      author_id: session?.user?.id,
      content: { texto: validarContenido(content) },
    })
    .select()
    .single();
  throwIfError(result);
  return { id: result.data.id, content: result.data.content?.texto || '', createdAt: result.data.created_at };
};

// deleteClinicalNote se retira del producto. NOM-004 exige conservar el
// expediente 5 años desde el ultimo acto medico: borrar una nota clinica
// no es una funcion que falte, es una que no debe existir.

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

const getAuthRole = async () => {
  const { data } = await supabase.auth.getSession();
  // Solo app_metadata: user_metadata es escribible por el propio usuario.
  // El rol es por clinica, no global: se lee el de la activa.
  const memberships = data.session?.user?.app_metadata?.memberships || {};
  return memberships[getSelectedTenant()] || null;
};

export const saveAppointments = async (items, previousItems = []) => {
  assertSupabaseConfigured();
  const authenticated = await hasAuthSession();
  const invalid = items.find((item) => Object.keys(validateAppointment(item)).length);
  if (invalid) throw new Error('La cita tiene datos incompletos o invalidos.');

  if (authenticated) {
    // Se devuelve lo que quedo GUARDADO, no lo que se mando.
    //
    // El trigger sync_patient_from_appointment resuelve o crea el paciente
    // y escribe patient_id en la fila. Sin .select(), esa fila se
    // descartaba y el estado local se quedaba con el paciente vacio: la
    // cita aparecia en la agenda pero el paciente no salia en "Pacientes y
    // notas" hasta recargar la pagina entera.
    if (items.length) {
      const guardado = await supabase
        .from('appointments')
        .upsert(items.map(mapAppointmentToDb))
        .select();
      throwIfError(guardado);
      await deleteMissing('appointments', items.map((item) => item.id));
      return (guardado.data || []).map(mapAppointmentFromDb);
    }
    await deleteMissing('appointments', items.map((item) => item.id));
    return items;
  }

  const previousIds = new Set(previousItems.map((item) => item.id));
  const newItems = items.filter((item) => !previousIds.has(item.id));
  if (newItems.length) {
    // Igual en el alta publica: la fila guardada trae el patient_id que
    // puso el trigger.
    const creado = await supabase
      .from('appointments')
      .insert(newItems.map(mapAppointmentToDb))
      .select();
    throwIfError(creado);
    await recordPrivacyConsents(newItems);
    const porId = new Map((creado.data || []).map((row) => [row.id, mapAppointmentFromDb(row)]));
    return items.map((item) => porId.get(item.id) || item);
  }
  return items;
};

// Deja constancia de que la persona acepto el aviso de privacidad, ligada a
// la cita y con la version del aviso vigente. Un checkbox que no se guarda
// no es evidencia de nada.
const recordPrivacyConsents = async (appointments) => {
  const rows = appointments
    .filter((item) => item.privacyAccepted && item.email)
    .map((item) => ({
      appointment_id: item.id,
      subject_email: item.email,
      consent_type: 'privacy_notice',
      document_version: PRIVACY_NOTICE_VERSION,
      user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 400),
      evidence: { source: 'booking_flow', accepted_at_client: new Date().toISOString() },
    }));
  if (!rows.length) return;
  throwIfError(await supabase.from('consents').insert(rows));
};

export const saveOrders = async (items, previousItems = []) => {
  assertSupabaseConfigured();
  const authenticated = await hasAuthSession();
  const role = authenticated ? await getAuthRole() : null;
  const invalid = items.find((item) => Object.keys(validateOrder(item)).length);
  if (invalid) throw new Error('El pedido requiere nombre y telefono validos.');
  const previousIds = new Set(previousItems.map((item) => item.id));
  const itemsToPersist = authenticated ? items : items.filter((item) => !previousIds.has(item.id));

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

  // Antes se interpolaban los ids dentro del string de filtro de PostgREST.
  // .not() usa el valor tal cual y no escapa nada, asi que un id con comillas
  // o comas rompia el filtro. notIn() recibe el arreglo y escapa los
  // caracteres reservados por su cuenta.
  throwIfError(await supabase.from(table).delete().notIn('id', ids));
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
    // Antes esto solo hacia console.warn y el guardado seguia como si nada:
    // un doctor podia quedarse sin acceso sin que nadie se enterara.
    const error = new Error('Los doctores se guardaron, pero no se pudo sincronizar su acceso al sistema. Revisa la lista de accesos e intenta de nuevo.');
    error.cause = result.error;
    throw error;
  }
};

// ---------------------------------------------------------------
// Accesos.
//
// Todo pasa por funciones de la base y no por consultas directas: el
// correo vive en auth.users, que la aplicacion no puede leer, y otorgar
// permisos exige escribir app_metadata. La base vuelve a verificar quien
// llama en cada una — la interfaz esconde los botones, pero quien manda
// es el motor.
// ---------------------------------------------------------------
export const listTenantMembers = async () => {
  assertSupabaseConfigured();
  const { data, error } = await supabase.rpc('list_tenant_members');
  if (error) throw error;
  return (data || []).map((row) => ({
    userId: row.user_id,
    email: row.email,
    role: row.role,
    therapistId: row.therapist_id || '',
    active: row.active,
    isSelf: row.is_self,
    createdAt: row.created_at,
  }));
};

// therapistId es obligatorio para el rol 'doctor': sin ficha vinculada,
// current_therapist_id() queda vacio y las policies clinicas lo rechazan
// todo — el doctor no puede crear citas ni ver a sus pacientes, y el error
// que llega no apunta a la causa. La base lo exige; aqui solo se manda.
export const setTenantMemberRole = async (email, role, therapistId = null) => {
  assertSupabaseConfigured();
  const { error } = await supabase.rpc('set_tenant_member_role', {
    p_email: email,
    p_role: role,
    p_therapist_id: therapistId,
  });
  if (error) throw error;
};

export const revokeTenantMember = async (userId) => {
  assertSupabaseConfigured();
  const { error } = await supabase.rpc('revoke_tenant_member', { p_user_id: userId });
  if (error) throw error;
};

// ---------------------------------------------------------------
// Horarios de trabajo.
// ---------------------------------------------------------------
export const loadTherapistSchedules = async () => {
  assertSupabaseConfigured();
  const result = await supabase
    .from('therapist_schedules')
    .select('*')
    .order('weekday')
    .order('start_time');
  throwIfError(result);
  return (result.data || []).map(mapScheduleFromDb);
};

export const saveTherapistSchedules = async (therapistId, blocks) => {
  assertSupabaseConfigured();
  // Se reemplaza el horario completo del terapeuta: es mas simple de
  // razonar que un diff, y RLS ya acota el borrado a su clinica.
  throwIfError(await supabase.from('therapist_schedules').delete().eq('therapist_id', therapistId));
  if (!blocks.length) return [];
  const result = await supabase
    .from('therapist_schedules')
    .insert(blocks.map((b) => mapScheduleToDb({ ...b, therapistId, id: undefined })))
    .select();
  throwIfError(result);
  return (result.data || []).map(mapScheduleFromDb);
};

export const saveTherapistAgendaPrefs = async (therapistId, prefs) => {
  assertSupabaseConfigured();
  const result = await supabase
    .from('therapists')
    .update({
      buffer_before_minutes: Number(prefs.bufferBefore ?? 0),
      buffer_after_minutes: Number(prefs.bufferAfter ?? 30),
      slot_interval_minutes: Number(prefs.slotInterval ?? 0),
      minimum_notice_minutes: Number(prefs.minimumNotice ?? 0),
      booking_window_days: Number(prefs.bookingWindowDays ?? 90),
      max_bookings_per_day: Number(prefs.maxBookingsPerDay ?? 12),
      updated_at: new Date().toISOString(),
    })
    .eq('id', therapistId)
    .select()
    .single();
  throwIfError(result);
  return mapTherapistFromDb(result.data);
};
