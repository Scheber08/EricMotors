import type { DriveInput } from '@ericmotors/physics';

/** Steuerung der Testfahrt: Tastatur, Gamepad und Touch-Tasten werden zusammengeführt. */

export type DriveAction = 'throttle' | 'brake' | 'left' | 'right' | 'handbrake';

export const KEY_BINDINGS: Record<string, DriveAction> = {
  KeyW: 'throttle',
  ArrowUp: 'throttle',
  KeyS: 'brake',
  ArrowDown: 'brake',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
};

export interface GamepadSample {
  /** Linker Stick horizontal −1 (links) .. 1 (rechts). */
  stick: number;
  /** Rechter bzw. linker Trigger 0..1. */
  throttle: number;
  brake: number;
  handbrake: boolean;
}

const DEADZONE = 0.12;

/** Liest das erste verbundene Gamepad (Standard-Belegung) oder `null`. */
export function readGamepad(): GamepadSample | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
  for (const pad of navigator.getGamepads()) {
    if (!pad || !pad.connected) continue;
    return {
      stick: pad.axes[0] ?? 0,
      throttle: pad.buttons[7]?.value ?? 0,
      brake: pad.buttons[6]?.value ?? 0,
      handbrake: pad.buttons[0]?.pressed ?? false,
    };
  }
  return null;
}

/** Fahrereingabe aus gedrückten Aktionen und optional einem Gamepad. */
export function combineInput(
  active: ReadonlySet<DriveAction>,
  pad: GamepadSample | null,
): DriveInput {
  const digitalSteer = (active.has('left') ? 1 : 0) - (active.has('right') ? 1 : 0);
  const stick = pad && Math.abs(pad.stick) > DEADZONE ? -pad.stick : 0;
  return {
    throttle: Math.max(active.has('throttle') ? 1 : 0, pad?.throttle ?? 0),
    brake: Math.max(active.has('brake') ? 1 : 0, pad?.brake ?? 0),
    steer: Math.max(-1, Math.min(1, digitalSteer + stick)),
    handbrake: active.has('handbrake') || (pad?.handbrake ?? false),
  };
}

/** Zeit als „m:ss.mmm“. */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '–:––.–––';
  const ms = Math.round(seconds * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
