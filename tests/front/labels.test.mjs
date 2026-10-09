// Ninguna pantalla pinta un codigo interno (status, role, method…) tal
// cual: el Inicio del panel mostraba "PENDING_APPOINTMENT". Los codigos se
// traducen con su etiqueta (StatusBadge, ROLE_LABELS, METHOD_LABEL…).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const archivos = (dir) => readdirSync(dir).flatMap((n) => {
  const ruta = join(dir, n);
  return statSync(ruta).isDirectory() ? archivos(ruta) : ruta.endsWith('.jsx') ? [ruta] : [];
});

const CODIGOS = 'status|role|method|source|kind|type|consentType|relationship';
// {o.status}, {o.status.toUpperCase()}… como TEXTO. {errors.type} es un
// mensaje de error, no un codigo.
const crudo = new RegExp(String.raw`>\s*\{(?!errors\.)[\w?.]+\.(${CODIGOS})(\??\.(toUpperCase|toLowerCase|replace)\([^)]*\))?\}`);
const mayusculas = new RegExp(String.raw`\.(${CODIGOS})\??\.toUpperCase\(\)`);

const culpables = archivos('src').flatMap((ruta) => readFileSync(ruta, 'utf8').split('\n')
  .map((linea, i) => ({ ruta, n: i + 1, linea }))
  .filter(({ linea }) => crudo.test(linea) || mayusculas.test(linea)));

assert.deepEqual(culpables.map(({ ruta, n }) => `${ruta}:${n}`), [],
  'hay codigos internos pintados tal cual; usa su etiqueta en espanol');
console.log('labels: ningun codigo interno se pinta tal cual');
