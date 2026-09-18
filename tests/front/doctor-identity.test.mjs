// La sincronizacion de doctores no puede reescribir la identidad GLOBAL
// de alguien por orden de UNA de sus clinicas.
//
// sync-doctor-access corre con service_role. Su chequeo de autorizacion
// es correcto y por tenant: solo un owner/admin_consultorio de ESA
// clinica puede llamarla. Pero auth.users.email no esta acotado por
// tenant — es el login en todas las clinicas del usuario — y la funcion
// lo reescribia con el valor del payload.
//
// Sumado a que el emparejamiento acepta por ficha de terapeuta aunque el
// correo NO coincida, un admin de la clinica A podia apuntar la ficha de
// un doctor a un correo suyo, quedarse con la cuenta via "recuperar
// contraseña", y heredar la membresia de doctor de ese usuario en la
// clinica B — es decir, sus pacientes y sus notas clinicas.
import assert from 'node:assert/strict';
import {
  matchDoctorUser,
  buildIdentityUpdate,
  canRewriteLoginEmail,
  canRecreateUnconfirmedUser,
  invitedUserFrom,
  otherTenantsOf,
} from '../../supabase/functions/sync-doctor-access/identity.mjs';

// Dr. X trabaja en dos clinicas.
const drX = {
  id: 'user-x',
  email: 'dr.x@clinica.mx',
  confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { name: 'Dr X' },
  app_metadata: {
    memberships: { clinica_a: 'doctor', clinica_b: 'doctor' },
    therapist_ids: { clinica_a: 'psq-7', clinica_b: 'psq-3' },
  },
};

// Doctor que solo trabaja en la clinica A.
const drSolo = {
  id: 'user-solo',
  email: 'solo@clinica.mx',
  confirmed_at: '2026-01-01T00:00:00Z',
  user_metadata: { name: 'Dr Solo' },
  app_metadata: {
    memberships: { clinica_a: 'doctor' },
    therapist_ids: { clinica_a: 'psq-9' },
  },
};

const doctoresDeA = [drX, drSolo];

// --- El ataque -------------------------------------------------------
// El admin de la clinica A edita la ficha psq-7 y le pone un correo suyo.
{
  const fichaSecuestrada = { id: 'psq-7', name: 'Dr X', email: 'atacante@evil.test' };
  const { user, matchedBy } = matchDoctorUser(doctoresDeA, fichaSecuestrada, 'clinica_a');

  assert.equal(user?.id, 'user-x', 'el montaje debe emparejar por ficha, no por correo');
  assert.equal(matchedBy, 'therapist_id', 'el correo no coincide: el match es por ficha');
  assert.deepEqual(otherTenantsOf(user, 'clinica_a'), ['clinica_b'],
    'el montaje exige que el doctor tenga otra clinica');

  const update = buildIdentityUpdate({
    user, tenantId: 'clinica_a', therapist: fichaSecuestrada, matchedBy,
    otherTenants: ['clinica_b'],   // lo que dice tenant_members
  });

  assert.ok(
    !('email' in update),
    'SECUESTRO: la clinica A reescribio el correo de login de un doctor que tambien atiende en la clinica B; ' +
    'con "recuperar contraseña" el atacante hereda su acceso a los pacientes de B',
  );

  // La membresia ajena tiene que sobrevivir intacta.
  assert.equal(update.app_metadata.memberships.clinica_b, 'doctor',
    'la sincronizacion de A no puede tocar la membresia de B');
  assert.equal(update.app_metadata.therapist_ids.clinica_b, 'psq-3',
    'la sincronizacion de A no puede tocar la ficha de B');
}

// --- Lo que SI debe seguir funcionando -------------------------------
// Corregir el correo de un doctor que solo trabaja aqui: nadie mas
// depende de esa identidad.
{
  const fichaCorregida = { id: 'psq-9', name: 'Dr Solo', email: 'solo.nuevo@clinica.mx' };
  const { user, matchedBy } = matchDoctorUser(doctoresDeA, fichaCorregida, 'clinica_a');

  assert.equal(user?.id, 'user-solo');
  assert.equal(matchedBy, 'therapist_id');

  const update = buildIdentityUpdate({
    user, tenantId: 'clinica_a', therapist: fichaCorregida, matchedBy,
    otherTenants: [],
  });

  assert.equal(update.email, 'solo.nuevo@clinica.mx',
    'corregir el correo de alguien que solo trabaja en esta clinica debe seguir funcionando');
}

// Emparejar por correo no renombra nada: ya son el mismo.
{
  const ficha = { id: 'psq-7', name: 'Dr X', email: 'DR.X@clinica.MX' };
  const { user, matchedBy } = matchDoctorUser(doctoresDeA, ficha, 'clinica_a');

  assert.equal(user?.id, 'user-x');
  assert.equal(matchedBy, 'email', 'el correo normalizado debe emparejar sin importar mayusculas');

  const update = buildIdentityUpdate({
    user, tenantId: 'clinica_a', therapist: ficha, matchedBy, otherTenants: [],
  });
  assert.ok(!('email' in update), 'si se emparejo por correo no hay nada que reescribir');
}

// Un doctor nuevo no empareja con nadie.
{
  const ficha = { id: 'psq-nuevo', name: 'Dra Nueva', email: 'nueva@clinica.mx' };
  const { user } = matchDoctorUser(doctoresDeA, ficha, 'clinica_a');
  assert.equal(user, null, 'una ficha nueva con correo nuevo no debe emparejar con nadie');
}

console.log('doctor-identity: la clinica no reescribe la identidad global de un doctor');

// --- La decision no puede colgar del claim ---------------------------
// app_metadata es la CACHE de tenant_members. Si la escritura del claim
// falla, el usuario sigue siendo miembro de la otra clinica en la tabla
// mientras su claim ya no lo dice. Si el permiso se decidiera con el
// claim, el secuestro se reabriria solo, sin que nadie tocara el codigo.
{
  const drXconClaimRoto = {
    ...drX,
    app_metadata: {
      // El claim perdio clinica_b.
      memberships: { clinica_a: 'doctor' },
      therapist_ids: { clinica_a: 'psq-7' },
    },
  };

  assert.deepEqual(otherTenantsOf(drXconClaimRoto, 'clinica_a'), [],
    'el montaje exige que el claim ya no mencione la otra clinica');

  // Pero tenant_members si la tiene.
  const update = buildIdentityUpdate({
    user: drXconClaimRoto,
    tenantId: 'clinica_a',
    therapist: { id: 'psq-7', name: 'Dr X', email: 'atacante@evil.test' },
    matchedBy: 'therapist_id',
    otherTenants: ['clinica_b'],
  });

  assert.ok(!('email' in update),
    'SECUESTRO: con el claim desfasado se reescribio el correo; la decision debe salir de tenant_members, no de app_metadata');
}

// Sin dato sobre otras clinicas se falla CERRADO: no saberlo no es
// permiso.
{
  assert.equal(
    canRewriteLoginEmail({ matchedBy: 'therapist_id', otherTenants: undefined }),
    false,
    'sin lista de clinicas no se puede reescribir la identidad',
  );
  assert.equal(
    canRewriteLoginEmail({ matchedBy: 'therapist_id', otherTenants: [] }),
    true,
    'sin otras clinicas, corregir el correo sigue permitido',
  );
  assert.equal(
    canRewriteLoginEmail({ matchedBy: 'email', otherTenants: [] }),
    false,
    'emparejado por correo no hay nada que reescribir',
  );
}

console.log('doctor-identity: la decision sale de tenant_members y falla cerrado');

// --- Hallazgo A: borrar y recrear tambien escribe la identidad -------
// El mismo patron que 8.3, expresado como borrar-y-recrear en vez de
// actualizar. deleteUser NO esta acotado por tenant: borra la fila entera
// de auth.users, y profiles.user_id es on delete cascade. Si el doctor
// nunca confirmo su cuenta, la rama disparaba ANTES de cualquier chequeo
// de clinica.
{
  // Dr Z fue invitado a las dos clinicas y nunca confirmo.
  const drZsinConfirmar = {
    id: 'user-z',
    email: 'dr.z@clinica.mx',
    confirmed_at: null,
    app_metadata: {
      memberships: { clinica_a: 'doctor', clinica_b: 'doctor' },
      therapist_ids: { clinica_a: 'psq-11', clinica_b: 'psq-12' },
    },
  };

  assert.equal(
    canRecreateUnconfirmedUser({ user: drZsinConfirmar, otherTenants: ['clinica_b'] }),
    false,
    'DESTRUCCION: la clinica A borro la cuenta global de un doctor que tambien atiende en la ' +
    'clinica B — con ella su fila de profiles (on delete cascade) y su membresia de B — y la ' +
    'recreo bajo el correo que A eligio',
  );
}

// Lo que SI debe seguir funcionando: una invitacion sin confirmar de
// alguien que solo pertenece a esta clinica. No se le puede corregir el
// correo —el enlace ya salio a la direccion vieja— asi que borrar y
// reinvitar es lo unico que funciona, y no afecta a nadie mas.
{
  const invitadoSoloAqui = {
    id: 'user-inv',
    email: 'typo@clinica.mx',
    confirmed_at: null,
    app_metadata: {
      memberships: { clinica_a: 'doctor' },
      therapist_ids: { clinica_a: 'psq-13' },
    },
  };

  assert.equal(
    canRecreateUnconfirmedUser({ user: invitadoSoloAqui, otherTenants: [] }),
    true,
    'reinvitar a alguien que solo pertenece a esta clinica debe seguir funcionando',
  );
}

// Una cuenta YA CONFIRMADA nunca se borra por esta via, ni siquiera si
// solo pertenece a esta clinica: ahi si se puede actualizar.
{
  const confirmadoSoloAqui = {
    id: 'user-conf',
    email: 'conf@clinica.mx',
    confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { memberships: { clinica_a: 'doctor' }, therapist_ids: { clinica_a: 'psq-14' } },
  };

  assert.equal(
    canRecreateUnconfirmedUser({ user: confirmadoSoloAqui, otherTenants: [] }),
    false,
    'una cuenta confirmada no se borra: se actualiza',
  );
}

// Sin dato sobre otras clinicas se falla CERRADO, igual que en la
// reescritura de correo.
{
  const sinConfirmar = {
    id: 'user-x2', confirmed_at: null,
    app_metadata: { memberships: { clinica_a: 'doctor' } },
  };
  assert.equal(
    canRecreateUnconfirmedUser({ user: sinConfirmar, otherTenants: undefined }),
    false,
    'sin poder confirmar que no atiende en otro lado, no se destruye su cuenta',
  );
}

console.log('doctor-identity: no se destruye la cuenta de un doctor compartido');

// --- Hallazgo 2: invitar a alguien que ya existe le borra sus clinicas ---
// inviteDoctor pasaba a grantMembership un objeto FABRICADO con
// app_metadata: {}. buildIdentityUpdate lo expande y updateUserById
// REEMPLAZA el app_metadata entero. inviteUserByEmail sobre un correo que
// ya pertenece a alguien sin confirmar devuelve al usuario existente, no
// crea uno nuevo — y ahi se le borran las membresias de sus otras
// clinicas. Sin memberships, current_tenant_id() le da null alla y queda
// fuera de su propia clinica.
{
  const yaExistia = {
    data: {
      user: {
        id: 'user-preexistente',
        email: 'dra.b@clinica.mx',
        app_metadata: {
          memberships: { clinica_b: 'owner' },
          therapist_ids: { clinica_b: 'psq-20' },
        },
        user_metadata: { name: 'Dra B' },
      },
    },
  };

  const user = invitedUserFrom(yaExistia);

  assert.equal(
    user?.app_metadata?.memberships?.clinica_b,
    'owner',
    'BORRADO: se fabrico un app_metadata vacio en vez de usar el usuario que devolvio la ' +
    'invitacion; al escribirlo, la duena de la clinica B pierde su membresia alla',
  );

  // Y al construir el update, la membresia ajena sobrevive.
  const update = buildIdentityUpdate({
    user, tenantId: 'clinica_a',
    therapist: { id: 'psq-21', name: 'Dra B', email: 'dra.b@clinica.mx' },
    matchedBy: null, otherTenants: ['clinica_b'],
  });
  assert.equal(update.app_metadata.memberships.clinica_b, 'owner',
    'la membresia de la clinica B debe sobrevivir a una invitacion hecha desde la A');
  assert.equal(update.app_metadata.memberships.clinica_a, 'doctor',
    'y la de la clinica A debe quedar concedida');
}

// Un usuario de verdad nuevo no trae nada, y eso esta bien.
{
  const nuevo = { data: { user: { id: 'user-nuevo', email: 'nuevo@ex.mx', app_metadata: {} } } };
  const user = invitedUserFrom(nuevo);
  assert.equal(user?.id, 'user-nuevo');
  assert.deepEqual(otherTenantsOf(user, 'clinica_a'), [], 'un usuario nuevo no tiene otras clinicas');
}

// Sin usuario en la respuesta, no se inventa uno.
{
  assert.equal(invitedUserFrom({ data: {} }), null);
  assert.equal(invitedUserFrom(null), null);
}

// --- Hallazgo 3: el nombre global tampoco es de una sola clinica ------
// user_metadata.name vive en la misma llave de objeto que email, cuatro
// lineas mas arriba. email exige otherTenants vacio; name se escribia
// siempre, incluso en la rama que se toma PRECISAMENTE porque la persona
// atiende en otra clinica.
{
  const compartido = {
    id: 'user-comp',
    email: 'dra.garcia@clinica.mx',
    user_metadata: { name: 'Dra. García' },
    app_metadata: {
      memberships: { clinica_a: 'doctor', clinica_b: 'doctor' },
      therapist_ids: { clinica_a: 'psq-30', clinica_b: 'psq-31' },
    },
  };

  const update = buildIdentityUpdate({
    user: compartido, tenantId: 'clinica_a',
    therapist: { id: 'psq-30', name: 'LA QUE SEA', email: 'dra.garcia@clinica.mx' },
    matchedBy: 'email', otherTenants: ['clinica_b'],
  });

  assert.ok(
    !('user_metadata' in update),
    'NOMBRE: la clinica A reescribio el nombre global de una doctora que tambien atiende en la ' +
    'clinica B; B ve el texto que eligio A',
  );
}

// Para quien solo trabaja aqui, actualizar el nombre sigue siendo lo correcto.
{
  const solo = {
    id: 'user-solo2', email: 'solo2@clinica.mx',
    user_metadata: { name: 'Viejo' },
    app_metadata: { memberships: { clinica_a: 'doctor' }, therapist_ids: { clinica_a: 'psq-40' } },
  };
  const update = buildIdentityUpdate({
    user: solo, tenantId: 'clinica_a',
    therapist: { id: 'psq-40', name: 'Nuevo', email: 'solo2@clinica.mx' },
    matchedBy: 'email', otherTenants: [],
  });
  assert.equal(update.user_metadata?.name, 'Nuevo',
    'con una sola clinica, actualizar el nombre debe seguir funcionando');
}

console.log('doctor-identity: invitar no borra clinicas, y el nombre global tampoco se pisa');

// --- Una membresia inactiva sigue siendo otra clinica ----------------
// El guard preguntaba a tenant_members filtrando active=true. Una baja
// logica devolvia [] y abria solas las dos operaciones destructivas.
// Hoy nadie escribe active=false, asi que no era explotable; pero la
// columna existe y el dia que alguien implemente baja logica el permiso
// se abriria sin tocar el guard. La consulta ya no filtra por active, y
// estas dos aserciones fijan que la lista que llega se respeta tal cual.
{
  const compartido = {
    id: 'user-baja',
    email: 'dr.baja@clinica.mx',
    confirmed_at: null,
    user_metadata: { name: 'Dr Baja' },
    app_metadata: { memberships: { clinica_a: 'doctor' }, therapist_ids: { clinica_a: 'psq-50' } },
  };

  // tenant_members dice que sigue vinculado a B, aunque esa membresia
  // este dada de baja.
  assert.equal(
    canRecreateUnconfirmedUser({ user: compartido, otherTenants: ['clinica_b'] }),
    false,
    'una membresia inactiva en otra clinica no autoriza destruir la cuenta',
  );

  const update = buildIdentityUpdate({
    user: compartido, tenantId: 'clinica_a',
    therapist: { id: 'psq-50', name: 'Otro nombre', email: 'atacante@evil.test' },
    matchedBy: 'therapist_id', otherTenants: ['clinica_b'],
  });
  assert.ok(!('email' in update), 'ni a reescribir su correo');
  assert.ok(!('user_metadata' in update), 'ni su nombre');
}

console.log('doctor-identity: una membresia inactiva sigue contando como otra clinica');
