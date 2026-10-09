// Utilidades comunes de la capa de datos.
import { conCliente } from './supabaseClient';
import { getSelectedTenant } from './tenant';
import { cambiosDeLista } from '../listDiff.mjs';

export const throwIfError = ({ error }) => {
  if (error) throw error;
};

export const toNumber = (value) => Number(value || 0);

// Todos los guardados de listas siguen la misma regla (ver listDiff.mjs):
// se escribe lo que cambio y se borra solo lo que el usuario quito. Nunca
// "todo lo que no este en la lista": esa lista es una foto de cuando se
// cargo la pantalla, y lo que llego despues se perdia.
export const guardarLista = async (table, items, previousItems, toDb, idDe) => {
  const supabase = await conCliente();
  const cambios = cambiosDeLista(items, previousItems, idDe);
  if (cambios.aPersistir.length) {
    throwIfError(await supabase.from(table).upsert(cambios.aPersistir.map(toDb)));
  }
  await deleteRemoved(table, cambios.eliminados);
  return cambios;
};

export const hasAuthSession = async () => {
  const supabase = await conCliente();
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
};

export const getAuthRole = async () => {
  const supabase = await conCliente();
  const { data } = await supabase.auth.getSession();
  // Solo app_metadata: user_metadata es escribible por el propio usuario.
  // El rol es por clinica, no global: se lee el de la activa.
  const memberships = data.session?.user?.app_metadata?.memberships || {};
  return memberships[getSelectedTenant()] || null;
};

// Borra por id EXPLICITO, los que el usuario quito. Sin ids no hay
// borrado: nunca un filtro que abarque filas que la pantalla no vio.
// in() recibe el arreglo y escapa los caracteres reservados por su cuenta.
export const deleteRemoved = async (table, ids) => {
  const supabase = await conCliente();
  if (!ids?.length) return;
  throwIfError(await supabase.from(table).delete().in('id', ids));
};
