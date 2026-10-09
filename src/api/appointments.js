// Citas: lectura del staff, alta publica y consentimientos.
import { conCliente } from './supabaseClient';
import { cambiosDeLista } from '../listDiff.mjs';
import { validateAppointment } from '../validation';
import { throwIfError, hasAuthSession, deleteRemoved } from './shared';
import { mapAppointmentFromDb, mapAppointmentToDb } from './mappers';

export const PRIVACY_NOTICE_VERSION = '2026-08-v1';

export const loadAppointments = async () => {
  const supabase = await conCliente();
  const result = await supabase.from('appointments').select('*').order('appointment_date').order('appointment_time');
  throwIfError(result);
  return (result.data || []).map(mapAppointmentFromDb);
};

export const saveAppointments = async (items, previousItems = []) => {
  const supabase = await conCliente();
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
    //
    // Y solo se escribe lo que CAMBIO. Reescribir la lista entera pisaba
    // con datos viejos lo que otra persona hubiera editado, y cada fila
    // reescrita volvia a disparar el trigger de pacientes.
    const cambios = cambiosDeLista(items, previousItems);
    let porId = new Map();
    if (cambios.aPersistir.length) {
      const guardado = await supabase
        .from('appointments')
        .upsert(cambios.aPersistir.map(mapAppointmentToDb))
        .select();
      throwIfError(guardado);
      porId = new Map((guardado.data || []).map((row) => [row.id, mapAppointmentFromDb(row)]));
    }
    await deleteRemoved('appointments', cambios.eliminados);
    return items.map((item) => porId.get(item.id) || item);
  }

  // Sin sesion solo se pueden CREAR citas: la base no deja a un visitante
  // modificar ni borrar ninguna. Antes esto se ignoraba en silencio y "Mis
  // citas" le decia al paciente "Cita cancelada" mientras la clinica lo
  // seguia esperando. Ahora se dice la verdad y la pantalla deshace el
  // cambio.
  const publicos = cambiosDeLista(items, previousItems);
  if (publicos.modificados.length || publicos.eliminados.length) {
    const error = new Error('Para cambiar o cancelar tu cita, escríbenos por WhatsApp.');
    error.code = 'PUBLIC_EDIT_NOT_ALLOWED';
    throw error;
  }
  const newItems = publicos.nuevos;
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
  const supabase = await conCliente();
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
