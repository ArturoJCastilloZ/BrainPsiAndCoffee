// Ningun .sql de prueba puede correr contra una base real.
//
// El incidente: el 2026-09-18, entre las 05:47 y las 05:48, se ejecutaron
// tests/tenancy/0013_profiles_isolation.sql y 0014_login_identifier.sql
// contra la base de PRODUCCION. Dejaron cuatro tenants fantasma
// (t_pf1, t_pf2, t_li_a, t_li_b) y cuatro cuentas en auth.users con
// membresias activas, una de ellas con rol OWNER.
//
// El guard falla CERRADO: cada archivo aborta salvo que encuentre la
// marca public.__banco_desechable, que solo crea run.sh en el contenedor
// que el mismo levanta. Enumerar señales de produccion —"si existe el
// esquema storage, es Supabase"— fallaria ABIERTO en cuanto la lista se
// quedara corta; exigir una marca positiva no tiene esa fuga.
//
// Esta prueba vigila que NINGUN archivo se quede sin el guard, que es como
// volveria a pasar: alguien agrega 0021_loquesea.sql y se le olvida.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'tests/tenancy';
const MARCA = '__banco_desechable';

const sqls = readdirSync(DIR).filter((f) => f.endsWith('.sql'));
assert.ok(sqls.length >= 20, `se esperaban los archivos de la suite, se hallaron ${sqls.length}`);

// 1 · Todos llevan el guard, y ARRIBA: si va despues de los inserts, el
//     daño ya se hizo cuando aborta.
const sinGuard = [];
const tarde = [];
for (const nombre of sqls) {
  const texto = readFileSync(join(DIR, nombre), 'utf8');
  const posGuard = texto.indexOf(MARCA);
  if (posGuard === -1) { sinGuard.push(nombre); continue; }
  const primeraEscritura = Math.min(
    ...['insert into', 'create table', 'update ', 'delete from', 'drop ', 'alter table', 'create or replace']
      .map((p) => { const i = texto.toLowerCase().indexOf(p); return i === -1 ? Number.MAX_SAFE_INTEGER : i; }),
  );
  if (primeraEscritura < posGuard) tarde.push(nombre);
}

assert.deepEqual(sinGuard, [],
  `estos .sql de prueba no tienen el guard del banco desechable y podrian ejecutarse contra produccion: ${sinGuard.join(', ')}`);

assert.deepEqual(tarde, [],
  `en estos el guard va DESPUES de la primera escritura, asi que abortaria con el daño ya hecho: ${tarde.join(', ')}`);

// 2 · Y el monolito del esquema, que es el peor caso: reescribe las 49
//     policies y apaga el aislamiento sin lanzar un error.
const monolito = readFileSync('scripts/legacy/supabase-schema.sql', 'utf8');
assert.ok(monolito.includes(MARCA),
  'scripts/legacy/supabase-schema.sql no tiene el guard: correrlo contra una base real reescribe las policies y apaga el aislamiento entre clinicas en silencio');

// 3 · Y lo unico que habilita la marca es run.sh.
const runner = readFileSync(join(DIR, 'run.sh'), 'utf8');
assert.ok(runner.includes(`create table if not exists public.${MARCA}`),
  'run.sh ya no crea la marca del banco desechable: la suite entera abortaria');

console.log(`sql-guard: ${sqls.length} archivos de prueba + el monolito, todos con guard antes de la primera escritura`);
