import React, { useEffect, useMemo, useState } from 'react';
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
import { MENU } from '../data';
import { uid } from '../utils.jsx';
import { validateOrder } from '../validation';
import { canCreateOrders } from '../auth/permissions';

const actionText = '#1E1B18';

export default function AdminOrders({ orders, setOrders, catalogs, session }) {
  const [filter, setFilter] = useState('active');
  const canCreate = canCreateOrders(session?.user?.role);
  const menu = catalogs?.menu || MENU;
  const products = Object.entries(menu).flatMap(([category, section]) => (section.items || []).filter(item => item.active !== false).map(item => ({ ...item, category, categoryTitle: section.title })));
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [draft, setDraft] = useState({
    productId: products[0]?.id || '',
    qty: 1,
    customerName: '',
    customerPhone: '',
  });
  const canCreateOrder = Boolean(
    draft.productId &&
    Number(draft.qty || 0) > 0 &&
    Object.keys(validateOrder(draft)).length === 0
  );

  useEffect(() => {
    if (!draft.productId && products[0]?.id) {
      setDraft(current => ({ ...current, productId: products[0].id }));
    }
  }, [draft.productId, products]);

  const filtered = useMemo(() => {
    let list = [...orders];
    if (filter === 'active') list = list.filter(o => o.status !== 'delivered' && o.status !== 'cancelled');
    else if (filter === 'pending_appointment') list = list.filter(o => o.status === 'pending_appointment');
    else if (filter === 'ready') list = list.filter(o => o.status === 'ready');
    else if (filter === 'completed') list = list.filter(o => o.status === 'delivered');
    else if (filter === 'cancelled') list = list.filter(o => o.status === 'cancelled');
    return list.sort((a, b) => {
      const aTarget = a.targetReadyAt ? new Date(a.targetReadyAt).getTime() : null;
      const bTarget = b.targetReadyAt ? new Date(b.targetReadyAt).getTime() : null;
      if (a.status === 'pending_appointment' && b.status === 'pending_appointment' && aTarget && bTarget) return aTarget - bTarget;
      if (a.status === 'ready' && b.status !== 'ready') return -1;
      if (b.status === 'ready' && a.status !== 'ready') return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }, [orders, filter]);

  const updateOrderStatus = (id, status) => {
    setOrders(orders.map(o => o.id === id ? { ...o, status } : o));
  };

  const createOrder = () => {
    const nextErrors = validateOrder(draft);
    if (Object.keys(nextErrors).length) {
      setFormError(Object.values(nextErrors)[0]);
      return;
    }
    if (!canCreateOrder) return;
    const product = products.find(item => item.id === draft.productId);
    if (!product) return;
    const qty = Math.max(1, Number(draft.qty || 1));
    const total = product.price * qty;
    setOrders([{
      id: uid(),
      items: [{ ...product, qty, customizations: {} }],
      subtotal: total,
      comboSavings: 0,
      total,
      customerName: draft.customerName,
      customerPhone: draft.customerPhone,
      source: 'admin',
      targetReadyAt: '',
      operationalNotes: '',
      status: 'received',
      createdAt: new Date().toISOString(),
    }, ...orders]);
    setDraft({ ...draft, qty: 1, customerName: '', customerPhone: '' });
    setFormError('');
    setCreating(false);
  };

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Pedidos cafetería</h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 24 }}>Cola de pedidos en tiempo real</p>

      {canCreate && <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={() => setCreating(!creating)} style={{
          background: C.caramel, color: actionText, border: 'none', borderRadius: 999,
          padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700
        }}>
          {creating ? <X size={14} /> : <Plus size={14} />} {creating ? 'Cancelar' : 'Nuevo pedido'}
        </button>
      </div>}

      {canCreate && creating && (
        <div className="admin-card" style={{ borderRadius: 14, padding: 22, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(170px, 1fr))', gap: '18px 14px', alignItems: 'end' }}>
            <label style={{ ...fieldWrap, gridColumn: 'span 2' }}>
              <span style={fieldLabel}>PRODUCTO</span>
              <select value={draft.productId} onChange={e => { setFormError(''); setDraft({ ...draft, productId: e.target.value }); }} required className="admin-input" style={{ ...fieldInput, borderColor: !draft.productId ? C.rust : undefined }}>
                {products.map(product => <option key={product.id} value={product.id}>{product.categoryTitle} · {product.name} (${product.price})</option>)}
              </select>
              {!draft.productId && <span style={requiredHint}>Campo requerido</span>}
            </label>
            <AdminField label="Cantidad" value={draft.qty} onChange={qty => { setFormError(''); setDraft({ ...draft, qty }); }} type="number" required />
            <AdminField label="Cliente" value={draft.customerName} onChange={customerName => { setFormError(''); setDraft({ ...draft, customerName }); }} required />
            <AdminField label="Teléfono" value={draft.customerPhone} onChange={customerPhone => { setFormError(''); setDraft({ ...draft, customerPhone }); }} required />
          </div>
          {formError && (
            <div style={{ marginTop: 14, color: C.rust, background: C.rustAlpha20, border: `1px solid ${C.rustAlpha40}`, borderRadius: 10, padding: '10px 12px', fontSize: 12, fontWeight: 700 }}>
              {formError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={createOrder} disabled={!canCreateOrder} style={{
              background: C.caramel, color: actionText, border: 'none', borderRadius: 9,
              padding: '9px 14px', cursor: canCreateOrder ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              opacity: canCreateOrder ? 1 : 0.45
            }}>Guardar pedido</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { id: 'active', label: 'Activos' },
          { id: 'pending_appointment', label: 'Pendientes por cita' },
          { id: 'ready', label: 'Listos' },
          { id: 'completed', label: 'Entregados' },
          { id: 'cancelled', label: 'Cancelados' },
          { id: 'all', label: 'Todos' },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            background: filter === f.id ? C.caramel : 'transparent',
            color: filter === f.id ? actionText : 'var(--admin-muted)',
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
                  <div style={{ fontSize: 11, color: 'var(--admin-muted)', marginTop: 2 }}>{formatOrderTime(o.createdAt)} · {sourceLabel(o.source, o.linkedBookingId)}</div>
                </div>
                <StatusBadge status={o.status} />
              </div>

              <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
                {(o.customerName || o.customerPhone) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'var(--admin-row-text)' }}>
                    <span>{o.customerName || 'Cliente'}</span>
                    {o.customerPhone && <span style={{ color: 'var(--admin-muted)' }}>{o.customerPhone}</span>}
                  </div>
                )}
                {o.linkedBookingId && (
                  <div style={{ border: `1px solid ${C.caramel}`, background: C.caramelLightAlpha30, color: 'var(--admin-text)', borderRadius: 10, padding: '9px 10px', fontSize: 11, fontWeight: 700 }}>
                    Pedido ligado a cita · sin datos clínicos
                  </div>
                )}
                {o.targetReadyAt && (
                  <div style={{
                    border: `1px solid ${isLate(o) ? C.rust : 'var(--admin-border)'}`,
                    background: isLate(o) ? C.rustAlpha20 : 'var(--admin-surface-soft)',
                    color: isLate(o) ? C.rust : 'var(--admin-row-text)',
                    borderRadius: 10,
                    padding: '9px 10px',
                    fontSize: 11,
                    fontWeight: 700
                  }}>
                    Hora objetivo: {formatTargetTime(o.targetReadyAt)}{isLate(o) ? ' · retrasado' : ''}
                  </div>
                )}
                {o.operationalNotes && (
                  <div style={{ color: 'var(--admin-muted)', fontSize: 11, lineHeight: 1.45 }}>
                    {o.operationalNotes}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 6, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--admin-border)' }}>
                {o.items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--admin-row-text)' }}>
                    <span>{Number(item.qty || 1) > 1 ? `${item.qty}x ` : ''}{item.name}{item.customizations?.milk ? ` · ${item.customizations.milk}` : ''}{item.customizations?.flavor ? ` · ${item.customizations.flavor}` : ''}</span>
                    <span style={{ color: 'var(--admin-text)' }}>${(item.customizations?.totalPrice || item.price) * Number(item.qty || 1)}</span>
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
                      flex: 1, background: C.caramel, color: actionText, border: 'none', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Preparar</button>
                  )}
                  {o.status === 'pending_appointment' && (
                    <button onClick={() => updateOrderStatus(o.id, 'preparing')} style={{
                      flex: 1, background: C.caramel, color: actionText, border: 'none', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Preparar ahora</button>
                  )}
                  {o.status === 'preparing' && (
                    <button onClick={() => updateOrderStatus(o.id, 'ready')} style={{
                      flex: 1, background: C.sageLight, color: actionText, border: 'none', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Listo</button>
                  )}
                  {o.status === 'ready' && (
                    <button onClick={() => updateOrderStatus(o.id, 'delivered')} style={{
                      flex: 1, background: C.sageDark, color: 'var(--admin-on-accent)', border: 'none', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Entregar</button>
                  )}
                  {(o.status === 'received' || o.status === 'pending_appointment' || o.status === 'preparing') && (
                    <button onClick={() => updateOrderStatus(o.id, 'cancelled')} style={{
                      flex: 1, background: 'transparent', color: C.rust, border: `1px solid ${C.rustAlpha40}`, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Cancelar</button>
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

const fieldWrap = { display: 'grid', gap: 6 };
const fieldLabel = { color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 };
const fieldInput = { width: '100%', minHeight: 40, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit' };
const requiredHint = { color: C.rust, fontSize: 10, fontWeight: 800, letterSpacing: 0.4 };

function AdminField({ label, value, onChange, type = 'text', required = false }) {
  const missing = required && String(value || '').trim().length === 0;
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label.toUpperCase()}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} type={type} min={type === 'number' ? 1 : undefined} required={required} className="admin-input" style={{ ...fieldInput, borderColor: missing ? C.rust : undefined }} />
      {missing && <span style={requiredHint}>Campo requerido</span>}
    </label>
  );
}

function sourceLabel(source, linkedBookingId) {
  if (source === 'appointment' || linkedBookingId) return 'Cita';
  if (source === 'admin') return 'Admin';
  if (source === 'doctor_reception') return 'Recepción';
  return 'Menú público';
}

function formatOrderTime(value) {
  if (!value) return 'Sin hora';
  return new Date(value).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatTargetTime(value) {
  return new Date(value).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function isLate(order) {
  return Boolean(
    order.targetReadyAt &&
    !['ready', 'delivered', 'cancelled'].includes(order.status) &&
    new Date(order.targetReadyAt).getTime() < Date.now()
  );
}

function StatusBadge({ status }) {
  const config = {
    received: { label: 'NUEVO', background: C.rustAlpha30, color: C.rust },
    pending_appointment: { label: 'PENDIENTE POR CITA', background: C.caramelLightAlpha30, color: C.caramel },
    preparing: { label: 'PREPARANDO', background: C.caramelLightAlpha30, color: C.caramel },
    ready: { label: 'LISTO', background: C.sageDarkAlpha50, color: 'var(--admin-accent-text)' },
    delivered: { label: 'ENTREGADO', background: 'var(--admin-border)', color: 'var(--admin-muted)' },
    cancelled: { label: 'CANCELADO', background: C.rustAlpha20, color: C.rust },
  }[status] || { label: String(status || '').toUpperCase(), background: 'var(--admin-border)', color: 'var(--admin-muted)' };

  return (
    <span style={{
      fontSize: 10,
      padding: '3px 8px',
      borderRadius: 999,
      fontWeight: 700,
      background: config.background,
      color: config.color,
      whiteSpace: 'nowrap'
    }}>{config.label}</span>
  );
}

// ============ ADMIN SERVICES ============
