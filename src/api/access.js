// Accesos: miembros de la clinica, invitaciones y contraseña temporal.
import { conCliente } from './supabaseClient';

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
  const supabase = await conCliente();
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
    // 0035: a quien esta clinica creo y no ha entrado se le puede volver a
    // generar la temporal. A nadie mas.
    puedeRegenerarTemporal: row.puede_regenerar_temporal === true,
  }));
};

// therapistId es obligatorio para el rol 'doctor': sin ficha vinculada,
// current_therapist_id() queda vacio y las policies clinicas lo rechazan
// todo — el doctor no puede crear citas ni ver a sus pacientes, y el error
// que llega no apunta a la causa. La base lo exige; aqui solo se manda.
export const setTenantMemberRole = async (email, role, therapistId = null) => {
  const supabase = await conCliente();
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
// Alta de personal con contraseña temporal (0033 + invite-staff).
//
// El correo de invitacion de Supabase no llega —su SMTP por defecto esta
// limitado a unos pocos envios por hora— asi que el dueño entrega la
// contraseña en mano. La devuelve la funcion UNA vez y no se guarda en
// ningun sitio: si se pierde, se regenera.
//
// Si el correo YA tiene cuenta no se crea nada: se cae en la invitacion
// pendiente de 0032, que si pide consentimiento.
export const inviteStaff = async (email, role, therapistId = null) => {
  const supabase = await conCliente();
  const { data, error } = await supabase.functions.invoke('invite-staff', {
    body: { email, role, therapistId },
  });
  if (error) {
    // El cuerpo del error trae el motivo real (rol invalido, ficha
    // ocupada, sin permisos). Sin esto el dueño ve "Edge Function
    // returned a non-2xx status code", que no dice nada.
    let detalle = '';
    try { detalle = (await error.context?.json())?.error || ''; } catch { /* sin cuerpo */ }
    const fallo = new Error(detalle || 'No se pudo dar de alta al usuario.');
    fallo.cause = error;
    throw fallo;
  }
  return data;
};

// Volver a generar la contraseña temporal de alguien a quien ESTA clinica
// le creo la cuenta y que la perdio antes de entrar.
//
// La Edge Function decide (puedeRegenerarTemporal) y la lista de miembros
// ya dice a quien se le puede ofrecer (0035). A una cuenta que ya existia
// no se le toca la contraseña: su titular acepta la invitacion.
export const generateTempPassword = async (email) => {
  const supabase = await conCliente();
  const { data, error } = await supabase.functions.invoke('invite-staff', {
    body: { email, accion: 'temporal' },
  });
  if (error) {
    let detalle = '';
    try { detalle = (await error.context?.json())?.error || ''; } catch { /* sin cuerpo */ }
    const fallo = new Error(detalle || 'No se pudo generar la contraseña temporal.');
    fallo.cause = error;
    throw fallo;
  }
  return data;
};

export const myPendingInvitations = async () => {
  const supabase = await conCliente();
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
  const supabase = await conCliente();
  const { data, error } = await supabase.rpc('accept_tenant_invitation', { p_tenant_id: tenantId });
  if (error) throw error;
  return data;
};

export const declineTenantInvitation = async (tenantId) => {
  const supabase = await conCliente();
  const { error } = await supabase.rpc('decline_tenant_invitation', { p_tenant_id: tenantId });
  if (error) throw error;
};

export const revokeTenantMember = async (userId) => {
  const supabase = await conCliente();
  const { error } = await supabase.rpc('revoke_tenant_member', { p_user_id: userId });
  if (error) throw error;
};
