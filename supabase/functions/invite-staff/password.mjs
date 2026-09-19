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
