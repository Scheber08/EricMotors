import type { LapState } from '@ericmotors/physics';

/** Typen der Testfahrt ohne three.js, damit die Seite die 3D-Szene getrennt nachladen kann. */

export type DriveCamera = 'chase' | 'near' | 'hood' | 'top';
export const DRIVE_CAMERAS: readonly DriveCamera[] = ['chase', 'near', 'hood', 'top'];

export interface Telemetry {
  speed: number;
  gear: number;
  rpm: number;
  slip: number;
  offTrack: boolean;
  time: number;
  lap: LapState;
}
