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

export default function AdminDashboard({ bookings, orders, setPage, catalogs }) {
  const services = catalogs?.services || THERAPY_SERVICES;
  const therapists = catalogs?.therapists || THERAPISTS;
  const today = todayISO();
  const todayBookings = bookings.filter(b => b.date === today && b.status !== 'cancelled');
  const todayOrders = orders.filter(o => o.createdAt.startsWith(today));
  const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0) +
    bookings.filter(b => b.status === 'confirmed').reduce((sum, b) => {
      const s = services.find(s => s.id === b.serviceId);
      return sum + (s?.price || 0);
    }, 0);
  const pendingOrders = orders.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');

  const stats = [
    { label: 'Citas hoy', value: todayBookings.length, icon: CalendarIcon, color: C.sage, change: '+12%' },
    { label: 'Pedidos pendientes', value: pendingOrders.length, icon: Coffee, color: C.caramel, change: pendingOrders.length > 0 ? 'Atender' : 'Al día' },
    { label: 'Total citas activas', value: bookings.filter(b => b.status === 'confirmed').length, icon: Users, color: C.rust, change: '+5' },
    { label: 'Ingresos estimados', value: `$${totalRevenue.toLocaleString('es-MX')}`, icon: DollarSign, color: C.sageLight, change: 'MXN' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: 0, letterSpacing: '-0.02em' }}>Dashboard</h1>
        <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginTop: 4 }}>Vista general de hoy · {fullDayLabel(new Date())}</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 28 }}>
        {stats.map(s => (
          <div key={s.label} className="admin-card" style={{ borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon size={18} color={s.color} strokeWidth={1.6} />
              </div>
              <span style={{ fontSize: 10, color: 'var(--admin-muted)', fontWeight: 600 }}>{s.change}</span>
            </div>
            <div className="font-display" style={{ fontSize: 28, fontWeight: 600, color: 'var(--admin-text)', lineHeight: 1, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--admin-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Today's appointments */}
        <div className="admin-card" style={{ borderRadius: 16, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 14, color: 'var(--admin-text)', margin: 0, fontWeight: 600, letterSpacing: 0.5 }}>CITAS DE HOY</h2>
            <button onClick={() => setPage('appointments')} style={{ background: 'none', border: 'none', color: 'var(--admin-accent-text)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
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
            <button onClick={() => setPage('orders')} style={{ background: 'none', border: 'none', color: 'var(--admin-accent-text)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
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

      {/* Automation panel */}
      <div className="admin-card" style={{ borderRadius: 16, padding: 22, marginTop: 16 }}>
        <h2 style={{ fontSize: 14, color: 'var(--admin-text)', margin: '0 0 14px', fontWeight: 600, letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={14} color={C.caramel} /> AUTOMATIZACIONES ACTIVAS
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {[
            { label: 'Recordatorio 24h antes', desc: 'WhatsApp + correo', on: true },
            { label: 'Recordatorio 1h antes', desc: 'WhatsApp', on: true },
            { label: 'Confirmación al reservar', desc: 'Correo con calendario', on: true },
            { label: 'Sugerencia de café post-sesión', desc: 'Notificación in-app', on: true },
            { label: 'Encuesta post-sesión', desc: 'Enviada automáticamente', on: true },
            { label: 'Combo café+postre auto', desc: 'Detecta y aplica $99', on: true },
          ].map((a, i) => (
            <div key={i} style={{ background: 'var(--admin-surface-soft)', padding: 12, borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--admin-text)', fontWeight: 500, marginBottom: 2 }}>{a.label}</div>
                <div style={{ fontSize: 10, color: 'var(--admin-muted)' }}>{a.desc}</div>
              </div>
              <div style={{ width: 32, height: 18, background: a.on ? C.sageDark : 'var(--admin-border)', borderRadius: 999, position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: a.on ? 16 : 2, width: 14, height: 14, borderRadius: '50%', background: 'var(--admin-on-accent)', transition: 'left 0.2s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ ADMIN APPOINTMENTS ============
