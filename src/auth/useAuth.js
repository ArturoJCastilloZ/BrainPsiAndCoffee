import { useEffect, useState } from 'react';
import { authService } from './authService';

export const useAuthSession = () => {
  const [session, setSession] = useState(authService.session$.value);

  useEffect(() => {
    const subscription = authService.session$.subscribe(setSession);
    return () => subscription.unsubscribe();
  }, []);

  return session;
};

// false mientras se lee la sesion guardada. Las rutas protegidas esperan
// a que sea true antes de decidir si mandan al login.
export const useAuthReady = () => {
  const [ready, setReady] = useState(authService.ready$.value);

  useEffect(() => {
    const subscription = authService.ready$.subscribe(setReady);
    return () => subscription.unsubscribe();
  }, []);

  return ready;
};

export const useSessionWarning = () => {
  const [showWarning, setShowWarning] = useState(authService.expiryWarning$.value);

  useEffect(() => {
    const subscription = authService.expiryWarning$.subscribe(setShowWarning);
    return () => subscription.unsubscribe();
  }, []);

  return showWarning;
};

export const useInactivityTracking = (enabled) => {
  useEffect(() => {
    if (!enabled) return undefined;

    // Como el throttleTime(30000) de rxjs que habia aqui: la PRIMERA
    // actividad cuenta y las siguientes 30 s se ignoran.
    let ultima = 0;
    const refresh = () => {
      const ahora = Date.now();
      if (ahora - ultima < 30000) return;
      ultima = ahora;
      if (!authService.expiryWarning$.value) authService.refreshActivity();
    };
    const eventos = ['click', 'keydown', 'mousemove', 'touchstart'];
    eventos.forEach((e) => window.addEventListener(e, refresh, { passive: true }));
    return () => eventos.forEach((e) => window.removeEventListener(e, refresh));
  }, [enabled]);
};
