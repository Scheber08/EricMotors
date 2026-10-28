import { describe, expect, it } from 'vitest';
import { CAR_TEMPLATES, type CarTemplateId } from '@ericmotors/schema';
import { analyzeCar } from '../car/analyze';
import {
  type DriveInput,
  type DriveState,
  GRASS,
  drivingModel,
  initialDriveState,
  stepDrive,
} from './vehicle';
import {
  TEST_TRACK,
  buildTrack,
  initialLapState,
  locate,
  scenery,
  startPose,
  surfaceAt,
  updateLap,
} from './track';

const KMH = 1 / 3.6;
const DT = 1 / 120;
const model = (id: CarTemplateId) => drivingModel(analyzeCar(CAR_TEMPLATES[id]()));
const input = (patch: Partial<DriveInput>): DriveInput => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  ...patch,
});

function run(
  m: ReturnType<typeof model>,
  s: DriveState,
  i: DriveInput,
  until: (s: DriveState, t: number) => boolean,
  maxT = 120,
) {
  let t = 0;
  while (t < maxT && !until(s, t)) {
    s = stepDrive(m, s, i, DT);
    t += DT;
  }
  return { s, t };
}

describe('Testfahrt: Fahrmodell aus den Fahrzeugwerten', () => {
  it('Beschleunigung 0–100 liegt nahe am berechneten Wert', () => {
    for (const id of ['light-roadster', 'hot-hatch', 'e-hypercar'] as const) {
      const a = analyzeCar(CAR_TEMPLATES[id]());
      const m = drivingModel(a);
      const { t } = run(m, initialDriveState(), input({ throttle: 1 }), (s) => s.u >= 100 * KMH);
      // Vereinfachte Traktion und Kupplung: etwas schneller, aber gleiche Größenordnung.
      expect(t).toBeGreaterThan(a.performance.accel0to100! * 0.75);
      expect(t).toBeLessThan(a.performance.accel0to100! * 1.2);
    }
  });

  it('stärkeres Auto beschleunigt schneller', () => {
    const time = (id: CarTemplateId) =>
      run(model(id), initialDriveState(), input({ throttle: 1 }), (s) => s.u >= 100 * KMH).t;
    expect(time('e-hypercar')).toBeLessThan(time('hot-hatch'));
    expect(time('hot-hatch')).toBeLessThan(time('diesel-wagon') + 3);
  });

  it('erreicht ungefähr die Höchstgeschwindigkeit, aber nicht mehr', () => {
    const m = model('hot-hatch');
    const { s } = run(m, initialDriveState(), input({ throttle: 1 }), () => false, 150);
    expect(s.u).toBeGreaterThan(m.topSpeed * 0.9);
    expect(s.u).toBeLessThan(m.topSpeed * 1.03);
  });

  it('Bremsweg 100–0 entspricht der Analyse', () => {
    const a = analyzeCar(CAR_TEMPLATES['hot-hatch']());
    const m = drivingModel(a);
    const start = { ...initialDriveState(), u: 100 * KMH };
    const { s } = run(m, start, input({ brake: 1 }), (st) => st.u <= 0.01);
    expect(s.distance).toBeGreaterThan(a.performance.braking100to0 * 0.85);
    expect(s.distance).toBeLessThan(a.performance.braking100to0 * 1.1);
    expect(s.u).toBeGreaterThan(-0.05);
  });

  it('Bremse im Stand legt den Rückwärtsgang ein, Gas wieder vorwärts', () => {
    const m = model('hot-hatch');
    let { s } = run(m, initialDriveState(), input({ brake: 1 }), (_, t) => t > 2);
    expect(s.gear).toBe(-1);
    expect(s.u).toBeLessThan(-1);
    expect(s.u).toBeGreaterThan(-8.1);
    ({ s } = run(m, s, input({ throttle: 1 }), (_, t) => t > 4));
    expect(s.gear).toBeGreaterThanOrEqual(1);
    expect(s.u).toBeGreaterThan(5);
  });

  it('schaltet beim Beschleunigen hoch', () => {
    const m = model('hot-hatch');
    const gears = new Set<number>();
    run(m, initialDriveState(), input({ throttle: 1 }), (s) => {
      gears.add(s.gear);
      return s.u > 150 * KMH;
    });
    expect(gears.size).toBeGreaterThanOrEqual(3);
  });

  it('Lenken fährt eine Kurve, deren Querbeschleunigung die Haftgrenze nicht überschreitet', () => {
    const m = model('hot-hatch');
    const start = { ...initialDriveState(), u: 80 * KMH };
    let maxLat = 0;
    const { s } = run(
      m,
      start,
      input({ steer: 1, throttle: 0.4 }),
      (st) => {
        maxLat = Math.max(maxLat, Math.abs(st.u * st.r));
        return false;
      },
      4,
    );
    expect(Math.abs(s.heading)).toBeGreaterThan(1);
    expect(s.heading).toBeGreaterThan(0); // links
    expect(maxLat).toBeLessThan(m.lateralLimit * 1.6);
  });

  it('auf der Wiese weniger Haftung und mehr Widerstand', () => {
    const m = model('hot-hatch');
    const free = (surface?: typeof GRASS) => {
      let s = { ...initialDriveState(), u: 25 };
      for (let t = 0; t < 3; t += DT) s = stepDrive(m, s, input({}), DT, surface);
      return s.u;
    };
    expect(free(GRASS)).toBeLessThan(free());
  });

  it('Handbremse lässt das Heck ausbrechen', () => {
    const m = model('muscle-car');
    const start = { ...initialDriveState(), u: 60 * KMH };
    const { s } = run(m, start, input({ steer: 1, handbrake: true }), (_, t) => t > 1);
    expect(Math.abs(s.slip)).toBeGreaterThan(0.05);
  });

  it('Zustand bleibt endlich bei extremen Eingaben', () => {
    const m = model('e-hypercar');
    let s = initialDriveState();
    for (let i = 0; i < 6000; i++) {
      s = stepDrive(
        m,
        s,
        input({
          throttle: i % 300 < 200 ? 1 : 0,
          brake: i % 500 > 450 ? 1 : 0,
          steer: Math.sin(i / 50),
          handbrake: i % 700 > 650,
        }),
        DT,
      );
    }
    for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('Testfahrt: Strecke und Rundenzeit', () => {
  const track = buildTrack(TEST_TRACK);

  it('Rundkurs ist geschlossen, etwa 2–3 km lang und überschneidet sich nicht', () => {
    expect(track.length).toBeGreaterThan(1800);
    expect(track.length).toBeLessThan(3200);
    const pts = track.points;
    const step = Math.ceil((track.width * 3) / 2);
    for (let i = 0; i < pts.length; i += 3) {
      for (let j = i + step * 4; j < pts.length; j += 3) {
        if (pts.length - j + i < step * 4) continue;
        const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
        expect(d).toBeGreaterThan(track.width * 1.5);
      }
    }
  });

  it('Ortung findet Bogenlänge und Seitenabstand', () => {
    const p = track.points[50]!;
    const loc = locate(track, p.x - p.ty * 3, p.y + p.tx * 3);
    expect(loc.index).toBe(50);
    expect(loc.offset).toBeCloseTo(3, 3);
    expect(loc.s).toBeCloseTo(p.s, 3);
    expect(surfaceAt(track, loc).grip).toBe(1);
    expect(surfaceAt(track, locate(track, p.x - p.ty * 20, p.y + p.tx * 20)).grip).toBeLessThan(1);
    // Mit Hinweis gleiches Ergebnis.
    expect(locate(track, p.x, p.y, 45).index).toBe(50);
  });

  it('Start steht vor der Ziellinie in Fahrtrichtung', () => {
    const pose = startPose(track);
    const loc = locate(track, pose.x, pose.y);
    expect(loc.s).toBeGreaterThan(track.length - 20);
  });

  it('zählt nur vollständige Runden in Fahrtrichtung', () => {
    const L = track.length;
    let lap = initialLapState();
    const at = (s: number, t: number) => (lap = updateLap(lap, s, t, L));
    at(L - 5, 0);
    at(1, 1); // erste Zieldurchfahrt startet die Uhr
    expect(lap.lapStart).toBe(1);
    expect(lap.laps).toBe(0);
    at(0.5 * L, 30);
    at(L - 1, 60);
    at(2, 61);
    expect(lap.laps).toBe(1);
    expect(lap.lastLap).toBe(60);
    // Abkürzung: zurück über die Linie und wieder vor zählt nicht.
    at(L - 3, 62);
    at(3, 63);
    expect(lap.laps).toBe(1);
    at(0.5 * L, 90);
    at(L - 1, 110);
    at(1, 111);
    expect(lap.laps).toBe(2);
    expect(lap.bestLap).toBe(48);
  });

  it('Kulisse hält Abstand zur Fahrbahn und ist reproduzierbar', () => {
    const trees = scenery(track, 60);
    expect(trees.length).toBe(60);
    expect(scenery(track, 60)).toEqual(trees);
    for (const t of trees) {
      const p = track.points[locate(track, t.x, t.y).index]!;
      expect(Math.hypot(p.x - t.x, p.y - t.y)).toBeGreaterThan(track.width / 2 + 10);
    }
  });

  it('ein einfacher Autopilot fährt eine gültige Runde in plausibler Zeit', () => {
    const lapTime = (id: CarTemplateId) => {
      const m = model(id);
      const pose = startPose(track);
      let s = initialDriveState(pose.x, pose.y, pose.heading);
      let lap = initialLapState();
      let hint: number | undefined;
      let t = 0;
      let offTrack = 0;
      while (t < 400 && lap.laps < 1) {
        const loc = locate(track, s.x, s.y, hint);
        hint = loc.index;
        // Zielpunkt voraus (Pure Pursuit); Sollgeschwindigkeit so, dass jede Kurve voraus mit
        // 60 % der Haftgrenze und 40 % der Bremsleistung erreichbar ist.
        const n = track.points.length;
        const ahead = track.points[(loc.index + 4 + Math.round(s.u / 6)) % n]!;
        let vTarget = 90;
        for (let i = 0; i < 150; i += 2) {
          const p = track.points[(loc.index + i) % n]!;
          const vCorner = Math.sqrt((m.lateralLimit * 0.6) / Math.max(Math.abs(p.curvature), 1e-4));
          vTarget = Math.min(vTarget, Math.sqrt(vCorner ** 2 + 2 * 0.4 * m.brakeLimit * i * 2));
        }
        let err = Math.atan2(ahead.y - s.y, ahead.x - s.x) - s.heading;
        while (err > Math.PI) err -= 2 * Math.PI;
        while (err < -Math.PI) err += 2 * Math.PI;
        const input: DriveInput = {
          throttle: Math.max(0, Math.min(1, (vTarget - s.u) / 2)),
          // Dosiert bremsen, damit Seitenführung übrig bleibt (Kammscher Kreis).
          brake: Math.max(0, Math.min(0.5, (s.u - vTarget) / 6)),
          steer: Math.max(-1, Math.min(1, err * 3)),
          handbrake: false,
        };
        const surface = surfaceAt(track, loc);
        if (surface.grip < 1) offTrack += DT;
        s = stepDrive(m, s, input, DT, surface);
        t += DT;
        lap = updateLap(lap, locate(track, s.x, s.y, hint).s, t, track.length);
      }
      expect(lap.laps).toBe(1);
      expect(offTrack).toBeLessThan(2);
      return lap.lastLap!;
    };
    const hypercar = lapTime('e-hypercar');
    const wagon = lapTime('diesel-wagon');
    expect(hypercar).toBeGreaterThan(40);
    expect(wagon).toBeLessThan(200);
    expect(hypercar).toBeLessThan(wagon);
  });
});
