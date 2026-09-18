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

// Y el reverso del mismo problema: un id generado en el CLIENTE para una
// columna uuid.
//
// Paso de verdad: el panel de contabilidad llamaba a uid() —7 caracteres
// base36— para expenses.id, que es uuid con default gen_random_uuid().
// Guardar un gasto reventaba con 'invalid input syntax for type uuid'.
//
// La solucion NO es mandar id: undefined (eso escribe NULL, ver arriba):
// es OMITIR la clave para que el DEFAULT de la base aplique.
const mappersUuid = [...src.matchAll(/const (map(?:Payment|Expense)ToDb)\s*=[\s\S]*?\n\};?/g)];
assert.ok(mappersUuid.length === 2, 'se esperaban los dos mappers de contabilidad');
for (const [bloque, nombre] of mappersUuid) {
  assert.ok(
    /\.\.\.\(item\.id \? \{ id: item\.id \} : \{\}\)/.test(bloque),
    `${nombre} debe OMITIR la clave id cuando no hay id, para que gen_random_uuid() aplique`,
  );
}

// Y nadie debe generar ids de cliente para esas tablas.
//
// Se quitan los comentarios de linea antes de buscar: el comentario que
// EXPLICA por que no se usa uid() contiene, literalmente, 'uid()'. Un
// guard que se dispara con su propia documentacion es ruido, y el ruido
// se acaba silenciando. Mismo tratamiento que en scripts/qa-check.mjs.
const sinComentarios = (source) => source
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

const panel = sinComentarios(readFileSync('src/admin/AdminAccounting.jsx', 'utf8'));
assert.ok(
  !/\buid\s*\(\)/.test(panel),
  'AdminAccounting no debe generar ids con uid(): las columnas son uuid y la base los pone.',
);

console.log('insert-payload: sin claves undefined, y los uuid los pone la base');
