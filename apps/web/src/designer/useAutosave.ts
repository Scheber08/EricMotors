import { useEffect, useRef, useState } from 'react';

/** Speichert ein Dokument verzögert nach jeder Änderung (lokal, IndexedDB). */
export function useAutosave<T>(doc: T | undefined, save: (doc: T) => Promise<void>, delay = 600) {
  const [state, setState] = useState<'saved' | 'saving'>('saved');
  const first = useRef(true);
  useEffect(() => {
    if (!doc) return;
    if (first.current) {
      first.current = false;
      return;
    }
    setState('saving');
    const timer = setTimeout(() => {
      void save(doc).then(() => setState('saved'));
    }, delay);
    return () => clearTimeout(timer);
  }, [doc, save, delay]);
  return state;
}
