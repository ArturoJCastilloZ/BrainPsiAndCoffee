// Traduccion fila de la base <-> objeto de la app.
import { BUSINESS } from '../businessInfo';
import { toNumber } from './shared';

export const mapServiceFromDb = (row) => ({
  id: row.id,
  name: row.name,
  desc: row.description || '',
  duration: row.duration_minutes,
  price: toNumber(row.price),
  icon: row.icon || 'heart',
  for: row.audience || '',
  active: row.active,
});

export const mapServiceToDb = (item) => ({
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

export const mapTherapistFromDb = (row, services = []) => ({
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
  // Preferencias de agenda. Desde 0038 la vista publica tambien las trae;
  // los respaldos son los DEFAULTS DE LA BASE (0016), no otros: con aviso
  // minimo 0 el visitante veia horarios de hoy que la base rechazaba.
  bufferBefore: Number(row.buffer_before_minutes ?? 0),
  bufferAfter: Number(row.buffer_after_minutes ?? 30),
  // 0 = automatico: los horarios se encadenan a duracion + buffer.
  slotInterval: Number(row.slot_interval_minutes ?? 0),
  minimumNotice: Number(row.minimum_notice_minutes ?? 1440),
  bookingWindowDays: Number(row.booking_window_days ?? 90),
  maxBookingsPerDay: Number(row.max_bookings_per_day ?? 12),
  timezone: row.timezone || 'America/Mexico_City',
});

export const mapScheduleFromDb = (row) => ({
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
export const mapScheduleToDb = (item) => ({
  therapist_id: item.therapistId,
  weekday: Number(item.weekday),
  start_time: item.startTime,
  end_time: item.endTime,
  active: item.active !== false,
  updated_at: new Date().toISOString(),
});

export const mapTherapistToDb = (item) => ({
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

export const mapSpecialtyFromDb = (row) => ({
  id: row.id,
  name: row.name,
  active: row.active,
});

export const mapSpecialtyToDb = (item) => ({
  id: item.id,
  name: item.name,
  active: item.active !== false,
  updated_at: new Date().toISOString(),
});

export const mapProductFromDb = (row) => ({
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

export const mapProductToDb = (category, item, index = 0) => ({
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
export const mapProductOptionFromDb = (row) => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  priceDelta: toNumber(row.price_delta),
  sortOrder: row.sort_order,
  active: row.active,
});

export const mapProductOptionToDb = (item, index = 0) => ({
  id: item.id,
  kind: item.kind,
  name: item.name,
  price_delta: Number(item.priceDelta || 0),
  sort_order: item.sortOrder ?? (index * 10 + 10),
  active: item.active !== false,
  updated_at: new Date().toISOString(),
});

export const mapOfferFromDb = (row) => ({
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

export const mapOfferToDb = (item) => ({
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

export const mapSettingsFromDb = (row) => ({
  ...BUSINESS,
  ...(row?.content || {}),
});

export const mapSettingsToDb = (settings) => ({
  // tenant_id lo pone el default de la base (migracion 0007). El id se
  // conserva porque sigue siendo columna de la tabla, pero ya no es la
  // llave: la PK es tenant_id.
  id: 'main',
  content: settings || BUSINESS,
  updated_at: new Date().toISOString(),
});

export const mapAppointmentFromDb = (row) => ({
  id: row.id,
  patientId: row.patient_id || '',
  serviceId: row.service_id,
  therapistId: row.therapist_id || 'any',
  date: row.appointment_date,
  time: String(row.appointment_time || '').slice(0, 5),
  name: row.customer_name,
  email: row.customer_email,
  phone: row.customer_phone,
  // 0038: cita para un menor. name es entonces el adulto responsable.
  forMinor: Boolean(row.for_minor),
  patientName: row.patient_name || '',
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

// Un rango ocupado con la forma de una cita, para que el motor de agenda
// (agenda.mjs) lo trate igual que las citas que ve el personal.
export const mapBusySlotFromDb = (row, i) => ({
  id: `ocupado-${i}`,
  therapistId: row.therapist_id,
  date: row.appointment_date,
  time: String(row.appointment_time || '').slice(0, 5),
  durationMinutes: Number(row.duration_minutes || 50),
  bufferBefore: row.buffer_before_minutes ?? undefined,
  bufferAfter: row.buffer_after_minutes ?? undefined,
  status: 'confirmed',
});

export const mapAppointmentToDb = (item) => ({
  id: item.id,
  patient_id: item.patientId || null,
  service_id: item.serviceId,
  therapist_id: item.therapistId === 'any' ? null : item.therapistId,
  appointment_date: item.date,
  appointment_time: item.time,
  customer_name: item.name,
  customer_email: item.email,
  customer_phone: item.phone,
  for_minor: Boolean(item.forMinor),
  patient_name: item.forMinor ? String(item.patientName || '').trim() : null,
  notes: String(item.notes || '').slice(0, 280),
  wants_coffee: Boolean(item.wantsCoffee),
  duration_minutes: Number(item.durationMinutes) > 0 ? Number(item.durationMinutes) : 50,
  status: item.status || 'confirmed',
  reminder_sent: Boolean(item.reminderSent),
  updated_at: new Date().toISOString(),
});

export const mapPatientFromDb = (row) => ({
  id: row.id,
  name: row.full_name,
  email: row.email,
  phone: row.phone,
  // 0038: paciente menor; email y phone son los del adulto responsable.
  isMinor: Boolean(row.is_minor),
  guardianName: row.guardian_name || '',
  active: row.active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// La nota guarda su contenido en jsonb con secciones. Hoy solo existe
// 'texto' —seccion libre— y las plantillas del tramo 2 se apoyan en el
// mismo formato sin volver a migrar.
export const mapClinicalNoteFromDb = (row) => ({
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

export const mapOrderFromDb = (row) => ({
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

export const mapOrderToDb = (item) => ({
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
