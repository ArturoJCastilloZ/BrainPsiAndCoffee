// Contabilidad: pagos y gastos.
import { conCliente } from './supabaseClient';
import { throwIfError, toNumber } from './shared';

const mapPaymentFromDb = (row) => ({
  id: row.id,
  appointmentId: row.appointment_id,
  orderId: row.order_id,
  amount: toNumber(row.amount),
  method: row.method,
  paidAt: row.paid_at,
  reference: row.reference || '',
  notes: row.notes || '',
});

// El id lo genera la BASE (gen_random_uuid), no el cliente: uid() produce
// 7 caracteres base36 y la columna es uuid — mandarlo reventaba con
// 'invalid input syntax for type uuid'.
//
// Y se OMITE la clave cuando no hay id, no se manda en undefined: una
// clave con undefined sigue apareciendo en Object.keys(), supabase-js la
// mete en ?columns=... y PostgREST escribe NULL en vez de aplicar el
// DEFAULT. Es la trampa que tests/front/insert-payload vigila.
const mapPaymentToDb = (item) => ({
  ...(item.id ? { id: item.id } : {}),
  appointment_id: item.appointmentId || null,
  order_id: item.orderId || null,
  amount: Number(item.amount || 0),
  method: item.method,
  paid_at: item.paidAt || new Date().toISOString(),
  reference: item.reference || null,
  notes: item.notes || null,
  updated_at: new Date().toISOString(),
});

const mapExpenseFromDb = (row) => ({
  id: row.id,
  area: row.area,
  category: row.category,
  description: row.description || '',
  amount: toNumber(row.amount),
  spentAt: row.spent_at,
  method: row.method || '',
  reference: row.reference || '',
});

const mapExpenseToDb = (item) => ({
  ...(item.id ? { id: item.id } : {}),
  area: item.area,
  category: item.category,
  description: item.description || null,
  amount: Number(item.amount || 0),
  spent_at: item.spentAt,
  method: item.method || null,
  reference: item.reference || null,
  updated_at: new Date().toISOString(),
});

export const loadAccounting = async () => {
  const supabase = await conCliente();
  const [pagos, gastos] = await Promise.all([
    supabase.from('payments').select('*').order('paid_at', { ascending: false }),
    supabase.from('expenses').select('*').order('spent_at', { ascending: false }),
  ]);
  throwIfError(pagos);
  throwIfError(gastos);
  return {
    payments: (pagos.data || []).map(mapPaymentFromDb),
    expenses: (gastos.data || []).map(mapExpenseFromDb),
  };
};

export const savePayment = async (payment) => {
  const supabase = await conCliente();
  const result = await supabase.from('payments').upsert(mapPaymentToDb(payment)).select().maybeSingle();
  throwIfError(result);
  return result.data ? mapPaymentFromDb(result.data) : null;
};

export const saveExpense = async (expense) => {
  const supabase = await conCliente();
  const result = await supabase.from('expenses').upsert(mapExpenseToDb(expense)).select().maybeSingle();
  throwIfError(result);
  return result.data ? mapExpenseFromDb(result.data) : null;
};

// Se borran de uno en uno y por id. NUNCA con deleteMissing: ese patron
// borra "todo lo que no este en la lista", y sobre un libro contable
// significaria que un catalogo a medio cargar arrasa el historial.
export const deletePayment = async (id) => {
  const supabase = await conCliente();
  throwIfError(await supabase.from('payments').delete().eq('id', id));
};

export const deleteExpense = async (id) => {
  const supabase = await conCliente();
  throwIfError(await supabase.from('expenses').delete().eq('id', id));
};
