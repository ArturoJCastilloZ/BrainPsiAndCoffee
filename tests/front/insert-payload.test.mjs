// Un payload de insercion no debe llevar claves con undefined.
//
// supabase-js arma la lista de columnas con Object.keys(), y una clave con
// valor undefined sigue siendo una clave propia: viaja en ?columns=...
// aunque JSON.stringify la omita del cuerpo. PostgREST entonces escribe
// NULL en esa columna en vez de aplicar su DEFAULT.
//
// Paso de verdad: guardar un horario nuevo fallaba con
// 'null value in column "id" of relation "therapist_schedules"'.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('src/api/supabaseData.js', 'utf8');

// Los mappers *ToDb construyen filas que se mandan en arreglos. Ninguno
// debe emitir una clave que pueda quedar en undefined.
const sospechosos = [...src.matchAll(/const (map\w+ToDb)\s*=[\s\S]*?\n\};?/g)]
  .filter(([bloque]) => /:\s*[^,\n]*\|\|\s*undefined/.test(bloque))
  .map(([, nombre]) => nombre);

assert.deepEqual(sospechosos, [],
  `estos mappers emiten claves undefined y provocarian NULL en columnas con DEFAULT: ${sospechosos.join(', ')}`);

// Y la demostracion de por que importa.
const conUndefined = { id: undefined, therapist_id: 'dra' };
assert.ok(Object.keys(conUndefined).includes('id'),
  'una clave con undefined sigue apareciendo en Object.keys: por eso hay que omitirla');
assert.ok(!Object.keys(JSON.parse(JSON.stringify(conUndefined))).includes('id'),
  'y desaparece del cuerpo JSON: de ahi el desajuste entre columns y body');

console.log('insert-payload: sin claves undefined en los mappers');
