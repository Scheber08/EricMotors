import { IDENTITY_ROTATION, type Transform, type Vec3 } from '../primitives';

/** Grad → rad (nur für lesbare Vorlagen). */
export const deg = (d: number) => (d * Math.PI) / 180;
/** 1/min → rad/s. */
export const rpm = (n: number) => (n * Math.PI) / 30;
/** Zoll → m. */
export const inch = (i: number) => i * 0.0254;
/** mm → m. */
export const mm = (x: number) => x / 1000;
/** bar (Überdruck) → Pa. */
export const bar = (b: number) => b * 1e5;

export const at = (position: Vec3): Transform => ({ position, rotation: IDENTITY_ROTATION });
