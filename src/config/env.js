export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api',
  authLoginPath: import.meta.env.VITE_AUTH_LOGIN_PATH || '/auth/login',
  authRefreshPath: import.meta.env.VITE_AUTH_REFRESH_PATH || '/auth/refresh',
  authInactivityMinutes: Number(import.meta.env.VITE_AUTH_INACTIVITY_MINUTES || 15),
  authWarningSeconds: Number(import.meta.env.VITE_AUTH_WARNING_SECONDS || 60),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabasePublishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY,
};
