// ============================================================================
// ESPECIMEN DE DESARROLLO — NO forma parte del producto.
//
// Vite construye unicamente index.html (no hay vite.config, asi que el input
// por defecto es ese), de modo que este archivo y specimen.html se sirven en
// `npm run dev` y NO entran en dist/. Verificado contra dist/ tras un build.
//
// Por que existe: las pantallas del admin solo se alcanzan con credenciales
// reales y tres roles distintos. Sin esto, "responsive arreglado" solo se
// podria AFIRMAR, no ver — y el handoff ya registra que varios bugs de esta
// linea los encontro el dev mirando la pantalla, no las pruebas.
//
// Honestidad sobre lo que prueba: el COMPONENTE es el real, sin mocks por
// dentro (AdminAppointments no hace una sola llamada de red; se alimenta
// entero por props). Lo que aqui se reproduce es su CONTENEDOR — el <main>
// de AdminApp con su padding de 24 — no el AdminApp completo. Sirve para
// medir el layout interno; no sustituye ver la app con sesion real.
// ============================================================================
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import GlobalStyle, { themeVars } from './GlobalStyle';
import AdminAppointments from './admin/AdminAppointments';
import AdminOrders from './admin/AdminOrders';
import AdminAccounting from './admin/AdminAccounting';
import AdminDashboard from './admin/AdminDashboard';
import AdminSchedules from './admin/AdminSchedules';
import AdminApp from './admin/AdminApp';
import { THERAPISTS, THERAPY_SERVICES } from './data';
import { todayISO, addDays } from './utils.jsx';

// addDays devuelve un Date, no una cadena ISO: las citas guardan 'YYYY-MM-DD'.
const dia = (n) => (n === 0 ? todayISO() : addDays(todayISO(), n).toISOString().split('T')[0]);

const hoy = todayISO();
// Citas con nombres y correos LARGOS a proposito: lo que desborda una fila no
// es el caso promedio, es el peor caso real.
// Los estados son SOLO los que el esquema admite:
// migrations -> check (status in ('confirmed','completed','cancelled')).
// Un mock con un estado inventado produce un falso hallazgo: 'pending'
// hizo creer por un momento que la etiqueta se mostraba sin traducir.
const CITAS = [
  { id: 'c1', serviceId: 'psi-adultos',   therapistId: 't1', date: dia(0),             time: '09:00', name: 'María Fernanda Villalobos Treviño', email: 'mariafernanda.villalobos@ejemplo.com.mx', phone: '8112345678', notes: '', wantsCoffee: true,  durationMinutes: 50, status: 'confirmed', price: 600, createdAt: hoy, reminderSent: false },
  { id: 'c2', serviceId: 'neuro-adultos', therapistId: 't2', date: dia(0),             time: '11:30', name: 'Juan Pablo Sáenz',                  email: 'jp.saenz@ejemplo.com',                   phone: '8187654321', notes: '', wantsCoffee: false, durationMinutes: 60, status: 'confirmed', price: 800, createdAt: hoy, reminderSent: false },
  { id: 'c3', serviceId: 'psi-infantil',  therapistId: 't3', date: dia(1), time: '10:00', name: 'Ana Sofía Cárdenas',               email: 'ana.cardenas@ejemplo.com',               phone: '8155512345', notes: '', wantsCoffee: false, durationMinutes: 45, status: 'completed',   price: 550, createdAt: hoy, reminderSent: false },
  { id: 'c4', serviceId: 'evaluacion',    therapistId: 't2', date: dia(2), time: '16:00', name: 'Roberto Gutiérrez Montemayor',     email: 'roberto.gutierrez@ejemplo.com',          phone: '8199988776', notes: '', wantsCoffee: true,  durationMinutes: 120, status: 'confirmed', price: 2500, createdAt: hoy, reminderSent: false },
  { id: 'c5', serviceId: 'pareja',        therapistId: 't4', date: dia(3), time: '18:00', name: 'Lucía y Andrés',                   email: 'lucia.andres@ejemplo.com',               phone: '8111223344', notes: '', wantsCoffee: false, durationMinutes: 75, status: 'cancelled', price: 900, createdAt: hoy, reminderSent: false },
];

const PANTALLAS = ['AdminApp', 'Citas', 'Pedidos', 'Contabilidad', 'Dashboard', 'Horarios'];
const SESION = { user: { role: 'owner', name: 'Espécimen' } };
// Se pasan los catalogos de demo explicitamente en vez de null: `catalogs?.x
// || FALLBACK` esta roto en ambos sentidos ([] || x === []), y un especimen
// que dependa de ese fallback estaria midiendo la rama equivocada.
const CATALOGOS = { services: THERAPY_SERVICES, therapists: THERAPISTS, schedules: [] };

// Un pedido, para que la tarjeta "Por producto" exista: el caso que el dev
// reporto tiene CUATRO tarjetas, y con tres el hueco no se reproduce.
const PEDIDOS = [
  { id: 'p1', status: 'delivered', createdAt: dia(0), total: 70,
    items: [{ id: 'apego', name: 'Apego seguro', price: 70, qty: 1 }] },
];

// ?limpio oculta los mandos del especimen: tapaban la barra inferior, que
// es justo lo que hay que medir. Un banco de pruebas que estorba a la
// medicion produce lecturas de su propio andamiaje.
const LIMPIO = new URLSearchParams(location.search).has('limpio');

function Especimen() {
  const [theme, setTheme] = useState('light');
  const [pantalla, setPantalla] = useState('AdminApp');
  const [pedidos, setPedidos] = useState(PEDIDOS);
  const [citas, setCitas] = useState(CITAS);
  const isDark = theme === 'dark';
  return (
    <div data-theme={theme} style={{ minHeight: '100vh', background: 'var(--admin-bg)', color: 'var(--admin-text)', fontFamily: "'Outfit', system-ui, sans-serif", ...themeVars(isDark) }}>
      <GlobalStyle />
      <div style={{ position: 'fixed', right: 8, bottom: 8, zIndex: 999, display: LIMPIO ? 'none' : 'block' }}>
        <button onClick={() => setTheme(isDark ? 'light' : 'dark')}
          style={{ fontFamily: 'inherit', fontSize: 11, padding: '6px 10px', borderRadius: 999, cursor: 'pointer',
                   background: 'var(--admin-surface)', color: 'var(--admin-text)', border: '1px solid var(--admin-border-interactive)' }}>
          {isDark ? 'Claro' : 'Oscuro'}
        </button>
      </div>
      {/* Reproduce el <main> de AdminApp.jsx: mismo padding, sin el
          minWidth:900 que M2 retiro. */}
      <div style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 999, display: LIMPIO ? 'none' : 'flex', gap: 4, flexWrap: 'wrap', maxWidth: '70vw' }}>
        {PANTALLAS.map(p => (
          <button key={p} onClick={() => setPantalla(p)}
            style={{ fontFamily: 'inherit', fontSize: 10, padding: '4px 8px', borderRadius: 999, cursor: 'pointer',
                     background: pantalla === p ? 'var(--admin-accent-text)' : 'var(--admin-surface)',
                     color: pantalla === p ? 'var(--admin-on-accent)' : 'var(--admin-text)',
                     border: '1px solid var(--admin-border-interactive)' }}>{p}</button>
        ))}
      </div>
      {pantalla === 'AdminApp' && (
        <AdminApp
          bookings={citas} setBookings={setCitas}
          orders={pedidos} setOrders={setPedidos}
          switchToUser={() => {}} logout={() => {}}
          session={SESION} theme={theme} toggleTheme={() => setTheme(isDark ? 'light' : 'dark')}
          catalogs={CATALOGOS} catalogActions={{ reload: () => {} }}
        />
      )}
      {/* Reproduce el <main> de AdminApp.jsx: mismo padding, sin el
          minWidth:900 que M2 retiro. AdminApp NO va aqui: trae su propio
          layout de 100vh y meterlo dentro seria medir un contenedor que en
          la app no existe. */}
      {pantalla !== 'AdminApp' && (
      <main id="especimen-main" style={{ padding: '24px', paddingBottom: 100, boxSizing: 'border-box' }}>
        <div>
          {pantalla === 'Citas'        && <AdminAppointments bookings={citas} setBookings={setCitas} catalogs={CATALOGOS} />}
          {pantalla === 'Pedidos'      && <AdminOrders orders={pedidos} setOrders={setPedidos} catalogs={CATALOGOS} session={SESION} />}
          {pantalla === 'Contabilidad' && <AdminAccounting bookings={citas} orders={pedidos} catalogs={CATALOGOS} session={SESION} />}
          {pantalla === 'Dashboard'    && <AdminDashboard bookings={citas} orders={pedidos} setPage={() => {}} catalogs={CATALOGOS} />}
          {pantalla === 'Horarios'     && <AdminSchedules catalogs={CATALOGOS} reload={() => {}} />}
        </div>
      </main>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Especimen />);
