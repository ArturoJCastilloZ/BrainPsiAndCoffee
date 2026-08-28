import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { beginRequest, endRequest, isAuthenticatedSupabaseRequest } from './requestActivity';
import { getActiveTenant } from './tenant';

const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabasePublishableKey);
// El tenant activo se inyecta aqui y no en global.headers porque
// global.headers se evalua una sola vez, al crear el cliente: si el
// usuario cambia de clinica a media sesion, seguiria mandando la
// anterior. Este hook corre en cada peticion y siempre manda la vigente.
const trackedFetch = async (input, init) => {
  const shouldTrack = isAuthenticatedSupabaseRequest(input, init);
  const requestId = shouldTrack ? beginRequest() : null;
  const tenantId = getActiveTenant();

  const withTenant = tenantId
    ? { ...init, headers: { ...(init?.headers || {}), 'x-tenant-id': tenantId } }
    : init;

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
