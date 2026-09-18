import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

const assert = (condition, message) => {
  if (!condition) failures.push(message);
};

const indexHtml = read('index.html');
assert(indexHtml.includes('<!doctype html>'), 'index.html debe declarar doctype.');
assert(indexHtml.includes('lang="es-MX"'), 'index.html debe declarar lang es-MX.');
assert(indexHtml.includes('name="description"'), 'index.html debe incluir meta description.');

assert(exists('public/robots.txt'), 'Debe existir public/robots.txt.');
assert(exists('public/sitemap.xml'), 'Debe existir public/sitemap.xml.');
const sitemap = read('public/sitemap.xml');
['/', '/coffee', '/therapy', '/contacto', '/privacidad'].forEach((route) => {
  assert(sitemap.includes(`brainpsicoffee.com${route === '/' ? '/' : route}`), `Sitemap debe incluir ${route}.`);
});

const envExample = read('.env.example');
[
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_AUTH_INACTIVITY_MINUTES',
  'VITE_AUTH_WARNING_SECONDS',
  'VITE_ANALYTICS_ENDPOINT',
].forEach((needle) => {
  assert(envExample.includes(needle), `.env.example debe documentar ${needle}.`);
});

const schema = read('scripts/legacy/supabase-schema.sql');
[
  'enable row level security',
  'business_settings',
  'profiles',
  'patients',
  'appointment_notes',
  'appointment_notifications',
  'Public can create appointments',
  'Admins can manage business settings',
  'Doctors can manage own clinical notes',
  'Clinic staff can manage appointment notifications',
  'Cafe staff can read orders',
  'prevent_barista_order_data_changes',
  'queue_appointment_notification',
  'order_can_receive_public_items',
].forEach((needle) => {
  assert(schema.includes(needle), `Schema debe incluir ${needle}.`);
});

const app = read('src/App.jsx');
assert(app.includes('lazy(() => import'), 'App debe usar lazy imports para code splitting.');
assert(app.includes('Suspense'), 'App debe usar Suspense para rutas lazy.');

const monitoring = read('src/monitoring.js');
assert(monitoring.includes('trackEvent'), 'Debe existir trackEvent.');
assert(monitoring.includes('installGlobalErrorReporting'), 'Debe existir reporte global de errores.');

const permissions = read('src/auth/permissions.js');
[
  'super_admin',
  'admin_cafe',
  'admin_consultorio',
  'doctor',
  'barista',
].forEach((role) => {
  assert(permissions.includes(role), `permissions.js debe incluir rol ${role}.`);
});

const login = read('src/components/Login.jsx');
assert(login.includes('Recuperar contraseña'), 'Login debe incluir recuperación de contraseña.');
assert(login.includes('requestPasswordReset'), 'Login debe llamar requestPasswordReset.');

const doctor = read('src/doctor/DoctorApp.jsx');
assert(doctor.includes('createClinicalNote'), 'DoctorApp debe poder crear notas clínicas.');
assert(doctor.includes('signClinicalNote'), 'DoctorApp debe poder firmar la nota.');
assert(doctor.includes('addNoteAddendum'), 'DoctorApp debe permitir addenda sobre una nota firmada.');
// Borrar una nota clínica no es una función que falte: es una que no debe
// existir. NOM-004 exige conservar el expediente 5 años desde el último
// acto médico, así que si alguien la reintroduce, esto lo detiene.
assert(!doctor.includes('deleteClinicalNote'), 'DoctorApp no debe poder borrar notas clínicas.');
const dataLayer = read('src/api/supabaseData.js');
assert(!dataLayer.includes('export const deleteClinicalNote'), 'La capa de datos no debe exponer borrado de notas clínicas.');
assert(doctor.includes('Pacientes'), 'DoctorApp debe incluir vista de pacientes.');

// La bitacora de LECTURA del expediente no se produce sola: Postgres no
// tiene triggers de SELECT, asi que si la aplicacion no la pide, abrir un
// expediente no deja rastro. La funcion de la base existia desde el
// esquema base y NADIE la llamaba — un control de cumplimiento que
// parecia estar y no estaba. En posicion de llamada, no un includes() del
// nombre: el import lo menciona igual.
assert(
  /logClinicalNoteAccess\s*\(/.test(doctor),
  'DoctorApp debe registrar el acceso al expediente llamando a logClinicalNoteAccess: sin eso, NOM-024 se queda sin bitacora de lectura.',
);

// La sincronizacion de doctores corre con service_role y auth.users.email
// NO esta acotado por tenant: es el login del usuario en todas sus
// clinicas. Quien lo controla controla la cuenta, porque el enlace de
// recuperacion va ahi. La decision de escribirlo vive en identity.mjs,
// que si se puede probar; si vuelve a escribirse a mano dentro de la
// funcion, ese control se evapora sin que ninguna prueba se entere.
// Las aserciones de abajo buscan patrones peligrosos como TEXTO. Sin
// quitar los comentarios, la prosa que EXPLICA el peligro los dispara:
// el comentario que documenta por que no se fabrica un app_metadata
// vacio contiene, literalmente, 'app_metadata: {}'. Un guard que se
// dispara con su propia documentacion es ruido, y el ruido se termina
// silenciando.
//
// Se quitan solo las lineas que EMPIEZAN con // y los bloques. Un '//' a
// media linea se conserva a proposito: 'https://esm.sh/...' lo lleva, y
// recortar desde ahi borraria codigo real — un falso NEGATIVO, que es el
// error caro. Queda vivo el caso de un comentario al final de una linea
// de codigo; es aceptable y preferible al otro lado del error.
// Solo se quitan las lineas que EMPIEZAN con //. Nada mas.
//
// La primera version tambien borraba bloques /* ... */ y eso producia un
// FALSO NEGATIVO: el regex corre sobre texto plano, sin saber de strings.
// Un literal con '/*' dentro —una regex, un 'text/*' de Content-Type— abre
// un bloque que se cierra en el primer '*/' que aparezca mas abajo, y se
// lleva por delante todo el codigo intermedio. Si en ese tramo estaba la
// regresion, la asercion pasaba en VERDE sobre codigo vulnerable.
// Comprobado: con 'text/*' antes de un updateUserById({ email }), la
// asercion de email daba false.
//
// El problema real que se queria resolver —la prosa que explica el
// peligro disparando el guard— vive en comentarios de LINEA, asi que el
// strip de bloques nunca hizo falta. Se prefiere un guard que a veces
// moleste de mas a uno que calle cuando importa.
const sinComentarios = (source) => source
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

const syncDoctor = sinComentarios(read('supabase/functions/sync-doctor-access/index.ts'));
assert(
  syncDoctor.includes('buildIdentityUpdate'),
  'sync-doctor-access debe decidir la identidad con buildIdentityUpdate, no a mano.',
);
// El guard anterior era /updateUserById\([^)]*\bemail\s*:/ y era un
// control con FALSO NEGATIVO: [^)]* no cruza un parentesis de cierre, asi
// que bastaba poner otra clave antes —'user_metadata: { ...(x || {}) }'—
// para que el parentesis cortara la busqueda y la forma peligrosa pasara
// en verde. Un guard que reporta OK ante la regresion que existe para
// frenar es peor que no tenerlo.
//
// index.ts hoy no asigna NINGUNA clave 'email:': la unica escritura de
// identidad sale de buildIdentityUpdate. Eso permite una asercion sin
// agujeros, que no depende de como se escriba la llamada.
// deleteUser borra la fila entera de auth.users y profiles.user_id es
// on delete cascade: no esta acotado por tenant. Solo puede correr detras
// de canRecreateUnconfirmedUser, que exige que la persona no pertenezca a
// ninguna otra clinica.
//
// Limite declarado: estas dos aserciones no prueban que la llamada este
// DENTRO del if — eso lo prueba tests/front/doctor-identity.test.mjs sobre
// el predicado. Lo que si detectan es que aparezca una SEGUNDA llamada, o
// que el guard desaparezca. Se prefieren dos comprobaciones simples y
// explicables a un regex de estructura que de falsos negativos.
// En POSICION DE LLAMADA, no un includes() del nombre: el import lo
// menciona igual, asi que un includes() seguia dando verde despues de
// quitar el guard del if. Comprobado quitandolo.
assert(
  /canRecreateUnconfirmedUser\s*\(/.test(syncDoctor),
  'sync-doctor-access debe decidir el borrado LLAMANDO a canRecreateUnconfirmedUser, no solo importarlo.',
);
assert(
  (syncDoctor.match(/\bdeleteUser\s*\(/g) || []).length === 1,
  'sync-doctor-access debe tener exactamente una llamada a deleteUser, la que va detras del guard: borra la cuenta GLOBAL del doctor y con ella su acceso a las demas clinicas.',
);

// updateUserById REEMPLAZA app_metadata, no lo fusiona. Fabricar un
// objeto de usuario con app_metadata vacio —en vez de usar el que
// devuelve la API— le borra al usuario las membresias de sus otras
// clinicas y lo deja fuera de ellas, porque las policies leen el claim.
assert(
  !/app_metadata\s*:\s*\{\s*\}/.test(syncDoctor),
  'sync-doctor-access no debe fabricar un app_metadata vacio: usa el usuario que devuelve la API (invitedUserFrom), o le borras al doctor sus otras clinicas.',
);

assert(
  !/\bemail\s*:/.test(syncDoctor),
  'sync-doctor-access no debe asignar email en index.ts: la identidad se decide en identity.mjs, que si se prueba. Escribirlo aqui puede secuestrar la cuenta de un doctor que atiende en otra clinica.',
);

if (failures.length) {
  console.error('QA check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('QA check passed.');
