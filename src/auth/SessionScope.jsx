import React from 'react';

// Toda memoria de pantallas y hooks pertenece a este contexto de acceso.
// Cambiar de clínica/cuenta/permisos desmonta el anterior antes de pintar
// el siguiente. Los tokens renovados y la actividad no cambian la clave:
// no deben borrar formularios ni disparar cargas en cada pulsación.
export default function SessionScope({ session, children }) {
  const key = JSON.stringify([
    session?.user?.id ?? null,
    session?.user?.tenantId ?? null,
    session?.user?.role ?? null,
    session?.user?.therapistId ?? null,
    session?.aal ?? null,
    session?.user?.mustChangePassword ?? false,
  ]);
  return <React.Fragment key={key}>{children}</React.Fragment>;
}
