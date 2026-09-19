import React from 'react';
import { Building2, Check, X, Clock } from 'lucide-react';
import { C } from '../theme';
import BrandMark from './BrandMark';

const ROLE_LABELS = {
  owner: 'Dueño',
  admin_consultorio: 'Administracion del consultorio',
  admin_cafe: 'Administracion de cafeteria',
  doctor: 'Doctor',
  barista: 'Barista',
};

const diasRestantes = (expiraEl) => {
  if (!expiraEl) return null;
  const ms = new Date(expiraEl).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86400000));
};

// Invitaciones a una clinica.
//
// A una clinica se entra ACEPTANDO (0032). Antes, el dueño de cualquier
// clinica podia meter a cualquier usuario registrado en la suya: la fila
// entraba en tenant_members y un tercero le escribia el app_metadata a su
// cuenta de autenticacion. Esta pantalla es el otro lado de ese arreglo —
// sin ella las invitaciones se crearian y nadie tendria como aceptarlas.
//
// 'puedeSaltar' es falso cuando la persona no tiene ninguna clinica: no
// hay a donde continuar, asi que ofrecerle "mas tarde" seria mandarla a
// una pantalla vacia. Con al menos una clinica, esto NO bloquea: quien
// viene a trabajar sigue de largo.
export default function PendingInvitations({
  invitations = [],
  puedeSaltar = false,
  onAccept,
  onDecline,
  onSkip,
  theme,
}) {
  const [ocupado, setOcupado] = React.useState(null);
  const [error, setError] = React.useState('');

  const correr = async (tenantId, accion) => {
    setError('');
    setOcupado(tenantId);
    try {
      await accion(tenantId);
    } catch (e) {
      setError(e?.message || 'No se pudo completar la operacion.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, background: C.ivory,
    }}>
      <div style={{
        width: '100%', maxWidth: 460, background: C.surface,
        borderRadius: 20, padding: 32, border: `1px solid ${C.brownAlpha30}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <BrandMark theme={theme} />
        </div>

        <h1 style={{ fontSize: 20, margin: '0 0 6px', color: C.brown, textAlign: 'center' }}>
          {invitations.length === 1 ? 'Te invitaron a un consultorio' : 'Te invitaron a varios consultorios'}
        </h1>
        <p style={{ fontSize: 14, margin: '0 0 24px', color: C.brownLight, textAlign: 'center' }}>
          Nadie puede darte acceso sin que tu lo aceptes.
        </p>

        {error && (
          <p role="alert" style={{
            fontSize: 13, color: C.rustText, background: C.rustAlpha20,
            borderRadius: 10, padding: '10px 12px', margin: '0 0 16px',
          }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {invitations.map((inv) => {
            const dias = diasRestantes(inv.expiraEl);
            return (
              <div key={inv.tenantId} style={{
                padding: '14px 16px', borderRadius: 12,
                border: `1px solid ${C.brownAlpha30}`,
                background: C.surface2,
                // SIN opacity para la caducada, aunque atenuar la tarjeta
                // sea el gesto obvio. Medido en pantalla: con opacity
                // 0.65 el aviso "Caduco. Pide que te vuelvan a invitar."
                // baja de 4.89:1 a 2.61:1, y es el UNICO texto accionable
                // de esa tarjeta. La opacidad no cambia el color
                // computado, asi que un medidor que lea getComputedStyle
                // dice 4.89 y no se entera.
                //
                // Que esta caducada ya lo dicen el boton deshabilitado y
                // el color del aviso.
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <Building2 size={20} color={C.sageDeep} aria-hidden="true" />
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <strong style={{ fontSize: 15, color: C.brown }}>
                      {inv.tenantName || inv.tenantId}
                    </strong>
                    <span style={{ fontSize: 13, color: C.brownMid }}>
                      Como {ROLE_LABELS[inv.role] || inv.role}
                    </span>
                  </span>
                </div>

                <p style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 13, margin: '10px 0 12px',
                  color: inv.caducada ? C.rustText : C.brownMid,
                }}>
                  <Clock size={14} aria-hidden="true" />
                  {inv.caducada
                    ? 'Caduco. Pide que te vuelvan a invitar.'
                    : `Caduca en ${dias} ${dias === 1 ? 'dia' : 'dias'}.`}
                </p>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    disabled={inv.caducada || ocupado === inv.tenantId}
                    onClick={() => correr(inv.tenantId, onAccept)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      flex: 1, minHeight: 44, borderRadius: 10, border: 'none',
                      background: inv.caducada ? C.brownAlpha30 : C.primary,
                      color: inv.caducada ? C.brownMid : C.primaryContrast, font: 'inherit', fontSize: 14,
                      cursor: inv.caducada ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <Check size={16} aria-hidden="true" />
                    {ocupado === inv.tenantId ? 'Un momento...' : 'Aceptar'}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado === inv.tenantId}
                    onClick={() => correr(inv.tenantId, onDecline)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      minHeight: 44, padding: '0 16px', borderRadius: 10,
                      border: `1px solid ${C.brownAlpha30}`, background: 'transparent',
                      color: C.brown, font: 'inherit', fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    <X size={16} aria-hidden="true" />
                    Rechazar
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {puedeSaltar && (
          <button
            type="button"
            onClick={onSkip}
            style={{
              width: '100%', minHeight: 44, marginTop: 16, borderRadius: 10,
              border: 'none', background: 'transparent', color: C.brownMid,
              font: 'inherit', fontSize: 14, cursor: 'pointer',
            }}
          >
            Mas tarde
          </button>
        )}
      </div>
    </div>
  );
}
