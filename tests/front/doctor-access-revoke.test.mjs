// A quien se le revoca el acceso de doctor, y a quien NO.
//
// El bucle de revocacion de sync-doctor-access decidia sobre la foto de
// usuarios tomada ANTES de sincronizar, y sobre app_metadata en vez de
// sobre tenant_members. Las dos cosas fallan hacia lados opuestos y las
// dos en silencio, con {ok:true}.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { doctorsToRevoke } from '../../supabase/functions/sync-doctor-access/identity.mjs';

// El caso del hallazgo D, tal cual: se rehace la ficha de un doctor.
// t_old sale del catalogo, t_new entra con el mismo correo, y la
// sincronizacion ya le concedio la membresia con t_new.
test('rehacer la ficha de un doctor no le quita el acceso que acaba de recibir', () => {
  const { revoke } = doctorsToRevoke({
    // La tabla todavia trae la ficha vieja en el momento de leerla, que
    // es exactamente lo que hacia daño.
    members: [{ user_id: 'u-doc', therapist_id: 't_old' }],
    activeTherapistIds: ['t_new'],
    syncedUserIds: ['u-doc'],
  });

  assert.deepEqual(revoke, [],
    'se le revoco al doctor la membresia que la misma corrida acababa de concederle');
});

// Y el uso legitimo sigue funcionando: si de verdad se dio de baja, se
// revoca. Sin esto, el arreglo podria haber sido "no revocar nunca".
test('dar de baja a un doctor si le revoca el acceso', () => {
  const { revoke } = doctorsToRevoke({
    members: [{ user_id: 'u-baja', therapist_id: 't_baja' }],
    activeTherapistIds: ['t_otra'],
    syncedUserIds: [],
  });

  assert.deepEqual(revoke, [{ userId: 'u-baja', therapistId: 't_baja' }],
    'un doctor dado de baja conserva su acceso a pacientes y notas');
});

// Un doctor activo que no cambio no se toca.
test('un doctor activo que no cambio se queda como esta', () => {
  const { revoke } = doctorsToRevoke({
    members: [{ user_id: 'u-ok', therapist_id: 't_ok' }],
    activeTherapistIds: ['t_ok'],
    syncedUserIds: ['u-ok'],
  });
  assert.deepEqual(revoke, []);
});

// La fuente es tenant_members, no el claim. Un doctor que esta en la
// tabla y NO en app_metadata tiene que ser visible para el bucle: antes
// era invisible y su baja no revocaba nada. Aqui se representa porque la
// funcion ya no recibe usuarios con claims, recibe FILAS.
test('un miembro que el claim no refleja sigue siendo revocable', () => {
  const { revoke } = doctorsToRevoke({
    members: [{ user_id: 'u-sin-claim', therapist_id: 't_baja' }],
    activeTherapistIds: [],
    syncedUserIds: [],
  });
  assert.deepEqual(revoke, [{ userId: 'u-sin-claim', therapistId: 't_baja' }],
    'un doctor ausente del claim quedo fuera del bucle y conservo el acceso');
});

// Un miembro sin ficha no se revoca -seria adivinar- pero tampoco se
// calla. El codigo viejo hacia 'continue' y nadie se enteraba.
test('un miembro sin ficha se reporta en vez de saltarse en silencio', () => {
  const { revoke, unresolved } = doctorsToRevoke({
    members: [{ user_id: 'u-sin-ficha', therapist_id: null }],
    activeTherapistIds: ['t_ok'],
    syncedUserIds: [],
  });

  assert.deepEqual(revoke, [], 'se revoco a alguien cuya ficha no se pudo determinar');
  assert.deepEqual(unresolved, ['u-sin-ficha'],
    'el miembro sin ficha se salto en silencio, que es lo que hacia el codigo viejo');
});

console.log('doctor-access-revoke: la revocacion decide sobre lo que paso, no sobre la foto');
