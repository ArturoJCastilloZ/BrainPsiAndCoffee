const base64Url = (value) => {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

export const createDevJwt = ({ sub, role, expiresAt }) => {
  const header = { alg: 'none', typ: 'JWT' };
  const payload = {
    sub,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(expiresAt / 1000),
  };
  return `${base64Url(header)}.${base64Url(payload)}.`;
};

export const decodeJwtPayload = (token) => {
  const payload = token?.split('.')[1];
  if (!payload) return null;
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(decodeURIComponent(escape(atob(normalized))));
};
