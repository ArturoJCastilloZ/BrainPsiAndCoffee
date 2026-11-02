// Toda Edge Function que actue sobre la clinica de x-tenant-id tiene que
// comprobar que esa clinica este activa ANTES de escribir nada.
//
// Las funciones usan service_role, que se salta RLS: la migracion 0050
// (una clinica suspendida no opera) no las cubre. Sin esta comprobacion,
// el dueño de una clinica suspendida seguiria dando de alta personal y
// concediendo accesos clinicos.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const ROOT = 'supabase/functions';

// Lo primero que escribe o crea algo. La comprobacion va antes de todo esto.
const ESCRITURAS = ['.insert(', '.upsert(', '.update(', 'admin.createUser', 'inviteUserByEmail', '.rpc('];

const funciones = existsSync(ROOT)
  ? readdirSync(ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ nombre: d.name, file: join(ROOT, d.name, 'index.ts') }))
      .filter(({ file }) => existsSync(file))
      .map(({ nombre, file }) => ({ nombre, src: readFileSync(file, 'utf8') }))
      .filter(({ src }) => /req\.headers\.get\(\s*['"]x-tenant-id['"]\s*\)/i.test(src))
  : [];

test('hay funciones por clinica que revisar', () => {
  assert.ok(funciones.length > 0, 'ninguna Edge Function lee x-tenant-id: la prueba no revisa nada');
});

for (const { nombre, src } of funciones) {
  test(`${nombre}: rechaza una clinica que no esta activa antes de escribir`, () => {
    const consulta = src.indexOf(".from('tenants')");
    assert.ok(consulta >= 0, `${nombre}: no consulta tenants.status`);
    assert.ok(src.includes("status !== 'active'"), `${nombre}: no rechaza status distinto de 'active'`);

    const primeras = ESCRITURAS.map((m) => [m, src.indexOf(m)]).filter(([, i]) => i >= 0);
    for (const [marca, i] of primeras) {
      assert.ok(
        consulta < i,
        `${nombre}: "${marca}" aparece antes de comprobar que la clinica este activa`,
      );
    }
  });
}
