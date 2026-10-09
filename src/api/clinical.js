// Expediente: pacientes, encuentros, notas clinicas y su bitacora.
import { conCliente } from './supabaseClient';
import { throwIfError } from './shared';
import { mapPatientFromDb, mapClinicalNoteFromDb } from './mappers';

export const loadPatients = async () => {
  const supabase = await conCliente();
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
  const supabase = await conCliente();
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

export const loadClinicalNotes = async () => {
  const supabase = await conCliente();
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
  const supabase = await conCliente();
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
  const supabase = await conCliente();
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
  const supabase = await conCliente();
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
  const supabase = await conCliente();
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
  const supabase = await conCliente();
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
