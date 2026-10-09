import React, { useEffect, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Lock, LogIn, Mail, User } from 'lucide-react';
import { C } from '../theme';
import BrandMark from './BrandMark';
import { authService } from '../auth/authService';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 11px estaba por debajo del piso de 12px para texto de cuerpo, y C.rust
// sobre cream daba 3.21:1 — el mensaje de error era el texto menos legible
// de la pantalla, justo al reves de lo que conviene. C.rustText da 4.89:1.
const errorTextStyle = { color: C.rustText, fontSize: 13, fontWeight: 600, lineHeight: 1.4, margin: '0 0 12px' };

export default function Login({ onLogin, onCancel, theme, toggleTheme }) {
  // supabase-js se carga bajo demanda: se pide al abrir el login, mientras
  // la persona escribe, para que entrar no espere la descarga.
  useEffect(() => { authService.precargar(); }, []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  // El aviso de "Campo requerido" no puede depender solo de que el campo
  // este vacio: al montar lo estan los dos, y la pantalla abria con ambos
  // en rojo sin que nadie hubiera escrito nada. Un error que ya estaba ahi
  // antes de equivocarte no informa, y ensena a ignorar los errores.
  const [submitted, setSubmitted] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  // Segundo paso (0039): quien activo la verificacion en dos pasos escribe
  // el codigo de su app despues de la contraseña.
  const [codigo, setCodigo] = useState('');
  const codigoValido = /^\d{6}$/.test(codigo.replace(/\s/g, ''));

  const isDark = theme === 'dark';
  const identifier = username.trim();
  const isEmailIdentifier = identifier.includes('@');
  const passwordMissing = (submitted || passwordTouched) && password.length === 0;
  const emailMissing = (submitted || emailTouched) && identifier.length === 0;
  const emailInvalid = emailTouched && isEmailIdentifier && identifier.length > 0 && !emailPattern.test(identifier);
  const canSubmit = identifier.length > 0 && !emailInvalid && password.length > 0 && !loading;
  const resetIdentifier = resetEmail.trim();
  const resetInvalid = resetIdentifier.length > 0 && !emailPattern.test(resetIdentifier);
  const canReset = resetIdentifier.length > 0 && !resetInvalid && !loading;

  const submit = async (event) => {
    event.preventDefault();
    setSubmitted(true);
    setEmailTouched(true);
    setPasswordTouched(true);
    if (isEmailIdentifier && !emailPattern.test(identifier)) {
      setError('Ingresa un correo válido.');
      return;
    }
    if (!password) {
      setError('Ingresa tu contraseña.');
      return;
    }

      setLoading(true);
    try {
      const session = await authService.login({ username: identifier, password });
      setError('');
      if (session?.requiereSegundoFactor) {
        setMode('mfa');
        return;
      }
      onLogin(session);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const submitCodigo = async (event) => {
    event.preventDefault();
    if (!codigoValido || loading) return;
    setLoading(true);
    try {
      const session = await authService.verificarSegundoFactor(codigo);
      setError('');
      onLogin(session);
    } catch (err) {
      setError(err.message);
      setCodigo('');
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (event) => {
    event.preventDefault();
    if (!canReset) return;

    setLoading(true);
    try {
      await authService.requestPasswordReset(resetIdentifier);
      setError('');
      setResetSent(true);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 20,
      background: isDark ? '#0F1410' : C.ivory,
      color: isDark ? C.cream : C.brown,
      boxSizing: 'border-box'
    }}>
      <form onSubmit={mode === 'login' ? submit : mode === 'mfa' ? submitCodigo : submitReset} style={{
        width: '100%',
        maxWidth: 420,
        background: isDark ? '#1A2118' : C.creamLight,
        border: `1px solid ${isDark ? '#2A332A' : C.sagePale}`,
        borderRadius: 22,
        padding: 26,
        boxShadow: '0 24px 70px rgba(0,0,0,0.18)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <BrandMark size={42} />
          <div>
            <div className="font-display" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>Brainpsi</div>
            <div style={{ fontSize: 12, color: isDark ? C.sageLight : C.brownMid }}>{mode === 'login' ? 'Acceso administrativo' : mode === 'mfa' ? 'Verificación en dos pasos' : 'Recuperación de acceso'}</div>
          </div>
        </div>

        {mode === 'mfa' ? (
          <>
            <p style={{ margin: '0 0 16px', color: isDark ? C.cream : C.brownMid, fontSize: 14, lineHeight: 1.5 }}>
              Abre tu app de autenticación y escribe el código de 6 dígitos de Brainpsi.
            </p>
            <label htmlFor="login-codigo" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Código</label>
            <input id="login-codigo" value={codigo} onChange={(e) => { setCodigo(e.target.value); setError(''); }}
              inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: `1px solid ${isDark ? '#2A332A' : C.sagePale}`, background: isDark ? '#0F1410' : C.ivory, color: 'inherit', fontFamily: 'inherit', fontSize: 24, letterSpacing: 6, fontVariantNumeric: 'tabular-nums', marginBottom: 14 }} />
          </>
        ) : mode === 'reset' ? (
          <>
            <p style={{ margin: '0 0 16px', color: isDark ? C.cream : C.brownMid, fontSize: 13, lineHeight: 1.5 }}>
              Ingresa tu correo. Si pertenece a un usuario autorizado, recibirás un enlace para crear una nueva contraseña.
            </p>
            <label htmlFor="reset-correo" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Correo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${resetInvalid ? C.rust : (isDark ? '#2A332A' : C.sagePale)}`, marginBottom: resetInvalid ? 6 : 14, background: isDark ? '#0F1410' : C.ivory }}>
              <Mail size={16} />
              <input id="reset-correo" value={resetEmail} onChange={event => { setResetEmail(event.target.value); setResetSent(false); setError(''); }} type="email" autoComplete="email" aria-invalid={resetInvalid} aria-describedby={resetInvalid ? 'reset-correo-error' : undefined} required style={{ flex: 1, border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
            </div>
            {resetInvalid && <div id="reset-correo-error" role="alert" style={errorTextStyle}>Ese correo no tiene un formato válido.</div>}
            {resetSent && (
              <div style={{ color: isDark ? C.sageLight : C.sageDark, background: isDark ? '#0F1410' : C.ivory, border: `1px solid ${isDark ? '#2A332A' : C.sagePale}`, borderRadius: 12, padding: 12, fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
                Revisa tu correo para continuar con la recuperación.
              </div>
            )}
          </>
        ) : (
          <>
        <label htmlFor="login-identificador" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Correo o nombre</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${emailMissing || emailInvalid ? C.rust : (isDark ? '#2A332A' : C.sagePale)}`, marginBottom: emailMissing || emailInvalid ? 6 : 14, background: isDark ? '#0F1410' : C.ivory }}>
          <User size={16} />
          <input id="login-identificador" value={username} onChange={e => { setUsername(e.target.value); if (error === 'Ingresa un correo válido.') setError(''); }} onBlur={() => setEmailTouched(true)} type="text" autoComplete="username" autoFocus aria-invalid={emailMissing || emailInvalid} aria-describedby={emailMissing ? 'login-identificador-error' : (emailInvalid ? 'login-identificador-formato' : undefined)} required style={{ flex: 1, border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
        </div>
        {emailMissing && <div id="login-identificador-error" role="alert" style={errorTextStyle}>Escribe tu correo o tu nombre de usuario.</div>}
        {emailInvalid && <div id="login-identificador-formato" role="alert" style={errorTextStyle}>Ese correo no tiene un formato válido.</div>}

        <label htmlFor="login-password" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Contraseña</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${passwordMissing ? C.rust : (isDark ? '#2A332A' : C.sagePale)}`, marginBottom: passwordMissing ? 6 : 14, background: isDark ? '#0F1410' : C.ivory }}>
          <Lock size={16} />
          <input id="login-password" value={password} onChange={e => { setPassword(e.target.value); if (error === 'Ingresa tu contraseña.') setError(''); }} onBlur={() => setPasswordTouched(true)} type={showPassword ? 'text' : 'password'} autoComplete="current-password" aria-invalid={passwordMissing} aria-describedby={passwordMissing ? 'login-password-error' : undefined} required style={{ flex: 1, border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
          <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={{ background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, margin: '-12px -8px -12px 0', flexShrink: 0 }}>
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {passwordMissing && <div id="login-password-error" role="alert" style={errorTextStyle}>Escribe tu contraseña.</div>}
          </>
        )}

        {error && <div role="alert" style={{ color: C.rustText, fontSize: 13, fontWeight: 600, marginBottom: 14, lineHeight: 1.45 }}>{error}</div>}

        {(() => {
          const habilitado = mode === 'login' ? canSubmit : mode === 'mfa' ? codigoValido && !loading : canReset;
          const texto = mode === 'login'
            ? (loading ? 'Entrando…' : 'Entrar al admin')
            : mode === 'mfa' ? (loading ? 'Verificando…' : 'Verificar y entrar')
              : (loading ? 'Enviando…' : 'Enviar enlace');
          return (
            <button type="submit" disabled={!habilitado} style={{ width: '100%', border: 'none', borderRadius: 14, padding: 14, background: 'var(--bp-primary)', color: 'var(--bp-primary-contrast)', fontWeight: 700, cursor: loading ? 'wait' : (habilitado ? 'pointer' : 'not-allowed'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', opacity: habilitado ? 1 : 0.65 }}>
              {mode === 'reset' ? <Mail size={16} /> : <LogIn size={16} />} {texto}
            </button>
          );
        })()}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
          {mode === 'login' ? (
            <button type="button" onClick={onCancel} style={{ background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, minHeight: 44, padding: '0 8px' }}>Volver a la app</button>
          ) : mode === 'mfa' ? (
            // Volver cierra la sesion a medias (solo contraseña).
            <button type="button" onClick={async () => { await authService.logout('mfa-cancelado'); setMode('login'); setCodigo(''); setError(''); }} style={{ background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, minHeight: 44, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={13} /> Usar otra cuenta</button>
          ) : (
            <button type="button" onClick={() => { setMode('login'); setError(''); setResetSent(false); }} style={{ background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, minHeight: 44, padding: '0 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={13} /> Volver</button>
          )}
          <button type="button" onClick={toggleTheme} style={{ background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, minHeight: 44, padding: '0 8px' }}>
            Modo {isDark ? 'claro' : 'oscuro'}
          </button>
        </div>
        {mode === 'login' && (
          <button type="button" onClick={() => { setMode('reset'); setResetEmail(isEmailIdentifier ? identifier : ''); setError(''); }} style={{ display: 'block', width: '100%', marginTop: 6, background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, minHeight: 44 }}>
            Recuperar contraseña
          </button>
        )}
      </form>
    </div>
  );
}
