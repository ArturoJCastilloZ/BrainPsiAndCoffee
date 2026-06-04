import React, { useState } from 'react';
import { Eye, EyeOff, Lock, LogIn, User } from 'lucide-react';
import { C } from '../theme';
import BrandMark from './BrandMark';
import { authService } from '../auth/authService';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login({ onLogin, onCancel, theme, toggleTheme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isDark = theme === 'dark';
  const identifier = username.trim();
  const isEmailIdentifier = identifier.includes('@');
  const passwordMissing = password.length === 0;
  const emailMissing = identifier.length === 0;
  const emailInvalid = emailTouched && isEmailIdentifier && identifier.length > 0 && !emailPattern.test(identifier);
  const canSubmit = identifier.length > 0 && !emailInvalid && password.length > 0 && !loading;

  const submit = async (event) => {
    event.preventDefault();
    setEmailTouched(true);
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
      onLogin(session);
    } catch (error) {
      setError(error.message);
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
      <form onSubmit={submit} style={{
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
            <div style={{ fontSize: 12, color: isDark ? C.sageLight : C.brownMid }}>Acceso administrativo</div>
          </div>
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>CORREO O NOMBRE</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${emailMissing || emailInvalid ? C.rust : (isDark ? '#2A332A' : C.sagePale)}`, marginBottom: emailMissing || emailInvalid ? 6 : 14, background: isDark ? '#0F1410' : C.ivory }}>
          <User size={16} />
          <input value={username} onChange={e => { setUsername(e.target.value); if (error === 'Ingresa un correo válido.') setError(''); }} onBlur={() => setEmailTouched(true)} type="text" autoComplete="username" aria-invalid={emailInvalid} required style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
        </div>
        {emailMissing && <div style={{ color: C.rust, fontSize: 11, fontWeight: 700, margin: '0 0 12px' }}>Campo requerido</div>}
        {emailInvalid && <div style={{ color: C.rust, fontSize: 11, fontWeight: 600, margin: '0 0 12px' }}>Ingresa un correo válido.</div>}

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>CONTRASEÑA</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${passwordMissing ? C.rust : (isDark ? '#2A332A' : C.sagePale)}`, marginBottom: passwordMissing ? 6 : 14, background: isDark ? '#0F1410' : C.ivory }}>
          <Lock size={16} />
          <input value={password} onChange={e => { setPassword(e.target.value); if (error === 'Ingresa tu contraseña.') setError(''); }} type={showPassword ? 'text' : 'password'} autoComplete="current-password" autoFocus required style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
          <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={{ background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {passwordMissing && <div style={{ color: C.rust, fontSize: 11, fontWeight: 700, margin: '0 0 12px' }}>Campo requerido</div>}

        {error && <div style={{ color: C.rust, fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{error}</div>}

        <button type="submit" disabled={!canSubmit} style={{ width: '100%', border: 'none', borderRadius: 14, padding: 14, background: 'var(--bp-primary)', color: 'var(--bp-primary-contrast)', fontWeight: 700, cursor: loading ? 'wait' : (!canSubmit ? 'not-allowed' : 'pointer'), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit', opacity: canSubmit ? 1 : 0.65 }}>
          <LogIn size={16} /> {loading ? 'Entrando...' : 'Entrar al admin'}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 14 }}>
          <button type="button" onClick={onCancel} style={{ background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>Volver a la app</button>
          <button type="button" onClick={toggleTheme} style={{ background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
            Modo {isDark ? 'claro' : 'oscuro'}
          </button>
        </div>
      </form>
    </div>
  );
}
