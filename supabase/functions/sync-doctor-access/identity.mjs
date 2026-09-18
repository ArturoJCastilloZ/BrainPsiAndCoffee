// Decisiones de IDENTIDAD de la sincronizacion de doctores.
//
// Vive aparte de index.ts y sin dependencias de Deno ni de Supabase para
// que se pueda probar: son las dos decisiones con consecuencia de
// seguridad de toda la funcion —a quien se considera "el mismo usuario" y
// que se le escribe encima— y estaban embebidas entre llamadas de red,
// donde no habia forma de ejercitarlas.

export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

// Las clinicas del usuario que NO son la que esta sincronizando.
export const otherTenantsOf = (user, tenantId) =>
  Object.keys(user?.app_metadata?.memberships ?? {}).filter((t) => t !== tenantId);

// A que usuario existente corresponde esta ficha de terapeuta.
//
// Se busca primero por correo y solo despues por la ficha: son dos
// criterios distintos y el segundo es el que permite RENOMBRAR el correo
// de alguien, asi que conviene saber cual de los dos acerto.
export const matchDoctorUser = (doctorUsers, therapist, tenantId) => {
  const email = normalizeEmail(therapist.email);

  const byEmail = doctorUsers.find((user) => normalizeEmail(user.email) === email);
  if (byEmail) return { user: byEmail, matchedBy: 'email' };

  const byCard = doctorUsers.find(
    (user) => (user.app_metadata?.therapist_ids ?? {})[tenantId] === therapist.id
  );
  if (byCard) return { user: byCard, matchedBy: 'therapist_id' };

  return { user: null, matchedBy: null };
};

// Que se le manda a auth.admin.updateUserById.
export const buildIdentityUpdate = ({ user, tenantId, therapist, matchedBy }) => {
  const appMeta = user.app_metadata ?? {};
  const memberships = { ...(appMeta.memberships ?? {}), [tenantId]: 'doctor' };
  const therapistIds = { ...(appMeta.therapist_ids ?? {}), [tenantId]: therapist.id };

  const update = {
    user_metadata: { ...(user.user_metadata ?? {}), name: therapist.name },
    app_metadata: { ...appMeta, memberships, therapist_ids: therapistIds },
  };

  if (canRewriteLoginEmail({ user, tenantId, matchedBy })) {
    update.email = normalizeEmail(therapist.email);
  }

  return update;
};

// Cuando esta clinica puede reescribir el CORREO DE LOGIN del usuario.
//
// auth.users.email no esta acotado por tenant: es la identidad con la que
// la persona entra a TODAS sus clinicas, y quien la controla controla la
// cuenta, porque "recuperar contraseña" va a esa direccion. El chequeo de
// autorizacion de la funcion es por tenant y correcto, pero esta
// escritura se le escapaba.
//
// Dos condiciones:
//
//  1. Solo tiene sentido si el emparejamiento fue por FICHA. Si fue por
//     correo, el valor ya es ese y no hay nada que reescribir.
//  2. Solo si el usuario no pertenece a ninguna otra clinica. Corregirle
//     el correo a un doctor que solo trabaja aqui es administracion
//     legitima; hacerlo con uno que tambien atiende en otro consultorio
//     es decidir por un tercero que no te nombro.
//
// El caso 2 no se resuelve pidiendo confirmacion: el atacante es quien
// confirmaria. Un cambio de correo de alguien con varias clinicas tiene
// que pasar por un flujo verificado contra el propio titular.
export const canRewriteLoginEmail = ({ user, tenantId, matchedBy }) => {
  if (matchedBy !== 'therapist_id') return false;
  return otherTenantsOf(user, tenantId).length === 0;
};
