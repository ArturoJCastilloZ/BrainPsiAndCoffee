import React, { useCallback, useEffect, useState } from 'react';
import { C } from '../theme';
import { loadPatientConsents, registerClinicalConsent, revokeConsent } from '../api/supabaseData';
import { CONSENTIMIENTO_CLINICO } from '../legal/avisoPrivacidad.mjs';
import { useConfirm } from '../components/ConfirmDialog';

const fechaHora = (iso) => new Date(iso).toLocaleString('es-MX', {
  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// Consentimiento informado del paciente (0039).
//
// El documento se firma en consulta (papel o formato digital); aqui se
// REGISTRA que se obtuvo: version del formato, quien firmo y como. La
// base sella quien lo registro y cuando, y no deja borrarlo ni editarlo:
// solo revocarlo, una vez. Sin consentimiento vigente la pantalla lo dice
// arriba del expediente — no bloquea, porque la primera nota puede ser
// justamente la de esa sesion.
export default function ConsentimientoClinico({
  patient, cargar = loadPatientConsents, registrar = registerClinicalConsent, revocar = revokeConsent,
}) {
  const [consentimientos, setConsentimientos] = useState(null);
  const [error, setError] = useState('');
  const [formulario, setFormulario] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const { confirmar, dialogo } = useConfirm();

  const recargar = useCallback(async () => {
    if (!patient?.id) return;
    setError('');
    try {
      const todos = await cargar(patient.id);
      setConsentimientos(todos.filter((c) => c.type === 'clinical_treatment'));
    } catch {
      setConsentimientos([]);
      setError('No se pudo leer el consentimiento de este paciente.');
    }
  }, [cargar, patient?.id]);

  useEffect(() => { setConsentimientos(null); setFormulario(null); recargar(); }, [recargar]);

  if (!patient) return null;
  const vigente = (consentimientos || []).find((c) => !c.revokedAt);
  const historial = (consentimientos || []).filter((c) => c !== vigente);

  const abrirFormulario = () => setFormulario({
    modalidad: 'papel',
    firmante: patient.isMinor ? (patient.guardianName || '') : patient.name,
    parentesco: patient.isMinor ? 'madre_padre_tutor' : 'titular',
  });

  const guardar = async (e) => {
    e.preventDefault();
    if (formulario.firmante.trim().length < 2) {
      setError('Escribe el nombre de quien firmó.');
      return;
    }
    setOcupado(true);
    setError('');
    try {
      await registrar({ patientId: patient.id, email: patient.email, ...formulario });
      setFormulario(null);
      await recargar();
    } catch (err) {
      setError(err?.message || 'No se pudo registrar el consentimiento.');
    } finally {
      setOcupado(false);
    }
  };

  const registrarRevocacion = async () => {
    const ok = await confirmar({
      titulo: 'Registrar revocación',
      mensaje: 'Registra que el paciente (o su adulto responsable) retiró su consentimiento. No se puede deshacer: si vuelve a dar su consentimiento, se registra uno nuevo.',
      aceptar: 'Registrar revocación',
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await revocar(vigente.id);
      await recargar();
    } catch (err) {
      setError(err?.message || 'No se pudo registrar la revocación.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section aria-labelledby="ci-titulo" style={{
      border: `1px solid ${vigente || consentimientos === null ? 'var(--admin-border)' : C.caramel}`,
      background: vigente || consentimientos === null ? 'transparent' : C.caramelLightAlpha30,
      borderRadius: 12, padding: '14px 16px',
    }}>
      {dialogo}
      <h3 id="ci-titulo" style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--admin-text)' }}>Consentimiento informado</h3>

      {consentimientos === null && <p style={texto}>Revisando…</p>}

      {consentimientos !== null && vigente && (
        <>
          <p style={texto}>
            Registrado el {fechaHora(vigente.acceptedAt)} · firmó {vigente.evidence.firmante || 'el paciente'}
            {vigente.evidence.parentesco === 'madre_padre_tutor' ? ' (madre, padre o tutor)' : ''}
            {' · '}{vigente.evidence.modalidad === 'digital' ? 'formato digital' : 'en papel'} · formato {vigente.version}
          </p>
          <button type="button" style={botonSecundario} disabled={ocupado} onClick={registrarRevocacion}>Registrar revocación</button>
        </>
      )}

      {consentimientos !== null && !vigente && !formulario && (
        <>
          <p style={texto}>
            Sin consentimiento vigente. Obtenlo por escrito en la primera sesión: el expediente contiene datos de salud.
            {patient.isMinor ? ' Como es menor de edad, lo firma su madre, padre o tutor.' : ''}
          </p>
          <button type="button" style={boton} onClick={abrirFormulario}>Registrar consentimiento</button>
        </>
      )}

      {formulario && (
        <form onSubmit={guardar} style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 14 }}>
            <legend style={{ fontWeight: 600, marginBottom: 6, color: 'var(--admin-text)' }}>¿Cómo se firmó?</legend>
            {[['papel', 'En papel'], ['digital', 'Formato digital']].map(([id, txt]) => (
              <label key={id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: 'var(--admin-text)' }}>
                <input type="radio" name="ci-modalidad" checked={formulario.modalidad === id} onChange={() => setFormulario({ ...formulario, modalidad: id })} /> {txt}
              </label>
            ))}
          </fieldset>
          <label style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>
            Nombre de quien firmó
            <input className="admin-input" value={formulario.firmante} onChange={(e) => setFormulario({ ...formulario, firmante: e.target.value })}
              style={{ padding: '10px 12px', borderRadius: 10, fontSize: 15, fontFamily: 'inherit' }} />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 600, color: 'var(--admin-text)' }}>
            Firmó como
            <select className="admin-input" value={formulario.parentesco} onChange={(e) => setFormulario({ ...formulario, parentesco: e.target.value })}
              style={{ padding: '10px 12px', borderRadius: 10, fontSize: 15, fontFamily: 'inherit' }}>
              <option value="titular">El propio paciente</option>
              <option value="madre_padre_tutor">Madre, padre o tutor</option>
              <option value="representante">Representante legal</option>
            </select>
          </label>
          <p style={{ ...texto, fontSize: 13, margin: 0 }}>Formato {CONSENTIMIENTO_CLINICO.version}. La fecha y quién lo registra los pone el sistema.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={boton} disabled={ocupado}>{ocupado ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" style={botonSecundario} onClick={() => setFormulario(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {error && <p role="alert" style={{ ...texto, color: C.rustText, fontWeight: 600 }}>{error}</p>}

      {historial.length > 0 && (
        <details style={{ marginTop: 10, fontSize: 13, color: 'var(--admin-muted)' }}>
          <summary style={{ cursor: 'pointer' }}>Historial ({historial.length})</summary>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {historial.map((c) => (
              <li key={c.id}>Registrado el {fechaHora(c.acceptedAt)}, revocado el {fechaHora(c.revokedAt)} · formato {c.version}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const texto = { fontSize: 14, lineHeight: 1.5, color: 'var(--admin-text)', margin: '6px 0 10px' };
const boton = {
  background: 'var(--admin-accent)', color: 'var(--admin-on-accent)', border: 'none', borderRadius: 10,
  padding: '8px 14px', minHeight: 40, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const botonSecundario = {
  background: 'transparent', color: 'var(--admin-text)', border: '1px solid var(--admin-border-interactive)', borderRadius: 10,
  padding: '8px 14px', minHeight: 40, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
