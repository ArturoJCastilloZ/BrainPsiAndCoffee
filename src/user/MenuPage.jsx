import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
import { FLAVORS, MENU, MILKS } from '../data';
import { formatMXN } from '../utils.jsx';
import { activeOffers } from '../offerUtils';

export default function MenuPage({ addToCart, catalogs, theme }) {
  const [activeTab, setActiveTab] = useState('hot');
  const [customizing, setCustomizing] = useState(null);
  const menu = catalogs?.menu || MENU;
  const offers = activeOffers(catalogs?.offers || []);
  const isDark = theme === 'dark';

  const tabs = [
    { id: 'hot', label: 'Calientes', icon: Coffee },
    { id: 'cold', label: 'Frías', icon: Coffee },
    { id: 'drinks', label: 'Bebidas', icon: null },
    { id: 'desserts', label: 'Postres', icon: Cake },
  ];

  const section = menu[activeTab] || MENU[activeTab];
  const isCoffee = activeTab === 'hot' || activeTab === 'cold';

  return (
    <div style={{ padding: '18px 16px 32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: C.sageDark, fontWeight: 700, letterSpacing: 2 }}>CAFETERÍA</span>
        <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: C.brown, margin: '2px 0 0', letterSpacing: '-0.02em' }}>El menú</h1>
        <p style={{ fontSize: 13, color: C.brownMid, margin: '2px 0 0', lineHeight: 1.35 }}>Cada bebida lleva el nombre de un estado mental. Elige el tuyo.</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', padding: '2px 0 4px', flexWrap: 'wrap' }} className="scrollbar-hide">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            background: activeTab === t.id ? 'var(--bp-primary)' : C.creamLight,
            color: activeTab === t.id ? 'var(--bp-primary-contrast)' : C.brown,
            border: `1px solid ${activeTab === t.id ? 'var(--bp-primary)' : C.sagePale}`,
            padding: '9px 15px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}>{t.label}</button>
        ))}
      </div>

      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <h2 className="font-display" style={{ fontSize: 21, fontWeight: 500, color: C.brown, margin: 0 }}>{section.title}</h2>
        {section.size && <span style={{ fontSize: 11, padding: '4px 10px', background: C.caramelLight, color: isDark ? '#1E1B18' : C.brown, borderRadius: 999, fontWeight: 600 }}>{section.size}</span>}
      </div>

      {/* Items */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 10 }}>
        {(section.items || []).filter(item => item.active !== false).map((item, i) => (
          <div key={item.id} className="animate-fade-up" style={{
            background: C.creamLight, border: `1px solid ${C.sagePale}`, borderRadius: 14, padding: 14,
            display: 'flex', alignItems: 'center', gap: 14,
            animationDelay: `${i * 0.04}s`, opacity: 0, animationFillMode: 'forwards'
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="font-display" style={{ fontSize: 17, fontWeight: 600, color: C.brown, lineHeight: 1.2 }}>{item.name}</div>
              <div style={{ fontSize: 12, color: C.brownLight, fontStyle: 'italic', marginTop: 2, lineHeight: 1.3 }}>{item.sub}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.sageDark, marginBottom: 6 }}>{formatMXN(item.price)}</div>
              <button onClick={() => isCoffee ? setCustomizing(item) : addToCart(item)} style={{
                background: 'var(--bp-primary)', color: 'var(--bp-primary-contrast)', border: 'none',
                padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4
              }}>
                <Plus size={12} /> {isCoffee ? 'Personalizar' : 'Agregar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Combo bar */}
      {offers[0] && <div style={{
        marginTop: 22, padding: 16,
        background: isDark ? 'linear-gradient(135deg, #332C27, #5A3E2B)' : `linear-gradient(135deg, #5A3E2B, #8B5E3C)`,
        color: C.cream, borderRadius: 14,
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap'
      }}>
        <Gift size={28} color={C.caramelLight} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="font-display" style={{ fontSize: 17, fontWeight: 600 }}>{offers[0].name}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{offers[0].desc}</div>
        </div>
      </div>}

      {/* Customize modal */}
      {customizing && <CustomizeModal item={customizing} theme={theme} onClose={() => setCustomizing(null)} onAdd={(item, custom) => { addToCart(item, custom); setCustomizing(null); }} />}
    </div>
  );
}

function CustomizeModal({ item, theme, onClose, onAdd }) {
  const [milk, setMilk] = useState(MILKS[0]);
  const [flavor, setFlavor] = useState(null);
  const [extraShot, setExtraShot] = useState(false);

  const total = item.price + (extraShot ? 10 : 0) + (flavor ? 5 : 0);
  const isDark = theme === 'dark';
  const modalColors = {
    overlay: isDark ? 'rgba(30, 27, 24, 0.76)' : 'rgba(58, 40, 24, 0.5)',
    surface: isDark ? '#332C27' : '#FFFFFF',
    surface2: isDark ? '#2A2521' : '#F5EFE6',
    border: isDark ? '#5A4B40' : '#E8D9C5',
    text: isDark ? '#F5EFE6' : '#2E2A27',
    muted: isDark ? '#CBBBAA' : '#6B5E55',
    selected: isDark ? '#C08A4D' : '#E8D9C5',
    selectedBorder: isDark ? '#D9A96A' : '#7A9E7E',
    selectedText: isDark ? '#1E1B18' : '#2E2A27',
    primary: isDark ? '#C08A4D' : '#5A3E2B',
    primaryText: isDark ? '#1E1B18' : '#FFFFFF',
    accent: isDark ? '#D9A96A' : '#7A9E7E'
  };

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: modalColors.overlay, backdropFilter: 'blur(8px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
      boxSizing: 'border-box'
    }}>
      <div onClick={e => e.stopPropagation()} className="animate-fade-up" style={{
        background: modalColors.surface, borderRadius: 22, width: '100%', maxWidth: 520,
        maxHeight: 'calc(100dvh - 32px)', overflow: 'hidden',
        boxShadow: '0 24px 70px rgba(0,0,0,0.28)',
        display: 'flex', flexDirection: 'column',
        border: `1px solid ${modalColors.border}`,
        color: modalColors.text
      }}>
        <div style={{ padding: '18px 20px 0', overflow: 'auto' }}>
          <div style={{ width: 36, height: 4, background: modalColors.border, borderRadius: 999, margin: '0 auto 16px' }} />

          <div className="font-display" style={{ fontSize: 24, fontWeight: 600, color: modalColors.text, marginBottom: 2, lineHeight: 1.1 }}>{item.name}</div>
          <div style={{ fontSize: 13, color: modalColors.muted, fontStyle: 'italic', marginBottom: 16 }}>{item.sub}</div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: modalColors.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 8, display: 'block' }}>TIPO DE LECHE</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {MILKS.map(m => (
                <button key={m} onClick={() => setMilk(m)} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 11, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: milk === m ? modalColors.selected : modalColors.surface2,
                  border: `1.5px solid ${milk === m ? modalColors.selectedBorder : modalColors.border}`,
                  color: milk === m ? modalColors.selectedText : modalColors.text
                }}>{m}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: modalColors.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 8, display: 'block' }}>SABORES (+$5)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              <button onClick={() => setFlavor(null)} style={{
                padding: '9px 10px', borderRadius: 11, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: flavor === null ? modalColors.selected : modalColors.surface2,
                border: `1.5px solid ${flavor === null ? modalColors.selectedBorder : modalColors.border}`,
                color: flavor === null ? modalColors.selectedText : modalColors.text
              }}>Sin sabor</button>
              {FLAVORS.map(f => (
                <button key={f} onClick={() => setFlavor(f)} style={{
                  padding: '9px 10px', borderRadius: 11, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: flavor === f ? modalColors.selected : modalColors.surface2,
                  border: `1.5px solid ${flavor === f ? modalColors.selectedBorder : modalColors.border}`,
                  color: flavor === f ? modalColors.selectedText : modalColors.text, textAlign: 'left', lineHeight: 1.3
                }}>{f}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, padding: 12, background: modalColors.surface2, borderRadius: 11, border: `1px solid ${modalColors.border}` }}>
            <input type="checkbox" id="extraShot" checked={extraShot} onChange={e => setExtraShot(e.target.checked)} style={{ accentColor: modalColors.primary, width: 16, height: 16 }} />
            <label htmlFor="extraShot" style={{ flex: 1, fontSize: 13, color: modalColors.text, fontWeight: 600, cursor: 'pointer' }}>
              Shot extra de espresso
            </label>
            <span style={{ fontSize: 13, fontWeight: 700, color: modalColors.accent }}>+$10</span>
          </div>
        </div>

        <div style={{
          padding: 20, paddingTop: 12, background: modalColors.surface,
          borderTop: `1px solid ${modalColors.border}`, boxShadow: '0 -8px 18px rgba(58,40,24,0.08)'
        }}>
          <button onClick={() => onAdd(item, { milk, flavor, extraShot, totalPrice: total })} style={{
            width: '100%', background: modalColors.primary, color: modalColors.primaryText, border: 'none',
            padding: '14px 16px', borderRadius: 13, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8
          }}>
            <span>Agregar al carrito</span>
            <span>{formatMXN(total)}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============ CART PAGE ============
