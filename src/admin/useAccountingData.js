import { useCallback, useEffect, useState } from 'react';
import { loadAccounting, savePayment } from '../api/supabaseData';
import { canViewAccounting } from '../auth/permissions';

// Los cobros y los gastos, cargados UNA vez y compartidos.
//
// Tres pantallas los necesitan: citas y pedidos para saber cuanto falta
// por cobrar de cada fila, y el panel para sumarlos. Si cada una cargara
// lo suyo, registrar un cobro desde Citas dejaria el panel mostrando un
// "Cobrado" viejo sin decir que esta viejo — que es exactamente la clase
// de fallo silencioso que costo esta ronda de arreglos.
//
// Lo que se ve aqui NO es lo que decide el permiso: RLS ya filtra por rol
// (0027), asi que el admin de cafeteria recibe solo cobros de pedidos y el
// de consultorio solo de citas. Esto es una cache de pantalla, no una
// defensa.
export function useAccountingData(role) {
  const puede = canViewAccounting(role);
  const [datos, setDatos] = useState({ payments: [], expenses: [] });
  const [cargando, setCargando] = useState(puede);
  const [error, setError] = useState('');

  const recargar = useCallback(async () => {
    // Al barista y al doctor no se les pide: ninguna policy de 0027 los
    // incluye, asi que la consulta volveria vacia y solo seria ruido.
    if (!puede) { setCargando(false); return; }
    setCargando(true);
    try {
      setDatos(await loadAccounting());
      setError('');
    } catch (err) {
      // Se propaga a la pantalla. Un panel contable que falla en silencio
      // muestra ceros que parecen datos.
      setError(err?.message || 'No se pudo cargar la contabilidad.');
    } finally {
      setCargando(false);
    }
  }, [puede]);

  useEffect(() => { recargar(); }, [recargar]);

  // Registra el cobro y RECARGA antes de devolver: quien llama necesita
  // que el saldo ya este actualizado cuando el dialogo se cierre. Si el
  // insert lo rechaza una policy, el error sube y el dialogo lo muestra
  // en vez de cerrarse como si hubiera funcionado.
  const registrarCobro = useCallback(async (fila) => {
    const guardado = await savePayment(fila);
    await recargar();
    return guardado;
  }, [recargar]);

  return { datos, cargando, error, recargar, registrarCobro };
}
