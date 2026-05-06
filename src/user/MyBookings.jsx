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
import { dayLabel, fullDayLabel } from '../utils.jsx';

export default function MyBookings({ bookings, setBookings, setPage, showToast, catalogs }) {
  const services = catalogs?.services || THERAPY_SERVICES;
  const therapists = catalogs?.therapists || THERAPISTS;
  const upcoming = bookings.filter(b => b.status !== 'cancelled' && new Date(b.date + 'T' + b.time) >= new Date()).sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
  const past = bookings.filter(b => b.status === 'cancelled' || new Date(b.date + 'T' + b.time) < new Date()).sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));

  const cancelBooking = (id) => {
    setBookings(bookings.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
    showToast('Cita cancelada');
  };

  return (
    <div style={{ padding: '24px 20px 40px', maxWidth: 720, margin: '0 auto' }}>
      <h1 className="font-display" style={{ fontSize: 36, fontWeight: 500, color: C.brown, margin: '0 0 4px', letterSpacing: '-0.02em' }}>Mis citas</h1>
      <p style={{ fontSize: 14, color: C.brownMid, marginBottom: 24 }}>Gestiona tus reservas activas y revisa tu historial.</p>

      {bookings.length === 0 && (
        <div style={{ background: C.creamLight, border: `1px dashed ${C.sagePale}`, borderRadius: 18, padding: 40, textAlign: 'center' }}>
          <CalendarIcon size={36} color={C.brownLight} strokeWidth={1.5} style={{ margin: '0 auto 10px', display: 'block' }} />
          <p style={{ fontSize: 14, color: C.brownMid, marginBottom: 16 }}>Aún no tienes citas reservadas</p>
          <button onClick={() => setPage('book')} style={{ background: 'var(--bp-primary)', color: 'var(--bp-primary-contrast)', border: 'none', padding: '12px 24px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Reservar primera cita</button>
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, color: C.brownMid, fontWeight: 700, letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>Próximas ({upcoming.length})</h2>
          <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
            {upcoming.map(b => <BookingCard key={b.id} booking={b} onCancel={() => cancelBooking(b.id)} active services={services} therapists={therapists} />)}
          </div>
        </>
      )}

      {past.length > 0 && (
        <>
          <h2 style={{ fontSize: 14, color: C.brownMid, fontWeight: 700, letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>Historial</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {past.map(b => <BookingCard key={b.id} booking={b} active={false} services={services} therapists={therapists} />)}
          </div>
        </>
      )}
    </div>
  );
}

function BookingCard({ booking, onCancel, active, services = THERAPY_SERVICES, therapists = THERAPISTS }) {
  const service = services.find(s => s.id === booking.serviceId);
  const therapist = therapists.find(t => t.id === booking.therapistId);
  const isPast = new Date(booking.date + 'T' + booking.time) < new Date();

  return (
    <div style={{
      background: active ? C.creamLight : 'transparent',
      border: `1px solid ${active ? C.sagePale : C.sagePaleAlpha80}`,
      borderRadius: 16, padding: 18, opacity: !active ? 0.7 : 1
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div className="font-display" style={{ fontSize: 18, fontWeight: 600, color: C.brown, lineHeight: 1.2 }}>{service?.name}</div>
          <div style={{ fontSize: 12, color: C.brownMid, marginTop: 2 }}>con {therapist?.name || 'asignación automática'}</div>
        </div>
        <span style={{
          fontSize: 10, padding: '3px 10px', borderRadius: 999, fontWeight: 700,
          background: booking.status === 'cancelled' ? C.rustAlpha20 : (isPast ? C.sagePale : C.sageDark),
          color: booking.status === 'cancelled' ? C.rust : (isPast ? C.sageDeep : C.cream)
        }}>{booking.status === 'cancelled' ? 'CANCELADA' : (isPast ? 'COMPLETADA' : 'CONFIRMADA')}</span>
      </div>

      <div style={{ display: 'flex', gap: 14, fontSize: 13, color: C.brownMid, paddingTop: 10, borderTop: `1px solid ${C.sagePale}` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CalendarIcon size={13} /> {dayLabel(new Date(booking.date))}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> {booking.time}</span>
      </div>

      {active && onCancel && (
        <button onClick={onCancel} style={{
          marginTop: 12, background: 'transparent', color: C.rust, border: `1px solid ${C.rustAlpha40}`,
          padding: '8px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer'
        }}>Cancelar cita</button>
      )}
    </div>
  );
}

// ============ ADMIN APP ============
