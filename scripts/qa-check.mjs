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

const schema = read('scripts/supabase-schema.sql');
[
  'enable row level security',
  'business_settings',
  'Public can create appointments',
  'Admins can manage business settings',
].forEach((needle) => {
  assert(schema.includes(needle), `Schema debe incluir ${needle}.`);
});

const app = read('src/App.jsx');
assert(app.includes('lazy(() => import'), 'App debe usar lazy imports para code splitting.');
assert(app.includes('Suspense'), 'App debe usar Suspense para rutas lazy.');

const monitoring = read('src/monitoring.js');
assert(monitoring.includes('trackEvent'), 'Debe existir trackEvent.');
assert(monitoring.includes('installGlobalErrorReporting'), 'Debe existir reporte global de errores.');

if (failures.length) {
  console.error('QA check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('QA check passed.');
