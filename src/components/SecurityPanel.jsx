import React, { useCallback, useEffect, useState } from 'react';
import { authService } from '../auth/authService';
import { clinicalMfaRequired, setClinicalMfa } from '../api/supabaseData';
import { C } from '../theme';

// Verificacion en dos pasos (0039).
//
// La usa cualquiera del personal para SU cuenta. El dueño, ademas, puede
// exigirla a toda la clinica para abrir expedientes; la base lo impone con
// policies restrictivas, asi que esta pantalla solo ayuda a cumplir: no
// hay boton que se salte nada.
//
// modo="exigido": la muestra MfaGate a quien entro solo con contraseña a
// una clinica que la exige. Sin salida mas que verificarse o cerrar sesion.
export default function SecurityPanel({ session, puedeExigir = false, modo = 'ajustes', onListo, onLogout }) {
  const [factores, setFactores] = useState(null);
  const [alta, setAlta] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [exigida, setExigida] = useState(null);
  const verificada = session?.aal === 'aal2';

  const cargar = useCallback(async () => {
    try {
      setFactores(await authService.factoresVerificados());
      if (puedeExigir) setExigida(await clinicalMfaRequired());
    } catch {
      setError('No pudimos leer tu configuración de seguridad. Recarga la página.');
    }
  }, [puedeExigir]);

  useEffect(() => { cargar(); }, [cargar]);

  const accion = async (fn) => {
    setOcupado(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err?.message || 'Algo falló. Inténtalo de nuevo.');
    } finally {
      setOcupado(false);
    }
  };

  const empezarAlta = () => accion(async () => setAlta(await authService.iniciarAltaSegundoFactor()));
  const confirmar = (factorId) => accion(async () => {
    await authService.verificarSegundoFactor(codigo, factorId);
    setAlta(null);
    setCodigo('');
    await cargar();
    onListo?.();
  });
  const desactivar = (factorId) => accion(async () => {
    await authService.desactivarSegundoFactor(factorId);
    await cargar();
  });
  const cambiarExigencia = (valor) => accion(async () => {
    await setClinicalMfa(valor);
    setExigida(valor);
  });

  const tieneFactor = (factores || []).length > 0;
  const codigoValido = /^\d{6}$/.test(codigo.replace(/\s/g, ''));

  const campoCodigo = (onEnviar) => (
    <form onSubmit={(e) => { e.preventDefault(); if (codigoValido) onEnviar(); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
      <label style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>
        Código de 6 dígitos
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7}
          className="admin-input" style={{ padding: '10px 12px', borderRadius: 10, fontSize: 20, letterSpacing: 4, width: 160, fontVariantNumeric: 'tabular-nums' }} />
      </label>
      <button type="submit" disabled={!codigoValido || ocupado} style={boton}>{ocupado ? 'Verificando…' : 'Verificar'}</button>
    </form>
  );

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 className="font-display" style={{ fontSize: 30, fontWeight: 500, color: 'var(--admin-text)', margin: 0 }}>
        {modo === 'exigido' ? 'Tu clínica pide verificación en dos pasos' : 'Seguridad'}
      </h1>
      <p style={{ fontSize: 15, color: 'var(--admin-muted)', margin: '8px 0 20px', lineHeight: 1.55 }}>
        {modo === 'exigido'
          ? 'Para abrir expedientes clínicos necesitas, además de tu contraseña, un código de tu app de autenticación (Google Authenticator, Microsoft Authenticator, la app Contraseñas del iPhone, 1Password…).'
          : 'Con la verificación en dos pasos, alguien que adivine o robe tu contraseña no puede entrar sin tu teléfono.'}
      </p>

      {error && <p role="alert" style={{ color: C.rustText, fontWeight: 600 }}>{error}</p>}
      {factores === null && !error && <p style={{ color: 'var(--admin-muted)' }}>Cargando…</p>}

      {factores !== null && tieneFactor && (
        <section className="admin-card" style={tarjeta}>
          <h2 style={h2}>Verificación en dos pasos: activa</h2>
          {verificada ? (
            <>
              <p style={texto}>Esta sesión ya está verificada con tu código.</p>
              {modo !== 'exigido' && (
                <button type="button" style={botonSecundario} disabled={ocupado} onClick={() => desactivar(factores[0].id)}>Desactivar</button>
              )}
            </>
          ) : (
            <>
              <p style={texto}>Escribe el código que muestra tu app para verificar esta sesión.</p>
              {campoCodigo(() => confirmar(factores[0].id))}
            </>
          )}
        </section>
      )}

      {factores !== null && !tieneFactor && (
        <section className="admin-card" style={tarjeta}>
          <h2 style={h2}>Activar la verificación en dos pasos</h2>
          {!alta ? (
            <>
              <p style={texto}>Necesitas una app de autenticación en tu teléfono. Toma un minuto.</p>
              <button type="button" style={boton} disabled={ocupado} onClick={empezarAlta}>Empezar</button>
            </>
          ) : (
            <ol style={{ ...texto, paddingLeft: 20, display: 'grid', gap: 14 }}>
              <li>
                Escanea este código con tu app.
                <img src={alta.qr} alt="Código QR para tu app de autenticación" width={180} height={180}
                  style={{ display: 'block', marginTop: 10, background: '#fff', padding: 8, borderRadius: 8 }} />
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer' }}>No puedo escanear: escribirlo a mano</summary>
                  <code style={{ display: 'block', marginTop: 6, fontSize: 15, overflowWrap: 'anywhere', userSelect: 'all' }}>{alta.secreto}</code>
                </details>
              </li>
              <li>Escribe el código que aparece en la app.{campoCodigo(() => confirmar(alta.factorId))}</li>
            </ol>
          )}
        </section>
      )}

      {puedeExigir && modo !== 'exigido' && exigida !== null && (
        <section className="admin-card" style={tarjeta}>
          <h2 style={h2}>Exigirla para abrir expedientes</h2>
          <p style={texto}>
            {exigida
              ? 'Activo: quien abra expedientes clínicos (dueño, administración del consultorio y especialistas) debe entrar con su código.'
              : 'Cuando la actives, quien entre solo con contraseña no podrá ver pacientes ni notas hasta verificarse. Avisa antes a tu equipo.'}
          </p>
          {exigida ? (
            <button type="button" style={botonSecundario} disabled={ocupado} onClick={() => cambiarExigencia(false)}>Dejar de exigirla</button>
          ) : (
            <>
              <button type="button" style={boton} disabled={ocupado || !verificada} onClick={() => cambiarExigencia(true)}>Exigirla a la clínica</button>
              {!verificada && <p style={{ ...texto, fontSize: 14, marginTop: 8 }}>Primero activa la tuya y verifica esta sesión: así no te quedas fuera.</p>}
            </>
          )}
        </section>
      )}

      {modo === 'exigido' && onLogout && (
        <button type="button" style={{ ...botonSecundario, marginTop: 16 }} onClick={onLogout}>Cerrar sesión</button>
      )}
    </div>
  );
}

const tarjeta = { borderRadius: 14, padding: 18, marginBottom: 14 };
const h2 = { fontSize: 18, margin: '0 0 8px', color: 'var(--admin-text)' };
const texto = { fontSize: 15, lineHeight: 1.55, color: 'var(--admin-text)', margin: '0 0 12px' };
const boton = {
  background: 'var(--admin-accent)', color: 'var(--admin-on-accent)', border: 'none', borderRadius: 10,
  padding: '8px 16px', minHeight: 40, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const botonSecundario = {
  background: 'transparent', color: 'var(--admin-text)', border: '1px solid var(--admin-border-interactive)', borderRadius: 10,
  padding: '8px 16px', minHeight: 40, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
