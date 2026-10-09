// Un valor observable: lo unico que la app usaba de rxjs.
//
// rxjs entraba entero en el paquete inicial de la portada para tres
// BehaviorSubject y un throttle. Esta clase conserva su contrato —value,
// next(), y subscribe() que avisa de inmediato con el valor actual y
// devuelve { unsubscribe }— para que quien la usa no cambie.
export class ValueSubject {
  #value;
  #listeners = new Set();

  constructor(initial) {
    this.#value = initial;
  }

  get value() {
    return this.#value;
  }

  next(value) {
    this.#value = value;
    // Copia: un suscriptor que se da de baja al recibir el aviso no debe
    // saltarse al siguiente.
    [...this.#listeners].forEach((fn) => fn(value));
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    fn(this.#value);
    return { unsubscribe: () => this.#listeners.delete(fn) };
  }
}
