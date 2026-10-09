import React from 'react';
import { reportError } from '../monitoring';

// Un error de render ya no deja la pantalla en blanco.
//
// Antes no habia ninguno: cualquier excepcion en un componente desmontaba
// la app entera y el paciente veia una pagina vacia sin saber que hacer.
// El caso mas comun no es un bug sino un DEPLOY: una pestaña abierta antes
// de publicar una version nueva pide un chunk que ya no existe (los
// nombres llevan hash) y el import() falla.
//
// Se reinicia al cambiar de ruta (resetKey), para que el fallo de una
// pantalla no bloquee las demas.
export default class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    reportError(error, { source: 'error-boundary', stack: info?.componentStack?.slice(0, 500) });
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" style={{
        minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center',
      }}>
        <div style={{ maxWidth: 380 }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px', color: 'var(--bp-brown, #2E2A27)' }}>
            Algo falló al mostrar esta pantalla
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, margin: '0 0 18px', color: 'var(--bp-brown-mid, #6B5E55)' }}>
            Recarga la página. Si sigue pasando, escríbenos por WhatsApp.
          </p>
          <button type="button" onClick={() => window.location.reload()} style={{
            background: 'var(--bp-primary, #5A3E2B)', color: 'var(--bp-primary-contrast, #fff)',
            border: 'none', padding: '12px 22px', borderRadius: 12, fontSize: 15, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
