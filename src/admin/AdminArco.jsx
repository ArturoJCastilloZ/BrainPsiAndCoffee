import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { C } from '../theme';
import { loadArcoRequests, updateArcoRequest } from '../api/supabaseData';
import { CERRADOS, ESTADOS_ARCO, TIPOS_ARCO, diasHabilesRestantes } from '../arcoPlazos.mjs';

const nombreTipo = (id) => TIPOS_ARCO.find((t) => t.id === id)?.nombre || id;
const RELACION = { titular: 'Titular', madre_padre_tutor: 'Madre, padre o tutor', representante: 'Representante' };
const fecha = (iso) => new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

// Solicitudes ARCO (0039). Lo urgente arriba: las abiertas, por
// vencimiento. Cerrar exige escribir que se respondio — la base lo exige
// tambien — porque esa respuesta es la evidencia ante la autoridad.
export default function AdminArco({ cargar = loadArcoRequests, actualizar = updateArcoRequest }) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [estado, setEstado] = useState('cargando');
  const [error, setError] = useState('');
  const [verCerradas, setVerCerradas] = useState(false);

  const recargar = useCallback(async () => {
    setEstado('cargando');
    try {
      setSolicitudes(await cargar());
      setEstado('listo');
    } catch {
      setEstado('error');
    }
  }, [cargar]);

  useEffect(() => { recargar(); }, [recargar]);

  const abiertas = useMemo(() => solicitudes.filter((s) => !CERRADOS.has(s.status))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn)), [solicitudes]);
  const cerradas = useMemo(() => solicitudes.filter((s) => CERRADOS.has(s.status)), [solicitudes]);

  const guardar = async (id, cambios) => {
    setError('');
    try {
      const nueva = await actualizar(id, cambios);
      if (nueva) setSolicitudes((prev) => prev.map((s) => (s.id === id ? nueva : s)));
      return true;
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el cambio.');
      return false;
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: 0 }}>Solicitudes ARCO</h1>
        <p style={{ fontSize: 15, color: 'var(--admin-muted)', margin: '6px 0 0', maxWidth: '65ch' }}>
          Acceso, rectificación, cancelación, oposición y revocación de datos personales. Antes de responder,
          confirma la identidad de quien pide. El plazo cuenta en días hábiles.
        </p>
      </div>

      {error && <p role="alert" style={{ color: C.rustText, fontWeight: 600 }}>{error}</p>}
      {estado === 'cargando' && <p style={{ color: 'var(--admin-muted)' }}>Cargando solicitudes…</p>}
      {estado === 'error' && (
        <p role="alert" style={{ color: C.rustText }}>
          No se pudieron cargar las solicitudes. <button type="button" onClick={recargar} style={botonTexto}>Reintentar</button>
        </p>
      )}

      {estado === 'listo' && (
        <>
          <h2 style={subtitulo}>Abiertas ({abiertas.length})</h2>
          {abiertas.length === 0 && <p style={{ color: 'var(--admin-muted)' }}>No hay solicitudes pendientes.</p>}
          <div style={{ display: 'grid', gap: 12 }}>
            {abiertas.map((s) => <Solicitud key={s.id} s={s} onGuardar={guardar} />)}
          </div>

          {cerradas.length > 0 && (
            <>
              <button type="button" onClick={() => setVerCerradas((v) => !v)} style={{ ...botonTexto, marginTop: 24 }} aria-expanded={verCerradas}>
                {verCerradas ? 'Ocultar' : 'Ver'} cerradas ({cerradas.length})
              </button>
              {verCerradas && (
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  {cerradas.map((s) => <Solicitud key={s.id} s={s} onGuardar={guardar} />)}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Solicitud({ s, onGuardar }) {
  const [respuesta, setRespuesta] = useState('');
  const cerrada = CERRADOS.has(s.status);
  const restantes = diasHabilesRestantes(s.dueOn);
  const vencida = !cerrada && restantes < 0;
  const plazo = cerrada
    ? `Cerrada el ${fecha(s.respondedAt)}`
    : vencida ? `Venció hace ${-restantes} ${-restantes === 1 ? 'día hábil' : 'días hábiles'}`
      : restantes === 0 ? 'Vence hoy' : `Vence en ${restantes} ${restantes === 1 ? 'día hábil' : 'días hábiles'} (${fecha(`${s.dueOn}T12:00:00`)})`;

  const cerrar = async (status) => {
    if (await onGuardar(s.id, { status, responseSummary: respuesta })) setRespuesta('');
  };

  return (
    <article className="admin-card" style={{ borderRadius: 14, padding: 18, borderColor: vencida ? C.rustText : undefined }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontSize: 18, color: 'var(--admin-text)' }}>{nombreTipo(s.type)} · {s.name}</h3>
        <span style={{ fontSize: 14, fontWeight: 700, color: vencida ? C.rustText : 'var(--admin-muted)' }}>{plazo}</span>
      </header>
      <dl style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: '4px 14px', fontSize: 14, margin: '12px 0', color: 'var(--admin-text)' }}>
        <dt style={dt}>Estado</dt><dd style={dd}>{ESTADOS_ARCO[s.status]}</dd>
        <dt style={dt}>Recibida</dt><dd style={dd}>{fecha(s.createdAt)}</dd>
        <dt style={dt}>Contacto</dt><dd style={dd}>{s.email}{s.phone ? ` · ${s.phone}` : ''}</dd>
        <dt style={dt}>Relación</dt><dd style={dd}>{RELACION[s.relationship]}{s.onBehalfOf ? ` de ${s.onBehalfOf}` : ''}</dd>
      </dl>
      <p style={{ whiteSpace: 'pre-wrap', fontSize: 15, lineHeight: 1.55, margin: 0, maxWidth: '65ch', color: 'var(--admin-text)' }}>{s.details}</p>

      {cerrada ? (
        s.responseSummary && <p style={{ marginTop: 12, fontSize: 14, color: 'var(--admin-muted)' }}><strong>Respuesta:</strong> {s.responseSummary}</p>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {s.status !== 'verificando_identidad' && <button type="button" style={botonSecundario} onClick={() => onGuardar(s.id, { status: 'verificando_identidad' })}>Pedí identificación</button>}
            {s.status !== 'en_proceso' && <button type="button" style={botonSecundario} onClick={() => onGuardar(s.id, { status: 'en_proceso' })}>Identidad confirmada, en proceso</button>}
          </div>
          <label style={{ display: 'grid', gap: 6, fontSize: 14, color: 'var(--admin-text)', fontWeight: 600 }}>
            Qué se respondió (queda como evidencia)
            <textarea className="admin-input" rows={3} maxLength={1500} value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
              style={{ padding: '10px 12px', borderRadius: 10, fontFamily: 'inherit', fontSize: 15, resize: 'vertical' }} />
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button type="button" style={botonPrimario} disabled={respuesta.trim().length < 10} onClick={() => cerrar('respondida')}>Cerrar como respondida</button>
            <button type="button" style={botonSecundario} disabled={respuesta.trim().length < 10} onClick={() => cerrar('improcedente')}>Cerrar como improcedente</button>
          </div>
        </div>
      )}
    </article>
  );
}

const subtitulo = { fontSize: 16, color: 'var(--admin-text)', margin: '0 0 12px' };
const dt = { color: 'var(--admin-muted)' };
const dd = { margin: 0, overflowWrap: 'anywhere' };
const botonPrimario = {
  background: 'var(--admin-accent)', color: 'var(--admin-on-accent)', border: 'none', borderRadius: 10,
  padding: '8px 14px', minHeight: 40, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const botonSecundario = {
  background: 'transparent', color: 'var(--admin-text)', border: '1px solid var(--admin-border-interactive)', borderRadius: 10,
  padding: '8px 14px', minHeight: 40, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
const botonTexto = { background: 'none', border: 'none', color: 'var(--admin-accent-text)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, padding: 0, textDecoration: 'underline' };
