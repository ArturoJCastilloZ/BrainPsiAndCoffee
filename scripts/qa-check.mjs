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

const schema = read('scripts/supabase-schema.sql');
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
assert(doctor.includes('saveClinicalNote'), 'DoctorApp debe manejar notas clínicas.');
assert(doctor.includes('Pacientes'), 'DoctorApp debe incluir vista de pacientes.');

if (failures.length) {
  console.error('QA check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('QA check passed.');
