import { BehaviorSubject } from 'rxjs';
import { env } from '../config/env';
import { supabase, assertSupabaseConfigured } from '../api/supabaseClient';
import { getSelectedTenant, resolveInitialTenant, setActiveTenant } from '../api/tenant';
import { resetRequests } from '../api/requestActivity';
import { canAccessAdmin, canAccessDoctor, normalizeRole } from './permissions';

const warningMs = env.authWarningSeconds * 1000;
const inactivityMs = env.authInactivityMinutes * 60 * 1000;

const toAppSession = (session) => {
  if (!session?.user) return null;
  // El rol se toma SOLO de app_metadata: viaja firmado en el JWT y el usuario
  // no puede escribirlo. user_metadata si es escribible por el propio usuario
  // via supabase.auth.updateUser(), asi que no sirve como fuente de permisos.
  //
  // Ya no hay un rol global: el mismo usuario puede ser doctor en una
  // clinica y administrador en otra, asi que se lee el de la clinica
  // activa. Sin clinica elegida no hay rol, y la UI no debe dar acceso.
  const tenantId = getSelectedTenant();
  const memberships = session.user.app_metadata?.memberships || {};
  const role = normalizeRole(memberships[tenantId] || 'user');

  return {
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.user_metadata?.name || session.user.email || 'Administrador',
      role,
      tenantId,
      memberships,
      therapistId: (session.user.app_metadata?.therapist_ids || {})[tenantId] || null,
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
    if (!canAccessAdmin(session?.user.role) && !canAccessDoctor(session?.user.role)) {
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

  async requestPasswordReset(email) {
    assertSupabaseConfigured();
    const redirectTo = `${window.location.origin}/set-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw new Error('No se pudo enviar el enlace de recuperación.');
    return true;
  }

  async resolveLoginEmail(identifier) {
    if (identifier.includes('@')) return identifier;

    const { data, error } = await supabase.rpc('resolve_login_identifier', { identifier });
    if (error || !data) return identifier;
    return data;
  }

  setSession(supabaseSession) {
    resetRequests();
    // La clinica activa se decide aqui, con la sesion recien llegada.
    // Si el usuario pertenece a una sola no hay nada que elegir; si tiene
    // varias y ninguna guardada, queda en null y la UI debe pedirle que
    // escoja antes de mostrarle datos.
    setActiveTenant(resolveInitialTenant(supabaseSession));
    const session = toAppSession(supabaseSession);
    this.expiryWarning$.next(false);
    this.session$.next(session);
    this.scheduleTimers(session);
    return session;
  }

  // Al cambiar de clinica hay que RE-DERIVAR la sesion, no solo refrescar
  // el temporizador: el rol se calcula a partir de la clinica activa, y el
  // mismo usuario puede ser doctor en una y administrador en otra.
  // refreshActivity() conserva el objeto anterior y dejaria el rol viejo.
  async reloadSession() {
    if (!supabase) return this.session$.value;
    const { data } = await supabase.auth.getSession();
    return this.setSession(data.session);
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
    // Sin esto, la clinica del usuario anterior seguiria viajando en el
    // header de quien inicie sesion despues en el mismo navegador.
    setActiveTenant(null);
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
