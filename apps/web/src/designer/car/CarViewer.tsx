import { Canvas, type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import {
  ContactShadows,
  Environment,
  Lightformer,
  Line,
  OrbitControls,
  RoundedBox,
} from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { CarAnalysis } from '@ericmotors/physics';
import type { Car, PaintLayer } from '@ericmotors/schema';
import {
  BODY_GROUPS,
  type BodyGroup,
  type BodyLayout,
  bodyLayout,
  buildBody,
  panelSeams,
} from './bodyGeometry';
import type { CameraView } from './camera';

/**
 * Echtzeit-3D-Vorschau des Autos. ISO-8855-Koordinaten (x vor, y links, z oben) werden auf
 * three.js (y oben) abgebildet: (x, y, z) → (x, z, −y).
 */

export type ViewMode = 'normal' | 'xray' | 'exploded';

interface Props {
  car: Car;
  analysis: CarAnalysis | undefined;
  mode: ViewMode;
  /** Kamerastandpunkt; jede Änderung von `cameraKey` fährt ihn erneut an. */
  camera?: CameraView;
  cameraKey?: number;
  /** Drehteller: Kamera kreist langsam um das Auto. */
  autoRotate?: boolean;
  /** Klick auf ein Bauteil wählt den zugehörigen Abschnitt. */
  onSelect: (section: string) => void;
}

const iso = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

/** Physikalisch basiertes Material je Lackart. */
function paintProps(layer: PaintLayer): THREE.MeshPhysicalMaterialParameters {
  const base: THREE.MeshPhysicalMaterialParameters = {
    color: new THREE.Color(layer.color),
    clearcoat: layer.clearcoat,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.1,
  };
  switch (layer.finish) {
    case 'solid':
      return { ...base, metalness: 0.02, roughness: 0.38 };
    case 'metallic':
      return { ...base, metalness: 0.5 + 0.35 * layer.flake, roughness: 0.34 - 0.12 * layer.flake };
    case 'pearl':
      return {
        ...base,
        metalness: 0.35,
        roughness: 0.28,
        iridescence: 0.4 + 0.6 * layer.flake,
        iridescenceIOR: 1.6,
        sheen: 1,
        sheenColor: new THREE.Color(layer.pearlColor ?? layer.color),
        sheenRoughness: 0.4,
      };
    case 'matte':
      return { ...base, metalness: 0.2, roughness: 0.72, clearcoat: 0 };
    case 'satin':
      return { ...base, metalness: 0.3, roughness: 0.5, clearcoat: 0.2 };
    case 'chrome':
      return { ...base, metalness: 1, roughness: 0.04 };
  }
}

function zoneLayer(
  paint: Car['paint'],
  zone: 'roof' | 'hood' | 'lower' | 'mirrors' | 'trim',
): PaintLayer {
  if (paint.wrap) return paint.wrap;
  return paint.zones.find((z) => z.zone === zone)?.layer ?? paint.base;
}

/** Feste Werkstoffe für Glas, Kunststoff, Leuchten und Kennzeichen. */
const FIXED: Partial<Record<BodyGroup, THREE.MeshPhysicalMaterialParameters>> = {
  glass: {
    color: '#22303d',
    metalness: 0.05,
    roughness: 0.02,
    clearcoat: 1,
    clearcoatRoughness: 0.01,
    envMapIntensity: 2.2,
    transparent: true,
    opacity: 0.9,
  },
  dark: { color: '#111215', roughness: 0.85, metalness: 0.1 },
  gloss: { color: '#07080a', roughness: 0.18, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.2 },
  headlight: {
    color: '#3a414b',
    metalness: 0.95,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.6,
  },
  drl: {
    color: '#ffffff',
    roughness: 0.2,
    emissive: '#eaf3ff',
    emissiveIntensity: 1.6,
    toneMapped: false,
  },
  taillight: {
    color: '#5c0508',
    metalness: 0.2,
    roughness: 0.1,
    clearcoat: 1,
    emissive: '#ff1d25',
    emissiveIntensity: 0.65,
  },
  plate: { color: '#eef0f2', roughness: 0.5, metalness: 0.1 },
};

const PAINT_ZONE: Partial<Record<BodyGroup, 'roof' | 'hood' | 'lower'>> = {
  roof: 'roof',
  hood: 'hood',
  lower: 'lower',
};

function useBodyGeometry(car: Car) {
  const { model, wheels, suspension, powertrain, aero } = car;
  return useMemo(() => {
    const mesh = buildBody(car);
    const geometry = new THREE.BufferGeometry();
    const pos = new Float32Array(mesh.positions.length);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const [x, y, z] = iso(mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!);
      pos[i] = x;
      pos[i + 1] = y;
      pos[i + 2] = z;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const indices: number[] = [];
    const groups: BodyGroup[] = [];
    for (const g of BODY_GROUPS) {
      const idx = mesh.groups[g];
      if (!idx) continue;
      geometry.addGroup(indices.length, idx.length, groups.length);
      groups.push(g);
      for (const i of idx) indices.push(i);
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return { geometry, groups };
    // Nur Form-relevante Teile des Autos lösen Neuaufbau aus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, wheels, suspension.rideHeight, powertrain.type, powertrain.engine?.placement, aero]);
}

function makeMaterial(g: BodyGroup, paint: Car['paint'], xray: boolean) {
  const fade = xray
    ? { transparent: true, opacity: g === 'glass' ? 0.08 : 0.16, depthWrite: false }
    : {};
  const fixed = FIXED[g];
  if (fixed) return new THREE.MeshPhysicalMaterial({ ...fixed, side: THREE.DoubleSide, ...fade });
  const zone = PAINT_ZONE[g];
  const layer = zone ? zoneLayer(paint, zone) : (paint.wrap ?? paint.base);
  return new THREE.MeshPhysicalMaterial({ ...paintProps(layer), side: THREE.DoubleSide, ...fade });
}

function Body({
  car,
  layout,
  mode,
  onSelect,
}: {
  car: Car;
  layout: BodyLayout;
  mode: ViewMode;
  onSelect: (s: string) => void;
}) {
  const { geometry, groups } = useBodyGeometry(car);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const xray = mode === 'xray';
  const paint = car.paint;
  const materials = useMemo(
    () => groups.map((g) => makeMaterial(g, paint, xray)),
    [groups, paint, xray],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  const seams = useMemo(() => panelSeams(layout), [layout]);

  const lift = mode === 'exploded' ? 0.45 : 0;
  return (
    <group position={[0, lift, 0]}>
      <mesh
        geometry={geometry}
        material={materials}
        castShadow
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect('model');
        }}
      />
      {!xray &&
        seams.flatMap((s, i) =>
          ([1, -1] as const).map((side) => (
            <Line
              key={`${i}${side}`}
              points={s.map(([x, y, z]) => iso(x, side * y, z))}
              color="#000000"
              transparent
              opacity={0.45}
              lineWidth={1}
            />
          )),
        )}
      <Mirrors car={car} layout={layout} xray={xray} />
      {layout.open && !xray && <Cockpit layout={layout} />}
      <Aero car={car} layout={layout} xray={xray} onSelect={onSelect} />
      <Exhaust car={car} layout={layout} xray={xray} onSelect={onSelect} />
    </group>
  );
}

function Mirrors({ car, layout, xray }: { car: Car; layout: BodyLayout; xray: boolean }) {
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        ...paintProps(zoneLayer(car.paint, 'mirrors')),
        ...(xray ? { transparent: true, opacity: 0.16, depthWrite: false } : {}),
      }),
    [car.paint, xray],
  );
  useEffect(() => () => material.dispose(), [material]);
  const m = layout.mirror;
  if (!m) return null;
  return (
    <>
      {([1, -1] as const).map((side) => (
        <group key={side} position={iso(m.x, side * m.y, m.z)}>
          <RoundedBox args={[0.1, 0.075, 0.15]} radius={0.03} smoothness={3} material={material} />
          {/* Spiegelglas zur Fahrzeugrückseite */}
          <mesh position={[-0.051, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <planeGeometry args={[0.12, 0.055]} />
            <meshStandardMaterial color="#8d99a6" metalness={1} roughness={0.05} />
          </mesh>
          {/* Arm zur Tür */}
          <mesh position={[0.01, -0.03, side * 0.08]}>
            <boxGeometry args={[0.05, 0.02, 0.1]} />
            <meshStandardMaterial color="#0b0c0e" roughness={0.6} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** Offener Innenraum (Roadster): zwei Sitze mit Kopfstützen und Lenkrad. */
function Cockpit({ layout: l }: { layout: BodyLayout }) {
  const x = lerp(l.cowlX - 0.2, l.rearWindowX + 0.1, 0.62);
  const w = (l.width / 2) * 0.42;
  const leather = <meshStandardMaterial color="#1b1c20" roughness={0.75} />;
  return (
    <group>
      {([1, -1] as const).map((side) => (
        <group key={side} position={iso(x, side * w, l.beltZ - 0.1)} rotation={[0, 0, 0.22]}>
          <RoundedBox args={[0.1, 0.42, 0.46]} radius={0.04} smoothness={3} position={[0, 0.1, 0]}>
            {leather}
          </RoundedBox>
          <RoundedBox
            args={[0.09, 0.14, 0.26]}
            radius={0.035}
            smoothness={3}
            position={[0, 0.38, 0]}
          >
            {leather}
          </RoundedBox>
        </group>
      ))}
      <mesh position={iso(l.cowlX - 0.32, w, l.beltZ + 0.06)} rotation={[0, Math.PI / 2, -0.4]}>
        <torusGeometry args={[0.17, 0.016, 10, 36]} />
        <meshStandardMaterial color="#111214" roughness={0.6} />
      </mesh>
    </group>
  );
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frontsplitter und Heckspoiler bzw. -flügel nach den Abtriebsreglern. */
function Aero({
  car,
  layout: l,
  xray,
  onSelect,
}: {
  car: Car;
  layout: BodyLayout;
  xray: boolean;
  onSelect: (s: string) => void;
}) {
  const { frontDownforce: fd, rearDownforce: rd } = car.aero;
  const W = l.width;
  const carbon = (
    <meshPhysicalMaterial
      color="#141518"
      roughness={0.3}
      metalness={0.3}
      clearcoat={1}
      transparent={xray}
      opacity={xray ? 0.2 : 1}
    />
  );
  const select = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect('aero');
  };
  const wingZ = l.deckZ + 0.1 + 0.16 * rd;
  const wingX = l.xRear + 0.22;
  return (
    <group onClick={select}>
      {fd > 0.08 && (
        <mesh position={iso(l.xFront - 0.12 + 0.03 * fd, 0, l.rideHeight + 0.065)}>
          <boxGeometry args={[0.3, 0.012, W * 0.72]} />
          {carbon}
        </mesh>
      )}
      {rd > 0.08 && rd < 0.4 && (
        // Abrisskante auf dem Heckdeckel
        <mesh position={iso(l.xRear + 0.08, 0, l.deckZ + 0.012)} rotation={[0, 0, 0.12 + 0.3 * rd]}>
          <boxGeometry args={[0.16, 0.012, W * 0.7]} />
          {carbon}
        </mesh>
      )}
      {rd >= 0.4 && (
        <group>
          <mesh position={iso(wingX, 0, wingZ)} rotation={[0, 0, -0.08 - 0.18 * rd]}>
            <boxGeometry args={[0.24 + 0.08 * rd, 0.018, W * 0.86]} />
            {carbon}
          </mesh>
          {([1, -1] as const).map((s) => (
            <group key={s}>
              {/* Endplatten */}
              <mesh position={iso(wingX, s * W * 0.43, wingZ - 0.02)}>
                <boxGeometry args={[0.3, 0.12, 0.008]} />
                {carbon}
              </mesh>
              {/* Stützen */}
              <mesh position={iso(wingX + 0.02, s * W * 0.25, (wingZ + l.deckZ) / 2)}>
                <boxGeometry args={[0.07, wingZ - l.deckZ, 0.012]} />
                {carbon}
              </mesh>
            </group>
          ))}
        </group>
      )}
    </group>
  );
}

/** Endrohre: nur mit Verbrennungsmotor; Anzahl und Durchmesser nach Motor und Abgasanlage. */
function Exhaust({
  car,
  layout: l,
  xray,
  onSelect,
}: {
  car: Car;
  layout: BodyLayout;
  xray: boolean;
  onSelect: (s: string) => void;
}) {
  const engine = car.powertrain.engine;
  if (!engine || car.powertrain.type === 'electric') return null;
  const dia = engine.variant.exhaustDiameter;
  const dual = engine.family.cylinders >= 6 || dia >= 0.065;
  const r = Math.min(0.055, Math.max(0.03, dia * 0.75));
  const ys = dual ? [l.width * 0.3, -l.width * 0.3] : [l.width * 0.28];
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect('powertrain');
      }}
    >
      {ys.map((y) => (
        <group
          key={y}
          position={iso(l.xRear + 0.02, y, l.rideHeight + 0.1)}
          rotation={[0, 0, Math.PI / 2]}
        >
          <mesh>
            <cylinderGeometry args={[r, r, 0.14, 24, 1, true]} />
            <meshStandardMaterial
              color="#c9ced6"
              metalness={1}
              roughness={0.18}
              side={THREE.DoubleSide}
              transparent={xray}
              opacity={xray ? 0.2 : 1}
            />
          </mesh>
          <mesh position={[0, 0.03, 0]}>
            <cylinderGeometry args={[r * 0.88, r * 0.88, 0.01, 24]} />
            <meshStandardMaterial color="#050505" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Reifenquerschnitt (Radius, Achsrichtung) für die Drehkörper-Geometrie. */
function tireProfile(rimR: number, R: number, width: number): THREE.Vector2[] {
  const h = R - rimR;
  const w2 = width / 2;
  const pts: [number, number][] = [
    [rimR + 0.004, -w2 * 0.86],
    [rimR + h * 0.35, -w2 * 0.98],
    [rimR + h * 0.7, -w2 * 1.02],
    [R - 0.025, -w2 * 0.96],
    [R - 0.006, -w2 * 0.86],
    [R, -w2 * 0.7],
    [R, w2 * 0.7],
    [R - 0.006, w2 * 0.86],
    [R - 0.025, w2 * 0.96],
    [rimR + h * 0.7, w2 * 1.02],
    [rimR + h * 0.35, w2 * 0.98],
    [rimR + 0.004, w2 * 0.86],
  ];
  return pts.map(([r, y]) => new THREE.Vector2(r, y));
}

/** Felgenbett mit Horn an der Außenseite. */
function rimProfile(rimR: number, width: number): THREE.Vector2[] {
  const w2 = width / 2;
  const pts: [number, number][] = [
    [rimR - 0.012, -w2 * 0.86],
    [rimR + 0.01, -w2 * 0.88],
    [rimR + 0.012, -w2 * 0.8],
    [rimR - 0.008, -w2 * 0.74],
    [rimR - 0.018, -w2 * 0.2],
    [rimR - 0.012, w2 * 0.74],
    [rimR + 0.006, w2 * 0.84],
    [rimR - 0.006, w2 * 0.88],
  ];
  return pts.map(([r, y]) => new THREE.Vector2(r, y));
}

/** Lenkeinschlag (rad, links positiv) und Raddrehwinkel (rad) für die Testfahrt. */
export interface WheelMotion {
  steer: number;
  spin: number;
}

function Wheel({
  car,
  layout,
  axle,
  side,
  mode,
  onSelect,
  motion,
}: {
  car: Car;
  layout: BodyLayout;
  axle: 0 | 1;
  side: 1 | -1;
  mode: ViewMode;
  onSelect: (s: string) => void;
  motion?: { current: WheelMotion } | undefined;
}) {
  const steerRef = useRef<THREE.Group>(null);
  const spinRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!motion) return;
    if (steerRef.current && axle === 0) steerRef.current.rotation.y = motion.current.steer;
    // Drehkörperachse zeigt nach außen: links ISO +y, rechts −y.
    if (spinRef.current) spinRef.current.rotation.y = side * motion.current.spin;
  });
  const w = layout.wheels[axle]!;
  const tire = axle === 0 ? car.wheels.front : car.wheels.rear;
  const brake = axle === 0 ? car.brakes.front : car.brakes.rear;
  const rimR = car.wheels.rimDiameter / 2;
  const width = tire.width;
  const explode = mode === 'exploded' ? 0.35 : 0;
  const y = side * (w.track / 2 + explode);
  const position = iso(w.x, y, w.radius);
  const design = car.wheels.rimDesign;
  const rimColor =
    car.wheels.rimMaterial === 'steel'
      ? '#3a3d42'
      : car.wheels.rimMaterial === 'cfrp'
        ? '#1d1f22'
        : '#c9ced5';
  const caliperColor =
    brake.type === 'carbon-ceramic' ? '#e0a400' : brake.pistons >= 4 ? '#c1121f' : '#4b5058';
  const discColor = brake.type === 'carbon-ceramic' ? '#2a2a2a' : '#8a8f96';
  const discR = Math.min(brake.diameter / 2, rimR - 0.03);
  const tireGeo = useMemo(
    () => new THREE.LatheGeometry(tireProfile(rimR, w.radius, width), 64),
    [rimR, w.radius, width],
  );
  const rimGeo = useMemo(() => new THREE.LatheGeometry(rimProfile(rimR, width), 48), [rimR, width]);
  useEffect(
    () => () => {
      tireGeo.dispose();
      rimGeo.dispose();
    },
    [tireGeo, rimGeo],
  );
  // Drehkörper laufen um three-y; das Rad dreht um three-z (ISO −y). Die Außenseite liegt bei +y
  // der Drehkörper; auf der rechten Seite wird gespiegelt.
  const face = width * 0.36;
  const rimMat = (
    <meshPhysicalMaterial color={rimColor} metalness={0.85} roughness={0.22} clearcoat={0.6} />
  );
  const spokes = { steel: 0, 'five-spoke': 5, 'multi-spoke': 10, mesh: 16, aero: 0 }[design];
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect('wheels');
      }}
    >
      <group ref={steerRef}>
        <group rotation={[side === 1 ? -Math.PI / 2 : Math.PI / 2, 0, 0]}>
          <group ref={spinRef}>
            <mesh geometry={tireGeo} castShadow>
              <meshStandardMaterial color="#141517" roughness={0.88} side={THREE.DoubleSide} />
            </mesh>
            <mesh geometry={rimGeo}>
              <meshPhysicalMaterial
                color={rimColor}
                metalness={0.8}
                roughness={0.28}
                side={THREE.DoubleSide}
              />
            </mesh>
            {/* Dunkler Innenraum der Felge */}
            <mesh position={[0, -width * 0.2, 0]}>
              <cylinderGeometry args={[rimR - 0.015, rimR - 0.015, 0.01, 40]} />
              <meshStandardMaterial color="#0c0d0f" roughness={0.9} />
            </mesh>
            {/* Felgenstern bzw. -scheibe */}
            <group position={[0, face, 0]}>
              {(design === 'steel' || design === 'aero') && (
                <mesh>
                  <cylinderGeometry args={[rimR - 0.012, rimR - 0.006, 0.014, 48]} />
                  {design === 'aero' ? (
                    <meshPhysicalMaterial
                      color={rimColor}
                      metalness={0.6}
                      roughness={0.3}
                      clearcoat={1}
                    />
                  ) : (
                    rimMat
                  )}
                </mesh>
              )}
              {design === 'steel' &&
                Array.from({ length: 8 }, (_, i) => {
                  const a = (i / 8) * Math.PI * 2;
                  return (
                    <mesh
                      key={i}
                      position={[Math.cos(a) * rimR * 0.62, 0.008, Math.sin(a) * rimR * 0.62]}
                    >
                      <cylinderGeometry args={[rimR * 0.1, rimR * 0.1, 0.004, 16]} />
                      <meshStandardMaterial color="#060607" />
                    </mesh>
                  );
                })}
              {design === 'aero' &&
                Array.from({ length: 5 }, (_, i) => {
                  const a = (i / 5) * Math.PI * 2;
                  return (
                    <mesh
                      key={i}
                      position={[Math.cos(a) * rimR * 0.68, 0.008, Math.sin(a) * rimR * 0.68]}
                      rotation={[0, -a, 0]}
                    >
                      <boxGeometry args={[rimR * 0.22, 0.004, rimR * 0.08]} />
                      <meshStandardMaterial color="#060607" />
                    </mesh>
                  );
                })}
              {Array.from({ length: spokes }, (_, i) => {
                const a = (i / spokes) * Math.PI * 2;
                const thin = spokes > 8;
                const len = rimR * 0.86;
                return (
                  <mesh
                    key={i}
                    position={[Math.cos(a) * len * 0.55, 0, Math.sin(a) * len * 0.55]}
                    rotation={[0, -a + (design === 'mesh' ? (i % 2 ? 0.35 : -0.35) : 0), 0]}
                  >
                    <boxGeometry args={[len * 0.9, 0.022, thin ? 0.018 : 0.05]} />
                    {rimMat}
                  </mesh>
                );
              })}
              {/* Nabe, Radmuttern, Nabendeckel */}
              <mesh>
                <cylinderGeometry args={[rimR * 0.24, rimR * 0.26, 0.03, 32]} />
                {rimMat}
              </mesh>
              {Array.from({ length: 5 }, (_, i) => {
                const a = (i / 5) * Math.PI * 2;
                return (
                  <mesh
                    key={i}
                    position={[Math.cos(a) * rimR * 0.16, 0.018, Math.sin(a) * rimR * 0.16]}
                  >
                    <cylinderGeometry args={[0.011, 0.011, 0.012, 6]} />
                    <meshStandardMaterial color="#9aa0a8" metalness={1} roughness={0.3} />
                  </mesh>
                );
              })}
              <mesh position={[0, 0.02, 0]}>
                <cylinderGeometry args={[rimR * 0.09, rimR * 0.1, 0.012, 24]} />
                <meshStandardMaterial color="#1a1b1e" metalness={0.5} roughness={0.35} />
              </mesh>
            </group>
          </group>
          {/* Bremse: Scheibe mit Topf und Sattel hinter dem Felgenstern */}
          {brake.type !== 'drum' && (
            <group
              onClick={(e) => {
                e.stopPropagation();
                onSelect('brakes');
              }}
            >
              <mesh position={[0, face - 0.05, 0]}>
                <cylinderGeometry args={[discR, discR, 0.024, 48]} />
                <meshStandardMaterial color={discColor} metalness={0.8} roughness={0.35} />
              </mesh>
              <mesh position={[0, face - 0.035, 0]}>
                <cylinderGeometry args={[discR * 0.45, discR * 0.45, 0.03, 32]} />
                <meshStandardMaterial color="#5a5e64" metalness={0.6} roughness={0.5} />
              </mesh>
              <group rotation={[0, (axle === 0 ? 1 : -1) * side * 0.9, 0]}>
                <RoundedBox
                  args={[0.07, 0.06, discR * 0.95]}
                  radius={0.015}
                  smoothness={2}
                  position={[discR * 0.82, face - 0.045, 0]}
                >
                  <meshPhysicalMaterial color={caliperColor} roughness={0.35} clearcoat={0.8} />
                </RoundedBox>
              </group>
            </group>
          )}
        </group>
      </group>
    </group>
  );
}

/** Innere Bauteile (Röntgen-/Explosionsansicht) als einfache Volumenkörper an ihrer berechneten Lage. */
function Internals({
  car,
  analysis,
  mode,
  onSelect,
}: {
  car: Car;
  analysis: CarAnalysis;
  mode: ViewMode;
  onSelect: (s: string) => void;
}) {
  const dims = analysis.engine?.dimensions;
  const engineItem = analysis.mass.items.find((i) => i.group === 'engine');
  const transverse = car.powertrain.engine?.placement.endsWith('transverse') ?? false;
  const explode = mode === 'exploded' ? 0.25 : 0;
  const ex = engineItem?.x ?? 0;
  const ez = (engineItem?.z ?? 0.5) + explode;
  const wb = car.model.dimensions.wheelbase;
  const box = (
    key: string,
    center: [number, number, number],
    size: [number, number, number],
    color: string,
    section: string,
  ) => (
    <RoundedBox
      key={key}
      args={[size[0], size[2], size[1]]}
      radius={Math.min(0.03, Math.min(...size) / 4)}
      smoothness={2}
      position={iso(...center)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(section);
      }}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.5}
        metalness={0.3}
        transparent
        opacity={0.94}
      />
    </RoundedBox>
  );
  const seats = Math.min(car.trim.seats, 9);
  const seatRows = Math.ceil(seats / (seats > 5 ? 3 : 2));
  return (
    <group>
      {dims && (
        <>
          {box(
            'powertrain',
            [ex, 0, ez],
            transverse
              ? [dims.width, dims.length, dims.height]
              : [dims.length, dims.width, dims.height],
            '#d97706',
            'powertrain',
          )}
          {box(
            'gearbox',
            [
              ex - (transverse ? 0 : dims.length / 2 + 0.25),
              transverse ? dims.length / 2 + 0.15 : 0,
              ez - 0.1,
            ],
            [0.45, 0.32, 0.3],
            '#2563eb',
            'drivetrain',
          )}
        </>
      )}
      {car.powertrain.engine &&
        box(
          'tank',
          [-wb + 0.45, 0, car.suspension.rideHeight + 0.18 + explode * 0.5],
          [0.45, 0.8, 0.22],
          '#16a34a',
          'trim',
        )}
      {analysis.mass.items
        .filter((i) => i.group === 'motors')
        .map((i, n) =>
          box(`motor-${n}`, [i.x, 0, i.z + explode], [0.35, 0.5, 0.3], '#7c3aed', 'powertrain'),
        )}
      {analysis.mass.items
        .filter((i) => i.group === 'battery')
        .map((i, n) => {
          // Volumen aus Masse (≈ 2,2 kg/l Packdichte), flach im Boden bzw. kompakt beim Hybrid.
          const volume = i.mass / 2200;
          const floor = car.powertrain.type === 'electric';
          const length = floor ? wb * 0.75 : 0.5;
          const width = floor ? 1.3 : 0.9;
          return box(
            `battery-${n}`,
            [i.x, 0, i.z + explode * 0.5],
            [length, width, Math.max(0.08, volume / (length * width))],
            '#0891b2',
            'powertrain',
          );
        })}
      {Array.from({ length: seats }, (_, i) => {
        const row = Math.floor(i / (seats > 5 ? 3 : 2));
        const perRow = seats > 5 ? 3 : 2;
        const col = (i % perRow) - (perRow - 1) / 2;
        const x = -wb * 0.42 - row * 0.85 * (seatRows > 1 ? 1 : 0);
        return box(
          `seat-${i}`,
          [x, col * 0.5, car.suspension.rideHeight + 0.3 + explode],
          [0.5, 0.45, 0.55],
          '#64748b',
          'trim',
        );
      })}
    </group>
  );
}

/** Kamerapositionen relativ zur Fahrzeugmitte (three.js-Koordinaten). */
function cameraGoal(view: CameraView, L: number, H: number): THREE.Vector3 {
  switch (view) {
    case 'front':
      return new THREE.Vector3(L * 1.3, H * 0.7, 0.001);
    case 'side':
      return new THREE.Vector3(0.001, H * 0.6, L * 1.45);
    case 'rear':
      return new THREE.Vector3(-L * 1.3, H * 0.85, -0.001);
    case 'top':
      return new THREE.Vector3(0.001, L * 1.75, 0.002);
    case 'three-quarter':
      return new THREE.Vector3(L * 0.78, H * 0.95, L * 0.86);
  }
}

interface Controls {
  update(): void;
  addEventListener(type: 'start', listener: () => void): void;
  removeEventListener(type: 'start', listener: () => void): void;
}

/** Fährt die Kamera weich zum gewählten Standpunkt; danach bleibt sie frei bedienbar. */
function CameraRig({
  view,
  viewKey,
  L,
  H,
}: {
  view: CameraView;
  viewKey: number;
  L: number;
  H: number;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const goal = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    goal.current = cameraGoal(view, L, H);
  }, [view, viewKey, L, H]);
  useFrame((_, dt) => {
    if (!goal.current) return;
    camera.position.lerp(goal.current, 1 - Math.exp(-dt * 6));
    controls?.update();
    if (camera.position.distanceTo(goal.current) < 0.01) goal.current = null;
  });
  // Eingriff der Nutzerin bzw. des Nutzers bricht die Fahrt ab.
  useEffect(() => {
    if (!controls) return;
    const stop = () => (goal.current = null);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);
  return null;
}

const noop = () => {};

/**
 * Auto ohne Bühne und Kamera (Karosserie, Spiegel, Anbauteile, Räder), z. B. für die Testfahrt.
 * Ursprung: Mitte Vorderachse auf der Fahrbahn, in three.js-Koordinaten.
 */
export function CarModel({
  car,
  wheelMotion,
}: {
  car: Car;
  wheelMotion?: { current: WheelMotion };
}) {
  const { model, wheels, suspension, powertrain } = car;
  const layout = useMemo(
    () => bodyLayout(car),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, wheels, suspension.rideHeight, powertrain, car.aero],
  );
  return (
    <>
      <Body car={car} layout={layout} mode="normal" onSelect={noop} />
      {([0, 1] as const).flatMap((axle) =>
        ([1, -1] as const).map((side) => (
          <Wheel
            key={`${axle}${side}`}
            car={car}
            layout={layout}
            axle={axle}
            side={side}
            mode="normal"
            onSelect={noop}
            motion={wheelMotion}
          />
        )),
      )}
    </>
  );
}

export function CarViewer({
  car,
  analysis,
  mode,
  camera = 'three-quarter',
  cameraKey = 0,
  autoRotate = false,
  onSelect,
}: Props) {
  const [contextLost, setContextLost] = useState(false);
  const d = car.model.dimensions;
  const centerX = d.overhangFront - d.length / 2;
  const { model, wheels, suspension, powertrain } = car;
  const layout = useMemo(
    () => bodyLayout(car),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, wheels, suspension.rideHeight, powertrain, car.aero],
  );
  const start = cameraGoal('three-quarter', d.length, d.height);
  if (contextLost) return <div className="viewer-fallback">WebGL nicht verfügbar</div>;
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [start.x, start.y, start.z], fov: 32 }}
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
      onCreated={({ gl }) => {
        gl.toneMappingExposure = 0.95;
        gl.domElement.addEventListener('webglcontextlost', () => setContextLost(true));
      }}
      onPointerMissed={() => onSelect('model')}
    >
      <hemisphereLight args={['#ffffff', '#3a3f47', 0.45]} />
      <directionalLight
        position={[4, 7, 5]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-5, 3, -4]} intensity={0.45} />
      <Environment resolution={512}>
        {/* Großes Softbox-Dach */}
        <Lightformer
          form="rect"
          intensity={2.2}
          position={[0, 6, 0]}
          scale={[12, 5, 1]}
          rotation-x={Math.PI / 2}
        />
        {/* Lange Lichtstreifen für Reflexlinien auf den Flanken */}
        {[-1.6, 0, 1.6].map((x) => (
          <Lightformer
            key={x}
            form="rect"
            intensity={2.5}
            position={[x, 2.2, 6]}
            scale={[0.6, 6, 1]}
            rotation-x={-0.2}
          />
        ))}
        {[-1.6, 0, 1.6].map((x) => (
          <Lightformer
            key={`b${x}`}
            form="rect"
            intensity={2}
            position={[x, 2.2, -6]}
            scale={[0.6, 6, 1]}
            rotation-y={Math.PI}
          />
        ))}
        <Lightformer
          form="rect"
          intensity={1.2}
          position={[8, 1.5, 0]}
          scale={[10, 2, 1]}
          rotation-y={-Math.PI / 2}
        />
        <Lightformer
          form="rect"
          intensity={1}
          position={[-8, 1.5, 0]}
          scale={[10, 2, 1]}
          rotation-y={Math.PI / 2}
        />
        {/* Boden: dunkler Horizont für Kontrast unterhalb der Gürtellinie */}
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.5, 0]}>
          <planeGeometry args={[60, 60]} />
          <meshBasicMaterial color="#2a2e35" />
        </mesh>
      </Environment>
      <group position={[-centerX, 0, 0]}>
        <Body car={car} layout={layout} mode={mode} onSelect={onSelect} />
        {([0, 1] as const).flatMap((axle) =>
          ([1, -1] as const).map((side) => (
            <Wheel
              key={`${axle}${side}`}
              car={car}
              layout={layout}
              axle={axle}
              side={side}
              mode={mode}
              onSelect={onSelect}
            />
          )),
        )}
        {mode !== 'normal' && analysis && (
          <Internals car={car} analysis={analysis} mode={mode} onSelect={onSelect} />
        )}
      </group>
      <ContactShadows
        position={[0, 0.001, 0]}
        opacity={0.6}
        scale={d.length * 2.2}
        blur={2.2}
        far={1.6}
        resolution={1024}
      />
      <CameraRig view={camera} viewKey={cameraKey} L={d.length} H={d.height} />
      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        autoRotate={autoRotate}
        autoRotateSpeed={0.9}
        minDistance={2.5}
        maxDistance={14}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, d.height * 0.4, 0]}
      />
    </Canvas>
  );
}
