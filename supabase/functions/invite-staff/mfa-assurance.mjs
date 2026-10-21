// getUser() ya comprobó la cuenta y tenant_members comprobó al dueño.
// Se verifica también el JWT recibido: tener factores inscritos no significa
// que esta sesión haya presentado uno. No decodificar el JWT sin verificar.
export const puedeAdministrarMfa = async (callerClient, authorization, callerId) => {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization)?.[1];
  if (!token || !callerId) return false;
  try {
    const { data, error } = await callerClient.auth.getClaims(token);
    return !error && data?.claims?.sub === callerId && data.claims.aal === 'aal2';
  } catch {
    return false;
  }
};
