// Citas: lectura del staff, alta publica y consentimientos.
import { conCliente } from './supabaseClient';
import { PRIVACY_NOTICE_VERSION, hashAviso } from '../legal/avisoPrivacidad.mjs';
import { cambiosDeLista } from '../listDiff.mjs';
import { validateAppointment } from '../validation';
import { throwIfError, hasAuthSession, deleteRemoved } from './shared';
import { mapAppointmentFromDb, mapAppointmentToDb } from './mappers';

// La version sale del aviso mismo (src/legal): una constante suelta aqui
// podia quedarse en '2026-08-v1' mientras el texto cambiaba.
export { PRIVACY_NOTICE_VERSION } from '../legal/avisoPrivacidad.mjs';

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
    if (newItems.some((item) => item.privacyAccepted !== true)) {
      throw new Error('Acepta el aviso de privacidad antes de enviar tu solicitud.');
    }
    // Una sola transaccion: si falla el consentimiento, tampoco queda la
    // cita ni el paciente. Sin fallback a inserts separados (0043).
    const documentHash = await hashAviso();
    throwIfError(await supabase.rpc('create_public_booking', {
      p_appointments: newItems.map(mapAppointmentToDb),
      p_privacy_accepted: true,
      p_document_version: PRIVACY_NOTICE_VERSION,
      p_document_hash: documentHash,
      p_user_agent: typeof navigator === 'undefined' ? null : navigator.userAgent.slice(0, 400),
    }));
  }
  return items;
};
