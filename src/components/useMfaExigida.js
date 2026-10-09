import { useEffect, useState } from 'react';
import { clinicalMfaRequired } from '../api/supabaseData';
import { normalizeRole, ROLES } from '../auth/permissions';

// Roles que abren expedientes: a ellos aplica la exigencia de MFA de la
// clinica (las policies restrictivas de 0039 estan en patients,
// encounters, clinical_notes, note_addenda y consents).
const CLINICOS = new Set([ROLES.SUPER_ADMIN, ROLES.ADMIN_CONSULTORIO, ROLES.DOCTOR]);

// true cuando la clinica exige verificacion en dos pasos y esta sesion
// entro solo con contraseña. La base ya negaria el expediente; esto evita
// pantallas vacias sin explicacion y lleva a verificarse.
export function useMfaExigida(session) {
  const [exigida, setExigida] = useState(false);
  const rol = normalizeRole(session?.user?.role);
  const aplica = Boolean(session) && CLINICOS.has(rol) && session.aal !== 'aal2';
  const tenant = session?.user?.tenantId;

  useEffect(() => {
    if (!aplica) { setExigida(false); return undefined; }
    let vigente = true;
    // Si la funcion no existe todavia (0039 sin aplicar) o falla, no se
    // bloquea a nadie: la base sigue decidiendo.
    clinicalMfaRequired().then((v) => { if (vigente) setExigida(v); }).catch(() => {});
    return () => { vigente = false; };
  }, [aplica, tenant]);

  return aplica && exigida;
}
