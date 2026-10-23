/// <reference lib="webworker" />
import { analyzeCar, analyzeEngineVariant } from '@ericmotors/physics';
import type { Car, EngineFamily, EngineVariant } from '@ericmotors/schema';

/**
 * Alle Berechnungen laufen in diesem Web Worker, damit die Oberfläche flüssig bleibt.
 * Nachrichten tragen eine fortlaufende ID; der Client verwirft veraltete Antworten.
 */
export type PhysicsRequest =
  | { id: number; kind: 'car'; car: Car }
  | { id: number; kind: 'engine'; family: EngineFamily; variant: EngineVariant };

export type PhysicsResponse =
  | { id: number; ok: true; kind: 'car'; result: ReturnType<typeof analyzeCar>; ms: number }
  | {
      id: number;
      ok: true;
      kind: 'engine';
      result: ReturnType<typeof analyzeEngineVariant>;
      ms: number;
    }
  | { id: number; ok: false; error: string };

self.onmessage = (event: MessageEvent<PhysicsRequest>) => {
  const req = event.data;
  const start = performance.now();
  try {
    const response: PhysicsResponse =
      req.kind === 'car'
        ? {
            id: req.id,
            ok: true,
            kind: 'car',
            result: analyzeCar(req.car),
            ms: performance.now() - start,
          }
        : {
            id: req.id,
            ok: true,
            kind: 'engine',
            result: analyzeEngineVariant({ family: req.family, variant: req.variant }),
            ms: performance.now() - start,
          };
    self.postMessage(response);
  } catch (error) {
    self.postMessage({
      id: req.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies PhysicsResponse);
  }
};
