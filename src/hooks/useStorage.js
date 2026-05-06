import { useEffect, useState } from 'react';

export const useStorage = (key, defaultValue) => {
  const [value, setValue] = useState(defaultValue);
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
