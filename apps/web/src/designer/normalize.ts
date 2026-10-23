import {
  CYLINDERS_BY_LAYOUT,
  type Aspiration,
  type Engine,
  type EngineFamily,
  type EngineVariant,
} from '@ericmotors/schema';

/**
 * Hält abhängige Werte nach einer Änderung stimmig, statt ungültige Kombinationen zuzulassen
 * (z. B. Zylinderzahl passend zur Bauart, Diesel ⇄ Einspritzung, Bohrung ≤ Blockmaß).
 */

const BANK_ANGLE = { inline: 0, v: Math.PI / 2, boxer: Math.PI } as const;

export function normalizeFamily(family: EngineFamily, changedPath: string): void {
  const allowed = CYLINDERS_BY_LAYOUT[family.layout];
  if (!allowed.includes(family.cylinders)) {
    family.cylinders = allowed.reduce((best, n) =>
      Math.abs(n - family.cylinders) < Math.abs(best - family.cylinders) ? n : best,
    );
  }
  if (changedPath.endsWith('layout')) family.bankAngle = BANK_ANGLE[family.layout];
  if (family.layout !== 'v') family.bankAngle = BANK_ANGLE[family.layout];
  if (family.headType === 'ohv') family.valvesPerCylinder = 2;
  if (family.headType === 'sohc') family.valvesPerCylinder = Math.min(family.valvesPerCylinder, 3);
}

export function normalizeVariant(
  variant: EngineVariant,
  family: EngineFamily,
  changedPath: string,
): void {
  variant.bore = Math.min(variant.bore, family.maxBore);
  variant.stroke = Math.min(variant.stroke, family.maxStroke);
  const dieselSystem =
    variant.fuelSystem === 'diesel-indirect' || variant.fuelSystem === 'common-rail';
  if (changedPath.endsWith('fuel')) {
    if (variant.fuel === 'diesel' && !dieselSystem) {
      variant.fuelSystem = 'common-rail';
      variant.compressionRatio = Math.max(variant.compressionRatio, 16);
      variant.lambda = Math.max(variant.lambda, 1.2);
      variant.revLimit = Math.min(variant.revLimit, (4_800 * Math.PI) / 30);
    } else if (variant.fuel !== 'diesel' && dieselSystem) {
      variant.fuelSystem = 'multi-point';
      variant.compressionRatio = Math.min(variant.compressionRatio, 10.5);
      variant.lambda = Math.min(variant.lambda, 0.9);
    }
  } else if (changedPath.endsWith('fuelSystem')) {
    if (dieselSystem) variant.fuel = 'diesel';
    else if (variant.fuel === 'diesel') variant.fuel = 'premium';
  }
}

/** Standardwerte beim Wechsel der Aufladeart. */
export function defaultAspiration(kind: Aspiration['kind']): Aspiration {
  switch (kind) {
    case 'natural':
      return { kind };
    case 'turbo':
      return { kind, count: 1, size: 0.4, boost: 0.8e5, intercooler: 0.5 };
    case 'supercharger':
      return { kind, type: 'twin-screw', size: 0.5, boost: 0.5e5, intercooler: 0.4 };
  }
}

/** Wendet Normalisierung auf ein ganzes Motordokument an (alle Varianten). */
export function normalizeEngine(engine: Engine, changedPath: string): void {
  normalizeFamily(engine.family, changedPath);
  for (const v of engine.variants) normalizeVariant(v, engine.family, changedPath);
}
