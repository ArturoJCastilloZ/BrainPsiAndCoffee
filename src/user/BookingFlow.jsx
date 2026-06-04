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
import { MENU, THERAPISTS, THERAPY_SERVICES } from '../data';
import { addDays, dayLabel, formatMXN, fullDayLabel, getServiceIcon, todayISO, uid } from '../utils.jsx';

export default function BookingFlow({ setPage, bookings, setBookings, addToCart, setLinkedBookingId, showToast, catalogs }) {
  const services = (catalogs?.services || THERAPY_SERVICES).filter(item => item.active !== false);
  const therapists = (catalogs?.therapists || THERAPISTS).filter(item => item.active !== false);
  const onLightAccent = '#1E1B18';
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    serviceId: null, therapistId: null, date: null, time: null,
    name: '', email: '', phone: '', notes: '', wantsCoffee: false
  });

  const update = (k, v) => setData({ ...data, [k]: v });
  const service = services.find(s => s.id === data.serviceId);
  const therapist = therapists.find(t => t.id === data.therapistId);
  const avatarTextColor = (color) => (color === C.brownMid || color === C.rust ? C.cream : onLightAccent);

  const confirmBooking = () => {
    const newBooking = {
      id: uid(),
      ...data,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      reminderSent: false
    };
    setBookings([...bookings, newBooking]);
    setLinkedBookingId(newBooking.id);
    setStep(6);
  };

  const stepTitles = ['Servicio', 'Profesional', 'Fecha y hora', 'Datos', 'Confirmar'];

  return (
    <div style={{ padding: '24px 20px 40px', maxWidth: 720, margin: '0 auto' }}>
      {step <= 5 && (
        <>
          {/* Progress */}
          <div style={{ marginBottom: 24 }}>
            <button onClick={() => step > 1 ? setStep(step - 1) : setPage('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.brownMid, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16, padding: 0 }}>
              <ArrowLeft size={14} /> Atrás
            </button>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {[1,2,3,4,5].map(n => (
                <div key={n} style={{ flex: 1, height: 4, borderRadius: 999, background: n <= step ? C.sageDark : C.sagePale, transition: 'background 0.3s' }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 11, color: C.sageDark, fontWeight: 700, letterSpacing: 1.5 }}>PASO {step} DE 5</span>
              <h1 className="font-display" style={{ fontSize: 30, fontWeight: 500, color: C.brown, margin: 0, letterSpacing: '-0.02em' }}>{stepTitles[step - 1]}</h1>
            </div>
          </div>

          {/* Step 1: Service */}
          {step === 1 && (
            <div className="animate-fade-up">
              <div style={{ display: 'grid', gap: 12 }}>
                {services.map(s => (
                  <button key={s.id} onClick={() => { update('serviceId', s.id); setStep(2); }} style={{
                    background: data.serviceId === s.id ? C.sagePale : C.creamLight,
                    border: `1.5px solid ${data.serviceId === s.id ? C.sageDark : C.sagePale}`,
                    borderRadius: 16, padding: 18, cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 16, transition: 'all 0.2s'
                  }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: C.sage, display: 'flex', alignItems: 'center', justifyContent: 'center', color: onLightAccent, flexShrink: 0 }}>
                      {getServiceIcon(s.icon, 24)}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="font-display" style={{ fontSize: 17, fontWeight: 600, color: C.brown, marginBottom: 2 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: C.brownMid, lineHeight: 1.5 }}>{s.desc}</div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11, color: C.brownLight }}>
                        <span><Clock size={11} style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }} />{s.duration} min</span>
                        <span style={{ fontWeight: 700, color: C.sageDark }}>${s.price}</span>
                      </div>
                    </div>
                    <ChevronRight size={20} color={C.brownLight} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Therapist */}
          {step === 2 && (
            <div className="animate-fade-up">
              <p style={{ fontSize: 14, color: C.brownMid, marginBottom: 16 }}>Elige al profesional con quien quieres tu sesión.</p>
              <div style={{ display: 'grid', gap: 12 }}>
                <button onClick={() => { update('therapistId', 'any'); setStep(3); }} style={{
                  background: data.therapistId === 'any' ? C.sagePale : C.creamLight,
                  border: `1.5px solid ${data.therapistId === 'any' ? C.sageDark : C.sagePale}`,
                  borderRadius: 16, padding: 16, cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 14
                }}>
                  <div style={{ width: 44, height: 44, borderRadius: 999, background: C.caramelLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={20} color={C.brown} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="font-display" style={{ fontSize: 16, fontWeight: 600, color: C.brown }}>Asignación automática</div>
                    <div style={{ fontSize: 12, color: C.brownMid }}>El sistema te asigna al mejor profesional disponible</div>
                  </div>
                </button>
                {therapists.filter(t => !data.serviceId || t.services.includes(data.serviceId)).map(t => (
                  <button key={t.id} onClick={() => { update('therapistId', t.id); setStep(3); }} style={{
                    background: data.therapistId === t.id ? C.sagePale : C.creamLight,
                    border: `1.5px solid ${data.therapistId === t.id ? C.sageDark : C.sagePale}`,
                    borderRadius: 16, padding: 16, cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 14
                  }}>
                    <div style={{ width: 44, height: 44, borderRadius: 999, background: t.color, color: avatarTextColor(t.color), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700 }}>
                      {t.name.split(' ')[1][0]}{t.name.split(' ')[2]?.[0] || ''}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="font-display" style={{ fontSize: 16, fontWeight: 600, color: C.brown }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: C.brownMid }}>{t.specialty} · Céd. {t.cedula}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Date and time */}
          {step === 3 && (
            <DateTimePicker data={data} update={update} onContinue={() => setStep(4)} bookings={bookings} therapists={therapists} services={services} />
          )}

          {/* Step 4: Personal info */}
          {step === 4 && (
            <div className="animate-fade-up">
              <p style={{ fontSize: 14, color: C.brownMid, marginBottom: 20 }}>Datos para confirmar tu cita y enviarte recordatorios.</p>
              <div style={{ display: 'grid', gap: 14 }}>
                <Input label="Nombre completo" value={data.name} onChange={v => update('name', v)} icon={User} placeholder="Tu nombre" required />
                <Input label="Correo electrónico" value={data.email} onChange={v => update('email', v)} icon={Mail} placeholder="tucorreo@ejemplo.com" type="email" required />
                <Input label="Teléfono (WhatsApp)" value={data.phone} onChange={v => update('phone', v)} icon={Phone} placeholder="55 1234 5678" type="tel" required />
                <div>
                  <label style={{ fontSize: 12, color: C.brownMid, fontWeight: 600, marginBottom: 6, display: 'block', letterSpacing: 0.5 }}>NOTAS PARA EL PROFESIONAL (opcional)</label>
                  <textarea value={data.notes} onChange={e => update('notes', e.target.value)} rows={3} placeholder="¿Algo que el profesional deba saber antes de tu cita?" style={{
                    width: '100%', padding: 12, border: `1.5px solid ${C.sagePale}`, borderRadius: 12, fontSize: 14, fontFamily: 'inherit',
                    background: C.creamLight, color: C.brown, resize: 'vertical', outline: 'none'
                  }} onFocus={e => e.target.style.borderColor = C.sageDark} onBlur={e => e.target.style.borderColor = C.sagePale} />
                </div>

                <div style={{
                  background: `linear-gradient(135deg, ${C.cream}, ${C.caramelLightAlpha30})`,
                  border: `1px solid ${C.caramelLight}`, borderRadius: 16, padding: 16
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <input type="checkbox" id="wantsCoffee" checked={data.wantsCoffee} onChange={e => update('wantsCoffee', e.target.checked)} style={{ marginTop: 2, accentColor: C.sageDark, width: 18, height: 18 }} />
                    <label htmlFor="wantsCoffee" style={{ flex: 1, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <Coffee size={14} color={C.caramel} />
                        <span style={{ fontWeight: 600, fontSize: 14, color: C.brown }}>Quiero un café antes/después de mi sesión</span>
                      </div>
                      <div style={{ fontSize: 12, color: C.brownMid, lineHeight: 1.5 }}>Te llevaremos al menú al confirmar. Disfruta del combo café + postre por solo $99.</div>
                    </label>
                  </div>
                </div>
              </div>
              <button onClick={() => setStep(5)} disabled={!data.name || !data.email || !data.phone} style={{
                marginTop: 20, width: '100%',
                background: !data.name || !data.email || !data.phone ? C.sagePale : 'var(--bp-primary)',
                color: !data.name || !data.email || !data.phone ? '#1E1B18' : 'var(--bp-primary-contrast)', border: 'none', padding: '14px', borderRadius: 14,
                fontSize: 15, fontWeight: 600, cursor: !data.name || !data.email || !data.phone ? 'not-allowed' : 'pointer'
              }}>
                Continuar
              </button>
            </div>
          )}

          {/* Step 5: Confirm */}
          {step === 5 && (
            <div className="animate-fade-up">
              <div style={{ background: C.creamLight, border: `1px solid ${C.sagePale}`, borderRadius: 18, padding: 22, marginBottom: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: 1.5, color: C.sageDark, fontWeight: 700, marginBottom: 8 }}>RESUMEN DE TU CITA</div>
                <div className="font-display" style={{ fontSize: 22, fontWeight: 600, color: C.brown, marginBottom: 14, lineHeight: 1.2 }}>{service?.name}</div>
                <div style={{ display: 'grid', gap: 10, fontSize: 14 }}>
                  <Row icon={User} label="Profesional" value={therapist?.name || 'Asignación automática'} />
                  <Row icon={CalendarIcon} label="Fecha" value={fullDayLabel(new Date(data.date))} />
                  <Row icon={Clock} label="Hora" value={`${data.time} (${service?.duration} min)`} />
                  <Row icon={Mail} label="Contacto" value={data.email} />
                  <Row icon={Phone} label="WhatsApp" value={data.phone} />
                </div>
                <div style={{ borderTop: `1px solid ${C.sagePale}`, marginTop: 16, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: C.brownMid }}>Total a pagar en sitio</span>
                  <span className="font-display" style={{ fontSize: 26, fontWeight: 700, color: C.sageDark }}>${service?.price}</span>
                </div>
              </div>

              <div style={{ background: C.sagePale, borderRadius: 14, padding: 14, marginBottom: 20, fontSize: 12, color: C.sageDeep, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Bell size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Automatización activa:</strong> Te enviaremos recordatorio por WhatsApp 24h y 1h antes de tu cita. Si necesitas cambiar la fecha, podrás hacerlo hasta 12h antes.
                </div>
              </div>

              <button onClick={confirmBooking} style={{
                width: '100%', background: 'var(--bp-primary)', color: 'var(--bp-primary-contrast)', border: 'none',
                padding: '16px', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}>
                <Check size={18} /> Confirmar reservación
              </button>
            </div>
          )}
        </>
      )}

      {/* Step 6: Success */}
      {step === 6 && (
        <div className="animate-fade-up" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 100, height: 100, borderRadius: '50%', background: C.sagePale, margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: `2px dashed ${C.sage}`, animation: 'spin 20s linear infinite' }} />
            <CheckCircle2 size={50} color={C.sageDeep} strokeWidth={1.5} />
          </div>
          <h1 className="font-display" style={{ fontSize: 32, fontWeight: 600, color: C.brown, margin: '0 0 10px', letterSpacing: '-0.02em' }}>¡Listo, {data.name.split(' ')[0]}!</h1>
          <p style={{ fontSize: 15, color: C.brownMid, lineHeight: 1.6, maxWidth: 380, margin: '0 auto 24px' }}>
            Tu cita está confirmada. Te enviamos los detalles a <strong style={{ color: C.brown }}>{data.email}</strong> y un mensaje a tu WhatsApp.
          </p>

          <div style={{ background: C.creamLight, border: `1px solid ${C.sagePale}`, borderRadius: 14, padding: 16, marginBottom: 16, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="font-display" style={{ fontSize: 16, fontWeight: 600, color: C.brown }}>{service?.name}</span>
            </div>
            <div style={{ fontSize: 13, color: C.brownMid }}>{fullDayLabel(new Date(data.date))} · {data.time}</div>
          </div>

          {data.wantsCoffee ? (
            <button onClick={() => setPage('menu')} style={{
              width: '100%', background: C.caramel, color: '#1E1B18', border: 'none',
              padding: '14px', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10
            }}>
              <Coffee size={18} /> Pedir mi café ahora
            </button>
          ) : null}
          <button onClick={() => setPage('mybookings')} style={{
            width: '100%', background: 'transparent', color: C.brown, border: `1.5px solid ${C.brown}`,
            padding: '14px', borderRadius: 14, fontSize: 15, fontWeight: 600, cursor: 'pointer'
          }}>
            Ver mis citas
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon size={15} color={C.brownLight} />
      <span style={{ color: C.brownMid, fontSize: 13 }}>{label}:</span>
      <strong style={{ color: C.brown, fontWeight: 600 }}>{value}</strong>
    </div>
  );
}

function Input({ label, value, onChange, icon: Icon, placeholder, type = 'text', required = false }) {
  const missing = required && String(value || '').trim().length === 0;
  return (
    <div>
      <label style={{ fontSize: 12, color: C.brownMid, fontWeight: 600, marginBottom: 6, display: 'block', letterSpacing: 0.5 }}>{label.toUpperCase()}</label>
      <div style={{ position: 'relative' }}>
        <Icon size={16} color={C.brownLight} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} style={{
          width: '100%', padding: '12px 12px 12px 40px', border: `1.5px solid ${missing ? C.rust : C.sagePale}`, borderRadius: 12,
          fontSize: 14, fontFamily: 'inherit', background: C.creamLight, color: C.brown, outline: 'none',
          boxSizing: 'border-box'
        }} onFocus={e => e.target.style.borderColor = C.sageDark} onBlur={e => e.target.style.borderColor = missing ? C.rust : C.sagePale} />
      </div>
      {missing && <span style={{ color: C.rust, fontSize: 10, fontWeight: 800, letterSpacing: 0.4, marginTop: 5, display: 'block' }}>Campo requerido</span>}
    </div>
  );
}

// ============ DATE TIME PICKER ============

function DateTimePicker({ data, update, onContinue, bookings, therapists, services }) {
  const [weekStart, setWeekStart] = useState(0); // weeks from today
  const eligibleTherapists = useMemo(
    () => therapists.filter(therapist => !data.serviceId || therapist.services?.includes(data.serviceId)),
    [data.serviceId, therapists]
  );
  const therapistPool = data.therapistId === 'any'
    ? eligibleTherapists
    : eligibleTherapists.filter(therapist => therapist.id === data.therapistId);
  const slots = useMemo(
    () => generateBusinessTimeSlots(getSlotIntervalMinutes(therapistPool, data.therapistId, data.serviceId, services)),
    [data.serviceId, data.therapistId, therapistPool, services]
  );

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(new Date(), weekStart * 7 + i)), [weekStart]);

  const isAvailable = (date, time) => {
    const dateObj = new Date(date + 'T' + time);
    if (dateObj < new Date()) return false;
    if (!isBusinessDay(date)) return false;
    if (!therapistPool.length) return false;
    return therapistPool.some(therapist => canBookTherapist({ therapist, date, time, bookings, services }));
  };

  return (
    <div className="animate-fade-up">
      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <button onClick={() => setWeekStart(Math.max(0, weekStart - 1))} disabled={weekStart === 0} style={{
          background: weekStart === 0 ? 'transparent' : C.creamLight, border: `1px solid ${C.sagePale}`,
          width: 36, height: 36, borderRadius: 999, cursor: weekStart === 0 ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: weekStart === 0 ? 0.4 : 1
        }}>
          <ChevronLeft size={18} color={C.brown} />
        </button>
        <div style={{ fontSize: 13, color: C.brownMid, fontWeight: 600 }}>
          {days[0].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
        </div>
        <button onClick={() => setWeekStart(weekStart + 1)} disabled={weekStart >= 4} style={{
          background: weekStart >= 4 ? 'transparent' : C.creamLight, border: `1px solid ${C.sagePale}`,
          width: 36, height: 36, borderRadius: 999, cursor: weekStart >= 4 ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: weekStart >= 4 ? 0.4 : 1
        }}>
          <ChevronRight size={18} color={C.brown} />
        </button>
      </div>

      {/* Days */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 24 }}>
        {days.map(d => {
          const iso = d.toISOString().split('T')[0];
          const selected = data.date === iso;
          const isPast = d < new Date(new Date().setHours(0,0,0,0));
          return (
            <button key={iso} onClick={() => !isPast && update('date', iso)} disabled={isPast} style={{
              background: selected ? C.brown : (isPast ? 'transparent' : C.creamLight),
              border: `1.5px solid ${selected ? C.brown : C.sagePale}`,
              borderRadius: 12, padding: '10px 4px', cursor: isPast ? 'not-allowed' : 'pointer',
              opacity: isPast ? 0.3 : 1, color: selected ? 'var(--bp-primary-contrast)' : C.brown,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2
            }}>
              <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7, textTransform: 'uppercase' }}>{d.toLocaleDateString('es-MX', { weekday: 'short' })}</span>
              <span className="font-display" style={{ fontSize: 18, fontWeight: 600 }}>{d.getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Time slots */}
      {data.date ? (
        <div>
          <div style={{ fontSize: 12, color: C.brownMid, fontWeight: 600, marginBottom: 12, letterSpacing: 0.5 }}>HORARIOS DISPONIBLES — {fullDayLabel(new Date(data.date))}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))', gap: 8 }}>
            {slots.map(time => {
              const available = isAvailable(data.date, time);
              const selected = data.time === time;
              return (
                <button key={time} onClick={() => available && update('time', time)} disabled={!available} style={{
                  background: selected ? C.sageDark : (available ? C.creamLight : 'transparent'),
                  color: selected ? '#1E1B18' : (available ? C.brown : C.brownLight),
                  border: `1.5px solid ${selected ? C.sageDark : C.sagePale}`,
                  borderRadius: 10, padding: '10px 6px', fontSize: 13, fontWeight: 600,
                  cursor: available ? 'pointer' : 'not-allowed',
                  opacity: available ? 1 : 0.4,
                  textDecoration: !available ? 'line-through' : 'none'
                }}>{time}</button>
              );
            })}
          </div>
          <button onClick={onContinue} disabled={!data.time} style={{
            marginTop: 24, width: '100%',
            background: !data.time ? C.sagePale : 'var(--bp-primary)',
            color: !data.time ? '#1E1B18' : 'var(--bp-primary-contrast)', border: 'none', padding: '14px', borderRadius: 14,
            fontSize: 15, fontWeight: 600, cursor: !data.time ? 'not-allowed' : 'pointer'
          }}>
            Continuar
          </button>
        </div>
      ) : (
        <div style={{ background: C.creamLight, padding: 40, borderRadius: 16, textAlign: 'center', color: C.brownLight, border: `1px dashed ${C.sagePale}` }}>
          <CalendarIcon size={32} strokeWidth={1.5} style={{ margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontSize: 13 }}>Selecciona un día para ver horarios disponibles</div>
        </div>
      )}
    </div>
  );
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

    const bookedService = services.find(service => service.id === booking.serviceId);
    const bookedDuration = Number(booking.therapistId === therapist.id ? therapist.sessionDuration : bookedService?.duration || 50) + 10;
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
  const day = new Date(`${date}T12:00:00`).getDay();
  return day >= 2 && day <= 6;
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

// ============ MENU PAGE ============
