import { useEffect, useRef, useState } from 'react';
import type { CarAnalysis, EngineAnalysis } from '@ericmotors/physics';
import type { Car, EngineFamily, EngineVariant } from '@ericmotors/schema';
import type { PhysicsRequest, PhysicsResponse } from './physics.worker';

/** `Omit` verteilt sich nicht über Unions, daher je Variante. */
type RequestBody = PhysicsRequest extends infer R
  ? R extends unknown
    ? Omit<R, 'id'>
    : never
  : never;

let worker: Worker | undefined;
let nextId = 1;
const listeners = new Map<number, (r: PhysicsResponse) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./physics.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<PhysicsResponse>) => {
      listeners.get(e.data.id)?.(e.data);
      listeners.delete(e.data.id);
    };
  }
  return worker;
}

function request(body: RequestBody): Promise<PhysicsResponse> {
  const id = nextId++;
  return new Promise((resolve) => {
    listeners.set(id, resolve);
    getWorker().postMessage({ ...body, id } as PhysicsRequest);
  });
}

interface AnalysisState<T> {
  result: T | undefined;
  error: string | undefined;
  ms: number | undefined;
}

/** Berechnet die Analyse bei jeder Änderung neu; nur die jeweils neueste Antwort wird übernommen. */
function useAnalysis<T>(key: unknown, body: RequestBody | undefined): AnalysisState<T> {
  const [state, setState] = useState<AnalysisState<T>>({
    result: undefined,
    error: undefined,
    ms: undefined,
  });
  const latest = useRef(0);
  useEffect(() => {
    if (!body) return;
    const ticket = ++latest.current;
    void request(body).then((r) => {
      if (ticket !== latest.current) return;
      if (r.ok) setState({ result: r.result as T, error: undefined, ms: r.ms });
      else setState((s) => ({ ...s, error: r.error }));
    });
    // `key` ist die Identität des Dokuments (unveränderliche Zustandsobjekte).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export const useCarAnalysis = (car: Car | undefined) =>
  useAnalysis<CarAnalysis>(car, car ? { kind: 'car', car } : undefined);

export const useEngineAnalysis = (
  family: EngineFamily | undefined,
  variant: EngineVariant | undefined,
) =>
  useAnalysis<EngineAnalysis>(
    variant && family ? [family, variant] : undefined,
    family && variant ? { kind: 'engine', family, variant } : undefined,
  );
