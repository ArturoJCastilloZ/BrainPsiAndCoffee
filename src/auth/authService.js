import { BehaviorSubject } from 'rxjs';
import { env } from '../config/env';
import { createDevJwt } from './jwt';

const SESSION_KEY = 'brainpsi:auth-session';
const warningMs = env.authWarningSeconds * 1000;
const inactivityMs = env.authInactivityMinutes * 60 * 1000;

const readSession = () => {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
};

class AuthService {
  session$ = new BehaviorSubject(readSession());
  expiryWarning$ = new BehaviorSubject(false);
  warningTimer = null;
  logoutTimer = null;

  constructor() {
    this.scheduleTimers(this.session$.value);
  }

  login({ username, password }) {
    if (username.trim().toLowerCase() !== 'admin' || password !== 'brainpsi') {
      throw new Error('Usuario o contraseña incorrectos. Usa admin / brainpsi.');
    }
    return this.startSession({ name: 'Administrador', role: 'admin' });
  }

  startSession(user) {
    const expiresAt = Date.now() + inactivityMs;
    const session = {
      user,
      accessToken: createDevJwt({ sub: user.name, role: user.role, expiresAt }),
      expiresAt,
    };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    this.expiryWarning$.next(false);
    this.session$.next(session);
    this.scheduleTimers(session);
    return session;
  }

  refreshActivity() {
    const current = this.session$.value;
    if (!current) return null;
    return this.startSession(current.user);
  }

  logout(reason = 'manual') {
    window.localStorage.removeItem(SESSION_KEY);
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
