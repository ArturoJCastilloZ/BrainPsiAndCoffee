// La contraseña temporal del alta de personal.
//
// El dueño la entrega en mano, asi que CONOCE la contraseña de esa
// persona hasta que la cambie. Lo que hace tolerable esa ventana esta en
// 0033 (la sesion no puede hacer nada hasta cambiarla); lo que se prueba
// aqui es que la contraseña en si no sea el eslabon debil.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  generarTemporal,
  caducidadTemporal,
  metadatosDeAlta,
  validarAlta,
  LARGO_TEMPORAL,
  HORAS_VIGENCIA,
} from '../../supabase/functions/invite-staff/password.mjs';

test('no trae caracteres que se confundan al dictarla', () => {
  // Se dicta por telefono o se copia a un papel. 0/O y 1/l/I producen
  // intentos fallidos, y de ahi a "mejor pon una mas corta" hay un paso.
  for (let i = 0; i < 200; i += 1) {
    const p = generarTemporal();
    assert.ok(!/[0O1lI]/.test(p), `salio un caracter ambiguo: ${p}`);
  }
});

test('tiene el largo pedido y no se admite una corta', () => {
  assert.equal(generarTemporal().length, LARGO_TEMPORAL);
  assert.throws(() => generarTemporal(8), /menos de 12/);
});

test('no repite', () => {
  const vistas = new Set();
  for (let i = 0; i < 500; i += 1) vistas.add(generarTemporal());
  assert.equal(vistas.size, 500, 'se repitio una contraseña temporal');
});

// El sesgo del modulo no es teorico: con 'byte % 57' los bytes 228..255
// vuelven a caer sobre las 28 primeras letras, asi que esas salen 5/256
// del tiempo y las otras 29 solo 4/256. Reduce el espacio real de
// busqueda de la contraseña.
//
// Se mide ESTADISTICAMENTE y con la fuente real. El primer intento de
// esta prueba usaba una fuente secuencial 0..255 y un largo de 228, y
// PASABA con el defecto inyectado: el bucle se detiene en el byte 227 y
// hasta ahi las dos versiones dan lo mismo — el sesgo vive justo en los
// bytes que nunca llegaba a consumir.
//
//   con rechazo:  28/57       = 0.491
//   sin rechazo:  140/256     = 0.547
//
// Con 57 000 caracteres el error tipico es ~0.002, asi que el umbral de
// 0.52 esta a unas 14 desviaciones de lo correcto: no hay parpadeo.
test('no favorece a las 28 primeras letras del alfabeto', () => {
  const PRIMERAS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcd'; // las 28 que se repetirian
  let primeras = 0;
  let total = 0;
  for (let i = 0; i < 1000; i += 1) {
    for (const c of generarTemporal(57)) {
      if (PRIMERAS.includes(c)) primeras += 1;
      total += 1;
    }
  }
  const proporcion = primeras / total;
  assert.ok(proporcion < 0.52,
    `las 28 primeras letras salen el ${(proporcion * 100).toFixed(1)}% del tiempo (esperado ~49.1%): hay sesgo de modulo`);
});

test('la caducidad son 72 horas', () => {
  const ahora = new Date('2026-03-01T12:00:00.000Z');
  assert.equal(caducidadTemporal(ahora), '2026-03-04T12:00:00.000Z');
  assert.equal(HORAS_VIGENCIA, 72);
});

test('la cuenta nace encerrada', () => {
  const meta = metadatosDeAlta({
    tenantId: 't1', role: 'admin_cafe', caducidad: '2026-03-04T12:00:00.000Z',
  });
  // Sin el flag, current_tenant_id() resuelve y las 40 policies que
  // dependen de el dejan entrar con la contraseña que el dueño conoce.
  assert.equal(meta.must_change_password, true);
  assert.equal(meta.memberships.t1, 'admin_cafe');
  assert.equal(meta.temp_expires_at, '2026-03-04T12:00:00.000Z');
  assert.ok(!('therapist_ids' in meta), 'un admin_cafe no lleva ficha de terapeuta');
});

test('un doctor nace con su ficha', () => {
  const meta = metadatosDeAlta({
    tenantId: 't1', role: 'doctor', therapistId: 'psq-1', caducidad: 'x',
  });
  assert.equal(meta.therapist_ids.t1, 'psq-1');
});

test('el alta rechaza lo que la base rechazaria despues', () => {
  assert.match(validarAlta({ email: 'no-es-correo', role: 'barista' }), /Correo invalido/);
  assert.match(validarAlta({ email: 'a@b.com', role: 'superusuario' }), /Rol no valido/);
  // Un doctor sin ficha es un rol inservible: current_therapist_id()
  // queda vacio y las policies clinicas lo rechazan todo, con un error
  // que no apunta a la causa.
  assert.match(validarAlta({ email: 'a@b.com', role: 'doctor' }), /necesita una ficha/);
  assert.equal(validarAlta({ email: 'a@b.com', role: 'doctor', therapistId: 'psq-1' }), null);
  assert.equal(validarAlta({ email: 'a@b.com', role: 'barista' }), null);
});

console.log('temp-password: la temporal no es el eslabon debil, y la cuenta nace encerrada');
