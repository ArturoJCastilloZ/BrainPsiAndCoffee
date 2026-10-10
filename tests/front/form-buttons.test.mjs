// Un boton de guardar no se apaga por "faltan datos": se puede presionar y
// dice que falta junto al campo (Web Interface Guidelines: "submit stays
// enabled until request starts"). Apagado sin explicacion parecia un boton
// roto — asi le paso al dueño con "Guardar" en Servicios.
//
// Se permite apagar mientras TRABAJA (busy, loading, saving, ocupado,
// guardando) y la navegacion/paginacion. Lo que se busca es un disabled
// que dependa de una VALIDACION (canSave, canSubmit, isValid…).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const archivos = (dir) => readdirSync(dir).flatMap((n) => {
  const ruta = join(dir, n);
  return statSync(ruta).isDirectory() ? archivos(ruta) : ruta.endsWith('.jsx') ? [ruta] : [];
});

const VALIDACION = /disabled=\{[^}]*!(can[A-Z]\w*|isDraftValid|puedeAceptar|codigoValido|horaLibre|habilitado)\b/;
const culpables = archivos('src').flatMap((ruta) => readFileSync(ruta, 'utf8').split('\n')
  .map((linea, i) => ({ ruta, n: i + 1, linea }))
  .filter(({ linea }) => VALIDACION.test(linea)));

assert.deepEqual(culpables.map(({ ruta, n }) => `${ruta}:${n}`), [],
  'hay botones apagados por validacion: dejalos presionables y muestra que falta');
console.log('form-buttons: ningun boton se apaga por validacion sin explicar');
