// Lecturas por REST plano (PostgREST), sin supabase-js.
//
// Es lo que permite que la portada no descargue la libreria (M1): el
// catalogo publico son unos GET y un RPC de lectura. Con sesion, la misma
// peticion viaja con el token del usuario y RLS decide igual que antes.
//
// Devuelve { data, error } con la forma de supabase-js — error trae code
// y message de PostgREST — para que quien lo usa trate los errores igual.

import { env } from '../config/env';
import { getActiveTenant } from './tenant';
import { peekSupabase } from './supabaseClient';

// El token SOLO si supabase-js ya esta cargado: si no lo esta, no hay
// sesion (ver necesitaClienteAlArrancar), y pedirlo obligaria a cargarlo.
const tokenDeSesion = async () => {
  const cliente = peekSupabase();
  if (!cliente) return null;
  const { data } = await cliente.auth.getSession();
  return data?.session?.access_token || null;
};

const peticion = async (ruta, init = {}) => {
  const headers = new Headers(init.headers || {});
  headers.set('apikey', env.supabasePublishableKey);
  headers.set('Accept', 'application/json');
  const tenant = getActiveTenant();
  if (tenant) headers.set('x-tenant-id', tenant);
  const token = await tokenDeSesion();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let respuesta;
  try {
    respuesta = await fetch(`${env.supabaseUrl}/rest/v1/${ruta}`, { ...init, headers });
  } catch (err) {
    return { data: null, error: { code: 'NETWORK', message: err?.message || 'Sin conexión' } };
  }
  const texto = await respuesta.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = texto; }
  if (!respuesta.ok) {
    return {
      data: null,
      error: {
        code: cuerpo?.code || String(respuesta.status),
        message: cuerpo?.message || `HTTP ${respuesta.status}`,
        details: cuerpo?.details ?? null,
        hint: cuerpo?.hint ?? null,
        status: respuesta.status,
      },
    };
  }
  return { data: cuerpo, error: null };
};

// restSelect('therapy_services', { order: ['created_at'] })
export const restSelect = (tabla, { order = [] } = {}) => {
  const q = new URLSearchParams({ select: '*' });
  if (order.length) q.set('order', order.join(','));
  return peticion(`${encodeURIComponent(tabla)}?${q}`);
};

// Una sola fila o null, como maybeSingle().
export const restMaybeSingle = async (tabla) => {
  const r = await restSelect(tabla);
  if (r.error) return r;
  return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: null };
};

export const restRpc = (funcion, args = {}) => peticion(`rpc/${encodeURIComponent(funcion)}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(args),
});

export const haySesion = async () => Boolean(await tokenDeSesion());
