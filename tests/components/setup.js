import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => cleanup());

// jsdom no implementa <dialog>.showModal()/close() del todo. Se simula
// lo que la app usa: abrir, cerrar y el evento 'close' (Escape incluido).
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  if (!proto.showModal || !String(proto.showModal).includes('[native code]')) {
    proto.showModal = function showModal() {
      this.setAttribute('open', '');
      this.dataset.modal = 'true';
      // Como el navegador: el foco entra al dialogo (primer control) y
      // Escape, que llega por ahi, lo cierra.
      this.querySelector('button, input, select, textarea, [tabindex]')?.focus();
      this.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    };
    proto.close = function close() {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}

// window.scrollTo no existe en jsdom; la app lo llama al cambiar de paso.
window.scrollTo = () => {};
