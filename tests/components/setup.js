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
      // Escape es la accion por defecto del keydown: corre despues de que
      // el evento recorre la pagina (por eso escucha en document), no corre
      // si alguien previno el keydown, dispara 'cancel' (cancelable) y solo
      // cierra si nadie lo previno.
      this.querySelector('button, input, select, textarea, [tabindex]')?.focus();
      if (!this.alEscape) {
        this.alEscape = (e) => {
          if (e.key !== 'Escape' || e.defaultPrevented || !this.hasAttribute('open')) return;
          const ev = new Event('cancel', { cancelable: true });
          this.dispatchEvent(ev);
          if (!ev.defaultPrevented) this.close();
        };
        this.ownerDocument.addEventListener('keydown', this.alEscape);
      }
    };
    proto.close = function close() {
      if (!this.hasAttribute('open')) return;
      this.ownerDocument.removeEventListener('keydown', this.alEscape);
      this.alEscape = null;
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}

// window.scrollTo no existe en jsdom; la app lo llama al cambiar de paso.
window.scrollTo = () => {};
