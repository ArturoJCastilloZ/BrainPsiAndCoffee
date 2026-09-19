import React from 'react';
import { MoreVertical, LogOut, Moon, Sun, X } from 'lucide-react';
import { C } from '../theme';

// Los controles de la cabecera movil, en un solo menu.
//
// Antes eran tres pastillas sueltas —Claro, App, Salir— compitiendo por
// el ancho con la marca a 375px. Tres acciones que se usan poco no
// merecen tres objetivos permanentes en la unica franja que el telefono
// tiene siempre a la vista.
//
// Un solo boton de 44x44 y un menu que se abre. Se cierra al elegir, con
// Escape, y al tocar fuera: las tres salidas que alguien espera, porque
// un menu que solo se cierra con su propio boton deja atrapado a quien lo
// abrio por error.
export default function MobileMenu({ theme, toggleTheme, onSwitchToUser, onLogout }) {
  const [abierto, setAbierto] = React.useState(false);
  const caja = React.useRef(null);
  const disparador = React.useRef(null);

  React.useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (caja.current && !caja.current.contains(e.target)) setAbierto(false);
    };
    const tecla = (e) => {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      // El foco vuelve al boton: sin esto, cerrar con Escape lo deja en un
      // elemento que ya no existe y el teclado empieza otra vez desde arriba.
      disparador.current?.focus();
    };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  const elegir = (accion) => () => {
    setAbierto(false);
    accion?.();
  };

  const esOscuro = theme === 'dark';

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <button
        ref={disparador}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-label={abierto ? 'Cerrar menu' : 'Abrir menu'}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 44, height: 44, borderRadius: 999,
          background: abierto ? 'var(--admin-surface-soft)' : 'transparent',
          border: '1px solid var(--admin-border)',
          color: 'var(--admin-text)', cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        {abierto ? <X size={18} aria-hidden="true" /> : <MoreVertical size={18} aria-hidden="true" />}
      </button>

      {abierto && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 40,
            minWidth: 208, padding: 6, borderRadius: 14,
            background: 'var(--admin-surface)',
            border: '1px solid var(--admin-border)',
            boxShadow: '0 18px 40px rgba(0,0,0,0.28)',
            display: 'grid', gap: 2,
          }}
        >
          <button type="button" role="menuitem" onClick={elegir(toggleTheme)} style={opcion}>
            {esOscuro ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
            Modo {esOscuro ? 'claro' : 'oscuro'}
          </button>

          <button type="button" role="menuitem" onClick={elegir(onSwitchToUser)} style={opcion}>
            <LogOut size={16} aria-hidden="true" />
            Volver a la app
          </button>

          {/* rust-text y no rust: el segundo tambien pinta bordes y fondos,
              donde el contraste de texto no aplica, y como texto sobre esta
              superficie se quedaba en 4.37 — por debajo de AA. */}
          <button
            type="button"
            role="menuitem"
            onClick={elegir(onLogout)}
            style={{ ...opcion, color: C.rustText, borderTop: '1px solid var(--admin-border-soft)', borderRadius: '0 0 10px 10px', marginTop: 4 }}
          >
            <X size={16} aria-hidden="true" />
            Cerrar sesion
          </button>
        </div>
      )}
    </div>
  );
}

const opcion = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  minHeight: 44,
  padding: '0 12px',
  background: 'transparent',
  border: 'none',
  borderRadius: 10,
  color: 'var(--admin-text)',
  fontSize: 13,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};
