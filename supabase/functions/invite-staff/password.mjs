// Generacion de la contraseña TEMPORAL del alta de personal.
//
// Vive aparte de index.ts y sin dependencias de Deno ni de Supabase por
// la misma razon que identity.mjs: es la pieza con consecuencia de
// seguridad de toda la funcion, y embebida entre llamadas de red no hay
// forma de ejercitarla.

// Sin caracteres ambiguos. Esta contraseña se dicta por telefono o se
// copia de una pantalla a un papel: 0/O y 1/l/I generan intentos
// fallidos que terminan en "no me funciona" y en que alguien la
// reemplace por algo mas corto.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export const LARGO_TEMPORAL = 14;
export const HORAS_VIGENCIA = 72;

// La genera el SISTEMA, no el dueño. Si la eligiera el dueño acabaria
// usando la misma para todo el personal, y esa es la que se filtra.
//
// Rechazo por muestreo y no 'byte % alfabeto': 256 no es multiplo de 57,
// asi que el modulo daria mas probabilidad a las primeras letras. No es
// teorico —reduce el espacio real de busqueda— y cuesta un bucle.
export const generarTemporal = (largo = LARGO_TEMPORAL, aleatorio = fuenteAleatoria) => {
  if (!Number.isInteger(largo) || largo < 12) {
    throw new Error('La contraseña temporal no puede tener menos de 12 caracteres.');
  }
  const limite = Math.floor(256 / ALFABETO.length) * ALFABETO.length;
  let salida = '';
  while (salida.length < largo) {
    const bytes = aleatorio(largo);
    for (const b of bytes) {
      if (b >= limite) continue;
      salida += ALFABETO[b % ALFABETO.length];
      if (salida.length === largo) break;
    }
  }
  return salida;
};

function fuenteAleatoria(n) {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

// Cuando deja de servir. Se guarda en app_metadata y la comprueba el
// trigger de 0033, que rechaza el cambio de contraseña si ya paso.
export const caducidadTemporal = (ahora = new Date(), horas = HORAS_VIGENCIA) =>
  new Date(ahora.getTime() + horas * 3600 * 1000).toISOString();

// El app_metadata con el que nace la cuenta.
//
// El flag es lo unico que la mantiene encerrada: mientras este,
// current_tenant_id() devuelve null y las 40 policies que dependen de el
// niegan todo. Ver 0033.
export const metadatosDeAlta = ({ tenantId, role, therapistId = null, caducidad }) => {
  const meta = {
    // De que clinica salio la cuenta. Es lo que permite, despues, volver a
    // generarle una temporal si la perdio antes de entrar: solo a quien la
    // creo, y solo mientras nadie haya usado la cuenta. Ver
    // puedeRegenerarTemporal.
    created_by_tenant: tenantId,
    memberships: { [tenantId]: role },
    must_change_password: true,
    temp_expires_at: caducidad,
  };
  if (therapistId) meta.therapist_ids = { [tenantId]: therapistId };
  return meta;
};

export const ROLES_VALIDOS = ['owner', 'admin_consultorio', 'admin_cafe', 'doctor', 'barista'];

export const validarAlta = ({ email, role, therapistId }) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? '').trim())) {
    return 'Correo invalido.';
  }
  if (!ROLES_VALIDOS.includes(role)) {
    return `Rol no valido: ${role}.`;
  }
  // Mismo criterio que set_tenant_member_role: un doctor sin ficha es un
  // rol inservible -current_therapist_id() queda vacio y las policies
  // clinicas lo rechazan todo- y el error que llega no apunta a la causa.
  if (role === 'doctor' && !String(therapistId ?? '').trim()) {
    return 'Un doctor necesita una ficha de terapeuta.';
  }
  return null;
};

// Cuando esta clinica puede (re)generarle una contraseña temporal a una
// cuenta que YA existe.
//
// Antes bastaba con una invitacion pendiente y que la persona no tuviera
// otra clinica ACTIVA. El dueño podia crear esa invitacion para cualquier
// correo registrado —incluido un especialista suyo al que acababa de
// revocar—, generarle la temporal, entrar con ella y quedar como esa
// persona: leer su expediente y firmar notas a su nombre (auditoria
// 2026-10-09, S1). En el SaaS, cualquier dueño podia hacerlo con cuentas
// de otras clinicas.
//
// Ahora la temporal es solo para lo que sirve de verdad: alguien a quien
// ESTA clinica le creo la cuenta y que perdio la temporal antes de entrar.
//
//   · la cuenta la creo esta clinica (created_by_tenant),
//   · nadie la ha usado nunca (sin last_sign_in_at): una vez que su
//     titular entro, la contraseña es suya,
//   · no tiene relacion con ninguna otra clinica, activa o no,
//   · y es miembro (activo o invitado) de esta.
//
// Una cuenta que ya existia —de otra clinica, o de antes de este cambio—
// NO entra: esa persona ya tiene su contraseña y acepta la invitacion al
// iniciar sesion. Falla cerrado ante cualquier dato que falte.
export const puedeRegenerarTemporal = ({ user, tenantId, otrasClinicas, esMiembroAqui }) => {
  if (!user || !tenantId) return false;
  if (user.app_metadata?.created_by_tenant !== tenantId) return false;
  if (user.last_sign_in_at) return false;
  if (!Array.isArray(otrasClinicas) || otrasClinicas.length > 0) return false;
  return esMiembroAqui === true;
};

// Una sola respuesta para todas las negativas. Distinguir "no tiene
// cuenta" de "no tiene invitacion" le decia a quien preguntara si un
// correo esta registrado (auditoria S10, el oraculo que 0031 habia
// cerrado en SQL).
export const MENSAJE_TEMPORAL_NEGADA =
  'No se puede generar una contraseña temporal para ese correo. Si la persona ya tiene cuenta, debe aceptar la invitacion al iniciar sesion con su propia contraseña.';

// Quien todavia debe cambiar su contraseña temporal no administra nada:
// la contraseña la conoce quien se la dio.
export const debeCambiarClave = (user) => user?.app_metadata?.must_change_password === true;

// ¿Puede el dueño de ESTA clinica reiniciarle a alguien la verificacion
// en dos pasos? Es para quien perdio o cambio de celular y ya no puede
// generar codigos.
//
// Quitar el segundo factor no da acceso (sigue haciendo falta la
// contraseña), pero debilita la cuenta. Por eso, igual que la temporal:
//   · solo a un miembro de esta clinica, y no a uno mismo (para eso esta
//     Mi cuenta → Seguridad),
//   · no a otro dueño,
//   · y no a quien tambien pertenece a otra clinica: su cuenta no es solo
//     de esta, y aqui no se puede decidir por las demas.
// Falla cerrado ante cualquier dato que falte.
export const puedeReiniciarMfa = ({ esMiembroAqui, rolAqui, esElMismo, otrasClinicas }) => {
  if (esMiembroAqui !== true || esElMismo !== false) return false;
  if (!rolAqui || rolAqui === 'owner') return false;
  return Array.isArray(otrasClinicas) && otrasClinicas.length === 0;
};

export const MENSAJE_MFA_NEGADO =
  'No se puede reiniciar la verificación en dos pasos de ese correo desde aquí. Solo se puede con personal de esta clínica que no sea dueño ni trabaje también en otra clínica.';
