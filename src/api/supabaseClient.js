import { env } from '../config/env';
import { beginRequest, endRequest, isAuthenticatedSupabaseRequest } from './requestActivity';
import { getActiveTenant } from './tenant';

// supabase-js se carga BAJO DEMANDA (auditoria M1).
//
// Era un import estatico: unos 60 KB gz en el paquete inicial de TODA
// visita, aunque el visitante solo mirara precios. Ahora la portada lee el
// catalogo por REST plano (rest.js) y la libreria llega solo cuando hace
// falta de verdad: hay una sesion guardada, alguien entra al login, o se
// escribe algo (enviar una solicitud de cita, un pedido).

export const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabasePublishableKey);

// El tenant activo se inyecta aqui y no en global.headers porque
// global.headers se evalua una sola vez, al crear el cliente: si el
// usuario cambia de clinica a media sesion, seguiria mandando la
// anterior. Este hook corre en cada peticion y siempre manda la vigente.
//
// La capa "GUARDANDO" (GlobalLoader) se enciende solo con ESCRITURAS. Antes
// contaba toda peticion autenticada, lecturas incluidas, y como bloquea la
// pantalla, cada recarga del feed de pedidos le tapaba la barra al barista.
const ESCRITURAS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const esEscritura = (input, init) =>
  ESCRITURAS.has(String(init?.method || input?.method || 'GET').toUpperCase());

export const trackedFetch = async (input, init) => {
  const shouldTrack = isAuthenticatedSupabaseRequest(input, init) && esEscritura(input, init);
  const requestId = shouldTrack ? beginRequest() : null;
  const tenantId = getActiveTenant();

  // Se usa la API de Headers y no un spread del objeto.
  //
  // supabase-js manda a veces un Headers y no un objeto plano, y
  // { ...new Headers(...) } devuelve {}: sus entradas no son propiedades
  // enumerables. El spread se llevaba por delante apikey y Authorization,
  // y la peticion salia sin credenciales — 'No API key found in request'.
  // El constructor de Headers acepta las dos formas.
  let withTenant = init;
  if (tenantId) {
    const headers = new Headers(init?.headers || {});
    headers.set('x-tenant-id', tenantId);
    withTenant = { ...init, headers };
  }

  try {
    let respuesta = await fetch(input, withTenant);
    // "JWT issued at future": justo despues de entrar o de verificar el
    // codigo, Auth emite un token cuyo iat va unos segundos por delante del
    // reloj del servidor de datos, que lo rechaza (401) aunque sea valido.
    // Se reintenta tras una pausa corta. Es seguro tambien en escrituras:
    // el rechazo ocurre al validar el token, antes de tocar la base.
    for (const espera of ESPERAS_RELOJ) {
      if (!(await esTokenDelFuturo(respuesta))) break;
      await new Promise((listo) => setTimeout(listo, espera));
      respuesta = await fetch(input, withTenant);
    }
    return respuesta;
  } finally {
    if (requestId) endRequest(requestId);
  }
};

export const ESPERAS_RELOJ = [1000, 2000, 3000];

export const esTokenDelFuturo = async (respuesta) => {
  if (respuesta?.status !== 401) return false;
  try {
    return /issued at future/i.test(await respuesta.clone().text());
  } catch {
    return false;
  }
};

let cliente = null;
let cargando = null;

// El cliente, cargando la libreria la primera vez. null sin configuracion.
export const getSupabase = () => {
  if (!hasSupabaseConfig) return Promise.resolve(null);
  if (!cargando) {
    cargando = import('@supabase/supabase-js').then(({ createClient }) => {
      cliente = createClient(env.supabaseUrl, env.supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        global: {
          fetch: trackedFetch,
        },
      });
      return cliente;
    });
  }
  return cargando;
};

// El cliente SOLO si ya se cargo. Para quien quiere saber si hay sesion
// sin provocar la descarga: si la libreria no esta, no hay sesion.
export const peekSupabase = () => cliente;

export const assertSupabaseConfigured = () => {
  if (!hasSupabaseConfig) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en el entorno.');
  }
};

// Para la capa de datos: el cliente, o un error claro si no hay config.
export const conCliente = async () => {
  assertSupabaseConfigured();
  return getSupabase();
};

// ¿Hay algo que obligue a cargar la libreria al arrancar? Una sesion
// guardada (supabase-js la deja en localStorage como sb-<ref>-auth-token)
// o un enlace de correo que trae credenciales en la URL (invitacion,
// recuperacion de contraseña). Sin ninguna de las dos, el visitante es
// anonimo y no se descarga nada.
export const necesitaClienteAlArrancar = (location = window.location) => {
  const enUrl = /(access_token|refresh_token|error_description)=/.test(location.hash || '')
    || /[?&](code|token_hash)=/.test(location.search || '');
  if (enUrl) return true;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const llave = window.localStorage.key(i) || '';
      if (llave.startsWith('sb-') && llave.endsWith('-auth-token')) return true;
    }
  } catch {
    // Sin storage no puede haber sesion guardada.
  }
  return false;
};
