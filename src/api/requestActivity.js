import { BehaviorSubject } from 'rxjs';
import { env } from '../config/env';

const activeRequests$ = new BehaviorSubject(0);
const activeRequestIds = new Set();
const requestTimers = new Map();
const requestTimeoutMs = 30000;

export const requestActivity$ = activeRequests$;

export const beginRequest = () => {
  const id = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
  activeRequestIds.add(id);
  activeRequests$.next(activeRequestIds.size);

  const timer = window.setTimeout(() => {
    endRequest(id);
  }, requestTimeoutMs);
  requestTimers.set(id, timer);

  return id;
};

export const endRequest = (id) => {
  if (!id || !activeRequestIds.has(id)) return;
  activeRequestIds.delete(id);

  const timer = requestTimers.get(id);
  if (timer) window.clearTimeout(timer);
  requestTimers.delete(id);

  activeRequests$.next(activeRequestIds.size);
};

export const resetRequests = () => {
  requestTimers.forEach((timer) => window.clearTimeout(timer));
  activeRequestIds.clear();
  requestTimers.clear();
  activeRequests$.next(0);
};

export const isAuthenticatedSupabaseRequest = (input, init = {}) => {
  const headers = new Headers(init.headers || input?.headers || {});
  const authorization = headers.get('authorization') || headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  return Boolean(token && token !== env.supabasePublishableKey);
};
