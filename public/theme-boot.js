// Corre ANTES de pintar (script sincrono en el <head>). Lee el tema que
// guarda useStorage('brainpsi:theme') — JSON, por eso '"dark"' — y pinta
// el fondo correcto desde el primer cuadro.
try {
  if (window.localStorage.getItem('brainpsi:theme') === '"dark"') {
    document.documentElement.classList.add('tema-oscuro');
  }
} catch { /* sin storage: tema claro */ }
