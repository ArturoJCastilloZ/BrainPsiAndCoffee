// "No hay pacientes" solo se dice cuando de verdad se sabe.
//
// El defecto: el bloque `if (!patients.length)` devolvia el estado vacio
// ANTES de que se pintara el banner de error, que vive mas abajo en el
// mismo componente y por lo tanto no se alcanzaba nunca. Si loadPatients
// fallaba, al doctor se le afirmaba que su lista esta vacia cuando lo que
// pasaba es que no se pudo consultar.
//
// En un panel clinico eso no es un detalle de UX: confundir "no se pudo
// leer" con "no existe" es la clase de error que lleva a decidir sobre un
// paciente creyendo que no hay expediente.
//
// Tres situaciones, tres mensajes: cargando, fallo, y vacio de verdad.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const codigo = readFileSync('src/doctor/DoctorApp.jsx', 'utf8');

const inicio = codigo.indexOf('if (!patients.length)');
assert.ok(inicio > -1, 'no se encontro el bloque que decide el estado vacio de pacientes');

const afirmacionVacio = codigo.indexOf('Aún no hay pacientes', inicio);
assert.ok(afirmacionVacio > -1, 'no se encontro el mensaje de "sin pacientes"');

const bloque = codigo.slice(inicio, afirmacionVacio);

assert.ok(/\bloading\b/.test(bloque),
  'el bloque de "sin pacientes" no consulta `loading` antes de afirmar que no hay pacientes: lo diria mientras la consulta sigue en vuelo');

assert.ok(/\berror\b/.test(bloque),
  'el bloque de "sin pacientes" no consulta `error` antes de afirmar que no hay pacientes: un fallo de carga se le presentaria al doctor como un hecho sobre su lista');

// El mensaje de fallo tiene que DESMENTIR explicitamente la lectura
// facil. "No se pudo cargar" a secas se sigue leyendo como "no hay".
assert.ok(/NO quiere decir que no tengas pacientes/.test(codigo),
  'el mensaje de error no aclara que no equivale a no tener pacientes');

// Y tiene que haber salida: un error sin reintento deja al doctor sin
// nada que hacer salvo recargar la pagina entera.
const bloqueCompleto = codigo.slice(inicio, codigo.indexOf('return (', afirmacionVacio));
assert.ok(/onClick=\{reload\}/.test(bloqueCompleto),
  'el estado de error no ofrece reintentar');

// El estado de carga arranca en true: al montar SIEMPRE se dispara una
// consulta, asi que con false hay un render que afirma "no hay pacientes"
// sin haber preguntado todavia.
assert.ok(/const \[notesLoading, setNotesLoading\] = useState\(true\)/.test(codigo),
  'notesLoading arranca en false: habria un render afirmando que no hay pacientes antes de consultar');

console.log('doctor-empty-vs-error: el panel distingue cargando, fallo y vacio, y ofrece reintentar');
