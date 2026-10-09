import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { beginRequest, endRequest, isAuthenticatedSupabaseRequest } from './requestActivity';
import { getActiveTenant } from './tenant';

const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabasePublishableKey);
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

const trackedFetch = async (input, init) => {
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
    return await fetch(input, withTenant);
  } finally {
    if (requestId) endRequest(requestId);
  }
};

export const supabase = hasSupabaseConfig
  ? createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: {
        fetch: trackedFetch,
      },
    })
  : null;

export const assertSupabaseConfigured = () => {
  if (!supabase) {
    throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en el entorno.');
  }
};
