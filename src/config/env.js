// Configuracion en tiempo de ejecucion. En Docker, el contenedor escribe
// /env-config.js al arrancar (docker/40-env-config.sh), asi una misma
// imagen sirve a cualquier clinica o entorno sin recompilar. Fuera de
// Docker ese archivo es un objeto vacio y manda import.meta.env.
//
// Las variables de compilacion van con nombre literal a proposito: un
// import.meta.env[key] dinamico haria que Vite incrustara TODAS las
// VITE_* en el bundle, incluida cualquier llave secreta del .env.
const runtime = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};

export const env = {
  apiBaseUrl: runtime.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  authLoginPath: runtime.VITE_AUTH_LOGIN_PATH || import.meta.env.VITE_AUTH_LOGIN_PATH || '/auth/login',
  authRefreshPath: runtime.VITE_AUTH_REFRESH_PATH || import.meta.env.VITE_AUTH_REFRESH_PATH || '/auth/refresh',
  authInactivityMinutes: Number(runtime.VITE_AUTH_INACTIVITY_MINUTES || import.meta.env.VITE_AUTH_INACTIVITY_MINUTES || 15),
  authWarningSeconds: Number(runtime.VITE_AUTH_WARNING_SECONDS || import.meta.env.VITE_AUTH_WARNING_SECONDS || 60),
  supabaseUrl: runtime.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: runtime.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
  analyticsEndpoint: runtime.VITE_ANALYTICS_ENDPOINT || import.meta.env.VITE_ANALYTICS_ENDPOINT || '',
  // Clinica que sirve esta instalacion al publico. Un visitante no tiene
  // sesion ni membresias, asi que el tenant no puede salir del JWT: sale
  // del despliegue. Cuando haya varias clinicas en un mismo dominio, esto
  // pasa a resolverse por subdominio.
  defaultTenantId: runtime.VITE_TENANT_ID || import.meta.env.VITE_TENANT_ID || 'brainpsi',
};
