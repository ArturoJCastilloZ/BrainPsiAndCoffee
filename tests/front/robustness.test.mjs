// Fase 3 de la auditoria del 2026-10-09: fallos que ve el usuario.
//
// Son decisiones de estructura que un refactor deshace sin que ninguna
// otra prueba lo note, asi que se vigilan en la fuente.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (rel) => readFileSync(new URL(`../../src/${rel}`, import.meta.url), 'utf8')
  .replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const app = leer('App.jsx');
const cuerpoApp = app.slice(app.indexOf('export default function App'), app.indexOf('\nfunction Marco'));

// 1 · Marco fuera de App: definido dentro era un componente nuevo en cada
//     render y borraba lo escrito en SetPassword.
assert.ok(/\nfunction Marco\(/.test(app), 'Marco debe definirse a nivel de modulo');
assert.ok(!/const Marco\s*=/.test(cuerpoApp), 'Marco volvio a definirse DENTRO de App: remonta SetPassword en cada render');

// 2 · Las rutas protegidas esperan a saber si hay sesion.
assert.ok(/path="\/admin"[\s\S]{0,200}!authReady/.test(app), '/admin decide antes de leer la sesion: recargar manda al login');
assert.ok(/path="\/doctor"[\s\S]{0,200}!authReady/.test(app), '/doctor decide antes de leer la sesion');

// 3 · Un error de render no deja la pantalla en blanco.
assert.ok(/<ErrorBoundary[\s\S]*<Routes>/.test(app), 'las rutas deben ir dentro de un ErrorBoundary');
const main = leer('main.jsx');
assert.ok(/vite:preloadError/.test(main), 'tras un deploy, un chunk viejo deja la pantalla en blanco');
assert.ok(/onUncaughtError/.test(main), 'los errores no atrapados deben reportarse');

// 4 · El aviso de error no habla de Supabase ni es permanente.
assert.ok(!/Error conectando con Supabase/.test(app), 'el paciente vuelve a ver "Error conectando con Supabase"');
assert.ok(/setErrorCerrado/.test(app), 'el aviso de error debe poder cerrarse');

// 5 · La capa GUARDANDO solo en escrituras, y el feed de pedidos acotado.
const cliente = leer('api/supabaseClient.js');
assert.ok(/shouldTrack\s*=[^\n]*esEscritura\(/.test(cliente), 'el loader bloqueante volvio a encenderse con lecturas');
const crud = leer('hooks/useSupabaseCrud.js');
const feed = crud.slice(crud.indexOf("channel(`coffee-orders-feed"), crud.indexOf('removeChannel'));
assert.ok(feed.length > 0, 'no encontre el canal de pedidos');
assert.ok(!/\breload\(\)/.test(crud.slice(crud.indexOf('Feed de pedidos'), crud.indexOf('removeChannel'))),
  'cada evento del feed recarga TODO otra vez');
assert.ok(/filter:\s*filtro/.test(feed) && /tenant_id=eq\./.test(crud), 'el feed de pedidos debe acotarse a la clinica');

// 6 · Las invitaciones se consultan una vez por USUARIO, no en cada
//     cambio del objeto de sesion: Supabase lo recrea al volver a la
//     pestaña y el temporizador de inactividad cada 30 s de actividad.
assert.ok(/\[usuarioId, cargarInvitaciones\]/.test(app),
  'my_pending_invitations volvio a depender del objeto de sesion: se pide cada vez que la pestaña recupera el foco');

console.log('robustness: ok');
