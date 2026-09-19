import { menuVacio } from '../menuCategorias.mjs';
import { cambiosDePedidos } from '../orderDiff.mjs';
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

// El id NO se incluye: la base lo genera.
//
// Mandarlo como undefined no es lo mismo que omitirlo. supabase-js arma
// la lista de columnas con Object.keys(), y una clave con valor undefined
// SIGUE SIENDO una clave propia: viaja en ?columns=... aunque
// JSON.stringify la deje fuera del cuerpo. PostgREST entonces escribe
// NULL en esa columna en vez de aplicar su DEFAULT, y el insert revienta
// con 'null value in column "id" violates not-null constraint'.
const mapScheduleToDb = (item) => ({
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
  // La categoria viaja al carrito para decidir el combo por DATO y no por
  // el prefijo del id ('h', 'c', 'p'), que es lo que hacia la pantalla. El
  // trigger de 0023 usa products.category, asi que sin esto el cliente
  // mostraria un descuento que el servidor no aplica, o al reves.
  category: row.category,
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

// Modificadores del menu (leche, sabores, extras). Antes eran las
// constantes MILKS y FLAVORS y dos numeros sueltos en MenuPage.
const mapProductOptionFromDb = (row) => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  priceDelta: toNumber(row.price_delta),
  sortOrder: row.sort_order,
  active: row.active,
});

const mapProductOptionToDb = (item, index = 0) => ({
  id: item.id,
  kind: item.kind,
  name: item.name,
  price_delta: Number(item.priceDelta || 0),
  sort_order: item.sortOrder ?? (index * 10 + 10),
  active: item.active !== false,
  updated_at: new Date().toISOString(),
});

const mapOfferFromDb = (row) => ({
  // combo = la promocion que descuenta el total; generic = informativa.
  kind: row.kind || 'generic',
  id: row.id,
  name: row.name,
  desc: row.description || '',
  price: toNumber(row.price),
  startsAt: row.starts_at || '',
  endsAt: row.ends_at || '',
  active: row.active,
});

const mapOfferToDb = (item) => ({
  kind: item.kind === 'combo' ? 'combo' : 'generic',
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
  // El precio CONGELADO al agendar (0027). Sin esto la contabilidad suma
  // cero: la columna existe, el motor la lee, y el puente faltaba.
  // No viaja de vuelta en mapAppointmentToDb a proposito — lo pone y lo
  // conserva el trigger freeze_appointment_price.
  price: toNumber(row.price),
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

  const [servicesResult, therapistsResult, specialtiesResult, linksResult, productsResult, optionsResult, offersResult, settingsResult, schedulesResult] = await Promise.all([
    supabase.from('therapy_services').select('*').order('created_at'),
    supabase.from(therapistsSource).select('*').order('created_at'),
    supabase.from('specialties').select('*').order('created_at'),
    supabase.from('therapist_services').select('*'),
    supabase.from('products').select('*').order('category').order('sort_order').order('created_at'),
    supabase.from('product_options').select('*').order('kind').order('sort_order').order('created_at'),
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

// Deja constancia de que alguien LEYO una nota clinica.
//
// Postgres no tiene triggers de SELECT, asi que esta huella no se produce
// sola: la aplicacion tiene que pedirla. NOM-024 pide auditar el acceso al
// expediente, no solo sus cambios.
//
// La funcion de la base es silenciosa si la nota no es del tenant activo o
// no es del autor, asi que llamarla de mas no crea entradas falsas.
export const logClinicalNoteAccess = async (noteIds) => {
  assertSupabaseConfigured();
  const ids = [...new Set((Array.isArray(noteIds) ? noteIds : [noteIds]).filter(Boolean))];
  if (!ids.length) return;
  const resultados = await Promise.all(
    ids.map((id) => supabase.rpc('log_clinical_note_access', { note_id: id })),
  );
  const fallo = resultados.find((r) => r.error);
  // Se propaga a proposito. Una lectura de expediente que no queda
  // registrada es un hueco de cumplimiento, y un hueco que nadie ve es
  // peor que uno que molesta: quien llama decide como avisarlo, pero no
  // puede ignorarlo por omision.
  if (fallo) throw fallo.error;
};

// --- Contabilidad -----------------------------------------------------
//
// RLS decide que filas devuelve: el admin de cafeteria solo ve cobros de
// pedidos, el de consultorio solo de citas, y el dueño ambos. La consulta
// es la misma para los tres — el filtro no viaja en el cliente.

const mapPaymentFromDb = (row) => ({
  id: row.id,
  appointmentId: row.appointment_id,
  orderId: row.order_id,
  amount: toNumber(row.amount),
  method: row.method,
  paidAt: row.paid_at,
  reference: row.reference || '',
  notes: row.notes || '',
});

// El id lo genera la BASE (gen_random_uuid), no el cliente: uid() produce
// 7 caracteres base36 y la columna es uuid — mandarlo reventaba con
// 'invalid input syntax for type uuid'.
//
// Y se OMITE la clave cuando no hay id, no se manda en undefined: una
// clave con undefined sigue apareciendo en Object.keys(), supabase-js la
// mete en ?columns=... y PostgREST escribe NULL en vez de aplicar el
// DEFAULT. Es la trampa que tests/front/insert-payload vigila.
const mapPaymentToDb = (item) => ({
  ...(item.id ? { id: item.id } : {}),
  appointment_id: item.appointmentId || null,
  order_id: item.orderId || null,
  amount: Number(item.amount || 0),
  method: item.method,
  paid_at: item.paidAt || new Date().toISOString(),
  reference: item.reference || null,
  notes: item.notes || null,
  updated_at: new Date().toISOString(),
});

const mapExpenseFromDb = (row) => ({
  id: row.id,
  area: row.area,
  category: row.category,
  description: row.description || '',
  amount: toNumber(row.amount),
  spentAt: row.spent_at,
  method: row.method || '',
  reference: row.reference || '',
});

const mapExpenseToDb = (item) => ({
  ...(item.id ? { id: item.id } : {}),
  area: item.area,
  category: item.category,
  description: item.description || null,
  amount: Number(item.amount || 0),
  spent_at: item.spentAt,
  method: item.method || null,
  reference: item.reference || null,
  updated_at: new Date().toISOString(),
});

export const loadAccounting = async () => {
  assertSupabaseConfigured();
  const [pagos, gastos] = await Promise.all([
    supabase.from('payments').select('*').order('paid_at', { ascending: false }),
    supabase.from('expenses').select('*').order('spent_at', { ascending: false }),
  ]);
  throwIfError(pagos);
  throwIfError(gastos);
  return {
    payments: (pagos.data || []).map(mapPaymentFromDb),
    expenses: (gastos.data || []).map(mapExpenseFromDb),
  };
};

export const savePayment = async (payment) => {
  assertSupabaseConfigured();
  const result = await supabase.from('payments').upsert(mapPaymentToDb(payment)).select().maybeSingle();
  throwIfError(result);
  return result.data ? mapPaymentFromDb(result.data) : null;
};

export const saveExpense = async (expense) => {
  assertSupabaseConfigured();
  const result = await supabase.from('expenses').upsert(mapExpenseToDb(expense)).select().maybeSingle();
  throwIfError(result);
  return result.data ? mapExpenseFromDb(result.data) : null;
};

// Se borran de uno en uno y por id. NUNCA con deleteMissing: ese patron
// borra "todo lo que no este en la lista", y sobre un libro contable
// significaria que un catalogo a medio cargar arrasa el historial.
export const deletePayment = async (id) => {
  assertSupabaseConfigured();
  throwIfError(await supabase.from('payments').delete().eq('id', id));
};

export const deleteExpense = async (id) => {
  assertSupabaseConfigured();
  throwIfError(await supabase.from('expenses').delete().eq('id', id));
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

export const saveProductOptions = async (options) => {
  assertSupabaseConfigured();
  const rows = (options || []).map(mapProductOptionToDb);
  if (rows.length) throwIfError(await supabase.from('product_options').upsert(rows));
  await deleteMissing('product_options', rows.map((row) => row.id));
  return options;
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
  if (authenticated) await deleteMissing('orders', items.map((item) => item.id));

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
    // Desde 0032 una membresia puede estar PENDIENTE: la persona fue
    // invitada y todavia no acepta, asi que no tiene acceso a nada.
    invitedAt: row.invited_at,
    expiraEl: row.expira_el,
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

// Invitaciones pendientes (0032).
//
// A una clinica se entra ACEPTANDO. Nombrar a alguien que no es miembro
// crea una fila inactiva y no le toca la cuenta; lo que otorga acceso en
// este sistema es el claim del JWT, y ese solo lo escribe la persona al
// aceptar.
//
// Las tres RPC cuelgan de auth.uid() y NO de la clinica activa: quien
// tiene una invitacion puede no tener ninguna clinica todavia, asi que no
// hay tenant del que colgarse.
export const myPendingInvitations = async () => {
  assertSupabaseConfigured();
  const { data, error } = await supabase.rpc('my_pending_invitations');
  if (error) throw error;
  return (data || []).map((row) => ({
    tenantId: row.tenant_id,
    tenantName: row.tenant_name,
    role: row.role,
    invitedAt: row.invited_at,
    expiraEl: row.expira_el,
    caducada: row.caducada,
  }));
};

export const acceptTenantInvitation = async (tenantId) => {
  assertSupabaseConfigured();
  const { data, error } = await supabase.rpc('accept_tenant_invitation', { p_tenant_id: tenantId });
  if (error) throw error;
  return data;
};

export const declineTenantInvitation = async (tenantId) => {
  assertSupabaseConfigured();
  const { error } = await supabase.rpc('decline_tenant_invitation', { p_tenant_id: tenantId });
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
  if (!therapistId) throw new Error('No hay un doctor seleccionado.');
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
  assertSupabaseConfigured();
  if (!therapistId) throw new Error('No hay un doctor seleccionado.');
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
  if (!result.data) throw new Error(`No se pudo guardar la agenda del doctor "${therapistId}".`);
  return mapTherapistFromDb(result.data);
};
