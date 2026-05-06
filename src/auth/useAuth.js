import { useEffect, useState } from 'react';
import { fromEvent, merge } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { authService } from './authService';

export const useAuthSession = () => {
  const [session, setSession] = useState(authService.session$.value);

  useEffect(() => {
    const subscription = authService.session$.subscribe(setSession);
    return () => subscription.unsubscribe();
  }, []);

  return session;
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

    const refresh = () => {
      if (!authService.expiryWarning$.value) authService.refreshActivity();
    };
    const activity$ = merge(
      fromEvent(window, 'click'),
      fromEvent(window, 'keydown'),
      fromEvent(window, 'mousemove'),
      fromEvent(window, 'touchstart')
    ).pipe(throttleTime(30000));
    const subscription = activity$.subscribe(refresh);

    return () => subscription.unsubscribe();
  }, [enabled]);
};
