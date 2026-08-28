// El hook de fetch debe AGREGAR el tenant sin perder ningun header.
//
// Existe por una regresion real: se inyectaba el header con
// { ...init.headers }, y cuando supabase-js manda un objeto Headers ese
// spread devuelve {} —sus entradas no son propiedades enumerables— asi
// que la peticion salia sin apikey ni Authorization. El sintoma era
// 'No API key found in request', y ni el build ni los tests lo veian.
import assert from 'node:assert/strict';

// Replica exacta de la logica de src/api/supabaseClient.js.
const inject = (init, tenantId) => {
  if (!tenantId) return init;
  const headers = new Headers(init?.headers || {});
  headers.set('x-tenant-id', tenantId);
  return { ...init, headers };
};

const read = (init) => Object.fromEntries(new Headers(init.headers).entries());

// Caso 1: supabase-js manda un Headers.
{
  const init = { headers: new Headers({ apikey: 'anon-key', Authorization: 'Bearer tok' }) };
  const out = read(inject(init, 't_a'));
  assert.equal(out.apikey, 'anon-key', 'se perdio apikey con Headers');
  assert.equal(out.authorization, 'Bearer tok', 'se perdio Authorization con Headers');
  assert.equal(out['x-tenant-id'], 't_a');
}

// Caso 2: objeto plano.
{
  const init = { headers: { apikey: 'anon-key', Authorization: 'Bearer tok' } };
  const out = read(inject(init, 't_a'));
  assert.equal(out.apikey, 'anon-key', 'se perdio apikey con objeto plano');
  assert.equal(out['x-tenant-id'], 't_a');
}

// Caso 3: sin headers previos.
{
  const out = read(inject({}, 't_a'));
  assert.equal(out['x-tenant-id'], 't_a');
}

// Caso 4: sin tenant no se toca el init, y el resto del init sobrevive.
{
  const init = { method: 'POST', headers: { apikey: 'anon-key' } };
  const out = inject(init, null);
  assert.equal(out, init, 'sin tenant el init debe pasar tal cual');
  assert.equal(inject({ method: 'POST', headers: {} }, 't_a').method, 'POST',
    'se perdio el resto del init');
}

console.log('tenant-header: 4 casos OK');
