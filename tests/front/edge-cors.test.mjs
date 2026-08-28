// Todo header personalizado que una Edge Function LEA tiene que estar
// declarado en su Access-Control-Allow-Headers.
//
// Existe por un error real: se agrego la lectura de x-tenant-id sin
// ponerlo en la lista de CORS. El navegador manda un preflight OPTIONS
// antes de la llamada y lo rechaza, asi que la funcion no llega ni a
// ejecutarse — y el sintoma no apunta al header, sino a un fallo generico
// de la llamada.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'supabase/functions';

// Los que el navegador manda siempre o son de la plataforma.
const SIEMPRE_PERMITIDOS = new Set([
  'authorization', 'content-type', 'accept', 'origin', 'apikey', 'x-client-info',
]);

if (!existsSync(ROOT)) {
  console.log('edge-cors: no hay funciones que revisar');
  process.exit(0);
}

let revisadas = 0;
for (const dir of readdirSync(ROOT, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const file = join(ROOT, dir.name, 'index.ts');
  if (!existsSync(file)) continue;
  const src = readFileSync(file, 'utf8');

  const leidos = [...src.matchAll(/req\.headers\.get\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => m[1].toLowerCase());

  const allow = (src.match(/'Access-Control-Allow-Headers':\s*'([^']*)'/) || [, ''])[1]
    .toLowerCase();

  for (const h of leidos) {
    if (SIEMPRE_PERMITIDOS.has(h)) continue;
    assert.ok(
      allow.includes(h),
      `${dir.name}: lee el header "${h}" pero no lo declara en Access-Control-Allow-Headers`,
    );
  }
  revisadas += 1;
}

console.log(`edge-cors: ${revisadas} funcion(es) OK`);
