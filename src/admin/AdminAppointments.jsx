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
import { THERAPISTS, THERAPY_SERVICES } from '../data';
import { addDays, todayISO, uid } from '../utils.jsx';
import { validateAppointment } from '../validation';

export default function AdminAppointments({ bookings, setBookings, catalogs, lockedTherapistId = null }) {
  const services = catalogs?.services || THERAPY_SERVICES;
  const therapists = catalogs?.therapists || THERAPISTS;
  const [filter, setFilter] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [reschedulingId, setReschedulingId] = useState(null);
  const [rescheduleDraft, setRescheduleDraft] = useState({ date: '', time: '' });
  const [formError, setFormError] = useState('');
  const [draft, setDraft] = useState({
    serviceId: services[0]?.id || '',
    therapistId: lockedTherapistId || 'any',
    date: todayISO(),
    time: '09:00',
    name: '',
    email: '',
    phone: '',
    notes: '',
    wantsCoffee: false,
  });
  const eligibleTherapists = useMemo(() => therapists.filter(therapist => (!lockedTherapistId || therapist.id === lockedTherapistId) && (!draft.serviceId || therapist.services?.includes(draft.serviceId))), [draft.serviceId, lockedTherapistId, therapists]);
  const calendarDays = useMemo(() => {
    return Array.from({ length: 35 }, (_, index) => {
      const date = addDays(new Date(), index);
      const iso = localISO(date);
      const slots = getAvailableSlots(iso, draft.therapistId, draft.serviceId, bookings, eligibleTherapists, services);
      return {
        iso,
        date,
        slots,
        disabled: !isBusinessDay(iso) || slots.length === 0,
      };
    });
  }, [bookings, draft.serviceId, draft.therapistId, eligibleTherapists, services]);
  const availableDates = useMemo(() => calendarDays.filter(day => !day.disabled).map(day => day.iso), [calendarDays]);
  const availableSlots = useMemo(() => getTimeSlotStates(draft.date, draft.therapistId, draft.serviceId, bookings, eligibleTherapists, services), [bookings, draft.date, draft.serviceId, draft.therapistId, eligibleTherapists, services]);
  const selectedSlot = availableSlots.find(slot => slot.time === draft.time);
  const canCreateBooking = Boolean(
    Object.keys(validateAppointment(draft)).length === 0 &&
    selectedSlot?.available
  );

  useEffect(() => {
    if (!draft.serviceId && services[0]?.id) {
      setDraft(current => ({ ...current, serviceId: services[0].id }));
    }
  }, [draft.serviceId, services]);

  useEffect(() => {
    if (lockedTherapistId && draft.therapistId !== lockedTherapistId) {
      setDraft(current => ({ ...current, therapistId: lockedTherapistId }));
      return;
    }
    if (draft.therapistId !== 'any' && !eligibleTherapists.some(therapist => therapist.id === draft.therapistId)) {
      setDraft(current => ({ ...current, therapistId: 'any' }));
    }
  }, [draft.therapistId, eligibleTherapists, lockedTherapistId]);

  useEffect(() => {
    if (!availableDates.length) return;
    if (!availableDates.includes(draft.date)) {
      setDraft(current => ({ ...current, date: availableDates[0], time: '' }));
    }
  }, [availableDates, draft.date]);

  useEffect(() => {
    const freeSlots = availableSlots.filter(slot => slot.available).map(slot => slot.time);
    if (!freeSlots.length) return;
    if (!freeSlots.includes(draft.time)) {
      setDraft(current => ({ ...current, time: freeSlots[0] }));
    }
  }, [availableSlots, draft.time]);

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
  const startReschedule = (booking) => {
    setReschedulingId(booking.id);
    setRescheduleDraft({ date: booking.date, time: booking.time });
    setFormError('');
  };
  const saveExistingReschedule = (booking) => {
    const serviceTherapists = therapists.filter(therapist => therapist.id === booking.therapistId && therapist.services?.includes(booking.serviceId));
    const slot = getTimeSlotStates(rescheduleDraft.date, booking.therapistId, booking.serviceId, bookings.filter(item => item.id !== booking.id), serviceTherapists, services)
      .find(item => item.time === rescheduleDraft.time);
    if (!slot?.available) {
      setFormError('Ese horario ya no está disponible. Selecciona otro horario.');
      return;
    }
    setBookings(bookings.map(item => item.id === booking.id ? { ...item, date: rescheduleDraft.date, time: rescheduleDraft.time } : item));
    setReschedulingId(null);
    setFormError('');
  };

  const createBooking = () => {
    const nextErrors = validateAppointment(draft);
    if (Object.keys(nextErrors).length) {
      setFormError(Object.values(nextErrors)[0]);
      return;
    }

    if (!selectedSlot?.available) {
      setFormError('Ese horario ya no está disponible. Selecciona otro horario.');
      return;
    }
    const assignedTherapistId = draft.therapistId === 'any'
      ? eligibleTherapists.find((therapist) => canBookTherapist({ therapist, date: draft.date, time: draft.time, bookings, services }))?.id
      : draft.therapistId;
    if (!assignedTherapistId) {
      setFormError('Ese horario ya no está disponible. Selecciona otro horario.');
      return;
    }

    setFormError('');
    setBookings([...bookings, {
      id: uid(),
      ...draft,
      therapistId: assignedTherapistId,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      reminderSent: false,
    }]);
    setDraft({ ...draft, name: '', email: '', phone: '', notes: '', wantsCoffee: false });
    setCreating(false);
  };

  return (
    <div>
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>Citas</h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 24 }}>Gestiona reservaciones, confirma o reprograma</p>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <button onClick={() => setCreating(!creating)} style={{
          background: C.sageDark, color: 'var(--admin-on-accent)', border: 'none', borderRadius: 999,
          padding: '9px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7,
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700
        }}>
          {creating ? <X size={14} /> : <Plus size={14} />} {creating ? 'Cancelar' : 'Nueva cita'}
        </button>
      </div>

      {creating && (
        <div className="admin-card" style={{ borderRadius: 14, padding: 22, marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(190px, 1fr))', gap: '18px 14px', alignItems: 'end' }}>
            <AdminField label="Nombre" value={draft.name} onChange={name => { setFormError(''); setDraft({ ...draft, name }); }} required />
            <AdminField label="Correo" value={draft.email} onChange={email => { setFormError(''); setDraft({ ...draft, email }); }} type="email" required />
            <AdminField label="Teléfono" value={draft.phone} onChange={phone => { setFormError(''); setDraft({ ...draft, phone }); }} required />
            <label style={{ ...fieldWrap, gridColumn: 'span 2' }}>
              <span style={fieldLabel}>SERVICIO</span>
              <select value={draft.serviceId} onChange={e => { setFormError(''); setDraft({ ...draft, serviceId: e.target.value }); }} required className="admin-input" style={{ ...fieldInput, borderColor: !draft.serviceId ? C.rust : undefined }}>
                {services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
              {!draft.serviceId && <span style={requiredHint}>Campo requerido</span>}
            </label>
            {!lockedTherapistId && (
              <label style={{ ...fieldWrap, minWidth: 240 }}>
                <span style={fieldLabel}>PROFESIONAL</span>
                <select value={draft.therapistId} onChange={e => { setFormError(''); setDraft({ ...draft, therapistId: e.target.value }); }} required className="admin-input" style={{ ...fieldInput, borderColor: !draft.therapistId ? C.rust : undefined }}>
                  <option value="any">Asignación automática</option>
                  {eligibleTherapists.map(therapist => <option key={therapist.id} value={therapist.id}>{therapist.name}</option>)}
                </select>
                {!draft.therapistId && <span style={requiredHint}>Campo requerido</span>}
              </label>
            )}
            <div style={{ ...fieldWrap, gridColumn: 'span 2' }}>
              <span style={fieldLabel}>FECHA DISPONIBLE</span>
              <AvailabilityCalendar days={calendarDays} selectedDate={draft.date} onSelect={date => { setFormError(''); setDraft({ ...draft, date, time: '' }); }} />
              {!draft.date && <span style={requiredHint}>Campo requerido</span>}
            </div>
            <div style={{ ...fieldWrap, gridColumn: 'span 3' }}>
              <span style={fieldLabel}>HORARIO DISPONIBLE</span>
              <TimeSlotGrid slots={availableSlots} selectedTime={draft.time} onSelect={time => { setFormError(''); setDraft({ ...draft, time }); }} />
              {!draft.time && <span style={requiredHint}>Campo requerido</span>}
            </div>
            <label style={{ ...fieldWrap, gridColumn: 'span 2' }}>
              <span style={fieldLabel}>NOTAS</span>
              <input value={draft.notes || ''} onChange={e => setDraft({ ...draft, notes: e.target.value })} className="admin-input" style={fieldInput} />
            </label>
          </div>
          {formError && (
            <div style={{
              marginTop: 14,
              color: C.rust,
              background: C.rustAlpha20,
              border: `1px solid ${C.rustAlpha40}`,
              borderRadius: 10,
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: 700
            }}>
              {formError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={createBooking} disabled={!canCreateBooking} style={{
              background: C.sageDark, color: 'var(--admin-on-accent)', border: 'none', borderRadius: 9,
              padding: '9px 14px', cursor: canCreateBooking ? 'pointer' : 'not-allowed', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              opacity: canCreateBooking ? 1 : 0.45
            }}>Guardar cita</button>
          </div>
        </div>
      )}

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
                      <button onClick={() => startReschedule(b)} title="Reagendar" style={{
                        background: 'var(--admin-surface-soft)', border: '1px solid var(--admin-border)', color: 'var(--admin-accent-text)', padding: 6, borderRadius: 8, cursor: 'pointer'
                      }}>
                        <RefreshCw size={14} />
                      </button>
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
                {reschedulingId === b.id && (
                  <AdminReschedulePanel
                    booking={b}
                    draft={rescheduleDraft}
                    setDraft={setRescheduleDraft}
                    bookings={bookings}
                    therapists={therapists}
                    services={services}
                    onSave={() => saveExistingReschedule(b)}
                    onClose={() => setReschedulingId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AdminReschedulePanel({ booking, draft, setDraft, bookings, therapists, services, onSave, onClose }) {
  const therapistPool = therapists.filter(therapist => therapist.id === booking.therapistId && therapist.services?.includes(booking.serviceId));
  const days = Array.from({ length: 28 }, (_, index) => addDays(new Date(), index))
    .map(localISO)
    .filter(isBusinessDay);
  const slots = getTimeSlotStates(draft.date, booking.therapistId, booking.serviceId, bookings.filter(item => item.id !== booking.id), therapistPool, services)
    .filter(slot => slot.available);

  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: '1px solid var(--admin-border)', background: 'var(--admin-surface-soft)' }}>
      <div style={{ color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 8 }}>REAGENDAR CITA</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(180px, 1fr)', gap: 10 }}>
        <label style={fieldWrap}>
          <span style={fieldLabel}>FECHA</span>
          <select value={draft.date} onChange={event => setDraft({ date: event.target.value, time: '' })} className="admin-input" style={fieldInput}>
            {days.map(day => <option key={day} value={day}>{day}</option>)}
          </select>
        </label>
        <label style={fieldWrap}>
          <span style={fieldLabel}>HORARIO</span>
          <select value={draft.time} onChange={event => setDraft({ ...draft, time: event.target.value })} className="admin-input" style={fieldInput}>
            <option value="">Selecciona horario</option>
            {slots.map(slot => <option key={slot.time} value={slot.time}>{slot.time}</option>)}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--admin-border)', color: 'var(--admin-accent-text)', borderRadius: 9, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>Cerrar</button>
        <button onClick={onSave} disabled={!draft.time} style={{ background: C.sageDark, color: 'var(--admin-on-accent)', border: 'none', borderRadius: 9, padding: '8px 12px', cursor: draft.time ? 'pointer' : 'not-allowed', opacity: draft.time ? 1 : 0.45, fontFamily: 'inherit', fontSize: 12, fontWeight: 700 }}>Guardar</button>
      </div>
    </div>
  );
}

const fieldWrap = { display: 'grid', gap: 6 };
const fieldLabel = { color: 'var(--admin-row-text)', fontSize: 10, fontWeight: 800, letterSpacing: 1 };
const fieldInput = { width: '100%', minHeight: 40, boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, outline: 'none', fontFamily: 'inherit' };

function AdminField({ label, value, onChange, type = 'text', required = false }) {
  const missing = required && String(value || '').trim().length === 0;
  return (
    <label style={fieldWrap}>
      <span style={fieldLabel}>{label.toUpperCase()}</span>
      <input value={value || ''} onChange={e => onChange(e.target.value)} type={type} required={required} className="admin-input" style={{ ...fieldInput, borderColor: missing ? C.rust : undefined }} />
      {missing && <span style={requiredHint}>Campo requerido</span>}
    </label>
  );
}

const requiredHint = { color: C.rust, fontSize: 10, fontWeight: 800, letterSpacing: 0.4 };

function AvailabilityCalendar({ days, selectedDate, onSelect }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
      gap: 6,
      background: 'var(--admin-surface-soft)',
      border: '1px solid var(--admin-border)',
      borderRadius: 12,
      padding: 10,
    }}>
      {['M', 'M', 'J', 'V', 'S', 'D', 'L'].map((label, index) => (
        <div key={`${label}-${index}`} style={{ color: 'var(--admin-subtle)', fontSize: 10, fontWeight: 800, textAlign: 'center' }}>{label}</div>
      ))}
      {days.map(day => {
        const selected = selectedDate === day.iso;
        const disabled = day.disabled;
        return (
          <button key={day.iso} type="button" disabled={disabled} onClick={() => onSelect(day.iso)} title={disabled ? 'Sin horarios disponibles' : `${day.slots.length} horarios disponibles`} style={{
            minHeight: 42,
            borderRadius: 10,
            border: `1px solid ${selected ? C.sageDark : 'var(--admin-border)'}`,
            background: selected ? C.sageDark : (disabled ? 'transparent' : 'var(--admin-surface)'),
            color: selected ? 'var(--admin-on-accent)' : (disabled ? 'var(--admin-subtle)' : 'var(--admin-text)'),
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.35 : 1,
            fontFamily: 'inherit',
            display: 'grid',
            placeItems: 'center',
            gap: 1,
          }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{day.date.getDate()}</span>
            <span style={{ fontSize: 9, color: selected ? 'var(--admin-on-accent)' : 'var(--admin-accent-text)' }}>{disabled ? '-' : day.slots.length}</span>
          </button>
        );
      })}
    </div>
  );
}

function TimeSlotGrid({ slots, selectedTime, onSelect }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))',
      gap: 8,
      background: 'var(--admin-surface-soft)',
      border: '1px solid var(--admin-border)',
      borderRadius: 12,
      padding: 10,
    }}>
      {slots.map(slot => {
        const selected = selectedTime === slot.time;
        return (
          <button key={slot.time} type="button" disabled={!slot.available} onClick={() => onSelect(slot.time)} title={slot.available ? 'Disponible' : slot.reason} style={{
            minHeight: 38,
            borderRadius: 10,
            border: `1px solid ${selected ? C.sageDark : 'var(--admin-border)'}`,
            background: selected ? C.sageDark : (slot.available ? 'var(--admin-surface)' : 'transparent'),
            color: selected ? 'var(--admin-on-accent)' : (slot.available ? 'var(--admin-text)' : 'var(--admin-subtle)'),
            cursor: slot.available ? 'pointer' : 'not-allowed',
            opacity: slot.available ? 1 : 0.35,
            textDecoration: slot.available ? 'none' : 'line-through',
            fontFamily: 'inherit',
            fontSize: 12,
            fontWeight: 800,
          }}>{slot.time}</button>
        );
      })}
    </div>
  );
}

function getAvailableSlots(date, therapistId, serviceId, bookings, eligibleTherapists, services) {
  return getTimeSlotStates(date, therapistId, serviceId, bookings, eligibleTherapists, services)
    .filter(slot => slot.available)
    .map(slot => slot.time);
}

function getTimeSlotStates(date, therapistId, serviceId, bookings, eligibleTherapists, services) {
  if (!date || !serviceId) return [];

  const therapistPool = therapistId === 'any'
    ? eligibleTherapists
    : eligibleTherapists.filter(therapist => therapist.id === therapistId);

  if (!therapistPool.length) return [];

  const slots = generateBusinessTimeSlots(getSlotIntervalMinutes(therapistPool, therapistId, serviceId, services));

  return slots.map(time => {
    if (!isBusinessDay(date)) return { time, available: false, reason: 'Fuera de horario' };
    if (new Date(`${date}T${time}`) < new Date()) return { time, available: false, reason: 'Horario pasado' };

    const available = therapistPool.some(therapist => canBookTherapist({ therapist, date, time, bookings, services }));
    return { time, available, reason: available ? 'Disponible' : 'Ocupado' };
  });
}

function getSlotIntervalMinutes(therapistPool, therapistId, serviceId, services) {
  if (therapistId !== 'any') {
    return Number(therapistPool[0]?.sessionDuration || services.find(service => service.id === serviceId)?.duration || 50) + 10;
  }

  const intervals = therapistPool.map(therapist => Number(therapist.sessionDuration || 50) + 10);
  return intervals.length ? Math.min(...intervals) : Number(services.find(service => service.id === serviceId)?.duration || 50) + 10;
}

function canBookTherapist({ therapist, date, time, bookings, services }) {
  const duration = Number(therapist.sessionDuration || 50) + 10;
  const start = toMinutes(time);
  const end = start + duration;
  if (end > 19 * 60) return false;

  return !bookings.some(booking => {
    if (booking.status === 'cancelled' || booking.date !== date) return false;
    if (booking.therapistId !== therapist.id && booking.therapistId !== 'any') return false;

    const bookedTherapist = booking.therapistId === therapist.id
      ? therapist
      : services.find(service => service.id === booking.serviceId)
        ? null
        : therapist;
    const bookedService = services.find(service => service.id === booking.serviceId);
    const bookedDuration = Number(bookedTherapist?.sessionDuration || bookedService?.duration || 50) + 10;
    const bookedStart = toMinutes(booking.time);
    const bookedEnd = bookedStart + bookedDuration;

    return start < bookedEnd && end > bookedStart;
  });
}

function generateBusinessTimeSlots(stepMinutes = 30) {
  const slots = [];
  const interval = Math.max(15, Number(stepMinutes || 30));
  for (let minutes = 9 * 60; minutes + interval <= 19 * 60; minutes += interval) {
    slots.push(fromMinutes(minutes));
  }
  return slots;
}

function isBusinessDay(date) {
  const day = localDate(date).getDay();
  return day >= 2 && day <= 6;
}

function localISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDate(iso) {
  const [year, month, day] = String(iso).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function toMinutes(time) {
  const [hours, minutes] = String(time || '00:00').split(':').map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

// ============ ADMIN ORDERS ============
