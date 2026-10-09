import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, Save } from 'lucide-react';
import { C } from '../theme';
import { authService } from '../auth/authService';
import BrandMark from './BrandMark';

export default function SetPassword({ session, onComplete, theme, toggleTheme }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Con la verificacion en dos pasos activa, cambiar la contraseña pide
  // el codigo de la app primero (Supabase exige sesion aal2).
  const [pideCodigo, setPideCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');

  useEffect(() => {
    if (!session) return undefined;
    let vigente = true;
    authService.faltaSegundoFactor().then((falta) => { if (vigente && falta) setPideCodigo(true); }).catch(() => {});
    return () => { vigente = false; };
  }, [session]);

  const isDark = theme === 'dark';
  const passwordMissing = password.length === 0;
  const confirmMissing = confirmPassword.length === 0;
  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsDiffer = confirmPassword.length > 0 && password !== confirmPassword;
  const codigoIncompleto = pideCodigo && codigo.replace(/\s/g, '').length !== 6;
  const canSubmit = Boolean(session) && !passwordMissing && !confirmMissing && !passwordTooShort && !passwordsDiffer && !codigoIncompleto && !loading;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    try {
      if (pideCodigo && await authService.faltaSegundoFactor()) {
        await authService.verificarSegundoFactor(codigo);
      }
      await authService.updatePassword(password);
      setError('');
      onComplete();
    } catch (nextError) {
      // Por si el nivel no se pudo leer al abrir: el error de Supabase
      // tambien lo dice, y entonces se pide el codigo.
      if (nextError.code === 'FALTA_SEGUNDO_FACTOR') {
        setPideCodigo(true);
        setError('Tienes activa la verificación en dos pasos: escribe el código de tu app para guardar la contraseña.');
      } else {
        setError(nextError.message);
      }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <BrandMark size={42} />
          <div>
            <div className="font-display" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>Crear contraseña</div>
            <div style={{ fontSize: 12, color: isDark ? C.sageLight : C.brownMid, marginTop: 4 }}>Acceso para profesionales Brainpsi</div>
          </div>
        </div>

        {!session && (
          <div style={{ color: C.rust, fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
            La invitación no es válida o ya expiró. Solicita una nueva invitación.
          </div>
        )}

        <PasswordField
          label="CONTRASEÑA"
          value={password}
          onChange={setPassword}
          showPassword={showPassword}
          onToggle={() => setShowPassword(!showPassword)}
          invalid={passwordMissing || passwordTooShort}
          isDark={isDark}
        />
        {passwordMissing && <RequiredHint />}
        {passwordTooShort && <Hint>Usa al menos 8 caracteres.</Hint>}

        <PasswordField
          label="CONFIRMAR CONTRASEÑA"
          value={confirmPassword}
          onChange={setConfirmPassword}
          showPassword={showPassword}
          onToggle={() => setShowPassword(!showPassword)}
          invalid={confirmMissing || passwordsDiffer}
          isDark={isDark}
        />
        {confirmMissing && <RequiredHint />}
        {passwordsDiffer && <Hint>Las contraseñas no coinciden.</Hint>}

        {pideCodigo && (
          <>
            <label htmlFor="sp-codigo" style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>CÓDIGO DE VERIFICACIÓN</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${isDark ? '#2A332A' : C.sagePale}`, marginBottom: 6, background: isDark ? '#0F1410' : C.ivory }}>
              <KeyRound size={16} aria-hidden="true" />
              <input id="sp-codigo" value={codigo} onChange={(event) => setCodigo(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7}
                placeholder="123 456" style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit', letterSpacing: 2 }} />
            </div>
            <div style={{ fontSize: 11, color: isDark ? C.sageLight : C.brownMid, margin: '0 0 14px' }}>
              Tienes activa la verificación en dos pasos: escribe los 6 dígitos que muestra tu app de autenticación.
            </div>
          </>
        )}

        {error && <div role="alert" style={{ color: C.rust, fontSize: 12, fontWeight: 600, marginBottom: 14 }}>{error}</div>}

        <button type="submit" disabled={!canSubmit} style={{
          width: '100%',
          border: 'none',
          borderRadius: 14,
          padding: 14,
          background: 'var(--bp-primary)',
          color: 'var(--bp-primary-contrast)',
          fontWeight: 700,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          opacity: canSubmit ? 1 : 0.65,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontFamily: 'inherit'
        }}>
          <Save size={16} /> {loading ? 'Guardando...' : 'Guardar contraseña'}
        </button>

        <button type="button" onClick={toggleTheme} style={{ display: 'block', margin: '14px auto 0', background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}>
          Modo {isDark ? 'claro' : 'oscuro'}
        </button>
      </form>
    </div>
  );
}

function PasswordField({ label, value, onChange, showPassword, onToggle, invalid, isDark }) {
  return (
    <>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 12, border: `1px solid ${invalid ? C.rust : (isDark ? '#2A332A' : C.sagePale)}`, marginBottom: invalid ? 6 : 14, background: isDark ? '#0F1410' : C.ivory }}>
        <Lock size={16} />
        <input value={value} onChange={event => onChange(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" required style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', color: 'inherit', fontFamily: 'inherit' }} />
        <button type="button" onClick={onToggle} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={{ background: 'transparent', border: 'none', color: isDark ? C.sageLight : C.brownMid, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </>
  );
}

function RequiredHint() {
  return <Hint>Campo requerido</Hint>;
}

function Hint({ children }) {
  return <div style={{ color: C.rust, fontSize: 11, fontWeight: 700, margin: '0 0 12px' }}>{children}</div>;
}
