import { env } from '../config/env';
import { ValueSubject } from '../lib/valueSubject.mjs';
import { conCliente, getSupabase, hasSupabaseConfig, necesitaClienteAlArrancar, peekSupabase } from '../api/supabaseClient';
import { getSelectedTenant, resolveInitialTenant, setActiveTenant } from '../api/tenant';
import { resetRequests } from '../api/requestActivity';
import { canAccessAdmin, canAccessDoctor, normalizeRole } from './permissions';

const warningMs = env.authWarningSeconds * 1000;
const inactivityMs = env.authInactivityMinutes * 60 * 1000;

// El claim 'aal' del JWT, sin verificar la firma: SOLO para decidir que
// pantalla mostrar. Quien decide el acceso es la base, que si la verifica.
const leerAal = (token) => {
  try {
    const carga = String(token || '').split('.')[1] || '';
    const json = JSON.parse(atob(carga.replace(/-/g, '+').replace(/_/g, '/')));
    return json.aal || 'aal1';
  } catch {
    return 'aal1';
  }
};

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
      // Alta con contraseña temporal (0033). Mientras esto sea cierto,
      // current_tenant_id() devuelve null en la base y las 40 policies
      // que dependen de el niegan todo: la pantalla solo refleja lo que
      // el motor ya impone, no lo sustituye.
      mustChangePassword: session.user.app_metadata?.must_change_password === true,
    },
    // aal1 = solo contraseña; aal2 = con segundo factor. Viene firmado en el
    // token; es lo que leen las policies del expediente (0039).
    aal: leerAal(session.access_token),
    accessToken: session.access_token,
    expiresAt: Date.now() + inactivityMs,
  };
};

class AuthService {
  session$ = new ValueSubject(null);
  // Si ya se sabe si hay sesion. session$ arranca en null tambien cuando SI
  // hay sesion guardada, porque leerla es asincrono: sin esta señal, las
  // rutas protegidas no distinguian "sin sesion" de "todavia no se sabe" y
  // recargar /admin mandaba al login a alguien con sesion valida.
  ready$ = new ValueSubject(false);
  expiryWarning$ = new ValueSubject(false);
  warningTimer = null;
  logoutTimer = null;
  escuchando = false;

  constructor() {
    this.bootstrap();
  }

  async bootstrap() {
    // Sin sesion guardada ni enlace de correo en la URL, el visitante es
    // anonimo: se decide YA, sin descargar supabase-js (M1).
    if (!hasSupabaseConfig || !necesitaClienteAlArrancar()) {
      this.ready$.next(true);
      return;
    }

    try {
      const supabase = await this.cliente();
      const { data } = await supabase.auth.getSession();
      this.setSession(data.session);
    } finally {
      // Tambien si falla: una sesion que no se pudo leer es "sin sesion",
      // y la pantalla tiene que poder avanzar al login.
      this.ready$.next(true);
    }
  }

  // El cliente, cargandolo si hace falta, y escuchando sus cambios de
  // sesion una sola vez (refresco de token, cierre en otra pestaña).
  async cliente() {
    const supabase = await conCliente();
    if (!this.escuchando) {
      this.escuchando = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        this.setSession(session);
      });
    }
    return supabase;
  }

  // El login carga la libreria mientras la persona escribe, no al enviar.
  precargar() {
    if (hasSupabaseConfig) getSupabase();
  }

  async login({ username, password }) {
    const supabase = await this.cliente();
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

    // Quien activo la verificacion en dos pasos la usa SIEMPRE al entrar:
    // la contraseña sola deja la sesion en aal1 y el expediente, si la
    // clinica lo exige, no se abre. Login pide el codigo y llama a
    // verificarSegundoFactor().
    const { data: nivel } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (nivel?.nextLevel === 'aal2' && nivel?.currentLevel !== 'aal2') {
      return { ...session, requiereSegundoFactor: true };
    }
    return session;
  }

  // ---- Verificacion en dos pasos (TOTP, app de autenticacion) ----------
  //
  // Supabase Auth la implementa; aqui solo se orquesta. El nivel (aal1 o
  // aal2) viaja FIRMADO en el JWT y es lo que las policies de 0039 leen:
  // la pantalla no puede saltarse nada.

  async factoresVerificados() {
    const supabase = await this.cliente();
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return (data?.totp || []).filter((f) => f.status === 'verified');
  }

  // Empieza el alta: devuelve el QR (SVG en data:) y el secreto para
  // escribirlo a mano. Los intentos a medias se limpian antes: Supabase
  // no deja dos factores sin verificar con el mismo nombre.
  async iniciarAltaSegundoFactor() {
    const supabase = await this.cliente();
    const { data: lista } = await supabase.auth.mfa.listFactors();
    for (const f of (lista?.all || []).filter((x) => x.status !== 'verified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'App de autenticación' });
    if (error) throw error;
    return { factorId: data.id, qr: data.totp.qr_code, secreto: data.totp.secret };
  }

  // Confirma un codigo: sirve para terminar el alta y para entrar. Deja
  // la sesion en aal2 (Supabase emite un token nuevo).
  async verificarSegundoFactor(codigo, factorId = null) {
    const supabase = await this.cliente();
    const id = factorId || (await this.factoresVerificados())[0]?.id;
    if (!id) throw new Error('No tienes configurada la verificación en dos pasos.');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: String(codigo).replace(/\s/g, '') });
    if (error) throw new Error('El código no es válido o ya expiró. Usa el que muestra tu app ahora.');
    const { data } = await supabase.auth.getSession();
    return this.setSession(data.session);
  }

  // Con la verificacion en dos pasos activa, Supabase no deja cambiar la
  // contraseña desde una sesion aal1 — justo la que abre el enlace de
  // "recuperar contraseña". SetPassword lo pregunta para pedir el codigo
  // ANTES de intentar, en vez de fallar con "AAL2 session is required".
  async faltaSegundoFactor() {
    const supabase = await this.cliente();
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2';
  }

  async desactivarSegundoFactor(factorId) {
    const supabase = await this.cliente();
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw new Error('Para desactivarla entra primero con tu código de verificación.');
    await supabase.auth.refreshSession();
    const { data } = await supabase.auth.getSession();
    return this.setSession(data.session);
  }

  async updatePassword(password) {
    const supabase = await this.cliente();
    const { data, error } = await supabase.auth.updateUser({ password });
    // El mensaje de Supabase va DENTRO. Antes se descartaba y se
    // mostraba siempre "solicita una nueva invitacion", que manda a
    // pedir otra invitacion aunque el problema sea que la contraseña es
    // debil o que la temporal caduco. Un error que no se puede
    // diagnosticar desde la pantalla obliga a abrir el inspector.
    if (error) {
      const fallo = new Error(`No se pudo guardar la contraseña: ${error.message}`);
      fallo.cause = error;
      if (error.code === 'insufficient_aal' || /AAL2/i.test(error.message || '')) fallo.code = 'FALTA_SEGUNDO_FACTOR';
      throw fallo;
    }
    return data.user;
  }

  async requestPasswordReset(email) {
    const supabase = await this.cliente();
    const redirectTo = `${window.location.origin}/set-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      const fallo = new Error(`No se pudo enviar el enlace de recuperación: ${error.message}`);
      fallo.cause = error;
      throw fallo;
    }
    return true;
  }

  async resolveLoginEmail(identifier) {
    if (identifier.includes('@')) return identifier;

    const supabase = await this.cliente();
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
    if (!hasSupabaseConfig) return this.session$.value;
    const supabase = await this.cliente();
    const { data } = await supabase.auth.getSession();
    return this.setSession(data.session);
  }

  // Tras ACEPTAR una invitacion (0032) no basta reloadSession: getSession()
  // devuelve el JWT que ya estaba en el navegador, y el claim nuevo vive
  // en auth.users, no en ese token. Hay que pedir uno nuevo, que el
  // servidor acuña leyendo raw_app_meta_data en ese momento.
  //
  // Es el equivalente programatico de "cierra sesion y vuelve a entrar",
  // que es lo que habia que hacer antes para que un rol nuevo apareciera.
  async refreshClaims() {
    if (!hasSupabaseConfig) return this.session$.value;
    const supabase = await this.cliente();
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
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
    // Si la libreria nunca se cargo, no hay sesion que cerrar.
    const supabase = peekSupabase();
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
