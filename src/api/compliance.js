// Cumplimiento (0039): solicitudes ARCO, consentimiento informado y la
// regla de verificacion en dos pasos de la clinica.
import { conCliente } from './supabaseClient';
import { throwIfError } from './shared';
import { CONSENTIMIENTO_CLINICO } from '../legal/avisoPrivacidad.mjs';

const mapArcoFromDb = (row) => ({
  id: row.id,
  type: row.request_type,
  name: row.requester_name,
  email: row.requester_email,
  phone: row.requester_phone || '',
  relationship: row.relationship,
  onBehalfOf: row.on_behalf_of || '',
  details: row.details,
  status: row.status,
  createdAt: row.created_at,
  dueOn: row.due_on,
  respondedAt: row.responded_at,
  responseSummary: row.response_summary || '',
});

// Alta publica. SIN .select(): el visitante no puede leer la tabla (ni su
// propia fila), asi que pedir la fila de vuelta haria fallar el alta.
// Estado, fecha y plazo los pone la base.
export const submitArcoRequest = async (form) => {
  const supabase = await conCliente();
  const { error } = await supabase.from('arco_requests').insert({
    request_type: form.type,
    requester_name: form.name.trim(),
    requester_email: form.email.trim(),
    requester_phone: form.phone.trim() || null,
    relationship: form.relationship,
    on_behalf_of: form.relationship === 'titular' ? null : form.onBehalfOf.trim(),
    details: form.details.trim(),
  });
  if (error) throw error;
};

export const loadArcoRequests = async () => {
  const supabase = await conCliente();
  const result = await supabase.from('arco_requests').select('*').order('due_on');
  throwIfError(result);
  return (result.data || []).map(mapArcoFromDb);
};

export const updateArcoRequest = async (id, { status, responseSummary }) => {
  const supabase = await conCliente();
  const result = await supabase.from('arco_requests')
    .update({ status, response_summary: responseSummary || null })
    .eq('id', id)
    .select()
    .maybeSingle();
  throwIfError(result);
  return result.data ? mapArcoFromDb(result.data) : null;
};

const mapConsentFromDb = (row) => ({
  id: row.id,
  type: row.consent_type,
  version: row.document_version,
  acceptedAt: row.accepted_at,
  revokedAt: row.revoked_at,
  evidence: row.evidence || {},
});

export const loadPatientConsents = async (patientId) => {
  const supabase = await conCliente();
  const result = await supabase.from('consents').select('*')
    .eq('patient_id', patientId).order('accepted_at', { ascending: false });
  throwIfError(result);
  return (result.data || []).map(mapConsentFromDb);
};

// El especialista registra el consentimiento que el paciente (o su adulto
// responsable) firmo en consulta. Quien lo registra y cuando, lo sella la
// base; aqui va como se obtuvo y quien firmo.
export const registerClinicalConsent = async ({ patientId, email, modalidad, firmante, parentesco }) => {
  const supabase = await conCliente();
  const result = await supabase.from('consents').insert({
    patient_id: patientId,
    subject_email: email,
    consent_type: 'clinical_treatment',
    document_version: CONSENTIMIENTO_CLINICO.version,
    evidence: { modalidad, firmante: firmante.trim(), parentesco: parentesco || 'titular' },
  }).select().maybeSingle();
  throwIfError(result);
  return result.data ? mapConsentFromDb(result.data) : null;
};

// La fecha la pone la base; se manda cualquiera distinta de null.
export const revokeConsent = async (id) => {
  const supabase = await conCliente();
  const result = await supabase.from('consents').update({ revoked_at: new Date().toISOString() })
    .eq('id', id).select().maybeSingle();
  throwIfError(result);
  return result.data ? mapConsentFromDb(result.data) : null;
};

export const clinicalMfaRequired = async () => {
  const supabase = await conCliente();
  const { data, error } = await supabase.rpc('clinical_mfa_required');
  if (error) throw error;
  return data === true;
};

export const setClinicalMfa = async (enabled) => {
  const supabase = await conCliente();
  const { error } = await supabase.rpc('set_clinical_mfa', { p_enabled: enabled });
  if (error) throw error;
};
