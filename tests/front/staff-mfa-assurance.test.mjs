import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import * as password from '../../supabase/functions/invite-staff/password.mjs';
import { puedeAdministrarMfa } from '../../supabase/functions/invite-staff/mfa-assurance.mjs';

// Ejecuta el handler real sin red ni Deno. Solo se sustituyen los clientes
// de Supabase; no se replica el orden de sus controles en la prueba.
const source = stripTypeScriptTypes(readFileSync('supabase/functions/invite-staff/index.ts', 'utf8'))
  .replace(/^import[\s\S]*?from\s+['"][^'"]+['"];\s*/gm, '');
const request = async ({ aal = 'aal2', claimsError = null, claimsSub = 'owner', owner = true, targetRole = 'doctor', otherClinics = [], self = false, failClaims = false } = {}) => {
  const calls = { claims: [], searches: 0, lists: 0, deletes: [] };
  const caller = { auth: {
    getUser: async () => ({ data: { user: { id: 'owner' } } }),
    getClaims: async (token) => {
      calls.claims.push(token);
      if (failClaims) throw new Error('offline');
      return { data: { claims: { sub: claimsSub, aal } }, error: claimsError };
    },
  } };
  let queries = 0;
  const admin = {
    from: () => {
      queries += 1;
      const queryNumber = queries;
      const chain = { select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: { role: queryNumber === 1 ? (owner ? 'owner' : 'doctor') : targetRole } }),
        neq: async () => ({ data: otherClinics.map((tenant_id) => ({ tenant_id })) }),
      };
      return chain;
    },
    auth: { admin: {
      listUsers: async () => { calls.searches += 1; return { data: { users: [{ id: self ? 'owner' : 'staff', email: 'staff@example.invalid' }] } }; },
      mfa: {
        listFactors: async () => { calls.lists += 1; return { data: { factors: [{ id: 'factor' }] } }; },
        deleteFactor: async (value) => { calls.deletes.push(value); return {}; },
      },
    } },
  };
  let handler;
  let clients = 0;
  vm.runInNewContext(source, {
    ...password, puedeAdministrarMfa, Request, Response, URL,
    createClient: () => (++clients === 1 ? caller : admin),
    Deno: { env: { get: () => 'fixture' }, serve: (fn) => { handler = fn; } },
  });
  const response = await handler(new Request('https://fixture.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer fixture-token', 'x-tenant-id': 'clinic' },
    body: JSON.stringify({ accion: 'reiniciar_mfa', email: 'staff@example.invalid' }),
  }));
  return { response, calls };
};

for (const options of [{ aal: 'aal1' }, { aal: null }, { aal: 'invalid' }, { claimsError: new Error('invalid signature') }, { claimsSub: 'other' }, { failClaims: true }]) {
  test(`el handler rechaza MFA no verificada antes de buscar personal: ${JSON.stringify(options)}`, async () => {
    const { response, calls } = await request(options);
    assert.equal(response.status, 403);
    assert.deepEqual(calls.claims, ['fixture-token']);
    assert.equal(calls.searches, 0);
    assert.equal(calls.lists, 0);
    assert.equal(calls.deletes.length, 0);
  });
}
test('dueño aal2 puede reiniciar un factor del personal elegible', async () => {
  const { response, calls } = await request();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).estado, 'mfa_reiniciado');
  assert.deepEqual(JSON.parse(JSON.stringify(calls.deletes)), [{ id: 'factor', userId: 'staff' }]);
});
for (const options of [{ owner: false }, { targetRole: 'owner' }, { otherClinics: ['other'] }, { self: true }]) {
  test(`aal2 no elude restricciones de dueño y destinatario: ${JSON.stringify(options)}`, async () => {
    const { response, calls } = await request(options);
    assert.ok([400, 403].includes(response.status));
    assert.equal(calls.deletes.length, 0);
  });
}
test('sin bearer no se intentan verificar claims ni se acepta la operación', async () => {
  assert.equal(await puedeAdministrarMfa({}, '', 'owner'), false);
});
