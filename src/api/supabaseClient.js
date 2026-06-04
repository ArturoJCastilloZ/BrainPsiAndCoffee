import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { beginRequest, endRequest, isAuthenticatedSupabaseRequest } from './requestActivity';

const hasSupabaseConfig = Boolean(env.supabaseUrl && env.supabasePublishableKey);
const trackedFetch = async (input, init) => {
  const shouldTrack = isAuthenticatedSupabaseRequest(input, init);
  const requestId = shouldTrack ? beginRequest() : null;

  try {
    return await fetch(input, init);
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
