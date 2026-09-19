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
//
// Con pending=true devuelve un objeto VACIO, y quien llama omite la
// llamada. Es el consentimiento de 0032 aplicado a esta puerta: esta
// pantalla ataba a un usuario ya registrado a la clinica igual que la de
// Accesos, escribiendole memberships en su cuenta de autenticacion. Y lo
// que otorga acceso en este sistema es el CLAIM, no la fila.
//
// Vacio y no "solo memberships fuera": una invitacion no debe tocar NADA
// de la cuenta de alguien que todavia no dijo que si, ni su nombre de
// perfil. La ficha tampoco se liga hasta que acepta; eso lo hace
// accept_tenant_invitation.
export const buildIdentityUpdate = ({ user, tenantId, therapist, matchedBy, otherTenants, pending = false }) => {
  if (pending) return {};

  const appMeta = user.app_metadata ?? {};
  const memberships = { ...(appMeta.memberships ?? {}), [tenantId]: 'doctor' };
  const therapistIds = { ...(appMeta.therapist_ids ?? {}), [tenantId]: therapist.id };

  // app_metadata se fusiona SIEMPRE: cada clave es de una clinica y solo
  // se toca la propia, asi que no hay nada que acotar.
  const update = {
    app_metadata: { ...appMeta, memberships, therapist_ids: therapistIds },
  };

  // El nombre, en cambio, es uno solo para todas. Vivia en esta misma
  // llave de objeto que el correo y se escribia sin condicion, incluso en
  // la rama que se toma PRECISAMENTE porque la persona atiende en otra
  // clinica: A elegia el texto que B veia.
  if (canRewriteProfileName({ otherTenants })) {
    update.user_metadata = { ...(user.user_metadata ?? {}), name: therapist.name };
  }

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
// El nombre no lleva la condicion de matchedBy que si lleva el correo:
// cuando el emparejamiento fue por correo no hay correo que reescribir,
// pero el nombre si puede haber cambiado legitimamente. Lo unico que lo
// acota es que la identidad no sea compartida. Mismo fallo cerrado.
export const canRewriteProfileName = ({ otherTenants }) => {
  if (!Array.isArray(otherTenants)) return false;
  return otherTenants.length === 0;
};

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

// Que usuario se le pasa a grantMembership despues de invitar.
//
// El usuario REAL que devolvio la invitacion, nunca uno fabricado.
//
// Antes se construia a mano `{ id, app_metadata: {}, user_metadata: {...} }`
// dando por hecho que inviteUserByEmail siempre crea a alguien nuevo.
// Cuando el correo ya pertenece a un usuario sin confirmar, GoTrue
// reenvia la invitacion y devuelve al usuario EXISTENTE — y ese
// app_metadata vacio, al pasar por buildIdentityUpdate, reemplazaba el
// suyo: perdia las membresias de todas sus otras clinicas y quedaba fuera
// de ellas, porque las policies leen el claim.
//
// La correccion no depende de resolver que hace GoTrue en cada caso, y
// por eso es la buena: se deja de suponer y se usa lo que la respuesta
// trae.
export const invitedUserFrom = (created) => {
  const user = created?.data?.user;
  if (!user?.id) return null;
  return user;
};

// A QUIEN se le revoca la membresia de doctor de esta clinica.
//
// Vive aqui por la misma razon que las de arriba: era una decision
// embebida entre llamadas de red, y estaba mal de dos formas distintas.
//
// 1 · DECIDIA SOBRE UNA FOTO VIEJA. index.ts capturaba la lista de
//     doctores ANTES del bucle de sincronizacion, y grantMembership
//     escribe en la base y en auth pero NO muta el objeto local. Rehacer
//     la ficha de un doctor -sacar t_old, poner t_new con el mismo
//     correo- terminaba asi:
//
//       sincronizacion: empareja por correo, concede con t_new
//       revocacion:     la foto todavia dice t_old, que ya no esta
//                       activa -> le quita la membresia recien dada
//       respuesta:      {ok: true}
//
//     Por eso entra syncedUserIds: a quien esta corrida acaba de
//     conceder membresia no se le revoca. No es una lista de exclusion
//     defensiva, es LO QUE PASO, que es justo lo que la foto no sabe.
//
// 2 · DECIDIA SOBRE LA CACHE. Las dos entradas -quien es doctor aqui, y
//     con que ficha- salian de app_metadata. El comentario de
//     otherTenantsOf, arriba en este mismo archivo, ya dice que eso no
//     se hace: es la cache de tenant_members, no la fuente de verdad, y
//     puede quedarse corta. Ahi fallaba ABIERTO: un doctor presente en
//     tenant_members cuyo claim no lo reflejara era invisible para el
//     bucle, asi que darle de baja la ficha no le revocaba el acceso a
//     pacientes ni a notas. En silencio. Ahora 'members' sale de la
//     tabla.
//
// Un miembro sin ficha NO se revoca: se devuelve en 'unresolved' para
// que la respuesta lo diga. Revocarlo seria adivinar -puede ser un alta
// a medias- y callarlo es lo que hacia el codigo viejo.
export const doctorsToRevoke = ({ members, activeTherapistIds, syncedUserIds }) => {
  const activas = new Set(activeTherapistIds ?? []);
  const sincronizados = new Set(syncedUserIds ?? []);
  const revoke = [];
  const unresolved = [];

  for (const member of members ?? []) {
    const userId = member?.user_id;
    if (!userId) continue;
    if (sincronizados.has(userId)) continue;

    const therapistId = member?.therapist_id ?? null;
    if (!therapistId) {
      unresolved.push(userId);
      continue;
    }
    if (activas.has(therapistId)) continue;

    revoke.push({ userId, therapistId });
  }

  return { revoke, unresolved };
};
