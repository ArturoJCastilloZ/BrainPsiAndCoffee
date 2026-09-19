import React from 'react';
import {
  Coffee, Calendar as CalendarIcon, Brain, Heart, Clock, User, Phone, Mail,
  ChevronRight, ChevronLeft, Plus, Minus, Check, X,
  ShoppingBag, Settings, BarChart3, Users, Sparkles,
  Bell, Trash2, ArrowRight, ArrowLeft,
  CheckCircle2, AlertCircle, MessageCircle, Cake,
  Home, Menu as MenuIcon, LogOut, TrendingUp, DollarSign,
  Zap, Gift, Send, RefreshCw, Filter
} from 'lucide-react';
import { C } from '../theme';
import { THERAPISTS, THERAPY_SERVICES } from '../data';
import { fullDayLabel, todayISO } from '../utils.jsx';
import {
  CAFETERIA, CONSULTORIO, collected, formatMoney,
  periodRange, previousRange, variation,
} from '../accounting.mjs';

const SIN_CONTABILIDAD = { datos: { payments: [], expenses: [] } };

export default function AdminDashboard({ bookings, orders, setPage, catalogs, contabilidad = SIN_CONTABILIDAD }) {
  const services = catalogs?.services || THERAPY_SERVICES;
  const therapists = catalogs?.therapists || THERAPISTS;
  const today = todayISO();
  const todayBookings = bookings.filter(b => b.date === today && b.status !== 'cancelled');
  const todayOrders = orders.filter(o => o.createdAt.startsWith(today));
  const pendingOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');

  // El dinero sale de accounting.mjs, el mismo motor probado que usa
  // Contabilidad. Antes se calculaba aqui a mano y estaba mal de tres
  // formas a la vez:
  //
  //   1. Sumaba los DOS negocios en un solo "Ingresos estimados". Cafeteria
  //      y consultorio son dominios separados en todo el producto —RLS los
  //      aisla por area en 0027— y el dueño necesita verlos aparte.
  //   2. Usaba el precio ACTUAL del catalogo por cada cita. La 0027 congela
  //      appointments.price al agendar justamente para que subir el catalogo
  //      no reescriba el historial; leer services[].price lo reescribia.
  //   3. Llamaba "ingresos" a lo FACTURADO. Facturado, cobrado y por cobrar
  //      son tres cifras distintas; el dashboard mostraba la primera con el
  //      nombre de la segunda.
  //
  // Lo que se muestra es lo COBRADO del mes, por area, que es flujo real.
  const pagos = contabilidad?.datos?.payments || [];
  const rangoMes = periodRange('mes');
  const rangoPrevio = previousRange(rangoMes);
  const cobradoDe = (area) => ({
    valor: collected(pagos, rangoMes, area),
    variacion: variation(collected(pagos, rangoMes, area), collected(pagos, rangoPrevio, area)),
  });
  const consultorio = cobradoDe(CONSULTORIO);
  const cafeteria = cobradoDe(CAFETERIA);

  // `cambio` solo lleva texto cuando ese texto es CIERTO. Antes decia '+12%'
  // y '+5', dos literales escritos a mano: los unicos numeros inventados que
  // tenia la app. Cuando no hay mes anterior con que comparar no se pinta
  // nada, en vez de rellenar el hueco con un adorno que se lee como dato.
  const stats = [
    { label: 'Citas hoy', value: todayBookings.length, icon: CalendarIcon, color: C.sage, page: 'clinic-appointments' },
    { label: 'Total citas activas', value: bookings.filter(b => b.status === 'confirmed').length, icon: Users, color: C.rust, page: 'clinic-appointments' },
    { label: 'Pedidos pendientes', value: pendingOrders.length, icon: Coffee, color: C.caramel, cambio: pendingOrders.length > 0 ? 'Atender' : 'Al día', page: 'cafe-orders' },
    { label: 'Cobrado · consultorio', value: formatMoney(consultorio.valor), icon: DollarSign, color: C.sageLight, variacion: consultorio.variacion, ayuda: rangoMes.label, page: 'general-accounting' },
    { label: 'Cobrado · cafetería', value: formatMoney(cafeteria.valor), icon: Coffee, color: C.caramel, variacion: cafeteria.variacion, ayuda: rangoMes.label, page: 'general-accounting' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: 0, letterSpacing: '-0.02em' }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginTop: 4 }}>Vista general de hoy · {fullDayLabel(new Date())}</p>
      </div>

      {/* Stats */}
      <div className="rejilla-tarjetas" style={{ '--rejilla-min': '180px', gap: 12, marginBottom: 28 }}>
        {stats.map(s => (
          <button key={s.label} onClick={() => setPage(s.page)} className="admin-card" style={{
            borderRadius: 14,
            padding: 18,
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            transition: 'transform 0.18s ease, border-color 0.18s ease'
          }} onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.borderColor = s.color;
          }} onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.borderColor = 'var(--admin-border)';
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={18} color={s.color} strokeWidth={1.6} />
              </div>
              <Cambio variacion={s.variacion} etiqueta={s.cambio} />
            </div>
            <div className="font-display" style={{ fontSize: 28, fontWeight: 600, color: 'var(--admin-text)', lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--admin-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{s.label}</div>
            {s.ayuda && (
              <div style={{ fontSize: 10.5, color: 'var(--admin-subtle)', marginTop: 4, textTransform: 'none', letterSpacing: 0 }}>{s.ayuda}</div>
            )}
          </button>
        ))}
      </div>

      {/* Two columns */}
      <div className="rejilla-tarjetas" style={{ '--rejilla-min': '320px', gap: 16 }}>
        {/* Today's appointments */}
        <div className="admin-card" style={{ borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, color: 'var(--admin-text)', margin: 0, fontWeight: 600, letterSpacing: 0.5 }}>CITAS DE HOY</h2>
            <button onClick={() => setPage('clinic-appointments')} style={{ background: 'none', border: 'none', color: 'var(--admin-accent-text)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              Ver todas <ArrowRight size={11} />
            </button>
          </div>
          {todayBookings.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--admin-subtle)', textAlign: 'center', padding: '20px 0' }}>Sin citas para hoy</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {todayBookings.slice(0, 4).map(b => {
                const s = services.find(sv => sv.id === b.serviceId);
                const t = therapists.find(th => th.id === b.therapistId);
                return (
                  <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--admin-surface-soft)', borderRadius: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 8, background: 'var(--admin-surface)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--admin-accent-text)' }}>{b.time.split(':')[0]}</span>
                      <span style={{ fontSize: 8, color: 'var(--admin-subtle)' }}>:{b.time.split(':')[1]}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--admin-text)', fontWeight: 500 }}>{b.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--admin-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s?.name} · {t?.name?.split(' ').slice(0,2).join(' ')}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pending orders */}
        <div className="admin-card" style={{ borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, color: 'var(--admin-text)', margin: 0, fontWeight: 600, letterSpacing: 0.5 }}>PEDIDOS PENDIENTES</h2>
            <button onClick={() => setPage('cafe-orders')} style={{ background: 'none', border: 'none', color: 'var(--admin-accent-text)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
              Ver todos <ArrowRight size={11} />
            </button>
          </div>
          {pendingOrders.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--admin-subtle)', textAlign: 'center', padding: '20px 0' }}>Sin pedidos pendientes</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {pendingOrders.slice(0, 4).map(o => (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, background: 'var(--admin-surface-soft)', borderRadius: 10 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: o.status === 'received' ? C.rust : C.caramel }} className="animate-pulse-slow" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--admin-text)', fontWeight: 500 }}>#{o.id.slice(0,5).toUpperCase()} · {o.items.length} items</div>
                    <div style={{ fontSize: 11, color: 'var(--admin-muted)' }}>{new Date(o.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · ${o.total}</div>
                  </div>
                  <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 999, background: 'var(--admin-surface)', color: 'var(--admin-accent-text)', fontWeight: 600 }}>{o.status.toUpperCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// El chip de la esquina de cada tarjeta. Tres estados, y ninguno inventa:
//   - variacion comparable -> el porcentaje REAL contra el mes anterior
//   - variacion sin base   -> se dice que no hay con que comparar
//   - etiqueta factual     -> texto que describe el estado ("Atender")
//   - nada                 -> no se pinta el chip
// El color no adorna: verde y rust solo cuando hay una direccion medida.
function Cambio({ variacion, etiqueta }) {
  if (variacion) {
    if (!variacion.comparable) {
      return (
        <span style={{ fontSize: 10, color: 'var(--admin-subtle)', fontWeight: 600, textAlign: 'right', maxWidth: 110 }}>
          Sin mes anterior con qué comparar
        </span>
      );
    }
    const sube = variacion.direction === 'up';
    const plano = variacion.direction === 'flat';
    return (
      <span style={{
        fontSize: 10, fontWeight: 700,
        color: plano ? 'var(--admin-muted)' : sube ? C.sageDark : C.rustText,
      }}>
        {sube ? '+' : ''}{variacion.pct}%
      </span>
    );
  }
  if (etiqueta) {
    return <span style={{ fontSize: 10, color: 'var(--admin-muted)', fontWeight: 600 }}>{etiqueta}</span>;
  }
  return null;
}

// ============ ADMIN APPOINTMENTS ============
