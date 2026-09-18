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
    user, tenantId: 'clinica_a', therapist: ficha, matchedBy,
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
