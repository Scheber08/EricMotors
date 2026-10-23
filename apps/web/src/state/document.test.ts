import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAR_TEMPLATES } from '@ericmotors/schema';
import { useCarDocument } from './document';

const history = () => useCarDocument.temporal.getState();

describe('Dokument-Store', () => {
  afterEach(() => vi.useRealTimers());

  it('Laden leert den Verlauf, Änderungen sind rückgängig zu machen', () => {
    vi.useFakeTimers();
    useCarDocument.getState().load(CAR_TEMPLATES['hot-hatch']());
    expect(history().pastStates).toHaveLength(0);

    vi.setSystemTime(1_000);
    useCarDocument.getState().update((c) => (c.trim.seats = 4));
    vi.setSystemTime(2_000);
    useCarDocument.getState().update((c) => (c.trim.seats = 2));
    expect(useCarDocument.getState().doc?.trim.seats).toBe(2);

    history().undo();
    expect(useCarDocument.getState().doc?.trim.seats).toBe(4);
    history().undo();
    expect(useCarDocument.getState().doc?.trim.seats).toBe(5);
    history().redo();
    expect(useCarDocument.getState().doc?.trim.seats).toBe(4);
  });

  it('schnelle Folgeänderungen (Regler) bilden einen Undo-Schritt', () => {
    vi.useFakeTimers();
    useCarDocument.getState().load(CAR_TEMPLATES['hot-hatch']());
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(10_000 + i * 50);
      useCarDocument.getState().update((c) => (c.aero.cooling = i / 10));
    }
    expect(history().pastStates).toHaveLength(1);
    history().undo();
    expect(useCarDocument.getState().doc?.aero.cooling).toBe(0.4);
  });

  it('update erzeugt ein neues Objekt und lässt das alte unverändert', () => {
    const original = CAR_TEMPLATES['hot-hatch']();
    useCarDocument.getState().load(original);
    useCarDocument.getState().update((c) => (c.trim.seats = 3));
    expect(original.trim.seats).toBe(5);
    expect(useCarDocument.getState().doc).not.toBe(original);
  });
});
