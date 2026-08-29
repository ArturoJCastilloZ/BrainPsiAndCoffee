import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { C } from '../theme';
import { listTenantMembers, revokeTenantMember, setTenantMemberRole } from '../api/supabaseData';
import { supabase } from '../api/supabaseClient';
import { useConfirm } from '../components/ConfirmDialog';

const ROLE_OPTIONS = [
  { id: 'owner', label: 'Dueño', help: 'Todo, incluido administrar accesos' },
  { id: 'admin_consultorio', label: 'Admin consultorio', help: 'Citas, servicios, doctores y especialidades' },
  { id: 'admin_cafe', label: 'Admin cafeteria', help: 'Pedidos, menu y promociones' },
  { id: 'barista', label: 'Barista', help: 'Solo pedidos de cafe' },
  { id: 'doctor', label: 'Doctor', help: 'Su agenda y sus notas clinicas' },
];

const roleLabel = (id) => ROLE_OPTIONS.find((r) => r.id === id)?.label || id;

export default function AdminAccess() {
  const [therapists, setTherapists] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('admin_consultorio');
  const [therapistId, setTherapistId] = useState('');
  const { confirmar, dialogo } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMembers(await listTenantMembers());
      // Las fichas de terapeuta de esta clinica, para poder vincular a un
      // doctor con la suya. RLS ya las acota al tenant activo.
      const fichas = await supabase
        .from('therapists')
        .select('id, name')
        .eq('active', true)
        .order('name');
      if (!fichas.error) setTherapists(fichas.data || []);
    } catch (err) {
      // El mensaje viene de la base y ya esta redactado para una persona
      // ("Solo el dueño...", "Es el unico dueño..."). Se muestra tal cual
      // en vez de sustituirlo por uno generico que esconda el motivo.
      setError(err.message || 'No se pudo cargar la lista de accesos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const run = async (accion, exito) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await accion();
      setNotice(exito);
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo completar la operacion.');
    } finally {
      setBusy(false);
    }
  };

  const grant = (event) => {
    event.preventDefault();
    const correo = email.trim();
    if (!correo) return;
    run(
      () => setTenantMemberRole(correo, role, role === 'doctor' ? therapistId : null),
      `${correo} quedo como ${roleLabel(role)}. Tiene que volver a iniciar sesion para que aplique.`,
    ).then(() => setEmail(''));
  };

  // Un doctor sin ficha no puede trabajar, asi que el boton no se ofrece
  // hasta que se elija una.
  const faltaFicha = role === 'doctor' && !therapistId;

  return (
    <div>
      {dialogo}
      <h1 className="font-display" style={{ fontSize: 32, fontWeight: 500, color: 'var(--admin-text)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>
        Accesos
      </h1>
      <p style={{ fontSize: 13, color: 'var(--admin-muted)', marginBottom: 20 }}>
        Quien entra a este consultorio y con que permisos
      </p>

      {error && <Aviso tono="error">{error}</Aviso>}
      {notice && <Aviso tono="ok">{notice}</Aviso>}

      <form onSubmit={grant} style={tarjeta}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <UserPlus size={16} color={C.sageDeep} />
          <strong style={{ fontSize: 13, color: 'var(--admin-text)' }}>Dar acceso</strong>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@ejemplo.mx"
            style={{ ...campo, flex: '1 1 240px' }}
          />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...campo, flex: '0 1 220px' }}>
            {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <button type="submit" disabled={busy || !email.trim() || faltaFicha} style={boton('primary', busy || !email.trim() || faltaFicha)}>
            <KeyRound size={14} /> Asignar
          </button>
        </div>

        {role === 'doctor' && (
          <div style={{ marginTop: 10 }}>
            <select value={therapistId} onChange={(e) => setTherapistId(e.target.value)} style={{ ...campo, width: '100%' }}>
              <option value="">Elige su ficha de terapeuta…</option>
              {therapists.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '6px 0 0' }}>
              {therapists.length
                ? 'Sin ficha vinculada, el doctor no puede crear citas ni ver a sus pacientes.'
                : 'No hay fichas de terapeuta activas. Créala primero en Doctores.'}
            </p>
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '10px 0 0' }}>
          {ROLE_OPTIONS.find((r) => r.id === role)?.help}
        </p>
        {/* Crear cuentas exige la API de administracion de auth, que no se
            expone al navegador: la persona se registra y aqui se le da el rol. */}
        <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '6px 0 0' }}>
          La persona ya debe tener una cuenta. Si aun no se ha registrado, pidele que lo haga y vuelve aqui.
        </p>
      </form>

      <div style={{ ...tarjeta, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={16} color={C.sageDeep} />
            <strong style={{ fontSize: 13, color: 'var(--admin-text)' }}>Con acceso ({members.length})</strong>
          </div>
          <button type="button" onClick={load} disabled={loading} style={boton('ghost', loading)}>
            <RefreshCw size={13} /> Actualizar
          </button>
        </div>

        {loading && <p style={vacio}>Cargando…</p>}
        {!loading && !members.length && !error && <p style={vacio}>Todavia no hay nadie mas con acceso.</p>}

        {!loading && members.map((m) => (
          <div key={m.userId} style={fila}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--admin-text)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {m.email}{m.isSelf && <span style={etiquetaTu}>tu</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--admin-muted)' }}>
                {roleLabel(m.role)}{m.therapistId ? ` · ficha ${m.therapistId}` : ''}
              </div>
            </div>

            {/* Sobre uno mismo no se ofrecen controles: la base los rechaza
                de todos modos, y mostrarlos solo invita a un error. */}
            {!m.isSelf && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <select
                  value={m.role}
                  disabled={busy}
                  onChange={async (e) => {
                    const nuevo = e.target.value;
                    // Pasar a doctor exige elegir ficha: se pregunta aqui
                    // en vez de dejar que la base lo rechace despues, y se
                    // ofrece la lista real en vez de pedir un id escrito.
                    let ficha = null;
                    if (nuevo === 'doctor') {
                      ficha = m.therapistId || await confirmar({
                        titulo: 'Ficha de terapeuta',
                        mensaje: `¿Con qué ficha se vincula ${m.email}? Sin ella no podrá crear citas ni ver a sus pacientes.`,
                        aceptar: 'Vincular',
                        opciones: therapists.map((t) => ({ id: t.id, label: t.name })),
                      });
                      if (!ficha) return;
                    }
                    run(
                      () => setTenantMemberRole(m.email, nuevo, ficha),
                      `${m.email} ahora es ${roleLabel(nuevo)}.`,
                    );
                  }}
                  style={{ ...campo, padding: '6px 8px', fontSize: 12 }}
                >
                  {ROLE_OPTIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    if (!(await confirmar({
                      titulo: 'Quitar acceso',
                      mensaje: `${m.email} dejará de tener acceso a este consultorio. Su cuenta y sus otras clínicas no se tocan.`,
                      aceptar: 'Quitar acceso',
                      destructivo: true,
                    }))) return;
                    run(() => revokeTenantMember(m.userId), `Se le quitó el acceso a ${m.email}.`);
                  }}
                  style={boton('ghost', busy)}
                >
                  <Trash2 size={13} /> Quitar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Aviso({ tono, children }) {
  const esError = tono === 'error';
  return (
    <div style={{
      marginBottom: 14,
      padding: '10px 12px',
      borderRadius: 10,
      fontSize: 13,
      border: '1px solid ' + (esError ? C.rustAlpha40 : 'var(--admin-border)'),
      background: esError ? C.rustAlpha20 : 'var(--admin-surface-soft)',
      color: esError ? C.rust : 'var(--admin-text)',
    }}>
      {children}
    </div>
  );
}

const tarjeta = {
  background: 'var(--admin-surface)',
  border: '1px solid var(--admin-border)',
  borderRadius: 14,
  padding: 16,
};

const fila = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: '10px 0',
  borderTop: '1px solid var(--admin-border)',
  flexWrap: 'wrap',
};

const campo = {
  background: 'var(--admin-surface-soft)',
  border: '1px solid var(--admin-border)',
  borderRadius: 9,
  padding: '8px 10px',
  color: 'var(--admin-text)',
  fontFamily: 'inherit',
  fontSize: 13,
};

const vacio = { fontSize: 13, color: 'var(--admin-muted)', margin: '6px 0 0' };

const etiquetaTu = {
  marginLeft: 6,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
  color: 'var(--admin-muted)',
};

function boton(kind, disabled) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: kind === 'primary' ? C.sageDeep : 'transparent',
    color: kind === 'primary' ? C.ivory : 'var(--admin-accent-text)',
    border: '1px solid ' + (kind === 'primary' ? C.sageDeep : 'var(--admin-border)'),
    padding: '7px 10px',
    borderRadius: 9,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 700,
  };
}
