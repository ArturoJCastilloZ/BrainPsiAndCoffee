import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { submitArcoRequest } from '../api/supabaseData';
import { PLAZO_DIAS_HABILES, TIPOS_ARCO, sumarDiasHabiles } from '../arcoPlazos.mjs';
import { isValidEmail, isValidPhone } from '../validation';
import './booking.css';

const VACIO = { type: '', name: '', email: '', phone: '', relationship: 'titular', onBehalfOf: '', details: '' };

const validar = (f) => {
  const e = {};
  if (!f.type) e.type = 'Elige qué quieres hacer con tus datos.';
  if (f.name.trim().length < 2) e.name = 'Escribe tu nombre.';
  if (!f.email.trim()) e.email = 'Escribe tu correo: ahí te respondemos.';
  else if (!isValidEmail(f.email)) e.email = 'Revisa el correo: falta la @ o el dominio.';
  if (f.phone.trim() && !isValidPhone(f.phone)) e.phone = 'Revisa el teléfono o déjalo vacío.';
  if (f.relationship !== 'titular' && f.onBehalfOf.trim().length < 2) e.onBehalfOf = 'Escribe el nombre de la persona titular de los datos.';
  if (f.details.trim().length < 10) e.details = 'Cuéntanos un poco más (mínimo 10 caracteres).';
  return e;
};

// Derechos ARCO (0039). Antes la unica via era un correo: nada quedaba
// registrado ni nadie veia correr el plazo. Ahora la solicitud entra a la
// base con fecha y vencimiento que pone el servidor, y el staff la
// atiende desde el panel.
export default function ArcoPage() {
  const [form, setForm] = useState(VACIO);
  const [errors, setErrors] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(null);

  const set = (k, v) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: '' }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    const errs = validar(form);
    setErrors(errs);
    const primero = ['type', 'name', 'email', 'phone', 'onBehalfOf', 'details'].find((k) => errs[k]);
    if (primero) {
      document.getElementById(`arco-${primero}`)?.focus();
      return;
    }
    setEnviando(true);
    try {
      await submitArcoRequest(form);
      setEnviada({ vence: sumarDiasHabiles(new Date(), PLAZO_DIAS_HABILES), correo: form.email.trim() });
    } catch (err) {
      setErrors({ submit: err?.code === 'P0429' ? err.message : 'No pudimos enviar tu solicitud. Inténtalo de nuevo o escríbenos por correo.' });
    } finally {
      setEnviando(false);
    }
  };

  if (enviada) {
    return (
      <div className="bk bk-done">
        <h1 className="bk-title">Recibimos tu solicitud</h1>
        <p className="pub-lead" style={{ margin: '0 auto 16px' }}>
          Te responderemos a <strong>{enviada.correo}</strong> a más tardar el{' '}
          <strong>{enviada.vence.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>.
          Antes te pediremos una identificación para confirmar que eres el titular o su representante.
        </p>
        <div className="pub-actions"><Link className="pub-btn pub-btn-ghost" to="/privacidad">Volver al aviso de privacidad</Link></div>
      </div>
    );
  }

  return (
    <div className="bk">
      <h1 className="bk-title">Tus derechos sobre tus datos</h1>
      <p className="bk-intro" style={{ marginTop: 0 }}>
        Puedes pedir acceso, corrección o cancelación de tus datos, oponerte a su uso o revocar tu consentimiento.
        Respondemos en un máximo de {PLAZO_DIAS_HABILES} días hábiles.
      </p>

      <form className="bk-form" onSubmit={enviar} noValidate>
        <fieldset className="bk-fieldset">
          <legend className="pub-label" id="arco-type" tabIndex={-1}>¿Qué quieres hacer?</legend>
          <ul className="bk-options">
            {TIPOS_ARCO.map((t) => (
              <li key={t.id}>
                <button type="button" className="bk-option" aria-pressed={form.type === t.id} onClick={() => set('type', t.id)}>
                  <span className="bk-option-name" style={{ fontSize: 19 }}>{t.nombre}</span>
                  <span />
                  <span className="bk-option-meta">{t.explica}</span>
                </button>
              </li>
            ))}
          </ul>
          {errors.type && <span className="pub-error">{errors.type}</span>}
        </fieldset>

        <fieldset className="bk-fieldset">
          <legend className="pub-label">¿Son tus datos?</legend>
          <div className="pub-choice-row">
            {[['titular', 'Sí, son míos'], ['madre_padre_tutor', 'Son de mi hijo o hija'], ['representante', 'Represento a alguien']].map(([id, txt]) => (
              <button key={id} type="button" className="pub-choice" aria-pressed={form.relationship === id} onClick={() => set('relationship', id)}>{txt}</button>
            ))}
          </div>
        </fieldset>

        {form.relationship !== 'titular' && (
          <Campo id="arco-onBehalfOf" label="Nombre de la persona titular de los datos" value={form.onBehalfOf} error={errors.onBehalfOf} onChange={(v) => set('onBehalfOf', v)} />
        )}
        <Campo id="arco-name" label="Tu nombre completo" value={form.name} error={errors.name} onChange={(v) => set('name', v)} autoComplete="name" />
        <Campo id="arco-email" label="Correo electrónico" type="email" value={form.email} error={errors.email} onChange={(v) => set('email', v)} autoComplete="email" hint="Ahí te respondemos." />
        <Campo id="arco-phone" label="Teléfono (opcional)" type="tel" value={form.phone} error={errors.phone} onChange={(v) => set('phone', v)} autoComplete="tel" placeholder="81 1234 5678" />

        <div className="pub-field">
          <label className="pub-label" htmlFor="arco-details">Cuéntanos qué necesitas</label>
          <span id="arco-details-hint" className="pub-hint">Por ejemplo, qué dato corregir. No escribas información clínica: eso se ve en persona.</span>
          <textarea id="arco-details" className="pub-input" rows={5} maxLength={1500} value={form.details}
            onChange={(e) => set('details', e.target.value)} aria-invalid={Boolean(errors.details)}
            aria-describedby={`arco-details-hint${errors.details ? ' arco-details-error' : ''}`} />
          {errors.details && <span id="arco-details-error" className="pub-error">{errors.details}</span>}
        </div>

        {errors.submit && <p role="alert" className="pub-error" style={{ margin: 0 }}>{errors.submit}</p>}
        <button type="submit" className="pub-btn pub-btn-primary bk-submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  );
}

function Campo({ id, label, value, onChange, type = 'text', error, hint, autoComplete, placeholder }) {
  const descr = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="pub-field">
      <label className="pub-label" htmlFor={id}>{label}</label>
      {hint && <span id={`${id}-hint`} className="pub-hint">{hint}</span>}
      <input id={id} className="pub-input" type={type} inputMode={type === 'email' ? 'email' : type === 'tel' ? 'tel' : undefined} spellCheck={type === 'email' ? false : undefined} value={value} placeholder={placeholder} autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} aria-describedby={descr} />
      {error && <span id={`${id}-error`} className="pub-error">{error}</span>}
    </div>
  );
}
