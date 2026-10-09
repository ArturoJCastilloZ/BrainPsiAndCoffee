// vercel.json y Docker (nginx) sirven el MISMO sitio: mismas cabeceras de
// seguridad, mismas redirecciones y misma cache. Si una cambia y la otra
// no, Vercel publicaria un sitio con otra CSP sin que nadie lo decidiera.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGACY_REDIRECTS } from '../../src/seo/routes.mjs';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const nginx = readFileSync(new URL('../../docker/security-headers.conf', import.meta.url), 'utf8');

const deNginx = Object.fromEntries([...nginx.matchAll(/^add_header\s+(\S+)\s+"([^"]*)"\s+always;/gm)]
  .map((m) => [m[1], m[2]]));
const bloque = (source) => Object.fromEntries(
  (vercel.headers.find((h) => h.source === source)?.headers || []).map((h) => [h.key, h.value]));

// 1 · Cabeceras de seguridad: identicas, en todas las rutas.
{
  assert.ok(Object.keys(deNginx).length >= 4, 'no se leyeron las cabeceras de nginx');
  const todas = bloque('/(.*)');
  for (const [clave, valor] of Object.entries(deNginx)) {
    assert.equal(todas[clave], valor, `vercel.json: ${clave} distinta de docker/security-headers.conf`);
  }
}

// 2 · Cache: assets con hash para siempre; env-config nunca; HTML revalida.
{
  assert.equal(bloque('/(.*)')['Cache-Control'], 'no-cache');
  assert.match(bloque('/assets/(.*)')['Cache-Control'], /immutable/);
  assert.equal(bloque('/env-config.js')['Cache-Control'], 'no-store');
}

// 3 · Redirecciones: las de routes.mjs, permanentes. Sin rewrites a
//     index.html: lo que no existe debe ser 404 de verdad (404.html), no
//     la portada con 200.
{
  const redir = Object.fromEntries(vercel.redirects.map((r) => [r.source, r.destination]));
  assert.deepEqual(redir, LEGACY_REDIRECTS);
  assert.ok(vercel.redirects.every((r) => r.permanent === true), 'las redirecciones viejas deben ser 301/308');
  assert.equal(vercel.rewrites, undefined, 'un rewrite general convertiria cada URL inventada en un 200');
  assert.equal(vercel.outputDirectory, 'dist');
}

console.log('vercel: cabeceras, cache y redirecciones iguales a Docker');
