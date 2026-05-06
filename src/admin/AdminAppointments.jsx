import React, { useMemo, useState } from 'react';
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

export default function AdminAppointments({ bookings, setBookings, catalogs }) {
  const services = catalogs?.services || THERAPY_SERVICES;
  const therapists = catalogs?.therapists || THERAPISTS;
  const [filter, setFilter] = useState('upcoming');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = [...bookings];
    if (filter === 'upcoming') list = list.filter(b => b.status !== 'cancelled' && new Date(b.date + 'T' + b.time) >= new Date());
    else if (filter === 'past') list = list.filter(b => new Date(b.date + 'T' + b.time) < new Date());
    else if (filter === 'cancelled') list = list.filter(b => b.status === 'cancelled');

    if (search) list = list.filter(b => b.name.toLowerCase().includes(search.toLowerCase()) || b.email.toLowerCase().includes(search.toLowerCase()));
    return list.sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
  }, [bookings, filter, search]);

  const updateStatus = (id, status) => {
    setBookings(bookings.map(b => b.id === id ? { ...b, status } : b));
  };

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Citas</h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 24 }}>Gestiona reservaciones, confirma o reprograma</p>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { id: 'upcoming', label: 'Próximas' },
          { id: 'past', label: 'Pasadas' },
          { id: 'cancelled', label: 'Canceladas' },
          { id: 'all', label: 'Todas' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            background: filter === f.id ? C.sageDark : 'transparent',
            color: filter === f.id ? 'var(--admin-on-accent)' : 'var(--admin-muted)',
            border: '1px solid ' + (filter === f.id ? C.sageDark : 'var(--admin-border)'),
            padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
          }}>{f.label}</button>
        ))}
      </div>

      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o correo..." className="admin-input" style={{
        width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none'
      }} />

      {filtered.length === 0 ? (
        <div className="admin-card" style={{ borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <CalendarIcon size={32} color="var(--admin-subtle)" strokeWidth={1.5} style={{ margin: '0 auto 10px', display: 'block' }} />
          <p style={{ fontSize: 13, color: 'var(--admin-muted)', margin: 0 }}>No hay citas en esta vista</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filtered.map(b => {
            const s = services.find(sv => sv.id === b.serviceId);
            const t = therapists.find(th => th.id === b.therapistId);
            return (
              <div key={b.id} className="admin-card" style={{ borderRadius: 12, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ background: 'var(--admin-surface-soft)', padding: '10px 14px', borderRadius: 10, textAlign: 'center', minWidth: 56 }}>
                    <div className="font-display" style={{ fontSize: 18, color: 'var(--admin-text)', fontWeight: 600, lineHeight: 1 }}>{new Date(b.date).getDate()}</div>
                    <div style={{ fontSize: 9, color: 'var(--admin-accent-text)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>{new Date(b.date).toLocaleDateString('es-MX', { month: 'short' })}</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: 14, color: 'var(--admin-text)', fontWeight: 600 }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--admin-muted)', marginTop: 2 }}>{s?.name} · {t?.name || 'Sin asignar'}</div>
                    <div style={{ fontSize: 11, color: 'var(--admin-accent-text)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {b.time}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Phone size={10} /> {b.phone}</span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, padding: '3px 8px', borderRadius: 999, fontWeight: 700, letterSpacing: 0.5,
                    background: b.status === 'cancelled' ? C.rustAlpha30 : (b.status === 'completed' ? 'var(--admin-border)' : C.sageDark),
                    color: b.status === 'cancelled' ? C.rust : (b.status === 'completed' ? 'var(--admin-accent-text)' : 'var(--admin-on-accent)')
                  }}>{b.status.toUpperCase()}</span>
                  {b.status === 'confirmed' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => updateStatus(b.id, 'completed')} title="Marcar completada" style={{
                        background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)', color: 'var(--admin-accent-text)', padding: 6, borderRadius: 8, cursor: 'pointer'
                      }}>
                        <Check size={14} />
                      </button>
                      <button onClick={() => updateStatus(b.id, 'cancelled')} title="Cancelar" style={{
                        background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)', color: C.rust, padding: 6, borderRadius: 8, cursor: 'pointer'
                      }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
                {b.notes && (
                  <div style={{ marginTop: 10, padding: 10, background: 'var(--admin-surface-soft)', borderRadius: 8, fontSize: 11, color: 'var(--admin-row-text)', borderLeft: `2px solid ${C.caramel}` }}>
                    <strong style={{ color: 'var(--admin-text)' }}>Nota:</strong> {b.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ ADMIN ORDERS ============
