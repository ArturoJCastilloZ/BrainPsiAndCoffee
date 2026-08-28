// Tenant activo: que clinica esta usando el usuario en esta sesion.
//
// Viaja a Supabase en el header x-tenant-id, que PostgREST expone a
// Postgres dentro de request.headers. NO se puede mandar como parametro
// de sesion: PostgREST solo publica un conjunto cerrado de GUCs y no deja
// que un cliente defina otros.
//
// Que el cliente proponga el tenant no es un hueco. En la base, el tenant
// activo solo surte efecto si YA existe como llave dentro de las
// membresias del JWT, y esas solo las escribe service_role. Un usuario que
// mande un tenant ajeno no obtiene acceso: obtiene cero filas.

import { env } from '../config/env';

const STORAGE_KEY = 'bpc.active_tenant';

let activeTenant = null;
const listeners = new Set();

// El acceso a localStorage revienta en modo privado y con las cookies de
// terceros bloqueadas. Un fallo al leer la clinica preferida no debe
// tumbar la aplicacion: se sigue sin preferencia guardada.
const readStored = () => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
};

const writeStored = (tenantId) => {
  try {
    if (tenantId) window.localStorage.setItem(STORAGE_KEY, tenantId);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin persistencia la sesion sigue funcionando; solo no se recuerda.
  }
};

activeTenant = readStored();

// La clinica que el usuario eligio, sin sustituto. Es la que manda para
// decidir su ROL: caer al tenant del despliegue aqui le daria el rol de
// una clinica a la que quiza ni pertenece.
export const getSelectedTenant = () => activeTenant;

// La que se manda en el header. Sin eleccion se usa la del despliegue,
// que es lo que necesita el visitante publico para ver el catalogo y
// agendar. Para trafico autenticado da igual cual se mande: si no esta
// entre las membresias del JWT, la base la ignora y devuelve cero filas.
export const getActiveTenant = () => activeTenant || env.defaultTenantId || null;

export const setActiveTenant = (tenantId) => {
  const next = tenantId || null;
  if (next === activeTenant) return;
  activeTenant = next;
  writeStored(next);
  listeners.forEach((fn) => fn(next));
};

export const onTenantChange = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Membresias que trae el JWT: { tenant_id: rol }. Es la lista de clinicas
// entre las que el usuario puede elegir.
export const readMemberships = (session) =>
  session?.user?.app_metadata?.memberships || {};

export const readTenantRole = (session, tenantId) =>
  readMemberships(session)[tenantId || activeTenant] || null;

// Al iniciar sesion se elige la clinica activa. Si el usuario solo
// pertenece a una, no tiene nada que elegir y se entra directo; si la
// guardada ya no esta entre sus membresias (le revocaron el acceso), se
// descarta en vez de arrastrar una seleccion invalida.
export const resolveInitialTenant = (session) => {
  const memberships = readMemberships(session);
  const ids = Object.keys(memberships);
  if (!ids.length) return null;
  const stored = readStored();
  if (stored && memberships[stored]) return stored;
  return ids.length === 1 ? ids[0] : null;
};

// Solo se le pregunta a quien tiene de verdad algo que elegir.
export const needsTenantSelection = (session) =>
  Object.keys(readMemberships(session)).length > 1 && !getSelectedTenant();
