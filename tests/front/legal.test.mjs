// Cumplimiento (0039): el aviso de privacidad es evidencia, y los plazos
// ARCO se cuentan igual en la pantalla que en la base.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AVISO_PRIVACIDAD, PRIVACY_NOTICE_VERSION, completar, hashAviso } from '../../src/legal/avisoPrivacidad.mjs';
import { diasHabilesRestantes, sumarDiasHabiles, TIPOS_ARCO } from '../../src/arcoPlazos.mjs';

// 1 · El texto del aviso no cambia sin cambiar la VERSION.
//
// Cada consentimiento guarda version y hash del texto aceptado. Si alguien
// edita el aviso y deja la version, los consentimientos nuevos dirian
// haber aceptado "2026-10-borrador-1" con un texto distinto al de los
// anteriores, y la evidencia ya no prueba nada.
//
// Al cambiar el texto: sube la version en avisoPrivacidad.mjs y agrega
// aqui su hash. Las versiones viejas se quedan: son las que firmaron.
const HASHES = {
  '2026-10-borrador-1': '5a8c8ed7cbad61935a2030515d6b50578ade631bf0ca48c5003c20865a045613',
  // + parrafo de estadisticas de uso (monitoring.js las manda si hay endpoint).
  '2026-10-borrador-2': '3155809b7aad33768453492a4c047fc670a82d4fa8e6cfcbf7d4fe8b16341188',
};
const hash = await hashAviso();
assert.ok(HASHES[AVISO_PRIVACIDAD.version],
  `La version ${AVISO_PRIVACIDAD.version} no esta registrada. Agrega su hash: ${hash}`);
assert.equal(hash, HASHES[AVISO_PRIVACIDAD.version],
  `El texto del aviso cambio sin cambiar la version ${AVISO_PRIVACIDAD.version}. Sube la version y registra el hash ${hash}.`);

// 2 · El consentimiento de la reserva usa ESTA version y manda el hash.
{
  const citas = readFileSync(new URL('../../src/api/appointments.js', import.meta.url), 'utf8');
  assert.ok(!/PRIVACY_NOTICE_VERSION\s*=\s*'/.test(citas), 'la version del aviso volvio a escribirse a mano en appointments.js');
  assert.match(citas, /document_hash:\s*documentHash/);
  assert.equal(PRIVACY_NOTICE_VERSION, AVISO_PRIVACIDAD.version);
}

// 3 · Las secciones que un aviso integral no puede omitir.
{
  const titulos = AVISO_PRIVACIDAD.secciones.map((s) => s.titulo.toLowerCase()).join(' | ');
  for (const tema of ['responsable', 'datos', 'para qué', 'compartimos', 'arco', 'conservamos', 'cambios']) {
    assert.ok(titulos.includes(tema), `al aviso le falta la seccion sobre "${tema}"`);
  }
  const texto = completar('{responsable} · {domicilio} · {correo}', { legalName: 'Clínica X', address: 'Calle 1', email: 'a@b.mx' });
  assert.equal(texto, 'Clínica X · Calle 1 · a@b.mx');
}

// 4 · Dias habiles: la misma cuenta que add_business_days de 0039
//     (tests/tenancy/0029 prueba los mismos dos casos en SQL).
{
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  assert.equal(iso(sumarDiasHabiles(new Date(2026, 9, 9), 1)), '2026-10-12', 'viernes + 1 habil = lunes');
  assert.equal(iso(sumarDiasHabiles(new Date(2026, 9, 9), 20)), '2026-11-06');
  assert.equal(diasHabilesRestantes('2026-10-12', new Date(2026, 9, 9)), 1);
  assert.equal(diasHabilesRestantes('2026-10-09', new Date(2026, 9, 9)), 0);
  assert.equal(diasHabilesRestantes('2026-10-08', new Date(2026, 9, 12)), -2, 'vencida: jueves 8 visto el lunes 12');
  assert.deepEqual(TIPOS_ARCO.map((t) => t.id), ['acceso', 'rectificacion', 'cancelacion', 'oposicion', 'revocacion'],
    'los tipos deben coincidir con el check de arco_requests.request_type');
}

console.log('legal: ok');
