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
import { MENU, THERAPY_SERVICES } from '../data';
import { formatMXN } from '../utils.jsx';
import { SectionTitle, ServiceCard } from '../components/Cards';
import { activeOffers } from '../offerUtils';

export default function UserHome({ setPage, bookings, catalogs, theme }) {
  const services = (catalogs?.services || THERAPY_SERVICES).filter(item => item.active !== false);
  const menu = catalogs?.menu || MENU;
  const offers = activeOffers(catalogs?.offers || []);
  const isDark = theme === 'dark';
  const onLightAccent = '#1E1B18';

  return (
    <div>
      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', padding: '60px 20px 80px' }}>
        <div style={{ position: 'absolute', inset: 0, background: isDark ? `linear-gradient(180deg, #2A2521 0%, #1E1B18 100%)` : `linear-gradient(180deg, ${C.creamLight} 0%, ${C.ivory} 100%)`, zIndex: 0 }} />
        <div className="grain" style={{ position: 'absolute', inset: 0, opacity: 0.06, zIndex: 0 }} />
        {/* Decorative elements */}
        <div style={{ position: 'absolute', top: 40, right: -40, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, ${C.sagePale}, transparent 70%)`, opacity: 0.5, zIndex: 0 }} />
        <div style={{ position: 'absolute', bottom: 20, left: -60, width: 240, height: 240, borderRadius: '50%', background: `radial-gradient(circle, ${C.caramelLight}, transparent 70%)`, opacity: 0.3, zIndex: 0 }} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div className="animate-fade-up" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bp-badge-bg)', padding: '6px 14px', borderRadius: 999, fontSize: 12, color: 'var(--bp-badge-text)', fontWeight: 500, marginBottom: 20 }}>
            <Sparkles size={12} /> Salud mental cotidiana, accesible y humana
          </div>
          <h1 className="font-display animate-fade-up" style={{ fontSize: 'clamp(40px, 9vw, 64px)', fontWeight: 400, color: C.brown, lineHeight: 1, margin: '0 0 20px', animationDelay: '0.05s', opacity: 0, animationFillMode: 'forwards' }}>
            Un cafecito<br />
            <span style={{ fontStyle: 'italic', fontWeight: 300 }}>y lo</span> <span style={{ color: C.sageDark, fontWeight: 600 }}>hablamos</span>
          </h1>
          <p className="animate-fade-up" style={{ fontSize: 16, color: C.brownMid, maxWidth: 460, margin: '0 auto 32px', lineHeight: 1.6, animationDelay: '0.1s', opacity: 0, animationFillMode: 'forwards' }}>
            Reserva tu sesión de psicología o neuropsicología, y acompáñala con un buen café. Aquí, cuidar de ti es cotidiano.
          </p>
          <div className="animate-fade-up" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', animationDelay: '0.15s', opacity: 0, animationFillMode: 'forwards' }}>
            <button onClick={() => setPage('book')} style={{
              background: 'var(--bp-primary)', color: 'var(--bp-primary-contrast)', border: 'none', padding: '14px 24px', borderRadius: 999,
              fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: `0 8px 24px ${C.brownAlpha30}`, transition: 'transform 0.2s'
            }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
              <CalendarIcon size={16} /> Reservar cita
            </button>
            <button onClick={() => setPage('menu')} style={{
              background: 'transparent', color: C.brown, border: `1.5px solid ${isDark ? '#CBBBAA' : C.brown}`, padding: '14px 24px', borderRadius: 999,
              fontSize: 15, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8
            }}>
              <Coffee size={16} /> Ver cafetería
            </button>
          </div>
        </div>
      </section>

      {/* Quick services */}
      <section style={{ padding: '24px 20px', maxWidth: 1100, margin: '0 auto' }}>
        <SectionTitle eyebrow="Servicios" title="¿Qué te traemos hoy?" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          {services.slice(0, 4).map((s, i) => (
            <ServiceCard key={s.id} service={s} onClick={() => setPage('book')} index={i} />
          ))}
        </div>
        <button onClick={() => setPage('book')} style={{
          marginTop: 16, background: 'transparent', border: `1px dashed ${C.brownLight}`,
          color: C.brownMid, padding: '12px 20px', borderRadius: 12, cursor: 'pointer',
          fontSize: 13, fontWeight: 500, width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
        }}>
          Ver todos los servicios <ArrowRight size={14} />
        </button>
      </section>

      {/* Menu preview */}
      <section style={{ padding: '24px 20px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <SectionTitle eyebrow="Cafetería" title="Bebidas con propósito" />
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 0 16px', marginLeft: -4 }} className="scrollbar-hide">
          {[...(menu.hot?.items || []), ...(menu.cold?.items || [])].filter(item => item.active !== false).slice(0, 8).map(item => (
            <div key={item.id} onClick={() => setPage('menu')} style={{
              minWidth: 200, background: 'var(--bp-surface)', borderRadius: 16, padding: 16, cursor: 'pointer',
              border: `1px solid ${isDark ? '#453A33' : C.caramelLightAlpha40}`, transition: 'all 0.2s'
            }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'} onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
              <Coffee size={20} color={C.caramel} strokeWidth={1.5} />
              <div className="font-display" style={{ fontSize: 17, fontWeight: 600, color: C.brown, margin: '8px 0 2px', lineHeight: 1.2 }}>
                {item.name}
              </div>
              <div style={{ fontSize: 11, color: C.brownLight, fontStyle: 'italic', marginBottom: 10 }}>{item.sub}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.sageDark }}>{formatMXN(item.price)}</div>
            </div>
          ))}
        </div>

        {/* Combo highlight */}
        {offers[0] && <div style={{
          marginTop: 24, padding: 24,
          background: isDark ? 'linear-gradient(135deg, #332C27, #5A3E2B)' : `linear-gradient(135deg, ${C.cream}, ${C.caramelLightAlpha40})`,
          border: `1px solid ${isDark ? '#8B5E3C' : C.caramelLight}`,
          borderRadius: 20,
          display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap'
        }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--bp-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Gift size={26} color="var(--bp-primary-contrast)" strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: isDark ? '#D9A96A' : C.rust, fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>COMBO ESPECIAL</div>
            <div className="font-display" style={{ fontSize: 22, fontWeight: 600, color: C.brown, lineHeight: 1.2 }}>{offers[0].name} por <span style={{ color: C.sageDark }}>{formatMXN(offers[0].price)}</span></div>
            <div style={{ fontSize: 13, color: C.brownMid, marginTop: 4 }}>{offers[0].desc}</div>
          </div>
        </div>}
      </section>

      {/* Identity ribbon */}
      <section style={{ background: isDark ? '#2A2521' : C.sage, color: C.cream, padding: '40px 20px', position: 'relative', overflow: 'hidden', borderTop: isDark ? '1px solid #453A33' : 'none', borderBottom: isDark ? '1px solid #453A33' : 'none' }}>
        <div className="grain" style={{ position: 'absolute', inset: 0, opacity: 0.1 }} />
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', position: 'relative' }}>
          <div className="font-script" style={{ fontSize: 28, color: isDark ? '#D9A96A' : C.creamLight, marginBottom: 8 }}>Nuestro propósito</div>
          <p className="font-display" style={{ fontSize: 24, fontWeight: 400, lineHeight: 1.4, fontStyle: 'italic' }}>
            "Romper el estigma de ir a terapia y transformar la forma en que las personas se relacionan con su salud mental, convirtiéndola en algo cotidiano, accesible y humano."
          </p>
          <button onClick={() => setPage('about')} style={{
            marginTop: 20, background: 'rgba(255,255,255,0.15)', backdropFilter: 'blur(10px)',
            border: `1px solid rgba(255,255,255,0.25)`, color: isDark ? C.cream : onLightAccent, padding: '10px 20px',
            borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 500
          }}>
            Conoce más sobre nosotros
          </button>
        </div>
      </section>
    </div>
  );
}
