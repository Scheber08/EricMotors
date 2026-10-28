import { createStore, del, get, keys, set } from 'idb-keyval';
import { type Car, type Engine, migrateCar, migrateEngine } from '@ericmotors/schema';

/**
 * Lokale Garage in IndexedDB. Funktioniert ohne Konto und ohne Cloud (Graceful Degradation).
 * Gespeichert wird nur das Eingabedokument; beim Laden wird es migriert und validiert.
 */

export interface StoredDoc<T> {
  doc: T;
  updatedAt: number;
}

export interface DocSummary {
  id: string;
  name: string;
  updatedAt: number;
  /** Nur Autos: migriertes Dokument für die Vorschau (fehlt, wenn es nicht lesbar ist). */
  car?: Car;
}

type Kind = 'car' | 'engine';

const stores = {
  car: typeof indexedDB !== 'undefined' ? createStore('schebermotors-cars', 'docs') : undefined,
  engine:
    typeof indexedDB !== 'undefined' ? createStore('schebermotors-engines', 'docs') : undefined,
};

const migrators = { car: migrateCar, engine: migrateEngine } as const;

function previewCar(doc: unknown): Car | undefined {
  try {
    return migrateCar(doc);
  } catch {
    return undefined;
  }
}

async function list(kind: Kind): Promise<DocSummary[]> {
  const store = stores[kind];
  if (!store) return [];
  const ids = (await keys(store)) as string[];
  const entries = await Promise.all(ids.map((id) => get<StoredDoc<Car | Engine>>(id, store)));
  return entries
    .filter((e): e is StoredDoc<Car | Engine> => !!e)
    .map((e) => {
      const summary: DocSummary = { id: e.doc.id, name: e.doc.meta.name, updatedAt: e.updatedAt };
      const car = kind === 'car' ? previewCar(e.doc) : undefined;
      if (car) summary.car = car;
      return summary;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

async function load<T extends Car | Engine>(kind: Kind, id: string): Promise<T | undefined> {
  const store = stores[kind];
  if (!store) return undefined;
  const entry = await get<StoredDoc<unknown>>(id, store);
  if (!entry) return undefined;
  return migrators[kind](entry.doc) as T;
}

async function save(kind: Kind, doc: Car | Engine): Promise<void> {
  const store = stores[kind];
  if (!store) return;
  await set(doc.id, { doc, updatedAt: Date.now() } satisfies StoredDoc<Car | Engine>, store);
}

async function remove(kind: Kind, id: string): Promise<void> {
  const store = stores[kind];
  if (store) await del(id, store);
}

export const garage = {
  listCars: () => list('car'),
  listEngines: () => list('engine'),
  loadCar: (id: string) => load<Car>('car', id),
  loadEngine: (id: string) => load<Engine>('engine', id),
  saveCar: (car: Car) => save('car', car),
  saveEngine: (engine: Engine) => save('engine', engine),
  removeCar: (id: string) => remove('car', id),
  removeEngine: (id: string) => remove('engine', id),
};

/** Neue zufällige UUID (v4). */
export const newId = () => crypto.randomUUID();
