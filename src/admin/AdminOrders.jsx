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

export default function AdminOrders({ orders, setOrders }) {
  const [filter, setFilter] = useState('active');

  const filtered = useMemo(() => {
    let list = [...orders];
    if (filter === 'active') list = list.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    else if (filter === 'completed') list = list.filter(o => o.status === 'delivered');
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [orders, filter]);

  const updateOrderStatus = (id, status) => {
    setOrders(orders.map(o => o.id === id ? { ...o, status } : o));
  };

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Pedidos cafetería</h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 24 }}>Cola de pedidos en tiempo real</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'active', label: 'Activos' },
          { id: 'completed', label: 'Entregados' },
          { id: 'all', label: 'Todos' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            background: filter === f.id ? C.caramel : 'transparent',
            color: filter === f.id ? C.brown : 'var(--admin-muted)',
            border: '1px solid ' + (filter === f.id ? C.caramel : 'var(--admin-border)'),
            padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
          }}>{f.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="admin-card" style={{ borderRadius: 14, padding: 40, textAlign: 'center' }}>
          <Coffee size={32} color="var(--admin-subtle)" strokeWidth={1.5} style={{ margin: '0 auto 10px', display: 'block' }} />
          <p style={{ fontSize: 13, color: 'var(--admin-muted)', margin: 0 }}>No hay pedidos</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {filtered.map(o => (
            <div key={o.id} className="admin-card" style={{ borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div>
                  <div className="font-display" style={{ fontSize: 18, color: 'var(--admin-text)', fontWeight: 600 }}>#{o.id.slice(0,5).toUpperCase()}</div>
                  <div style={{ fontSize: 11, color: 'var(--admin-muted)', marginTop: 2 }}>{new Date(o.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · hoy</div>
                </div>
                <span style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 999, fontWeight: 700,
                  background: o.status === 'received' ? C.rustAlpha30 : (o.status === 'preparing' ? C.caramelLightAlpha30 : (o.status === 'ready' ? C.sageDarkAlpha50 : 'var(--admin-border)')),
                  color: o.status === 'received' ? C.rust : (o.status === 'preparing' ? C.caramel : (o.status === 'ready' ? 'var(--admin-accent-text)' : 'var(--admin-muted)'))
                }}>{
                  o.status === 'received' ? 'NUEVO' :
                  o.status === 'preparing' ? 'PREPARANDO' :
                  o.status === 'ready' ? 'LISTO' : 'ENTREGADO'
                }</span>
              </div>

              <div style={{ display: 'grid', gap: 6, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--admin-border)' }}>
                {o.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--admin-row-text)' }}>
                    <span>{item.name}{item.customizations?.milk ? ` · ${item.customizations.milk}` : ''}{item.customizations?.flavor ? ` · ${item.customizations.flavor}` : ''}</span>
                    <span style={{ color: 'var(--admin-text)' }}>${item.customizations?.totalPrice || item.price}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, fontSize: 13 }}>
                <span style={{ color: 'var(--admin-muted)' }}>Total</span>
                <span className="font-display" style={{ color: 'var(--admin-text)', fontWeight: 700, fontSize: 18 }}>${o.total}</span>
              </div>

              {o.status !== 'delivered' && o.status !== 'cancelled' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {o.status === 'received' && (
                    <button onClick={() => updateOrderStatus(o.id, 'preparing')} style={{
                      flex: 1, background: C.caramel, color: C.brown, border: 'none', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Empezar</button>
                  )}
                  {o.status === 'preparing' && (
                    <button onClick={() => updateOrderStatus(o.id, 'ready')} style={{
                      flex: 1, background: C.sageLight, color: C.brown, border: 'none', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Listo</button>
                  )}
                  {o.status === 'ready' && (
                    <button onClick={() => updateOrderStatus(o.id, 'delivered')} style={{
                      flex: 1, background: C.sageDark, color: 'var(--admin-on-accent)', border: 'none', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Entregar</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ ADMIN SERVICES ============
