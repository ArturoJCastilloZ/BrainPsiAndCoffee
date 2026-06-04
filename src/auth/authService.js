import { BehaviorSubject } from 'rxjs';
import { env } from '../config/env';
import { supabase, assertSupabaseConfigured } from '../api/supabaseClient';
import { resetRequests } from '../api/requestActivity';

const warningMs = env.authWarningSeconds * 1000;
const inactivityMs = env.authInactivityMinutes * 60 * 1000;

const toAppSession = (session) => {
  if (!session?.user) return null;
  const role = session.user.app_metadata?.role || session.user.user_metadata?.role || 'user';

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.user_metadata?.name || session.user.email || 'Administrador',
      role,
      therapistId: session.user.app_metadata?.therapist_id || session.user.user_metadata?.therapist_id || null,
    },
    accessToken: session.access_token,
    expiresAt: Date.now() + inactivityMs,
  };
};

class AuthService {
  session$ = new BehaviorSubject(null);
  expiryWarning$ = new BehaviorSubject(false);
  warningTimer = null;
  logoutTimer = null;

  constructor() {
    this.bootstrap();
  }

  async bootstrap() {
    if (!supabase) return;

    const { data } = await supabase.auth.getSession();
    this.setSession(data.session);

    supabase.auth.onAuthStateChange((_event, session) => {
      this.setSession(session);
    });
  }

  async login({ username, password }) {
    assertSupabaseConfigured();
    const email = await this.resolveLoginEmail(username.trim());

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error('Correo o contraseña incorrectos.');
    }

    const session = this.setSession(data.session);
    if (!['admin', 'doctor'].includes(session?.user.role)) {
      await this.logout('not-admin');
      throw new Error('Tu usuario no tiene permisos para acceder al panel.');
    }

    return session;
  }

  async updatePassword(password) {
    assertSupabaseConfigured();
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error('No se pudo guardar la contraseña. Solicita una nueva invitación.');
    return data.user;
  }

  async resolveLoginEmail(identifier) {
    if (identifier.includes('@')) return identifier;

    const { data, error } = await supabase.rpc('resolve_login_identifier', { identifier });
    if (error || !data) return identifier;
    return data;
  }

  setSession(supabaseSession) {
    resetRequests();
    const session = toAppSession(supabaseSession);
    this.expiryWarning$.next(false);
    this.session$.next(session);
    this.scheduleTimers(session);
    return session;
  }

  refreshActivity() {
    const current = this.session$.value;
    if (!current) return null;
    const refreshed = { ...current, expiresAt: Date.now() + inactivityMs };
    this.expiryWarning$.next(false);
    this.session$.next(refreshed);
    this.scheduleTimers(refreshed);
    return refreshed;
  }

  async logout(reason = 'manual') {
    if (supabase) await supabase.auth.signOut();
    resetRequests();
    this.clearTimers();
    this.expiryWarning$.next(false);
    this.session$.next(null);
    return reason;
  }

  getAccessToken() {
    return this.session$.value?.accessToken || null;
  }

  scheduleTimers(session) {
    this.clearTimers();
    if (!session) return;
    const msRemaining = Math.max(session.expiresAt - Date.now(), 0);
    this.warningTimer = window.setTimeout(() => this.expiryWarning$.next(true), Math.max(msRemaining - warningMs, 0));
    this.logoutTimer = window.setTimeout(() => this.logout('expired'), msRemaining);
  }

  clearTimers() {
    if (this.warningTimer) window.clearTimeout(this.warningTimer);
    if (this.logoutTimer) window.clearTimeout(this.logoutTimer);
    this.warningTimer = null;
    this.logoutTimer = null;
  }
}

export const authService = new AuthService();
