import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { installGlobalErrorReporting, reportError } from './monitoring';

installGlobalErrorReporting();

// Despues de cada deploy, una pestaña abierta con la version anterior pide
// chunks que ya no existen (llevan hash en el nombre y nginx sirve solo los
// nuevos). Vite avisa con este evento: se recarga UNA vez para traer la
// version nueva. La marca en sessionStorage evita un bucle si el fallo es
// otro (sin red, por ejemplo); en ese caso decide el ErrorBoundary.
window.addEventListener('vite:preloadError', (event) => {
  const MARCA = 'brainpsi:recargado-por-deploy';
  let yaRecargo = false;
  try { yaRecargo = Boolean(sessionStorage.getItem(MARCA)); } catch { /* sin storage */ }
  if (yaRecargo) return;
  try { sessionStorage.setItem(MARCA, String(Date.now())); } catch { /* sin storage */ }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root'), {
  // Lo que ningun ErrorBoundary atrapo tambien se reporta, con la pila de
  // componentes: sin esto, en produccion se perdia sin rastro.
  onUncaughtError: (error, info) => {
    reportError(error, { source: 'react-uncaught', stack: info?.componentStack?.slice(0, 500) });
  },
}).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
