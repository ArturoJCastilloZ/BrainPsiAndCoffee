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
import { THERAPY_SERVICES } from '../data';
import { formatMXN, fullDayLabel, uid } from '../utils.jsx';

export default function CartPage({ cart, setCart, orders, setOrders, setPage, linkedBookingId, setLinkedBookingId, bookings, showToast }) {
  const linkedBooking = bookings.find(b => b.id === linkedBookingId);
  const onLightAccent = '#1E1B18';

  // Calculate combo
  const hasCoffee = cart.some(i => i.id?.startsWith('h') || i.id?.startsWith('c'));
  const hasDessert = cart.some(i => i.id?.startsWith('p'));
  const comboApplied = hasCoffee && hasDessert;

  const subtotal = cart.reduce((sum, item) => sum + (item.customizations?.totalPrice || item.price) * item.qty, 0);

  // Find cheapest coffee + dessert for combo savings
  let comboSavings = 0;
  if (comboApplied) {
    const coffees = cart.filter(i => i.id?.startsWith('h') || i.id?.startsWith('c'));
    const desserts = cart.filter(i => i.id?.startsWith('p'));
    const minCoffee = Math.min(...coffees.map(c => c.customizations?.totalPrice || c.price));
    const minDessert = Math.min(...desserts.map(d => d.price));
    if (minCoffee + minDessert > 99) comboSavings = (minCoffee + minDessert) - 99;
  }
  const total = subtotal - comboSavings;

  const placeOrder = () => {
    const order = {
      id: uid(),
      items: cart,
      subtotal, comboSavings, total,
      linkedBookingId,
      status: 'received',
      createdAt: new Date().toISOString()
    };
    setOrders([...orders, order]);
    setCart([]);
    setLinkedBookingId(null);
    showToast('¡Pedido enviado! Estará listo pronto.');
    setPage('home');
  };

  if (cart.length === 0) {
    return (
      <div style={{ padding: '60px 20px', textAlign: 'center', maxWidth: 400, margin: '0 auto' }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: C.creamLight, margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ShoppingBag size={36} color={C.brownLight} strokeWidth={1.5} />
        </div>
        <h2 className="font-display" style={{ fontSize: 24, color: C.brown, margin: '0 0 8px' }}>Tu carrito está vacío</h2>
        <p style={{ fontSize: 14, color: C.brownMid, margin: '0 0 20px' }}>Explora nuestro menú lleno de bebidas con propósito.</p>
        <button onClick={() => setPage('menu')} style={{
          background: 'var(--bp-primary)', color: 'var(--bp-primary-contrast)', border: 'none', padding: '12px 24px', borderRadius: 999,
          fontSize: 14, fontWeight: 600, cursor: 'pointer'
        }}>Ver cafetería</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 20px 40px', maxWidth: 600, margin: '0 auto' }}>
      <button onClick={() => setPage('menu')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.brownMid, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={14} /> Volver al menú
      </button>

      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: C.brown, margin: '0 0 20px', letterSpacing: '-0.02em' }}>Tu pedido</h1>

      {linkedBooking && (
        <div style={{ background: C.sagePale, borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 12, color: C.sageDeep, display: 'flex', gap: 10 }}>
          <CalendarIcon size={16} style={{ flexShrink: 0 }} />
          <div>
            <strong>Vinculado a tu cita:</strong> {fullDayLabel(new Date(linkedBooking.date))} a las {linkedBooking.time}. Tendremos tu pedido listo.
          </div>
        </div>
      )}

      <div style={{ background: C.creamLight, border: `1px solid ${C.sagePale}`, borderRadius: 16, padding: 8, marginBottom: 16 }}>
        {cart.map((item, i) => (
          <div key={item.cartId} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: 14,
            borderBottom: i < cart.length - 1 ? `1px solid ${C.sagePale}` : 'none'
          }}>
            <div style={{ flex: 1 }}>
              <div className="font-display" style={{ fontSize: 16, fontWeight: 600, color: C.brown }}>{item.name}</div>
              <div style={{ fontSize: 11, color: C.brownLight, marginTop: 2 }}>
                {item.customizations?.milk && `${item.customizations.milk}`}
                {item.customizations?.flavor && ` · ${item.customizations.flavor}`}
                {item.customizations?.extraShot && ` · Shot extra`}
                {!item.customizations?.milk && item.sub}
              </div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.sageDark }}>{formatMXN(item.customizations?.totalPrice || item.price)}</div>
            <button onClick={() => setCart(cart.filter(c => c.cartId !== item.cartId))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.brownLight, padding: 4 }}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ background: C.creamLight, border: `1px solid ${C.sagePale}`, borderRadius: 16, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 14, color: C.brownMid }}>
          <span>Subtotal</span><span>{formatMXN(subtotal)}</span>
        </div>
        {comboApplied && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13, color: C.rust, fontWeight: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Gift size={13} /> Combo café + postre</span>
            <span>−{formatMXN(comboSavings)}</span>
          </div>
        )}
        <div style={{ borderTop: `1px solid ${C.sagePale}`, marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 14, color: C.brown, fontWeight: 600 }}>Total</span>
          <span className="font-display" style={{ fontSize: 28, fontWeight: 700, color: C.sageDark }}>{formatMXN(total)}</span>
        </div>
      </div>

      {!comboApplied && (hasCoffee || hasDessert) && (
        <div style={{ background: C.caramelLight, border: `1px dashed ${C.caramel}`, borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 12, color: onLightAccent, display: 'flex', gap: 10, alignItems: 'center' }}>
          <Sparkles size={16} color={onLightAccent} />
          <div>
            <strong>¡Estás cerca del combo $99!</strong> Agrega un {hasCoffee ? 'postre' : 'café'} y aprovecha la promoción.
          </div>
        </div>
      )}

      <button onClick={placeOrder} style={{
        width: '100%', background: 'var(--bp-primary)', color: 'var(--bp-primary-contrast)', border: 'none',
        padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
      }}>
        <Send size={18} /> Confirmar pedido
      </button>
    </div>
  );
}

// ============ MY BOOKINGS ============
