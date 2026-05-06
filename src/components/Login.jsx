import React, { useState } from 'react';
import { Lock, LogIn, User } from 'lucide-react';
import { C } from '../theme';
import BrandMark from './BrandMark';
import { authService } from '../auth/authService';

export default function Login({ onLogin, onCancel, theme, toggleTheme }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const isDark = theme === 'dark';

  const submit = (event) => {
    event.preventDefault();
    try {
      authService.login({ username, password });
      setError('');
      onLogin();
    } catch (error) {
      setError(error.message);
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

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>USUARIO</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${isDark ? '#2A332A' : C.sagePale}`, marginBottom: 14, background: isDark ? '#0F1410' : C.ivory }}>
          <User size={16} />
          <input value={username} onChange={e => setUsername(e.target.value)} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>CONTRASEÑA</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${isDark ? '#2A332A' : C.sagePale}`, marginBottom: 14, background: isDark ? '#0F1410' : C.ivory }}>
          <Lock size={16} />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoFocus style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
        </div>

        {error && <div style={{ color: C.rust, fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{error}</div>}

        <button type="submit" style={{ width: '100%', border: 'none', borderRadius: 14, padding: 14, background: 'var(--bp-primary)', color: 'var(--bp-primary-contrast)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
          <LogIn size={16} /> Entrar al admin
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
