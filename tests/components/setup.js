import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom no implementa <dialog>.showModal()/close() del todo. Se simula
// lo que la app usa: abrir, cerrar y el evento 'close' (Escape incluido).
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  if (!proto.showModal || !String(proto.showModal).includes('[native code]')) {
    // Pila de dialogos modales abiertos, como la top layer del navegador:
    // Escape solo afecta al de arriba. Un dialogo cerrado sale de la pila y
    // uno desmontado (cleanup de RTL) se descarta al no estar conectado.
    const abiertos = [];
    const vigentes = () => {
      for (let i = abiertos.length - 1; i >= 0; i -= 1) {
        if (!abiertos[i].isConnected || !abiertos[i].hasAttribute('open')) abiertos.splice(i, 1);
      }
      return abiertos;
    };
    // Escape es la accion por defecto del keydown: corre despues de que el
    // evento recorre la pagina (por eso un solo listener en document), no
    // corre si alguien previno el keydown, dispara 'cancel' (cancelable) en
    // el dialogo de arriba y solo lo cierra si nadie lo previno.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const arriba = vigentes().at(-1);
      if (!arriba) return;
      const ev = new Event('cancel', { cancelable: true });
      arriba.dispatchEvent(ev);
      if (!ev.defaultPrevented) arriba.close();
    });
    proto.showModal = function showModal() {
      this.setAttribute('open', '');
      this.dataset.modal = 'true';
      if (!vigentes().includes(this)) abiertos.push(this);
      // Como el navegador: el foco entra al dialogo (primer control).
      this.querySelector('button, input, select, textarea, [tabindex]')?.focus();
    };
    proto.close = function close() {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      vigentes();
      this.dispatchEvent(new Event('close'));
    };
  }
}

// window.scrollTo no existe en jsdom; la app lo llama al cambiar de paso.
window.scrollTo = () => {};
