import { useEffect, useState } from 'react';

// localStorage se lee AL CREAR el estado, no en un efecto: leido despues
// del primer render, quien eligio el tema oscuro veia un destello claro
// en cada carga (auditoria, seccion 4 · Bajo).
const leerLocal = (key, defaultValue) => {
  try {
    const guardado = window.localStorage?.getItem(key);
    return guardado ? JSON.parse(guardado) : defaultValue;
  } catch {
    return defaultValue;
  }
};

export const useStorage = (key, defaultValue) => {
  const [value, setValue] = useState(() => leerLocal(key, defaultValue));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const localValue = window.localStorage?.getItem(key);
        if (localValue) {
          setValue(JSON.parse(localValue));
        } else if (window.storage?.get) {
          const result = await window.storage.get(key);
          if (result && result.value) {
          setValue(JSON.parse(result.value));
          }
        }
      } catch (e) {
        // key doesn't exist yet
      }
      setLoaded(true);
    })();
  }, [key]);

  const save = async (newValue) => {
    setValue(newValue);
    try {
      const serialized = JSON.stringify(newValue);
      window.localStorage?.setItem(key, serialized);
      if (window.storage?.set) {
        await window.storage.set(key, serialized);
      }
    } catch (e) {
      console.error('Storage error:', e);
    }
  };

  return [value, save, loaded];
};
