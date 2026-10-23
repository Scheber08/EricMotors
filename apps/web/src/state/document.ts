import { create } from 'zustand';
import { temporal } from 'zundo';
import { useStore } from 'zustand';
import type { Car, Engine } from '@ericmotors/schema';

/**
 * Bearbeitungszustand eines Dokuments (Auto oder Motor) mit Undo/Redo.
 * Änderungen erzeugen immer ein neues Dokumentobjekt (Kopie); dessen Identität dient als
 * Schlüssel für Neuberechnung und Autosave.
 */
export interface DocumentState<T> {
  doc: T | undefined;
  /** Setzt das Dokument und leert den Verlauf (Laden ist nicht rückgängig zu machen). */
  load: (doc: T | undefined) => void;
  /** Ändert eine Kopie des Dokuments (erzeugt einen Undo-Schritt). */
  update: (recipe: (draft: T) => void) => void;
}

/** Aufeinanderfolgende Änderungen innerhalb dieses Fensters bilden einen Undo-Schritt (Regler ziehen). */
const UNDO_MERGE_MS = 400;

function createDocumentStore<T>() {
  let clearHistory = () => {};
  const store = create<DocumentState<T>>()(
    temporal(
      (set, get) => ({
        doc: undefined,
        load: (doc) => {
          set({ doc });
          clearHistory();
        },
        update: (recipe) => {
          const current = get().doc;
          if (!current) return;
          const draft = structuredClone(current);
          recipe(draft);
          set({ doc: draft });
        },
      }),
      {
        limit: 200,
        partialize: (s) => ({ doc: s.doc }),
        equality: (a, b) => a.doc === b.doc,
        // Nur den Zustand *vor* einer Serie schneller Änderungen speichern.
        handleSet: (handleSet) => {
          let last = 0;
          return (...args: Parameters<typeof handleSet>) => {
            const now = Date.now();
            if (now - last > UNDO_MERGE_MS || now < last) handleSet(...args);
            last = now;
          };
        },
      },
    ),
  );
  clearHistory = () => store.temporal.getState().clear();
  return store;
}

export const useCarDocument = createDocumentStore<Car>();
export const useEngineDocument = createDocumentStore<Engine>();

type DocStore = typeof useCarDocument | typeof useEngineDocument;

/** Undo/Redo-Zustand eines Dokument-Stores als Hook. */
export function useHistory(store: DocStore) {
  const canUndo = useStore(store.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(store.temporal, (s) => s.futureStates.length > 0);
  const { undo, redo } = store.temporal.getState();
  return { canUndo, canRedo, undo: () => undo(), redo: () => redo() };
}
