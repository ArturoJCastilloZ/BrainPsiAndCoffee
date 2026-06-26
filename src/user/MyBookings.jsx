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
import { addDays, dayLabel } from '../utils.jsx';

export default function MyBookings({ bookings, setBookings, setPage, showToast, catalogs }) {
  const services = catalogs?.services || THERAPY_SERVICES;
  const therapists = catalogs?.therapists || THERAPISTS;
  const [reschedulingId, setReschedulingId] = useState(null);
  const [rescheduleDraft, setRescheduleDraft] = useState({ date: '', time: '' });
  const upcoming = bookings.filter(b => b.status !== 'cancelled' && new Date(b.date + 'T' + b.time) >= new Date()).sort((a, b) => new Date(a.date + 'T' + a.time) - new Date(b.date + 'T' + b.time));
  const past = bookings.filter(b => b.status === 'cancelled' || new Date(b.date + 'T' + b.time) < new Date()).sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time));

  const cancelBooking = (id) => {
    setBookings(bookings.map(b => b.id === id ? { ...b, status: 'cancelled' } : b));
    showToast('Cita cancelada');
  };
  const startReschedule = (booking) => {
    setReschedulingId(booking.id);
    setRescheduleDraft({ date: booking.date, time: booking.time });
  };
  const saveReschedule = (booking) => {
    if (!rescheduleDraft.date || !rescheduleDraft.time) return;
    setBookings(bookings.map(b => b.id === booking.id ? { ...b, date: rescheduleDraft.date, time: rescheduleDraft.time } : b));
    setReschedulingId(null);
    showToast('Cita reagendada');
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
            {upcoming.map(b => (
              <BookingCard
                key={b.id}
                booking={b}
                onCancel={() => cancelBooking(b.id)}
                onStartReschedule={() => startReschedule(b)}
                onSaveReschedule={() => saveReschedule(b)}
                onCancelReschedule={() => setReschedulingId(null)}
                rescheduling={reschedulingId === b.id}
                rescheduleDraft={rescheduleDraft}
                setRescheduleDraft={setRescheduleDraft}
                bookings={bookings}
                active
                services={services}
                therapists={therapists}
              />
            ))}
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

function BookingCard({ booking, onCancel, onStartReschedule, onSaveReschedule, onCancelReschedule, rescheduling, rescheduleDraft, setRescheduleDraft, bookings = [], active, services = THERAPY_SERVICES, therapists = THERAPISTS }) {
  const service = services.find(s => s.id === booking.serviceId);
  const therapist = therapists.find(t => t.id === booking.therapistId);
  const isPast = new Date(booking.date + 'T' + booking.time) < new Date();
  const onLightAccent = '#1E1B18';
  const days = useMemo(() => Array.from({ length: 21 }, (_, index) => addDays(new Date(), index)).filter(isBusinessDay), []);
  const slots = useMemo(() => getAvailableSlots({ booking, date: rescheduleDraft?.date, therapist, service, bookings }), [booking, bookings, rescheduleDraft?.date, service, therapist]);

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
          color: booking.status === 'cancelled' ? C.rust : (isPast ? C.sageDeep : onLightAccent)
        }}>{booking.status === 'cancelled' ? 'CANCELADA' : (isPast ? 'COMPLETADA' : 'CONFIRMADA')}</span>
      </div>

      <div style={{ display: 'flex', gap: 14, fontSize: 13, color: C.brownMid, paddingTop: 10, borderTop: `1px solid ${C.sagePale}` }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><CalendarIcon size={13} /> {dayLabel(new Date(booking.date))}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> {booking.time}</span>
      </div>

      {rescheduling && (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: C.ivory, border: `1px solid ${C.sagePale}` }}>
          <div style={{ fontSize: 11, color: C.brownMid, fontWeight: 800, letterSpacing: 0.8, marginBottom: 8 }}>REAGENDAR</div>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
            {days.map(day => {
              const iso = localISO(day);
              return (
                <button key={iso} onClick={() => setRescheduleDraft({ date: iso, time: '' })} style={{
                  minWidth: 72,
                  borderRadius: 10,
                  border: `1px solid ${rescheduleDraft.date === iso ? C.sageDark : C.sagePale}`,
                  background: rescheduleDraft.date === iso ? C.sageDark : C.creamLight,
                  color: rescheduleDraft.date === iso ? '#1E1B18' : C.brown,
                  padding: '8px 6px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 800
                }}>{dayLabel(day)}</button>
              );
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))', gap: 6, marginTop: 8 }}>
            {slots.map(time => (
              <button key={time} onClick={() => setRescheduleDraft({ ...rescheduleDraft, time })} style={{
                borderRadius: 9,
                border: `1px solid ${rescheduleDraft.time === time ? C.sageDark : C.sagePale}`,
                background: rescheduleDraft.time === time ? C.sageDark : C.creamLight,
                color: rescheduleDraft.time === time ? '#1E1B18' : C.brown,
                padding: '8px 6px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 800
              }}>{time}</button>
            ))}
          </div>
          {rescheduleDraft.date && slots.length === 0 && <div style={{ color: C.rust, fontSize: 11, fontWeight: 800, marginTop: 8 }}>No hay horarios disponibles ese dia.</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={onSaveReschedule} disabled={!rescheduleDraft.time} style={{
              background: rescheduleDraft.time ? 'var(--bp-primary)' : C.sagePale,
              color: rescheduleDraft.time ? 'var(--bp-primary-contrast)' : '#1E1B18',
              border: 'none',
              padding: '8px 13px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 800,
              cursor: rescheduleDraft.time ? 'pointer' : 'not-allowed'
            }}>Guardar</button>
            <button onClick={onCancelReschedule} style={ghostAction}>Cerrar</button>
          </div>
        </div>
      )}

      {active && onCancel && !rescheduling && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <button onClick={onStartReschedule} style={ghostAction}>Reagendar</button>
          <button onClick={onCancel} style={{ ...ghostAction, color: C.rust, borderColor: C.rustAlpha40 }}>Cancelar cita</button>
        </div>
      )}
    </div>
  );
}

const ghostAction = {
  background: 'transparent',
  color: C.sageDark,
  border: `1px solid ${C.sagePale}`,
  padding: '8px 14px',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer'
};

function getAvailableSlots({ booking, date, therapist, service, bookings }) {
  if (!date || !therapist || !service || !isBusinessDay(localDate(date))) return [];
  const duration = Number(therapist.sessionDuration || service.duration || 50) + 10;
  const slots = [];
  for (let minutes = 9 * 60; minutes + duration <= 19 * 60; minutes += Math.max(15, duration)) {
    const time = fromMinutes(minutes);
    if (new Date(`${date}T${time}`) < new Date()) continue;
    const start = minutes;
    const end = start + duration;
    const blocked = bookings.some((item) => {
      if (item.id === booking.id || item.status === 'cancelled' || item.date !== date || item.therapistId !== therapist.id) return false;
      const itemService = service;
      const itemDuration = Number(therapist.sessionDuration || itemService.duration || 50) + 10;
      const itemStart = toMinutes(item.time);
      return start < itemStart + itemDuration && end > itemStart;
    });
    if (!blocked) slots.push(time);
  }
  return slots;
}

function isBusinessDay(date) {
  const day = date.getDay();
  return day >= 2 && day <= 6;
}

function localISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDate(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function toMinutes(time) {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// ============ ADMIN APP ============
