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

const actionText = '#1E1B18';

export default function AdminOrders({ orders, setOrders, catalogs }) {
  const [filter, setFilter] = useState('active');
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
    else if (filter === 'completed') list = list.filter(o => o.status === 'delivered');
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={() => setCreating(!creating)} style={{
          background: C.caramel, color: actionText, border: 'none', borderRadius: 999,
          padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700
        }}>
          {creating ? <X size={14} /> : <Plus size={14} />} {creating ? 'Cancelar' : 'Nuevo pedido'}
        </button>
      </div>

      {creating && (
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
          { id: 'completed', label: 'Entregados' },
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
                      flex: 1, background: C.caramel, color: actionText, border: 'none', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
                    }}>Empezar</button>
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

// ============ ADMIN SERVICES ============
