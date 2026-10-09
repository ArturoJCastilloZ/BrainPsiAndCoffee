// La capa de datos vivia en src/api/supabaseData.js; desde la Fase 5 son
// varios modulos y ese archivo solo re-exporta. Las pruebas que vigilan
// la FUENTE leen todos juntos, para que mover una funcion de modulo no
// las deje mirando un archivo vacio.
import { readFileSync } from 'node:fs';

export const MODULOS = ['shared', 'mappers', 'catalogs', 'appointments', 'orders', 'clinical', 'accounting', 'access', 'compliance', 'rest', 'supabaseClient'];

export const fuenteCapaDeDatos = () => MODULOS
  .map((m) => readFileSync(new URL(`../../src/api/${m}.js`, import.meta.url), 'utf8'))
  .join('\n');
