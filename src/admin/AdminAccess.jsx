import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff, Trash2, UserPlus } from 'lucide-react';
import { C } from '../theme';
// setTenantMemberRole faltaba: cambiar el rol de un miembro fallaba siempre
// con un ReferenceError (lo encontro el linter, 2026-10-09).
import { listTenantMembers, revokeTenantMember, inviteStaff, generateTempPassword, resetStaffMfa, setTenantMemberRole } from '../api/supabaseData';
import { getSupabase } from '../api/supabaseClient';
import { useConfirm } from '../components/ConfirmDialog';
import TempPasswordPanel from './TempPasswordPanel';

const ROLE_OPTIONS = [
  { id: 'owner', label: 'Dueño', help: 'Todo, incluido administrar accesos' },
  { id: 'admin_consultorio', label: 'Admin consultorio', help: 'Citas, servicios, especialistas y especialidades' },
  { id: 'admin_cafe', label: 'Admin cafeteria', help: 'Pedidos, menu y promociones' },
  { id: 'barista', label: 'Barista', help: 'Solo pedidos de cafe' },
  { id: 'doctor', label: 'Especialista', help: 'Su agenda y sus notas clinicas' },
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
  // Como entra la primera vez quien no tiene cuenta: por correo (normal) o
  // con contraseña temporal entregada en mano (plan B).
  const [metodo, setMetodo] = useState('correo');
  // La contraseña temporal viaja UNA vez, en la respuesta del alta. No se
  // guarda en ningun sitio ni se puede volver a consultar: si se pierde,
  // se regenera dando de alta otra vez.
  const [temporal, setTemporal] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const { confirmar, dialogo } = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMembers(await listTenantMembers());
      // Las fichas de terapeuta de esta clinica, para poder vincular a un
      // doctor con la suya. RLS ya las acota al tenant activo.
      const supabase = await getSupabase();
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

  // Un solo boton para los dos casos, porque para el dueño es una sola
  // cosa: "dale acceso a esta persona". Quien decide es la funcion:
  //
  //   sin cuenta  -> la crea y le manda un correo para crear su
  //                  contraseña, o (plan B) le genera una temporal que se
  //                  muestra aqui una vez.
  //   con cuenta  -> la INVITA (0032) y no le toca nada hasta que acepte.
  const grant = async (event) => {
    event.preventDefault();
    const correo = email.trim();
    if (!correo) return;

    setBusy(true);
    setError('');
    setNotice('');
    setTemporal(null);
    try {
      const r = await inviteStaff(correo, role, role === 'doctor' ? therapistId : null, metodo);
      if (r?.estado === 'creado') {
        setTemporal({ email: r.email, clave: r.temporal, caduca: r.caduca });
        setCopiado(false);
      } else if (r?.estado === 'correo') {
        setNotice(`Le mandamos a ${correo} un correo para crear su contraseña. Si no le llega en unos minutos, que revise spam; si aun asi no aparece, usa "Generar nueva contraseña temporal" en su fila.`);
      } else {
        setNotice(`${correo} ya tenia cuenta, asi que se le envio una invitacion. Entra en vigor cuando la acepte.`);
      }
      setEmail('');
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo dar de alta al usuario.');
    } finally {
      setBusy(false);
    }
  };

  // Solo para quien esta clinica creo y todavia no ha entrado
  // (m.puedeRegenerarTemporal, misma regla que la Edge Function). A
  // cualquier otro, reescribirle la contraseña seria entrar como esa
  // persona: es como se podia tomar la cuenta de un especialista.
  const generarTemporal = async (correo) => {
    const ok = await confirmar({
      titulo: 'Generar contraseña temporal',
      mensaje: `${correo} todavia no ha entrado. Se le genera una contraseña temporal nueva y la anterior deja de servir. Tendra que cambiarla al entrar. Entregasela en persona.`,
      aceptar: 'Generar',
      destructivo: true,
    });
    if (!ok) return;

    setBusy(true);
    setError('');
    setNotice('');
    setTemporal(null);
    try {
      const r = await generateTempPassword(correo);
      setTemporal({ email: r.email, clave: r.temporal, caduca: r.caduca });
      setCopiado(false);
      await load();
    } catch (err) {
      setError(err.message || 'No se pudo generar la contraseña temporal.');
    } finally {
      setBusy(false);
    }
  };

  // Para quien perdio o cambio de celular y ya no puede generar codigos.
  // La Edge Function vuelve a decidir (puedeReiniciarMfa); aqui solo se
  // ofrece a quien tiene sentido.
  const reiniciarMfa = async (correo) => {
    const ok = await confirmar({
      titulo: 'Reiniciar verificación en dos pasos',
      mensaje: `Se le quita a ${correo} la verificación en dos pasos que tenga configurada. Úsalo solo si perdió o cambió de celular y tú confirmaste que es esa persona. Podrá entrar solo con su contraseña y deberá configurarla de nuevo en Mi cuenta → Seguridad.`,
      aceptar: 'Reiniciar',
      destructivo: true,
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await resetStaffMfa(correo);
      setNotice(r?.factores
        ? `Listo: ${correo} ya puede entrar con su contraseña y configurar su verificación de nuevo.`
        : `${correo} no tenía verificación en dos pasos configurada: no hubo nada que reiniciar.`);
    } catch (err) {
      setError(err.message || 'No se pudo reiniciar la verificación en dos pasos.');
    } finally {
      setBusy(false);
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(temporal.clave);
      setCopiado(true);
    } catch {
      // Sin permiso de portapapeles no se rompe nada: la contraseña esta
      // a la vista y se puede seleccionar a mano.
      setCopiado(false);
    }
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
                ? 'Sin ficha vinculada, el especialista no puede crear citas ni ver a sus pacientes.'
                : 'No hay fichas de terapeuta activas. Créala primero en Especialistas.'}
            </p>
          </div>
        )}

        <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '10px 0 0' }}>
          {ROLE_OPTIONS.find((r) => r.id === role)?.help}
        </p>
        {/* La leyenda anterior decia "la persona ya debe tener una cuenta,
            pidele que se registre" — y no habia ningun sitio donde
            registrarse: ni ruta, ni signUp en todo el codigo. Mandaba a un
            paso que no existia. */}
        <fieldset style={{ border: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 6 }}>
          <legend style={{ fontSize: 12, fontWeight: 700, color: 'var(--admin-text)', marginBottom: 4 }}>Si todavía no tiene cuenta, ¿cómo entra la primera vez?</legend>
          {[
            ['correo', 'Le llega un correo para crear su contraseña (recomendado)'],
            ['temporal', 'Le doy una contraseña temporal en persona'],
          ].map(([id, texto]) => (
            <label key={id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--admin-text)', cursor: 'pointer' }}>
              <input type="radio" name="acc-metodo" checked={metodo === id} onChange={() => setMetodo(id)} /> {texto}
            </label>
          ))}
        </fieldset>
        <p style={{ fontSize: 12, color: 'var(--admin-muted)', margin: '6px 0 0' }}>
          Si ya tiene cuenta, se le envía una invitación dentro del panel y decide ella.
        </p>
      </form>

      {temporal && (
        <TempPasswordPanel
          alta={temporal}
          copiado={copiado}
          onCopiar={copiar}
          onCerrar={() => setTemporal(null)}
        />
      )}

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
              {/* Desde 0032 a una clinica se entra ACEPTANDO. Sin decirlo
                  aqui, el dueño invita, ve a la persona en la lista igual
                  que a las demas, y no entiende por que no puede entrar. */}
              {m.invitedAt && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={etiquetaPendiente}>
                    {diasParaCaducar(m.expiraEl) === 0
                      ? 'Invitacion caducada · vuelve a invitar'
                      : `Invitacion pendiente · caduca en ${diasParaCaducar(m.expiraEl)} d`}
                  </span>
                </div>
              )}
              {/* Solo para cuentas que esta clinica creo y que nadie ha
                  estrenado. Una invitacion pendiente es de alguien que ya
                  tiene su contraseña: la acepta al entrar. */}
              {m.puedeRegenerarTemporal && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => generarTemporal(m.email)}
                  style={{ ...boton('ghost', busy), marginTop: 4 }}
                >
                  <KeyRound size={13} /> Generar nueva contraseña temporal
                </button>
              )}
              {/* No a uno mismo (eso es Mi cuenta → Seguridad) ni a otro
                  dueño: la funcion lo negaria igual (puedeReiniciarMfa). */}
              {!m.isSelf && m.role !== 'owner' && !m.invitedAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => reiniciarMfa(m.email)}
                  style={{ ...boton('ghost', busy), marginTop: 4 }}
                >
                  <ShieldOff size={13} /> Reiniciar verificación en dos pasos
                </button>
              )}
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
                    if (nuevo === 'doctor' && !m.therapistId && therapists.length === 0) {
                      // Sin fichas, la lista saldria vacia y no habria nada
                      // que elegir. Se dice que falta y donde se crea.
                      await confirmar({
                        titulo: 'Primero crea la ficha del especialista',
                        mensaje: 'Todavía no hay fichas de especialistas en este consultorio. Créala en Consultorio → Especialistas (nombre, especialidad, cédula y servicios) y vuelve aquí para darle el rol.',
                        aceptar: 'Entendido',
                      });
                      return;
                    }
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

// Dias que le quedan a una invitacion. 0 = caducada.
const diasParaCaducar = (expiraEl) => {
  if (!expiraEl) return 0;
  const ms = new Date(expiraEl).getTime() - Date.now();
  if (Number.isNaN(ms)) return 0;
  return Math.max(0, Math.ceil(ms / 86400000));
};

// Va en --admin-text y no en --admin-muted: es el dato que explica por
// que esa persona no puede entrar, asi que no es texto secundario.
const etiquetaPendiente = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--admin-text)',
  // --admin-surface-soft, no --admin-surface-2: el segundo NO EXISTE y
  // el fallback habria dejado la insignia sin fondo, en silencio.
  background: 'var(--admin-surface-soft)',
  border: '1px solid var(--admin-border)',
  borderRadius: 6,
  padding: '2px 6px',
  display: 'inline-block',
};

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
