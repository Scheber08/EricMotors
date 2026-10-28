import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  type DriveInput,
  type DriveState,
  type DrivingModel,
  KERB_WIDTH,
  type LapState,
  type Track,
  initialDriveState,
  initialLapState,
  locate,
  scenery,
  startPose,
  steerAngle,
  stepDrive,
  surfaceAt,
  updateLap,
} from '@ericmotors/physics';
import type { Car } from '@ericmotors/schema';
import { CarModel, type WheelMotion } from '../designer/car/CarViewer';
import type { DriveCamera, Telemetry } from './telemetry';

/**
 * 3D-Szene der Testfahrt: Strecke, Kulisse, Auto und Verfolgerkamera. Die Physik läuft im
 * Renderschritt mit festen Teilschritten; Werte für die Anzeige gehen gedrosselt nach außen.
 * ISO-Koordinaten (x, y, z) → three.js (x, z, −y), Gierwinkel ψ → rotation.y = ψ.
 */

interface Props {
  car: Car;
  model: DrivingModel;
  track: Track;
  input: { current: () => DriveInput };
  camera: DriveCamera;
  /** Jede Änderung setzt das Auto an den Start zurück. */
  resetKey: number;
  onTelemetry: (t: Telemetry) => void;
}

const STEP = 1 / 120;

/** Band entlang der Mittellinie zwischen den seitlichen Abständen a und b (links positiv). */
function ribbon(track: Track, a: number, b: number, y: number, color?: (i: number) => THREE.Color) {
  const pts = track.points;
  const n = pts.length;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const col = color ? new Float32Array((n + 1) * 2 * 3) : null;
  for (let k = 0; k <= n; k++) {
    const p = pts[k % n]!;
    // Normale nach links: (−ty, tx).
    const nx = -p.ty;
    const ny = p.tx;
    const left = [p.x + nx * a, p.y + ny * a];
    const right = [p.x + nx * b, p.y + ny * b];
    pos.set([left[0]!, y, -left[1]!, right[0]!, y, -right[1]!], k * 6);
    if (col && color) {
      const c = color(k % n);
      col.set([c.r, c.g, c.b, c.r, c.g, c.b], k * 6);
    }
  }
  const index: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = k * 2;
    index.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function TrackMesh({ track }: { track: Track }) {
  const geos = useMemo(() => {
    const half = track.width / 2;
    const red = new THREE.Color('#c62828');
    const white = new THREE.Color('#f4f4f4');
    const grass = new THREE.Color('#4f7d3b');
    // Randsteine nur in Kurven; auf Geraden Grasfarbe (wirkt wie ein Grünstreifen).
    const kerb = (i: number) => {
      const p = track.points[i]!;
      if (Math.abs(p.curvature) < 1 / 140) return grass;
      return Math.floor(p.s / 3) % 2 ? red : white;
    };
    return {
      asphalt: ribbon(track, half, -half, 0.04),
      lineL: ribbon(track, half - 0.35, half - 0.6, 0.08),
      lineR: ribbon(track, -half + 0.6, -half + 0.35, 0.08),
      kerbL: ribbon(track, half + KERB_WIDTH, half, 0.06, kerb),
      kerbR: ribbon(track, -half, -half - KERB_WIDTH, 0.06, kerb),
    };
  }, [track]);
  useEffect(() => () => Object.values(geos).forEach((g) => g.dispose()), [geos]);
  const start = track.points[0]!;
  const heading = Math.atan2(start.ty, start.tx);
  return (
    <group>
      <mesh geometry={geos.asphalt} receiveShadow>
        <meshStandardMaterial color="#3a3c41" roughness={0.92} />
      </mesh>
      <mesh geometry={geos.lineL}>
        <meshStandardMaterial color="#e9e9e9" roughness={0.7} />
      </mesh>
      <mesh geometry={geos.lineR}>
        <meshStandardMaterial color="#e9e9e9" roughness={0.7} />
      </mesh>
      <mesh geometry={geos.kerbL} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.6} />
      </mesh>
      <mesh geometry={geos.kerbR} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.6} />
      </mesh>
      {/* Start-/Ziellinie (Schachbrett) und Brücke */}
      <group position={[start.x, 0, -start.y]} rotation-y={heading}>
        {Array.from({ length: 2 * 12 }, (_, i) => {
          const row = i % 2;
          const col = Math.floor(i / 2);
          const size = track.width / 12;
          return (
            <mesh
              key={i}
              position={[(row - 0.5) * size, 0.07, (col - 5.5) * size]}
              rotation-x={-Math.PI / 2}
            >
              <planeGeometry args={[size, size]} />
              <meshStandardMaterial color={(row + col) % 2 ? '#111111' : '#f5f5f5'} />
            </mesh>
          );
        })}
        {([1, -1] as const).map((side) => (
          <mesh key={side} position={[0, 2.6, side * (track.width / 2 + 2)]} castShadow>
            <boxGeometry args={[0.5, 5.2, 0.5]} />
            <meshStandardMaterial color="#d9dde3" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[0, 5.4, 0]} castShadow>
          <boxGeometry args={[0.8, 1, track.width + 4.5]} />
          <meshStandardMaterial color="#ea580c" roughness={0.5} />
        </mesh>
      </group>
    </group>
  );
}

function Trees({ track }: { track: Track }) {
  const trees = useMemo(() => scenery(track, 160), [track]);
  const trunk = useRef<THREE.InstancedMesh>(null);
  const crown = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    trees.forEach((t, i) => {
      const s = t.scale;
      m.compose(new THREE.Vector3(t.x, 1.5 * s, -t.y), q, new THREE.Vector3(s, s, s));
      trunk.current?.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, 5.5 * s, -t.y), q, new THREE.Vector3(s, s, s));
      crown.current?.setMatrixAt(i, m);
    });
    if (trunk.current) trunk.current.instanceMatrix.needsUpdate = true;
    if (crown.current) crown.current.instanceMatrix.needsUpdate = true;
  }, [trees]);
  return (
    <>
      <instancedMesh ref={trunk} args={[undefined, undefined, trees.length]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 3, 8]} />
        <meshStandardMaterial color="#5b4030" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, trees.length]} castShadow>
        <coneGeometry args={[2.6, 7, 10]} />
        <meshStandardMaterial color="#2f5d2a" roughness={0.85} />
      </instancedMesh>
    </>
  );
}

/** Physik, Auto und Kamera; läuft in jedem Bild. */
function Vehicle({ car, model, track, input, camera, resetKey, onTelemetry }: Props) {
  const outer = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const wheels = useRef<WheelMotion>({ steer: 0, spin: 0 });
  const state = useRef<DriveState>(initialDriveState());
  const lap = useRef<LapState>(initialLapState());
  const time = useRef(0);
  const hint = useRef<number | undefined>(undefined);
  const lastReport = useRef(0);
  const offTrack = useRef(false);
  const cam = useThree((s) => s.camera);
  const camTarget = useRef(new THREE.Vector3());

  useEffect(() => {
    const pose = startPose(track);
    state.current = initialDriveState(pose.x, pose.y, pose.heading);
    lap.current = initialLapState();
    time.current = 0;
    hint.current = undefined;
    camTarget.current.set(pose.x, 0.6, -pose.y);
    cam.position.set(
      pose.x - Math.cos(pose.heading) * 9,
      3.2,
      -(pose.y - Math.sin(pose.heading) * 9),
    );
  }, [resetKey, track, model, cam]);

  const L = model.wheelbase;
  const H = car.model.dimensions.height;

  useFrame((_, frameDt) => {
    const dt = Math.min(frameDt, 0.05);
    const steps = Math.max(1, Math.round(dt / STEP));
    const drive = input.current();
    let s = state.current;
    for (let i = 0; i < steps; i++) {
      const loc = locate(track, s.x, s.y, hint.current);
      hint.current = loc.index;
      const surface = surfaceAt(track, loc);
      offTrack.current = surface.grip < 1;
      s = stepDrive(model, s, drive, dt / steps, surface);
      time.current += dt / steps;
      lap.current = updateLap(
        lap.current,
        locate(track, s.x, s.y, hint.current).s,
        time.current,
        track.length,
      );
    }
    state.current = s;

    // Auto: Lage, Nicken und Wanken aus Längs- und Querbeschleunigung.
    const speed = Math.hypot(s.u, s.w);
    wheels.current.steer = steerAngle(s.steer, speed);
    wheels.current.spin = s.wheelAngle;
    if (outer.current) {
      outer.current.position.set(s.x, 0.04, -s.y);
      outer.current.rotation.y = s.heading;
    }
    if (body.current) {
      body.current.rotation.z = THREE.MathUtils.clamp(s.ax * 0.0035, -0.05, 0.05);
      body.current.rotation.x = THREE.MathUtils.clamp(s.u * s.r * 0.005, -0.06, 0.06);
    }
    if (sun.current) {
      sun.current.position.set(s.x + 30, 60, -s.y + 25);
      sun.current.target.position.set(s.x, 0, -s.y);
      sun.current.target.updateMatrixWorld();
    }

    // Kamera folgt weich; die Blickrichtung hängt der Fahrtrichtung leicht hinterher.
    const fx = Math.cos(s.heading);
    const fz = -Math.sin(s.heading);
    const goal = new THREE.Vector3();
    const look = new THREE.Vector3(s.x, 0.6, -s.y);
    let rate = 5;
    switch (camera) {
      case 'chase':
        goal.set(s.x - fx * (L + 6.5), 2.6 + H * 0.4, -s.y - fz * (L + 6.5));
        look.add(new THREE.Vector3(fx * 4, 0.4, fz * 4));
        break;
      case 'near':
        goal.set(s.x - fx * (L + 3), 1.5 + H * 0.3, -s.y - fz * (L + 3));
        look.add(new THREE.Vector3(fx * 3, 0.3, fz * 3));
        rate = 8;
        break;
      case 'hood':
        goal.set(s.x + fx * (L * 0.1), H + 0.15, -s.y + fz * (L * 0.1));
        look.set(s.x + fx * 20, H * 0.8, -s.y + fz * 20);
        rate = 30;
        break;
      case 'top':
        goal.set(s.x - fx * 6, 38, -s.y - fz * 6);
        rate = 3;
        break;
    }
    const k = 1 - Math.exp(-dt * rate);
    cam.position.lerp(goal, camera === 'hood' ? 1 : k);
    camTarget.current.lerp(look, camera === 'hood' ? 1 : 1 - Math.exp(-dt * 10));
    cam.lookAt(camTarget.current);

    if (time.current - lastReport.current > 0.1 || time.current < lastReport.current) {
      lastReport.current = time.current;
      onTelemetry({
        speed: s.u,
        gear: s.gear,
        rpm: s.rpm,
        slip: s.slip,
        offTrack: offTrack.current,
        time: time.current,
        lap: lap.current,
      });
    }
  });

  return (
    <>
      <directionalLight
        ref={sun}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-far={140}
        shadow-bias={-0.0004}
      />
      <group ref={outer}>
        <group ref={body} position={[0, 0, 0]}>
          {/* Ursprung des Modells ist die Vorderachse, der Drehpunkt die Radstandsmitte. */}
          <group position={[L / 2, 0, 0]}>
            <CarModel car={car} wheelMotion={wheels} />
          </group>
        </group>
      </group>
    </>
  );
}

export function DriveScene(props: Props) {
  const { track } = props;
  const extent = useMemo(() => {
    const xs = track.points.map((p) => p.x);
    const ys = track.points.map((p) => p.y);
    return {
      cx: (Math.min(...xs) + Math.max(...xs)) / 2,
      cy: (Math.min(...ys) + Math.max(...ys)) / 2,
      size: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 600,
    };
  }, [track]);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 60, near: 0.3, far: 1500, position: [-10, 4, 0] }}
      gl={{ antialias: true }}
      onCreated={({ gl }) => (gl.toneMappingExposure = 1)}
    >
      <color attach="background" args={['#a9c8e8']} />
      <fog attach="fog" args={['#bcd3ea', 180, 900]} />
      <hemisphereLight args={['#dce9f7', '#4a5a3a', 0.8]} />
      <Environment resolution={256}>
        <Lightformer
          form="rect"
          intensity={1.6}
          position={[0, 8, 0]}
          scale={[20, 20, 1]}
          rotation-x={Math.PI / 2}
        />
        <Lightformer
          form="ring"
          intensity={0.8}
          position={[0, 1, 0]}
          scale={[30, 30, 1]}
          rotation-x={Math.PI / 2}
          color="#cfe0f2"
        />
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.5, 0]}>
          <planeGeometry args={[60, 60]} />
          <meshBasicMaterial color="#3d5a30" />
        </mesh>
      </Environment>
      <mesh rotation-x={-Math.PI / 2} position={[extent.cx, -0.05, -extent.cy]} receiveShadow>
        <planeGeometry args={[extent.size, extent.size]} />
        <meshStandardMaterial color="#5b8a45" roughness={1} />
      </mesh>
      <TrackMesh track={track} />
      <Trees track={track} />
      <Vehicle {...props} />
    </Canvas>
  );
}
