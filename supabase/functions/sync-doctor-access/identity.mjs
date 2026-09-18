// Decisiones de IDENTIDAD de la sincronizacion de doctores.
//
// Vive aparte de index.ts y sin dependencias de Deno ni de Supabase para
// que se pueda probar: son las dos decisiones con consecuencia de
// seguridad de toda la funcion —a quien se considera "el mismo usuario" y
// que se le escribe encima— y estaban embebidas entre llamadas de red,
// donde no habia forma de ejercitarlas.

export const normalizeEmail = (email) => String(email ?? '').trim().toLowerCase();

// Las clinicas del usuario que NO son la que esta sincronizando, SEGUN EL
// CLAIM.
//
// Sirve para diagnostico, NO para decidir. app_metadata es la cache de
// tenant_members, no la fuente de verdad, y puede quedarse corta: si la
// escritura del claim falla, el usuario sigue siendo miembro de la otra
// clinica en la tabla mientras su claim ya no lo dice. Decidir el permiso
// de reescritura con esta funcion reabre el secuestro sin tocar una linea
// de codigo. Quien decide es canRewriteLoginEmail, con la lista que sale
// de la base.
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
export const buildIdentityUpdate = ({ user, tenantId, therapist, matchedBy, otherTenants }) => {
  const appMeta = user.app_metadata ?? {};
  const memberships = { ...(appMeta.memberships ?? {}), [tenantId]: 'doctor' };
  const therapistIds = { ...(appMeta.therapist_ids ?? {}), [tenantId]: therapist.id };

  const update = {
    user_metadata: { ...(user.user_metadata ?? {}), name: therapist.name },
    app_metadata: { ...appMeta, memberships, therapist_ids: therapistIds },
  };

  if (canRewriteLoginEmail({ matchedBy, otherTenants })) {
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
// otherTenants tiene que venir de tenant_members, que es la fuente de
// verdad, y no del claim. Si no llega una lista, se falla CERRADO: no
// saber si la persona atiende en otro consultorio no es permiso para
// reescribir su identidad.
export const canRewriteLoginEmail = ({ matchedBy, otherTenants }) => {
  if (matchedBy !== 'therapist_id') return false;
  if (!Array.isArray(otherTenants)) return false;
  return otherTenants.length === 0;
};

// Si esta clinica puede BORRAR Y RECREAR una cuenta sin confirmar.
//
// La rama existe por una razon legitima: a una invitacion que nadie acepto
// no se le puede "corregir" el correo, porque el enlace ya salio a la
// direccion vieja. Borrar y volver a invitar es lo unico que funciona.
// Pero deleteUser NO esta acotado por tenant: borra la fila entera de
// auth.users, y profiles.user_id es on delete cascade. Con un doctor que
// atiende en dos consultorios, la sincronizacion de uno destruia la
// cuenta, su ficha global y su membresia en el otro — y la recreaba bajo
// el correo que eligio quien sincronizo. Es el mismo "una clinica escribe
// una identidad compartida" que canRewriteLoginEmail cierra, expresado
// como borrar-y-recrear en vez de actualizar.
//
// Misma regla y mismo fallo cerrado: solo si la persona no pertenece a
// ninguna otra clinica. Cuando se niega, quien llama NO se queda sin
// hacer nada: concede la membresia por la via normal, que ya sabe no
// tocar la identidad. La cuenta sigue sin confirmar, que es un estado
// legitimo, y nadie pierde su acceso.
export const canRecreateUnconfirmedUser = ({ user, otherTenants }) => {
  if (user?.confirmed_at) return false;
  if (!Array.isArray(otherTenants)) return false;
  return otherTenants.length === 0;
};
