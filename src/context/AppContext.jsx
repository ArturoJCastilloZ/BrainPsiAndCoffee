import React, { createContext, useContext } from 'react';

// Datos de la app y tema, publicados UNA vez (auditoria M4).
//
// App repetia la misma lista de 8 a 11 props en cada ruta —citas,
// pedidos, catalogos, sus setters, tema, sesion— y cada panel la volvia a
// pasar. Ahora App las publica aqui y UserApp, AdminApp y DoctorApp las
// leen con estos hooks.
//
// Las PANTALLAS hoja (AdminAppointments, AdminOrders, BookingFlow...)
// siguen recibiendo props A PROPOSITO: son componentes puros, el
// especimen de desarrollo y las pruebas las montan con datos de ejemplo
// sin levantar ningun proveedor.

const AppDataContext = createContext(null);
const ThemeContext = createContext({ theme: 'light', isDark: false, toggleTheme: () => {} });

export function AppProviders({ data, theme, children }) {
  return (
    <ThemeContext.Provider value={theme}>
      <AppDataContext.Provider value={data}>{children}</AppDataContext.Provider>
    </ThemeContext.Provider>
  );
}

// { session, bookings, setBookings, orders, setOrders, catalogs,
//   catalogActions, dataLoading, reload }
export const useAppData = () => {
  const valor = useContext(AppDataContext);
  if (!valor) throw new Error('useAppData necesita <AppProviders> arriba en el arbol.');
  return valor;
};

// { theme, isDark, toggleTheme }
export const useTheme = () => useContext(ThemeContext);
