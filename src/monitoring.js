const analyticsEndpoint = import.meta.env.VITE_ANALYTICS_ENDPOINT;

export const trackEvent = (name, payload = {}) => {
  const event = {
    name,
    payload,
    path: window.location.pathname,
    at: new Date().toISOString(),
  };

  if (window.dataLayer?.push) {
    window.dataLayer.push({ event: name, ...payload });
  }

  if (analyticsEndpoint) {
    navigator.sendBeacon?.(analyticsEndpoint, JSON.stringify(event));
  }

  if (import.meta.env.DEV) {
    console.debug('[analytics]', event);
  }
};

export const trackPageView = (path) => {
  trackEvent('page_view', { path });
};

export const reportError = (error, context = {}) => {
  const message = error?.message || String(error);
  trackEvent('app_error', { message, ...context });
};

export const installGlobalErrorReporting = () => {
  window.addEventListener('error', (event) => {
    reportError(event.error || event.message, { source: 'window.error' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportError(event.reason || 'Unhandled promise rejection', { source: 'unhandledrejection' });
  });
};
