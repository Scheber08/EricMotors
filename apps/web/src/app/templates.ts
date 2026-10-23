import {
  CAR_TEMPLATES,
  type Car,
  type CarTemplateId,
  ENGINE_TEMPLATES,
  type Engine,
  type EngineTemplateId,
  baseCar,
} from '@ericmotors/schema';
import { newId } from '../storage/db';

/** Neues, eigenständiges Auto aus einer Vorlage (frische ID, übersetzter Name). */
export function newCarFromTemplate(id: CarTemplateId | 'base', name: string): Car {
  const car = id === 'base' ? baseCar() : CAR_TEMPLATES[id]();
  return { ...car, id: newId(), meta: { ...car.meta, name } };
}

export function newEngineFromTemplate(id: EngineTemplateId, name: string): Engine {
  const engine = ENGINE_TEMPLATES[id]();
  return { ...engine, id: newId(), meta: { ...engine.meta, name } };
}

export const CAR_TEMPLATE_IDS = Object.keys(CAR_TEMPLATES) as CarTemplateId[];
export const ENGINE_TEMPLATE_IDS = Object.keys(ENGINE_TEMPLATES) as EngineTemplateId[];
