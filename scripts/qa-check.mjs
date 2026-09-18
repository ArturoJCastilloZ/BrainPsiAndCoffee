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

// La sincronizacion de doctores corre con service_role y auth.users.email
// NO esta acotado por tenant: es el login del usuario en todas sus
// clinicas. Quien lo controla controla la cuenta, porque el enlace de
// recuperacion va ahi. La decision de escribirlo vive en identity.mjs,
// que si se puede probar; si vuelve a escribirse a mano dentro de la
// funcion, ese control se evapora sin que ninguna prueba se entere.
const syncDoctor = read('supabase/functions/sync-doctor-access/index.ts');
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
