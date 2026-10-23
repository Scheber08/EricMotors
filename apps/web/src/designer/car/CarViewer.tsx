import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { CarAnalysis } from '@ericmotors/physics';
import type { Car, PaintLayer } from '@ericmotors/schema';
import { type BodyGroup, bodyLayout, buildBody } from './bodyGeometry';

/**
 * Echtzeit-3D-Vorschau des Autos. ISO-8855-Koordinaten (x vor, y links, z oben) werden auf
 * three.js (y oben) abgebildet: (x, y, z) → (x, z, −y).
 */

export type ViewMode = 'normal' | 'xray' | 'exploded';

interface Props {
  car: Car;
  analysis: CarAnalysis | undefined;
  mode: ViewMode;
  /** Klick auf ein Bauteil wählt den zugehörigen Abschnitt. */
  onSelect: (section: string) => void;
}

const iso = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

/** Physikalisch basiertes Material je Lackart. */
function paintProps(layer: PaintLayer): THREE.MeshPhysicalMaterialParameters {
  const base: THREE.MeshPhysicalMaterialParameters = {
    color: new THREE.Color(layer.color),
    clearcoat: layer.clearcoat,
    clearcoatRoughness: 0.06,
  };
  switch (layer.finish) {
    case 'solid':
      return { ...base, metalness: 0.05, roughness: 0.35 };
    case 'metallic':
      return { ...base, metalness: 0.45 + 0.4 * layer.flake, roughness: 0.32 - 0.12 * layer.flake };
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
      return { ...base, metalness: 0.2, roughness: 0.75, clearcoat: 0 };
    case 'satin':
      return { ...base, metalness: 0.3, roughness: 0.5, clearcoat: 0.2 };
    case 'chrome':
      return { ...base, metalness: 1, roughness: 0.04 };
  }
}

function zoneLayer(car: Car, zone: 'roof' | 'hood' | 'lower' | 'mirrors' | 'trim'): PaintLayer {
  if (car.paint.wrap) return car.paint.wrap;
  return car.paint.zones.find((z) => z.zone === zone)?.layer ?? car.paint.base;
}

function useBodyGeometry(car: Car) {
  const { model, wheels, suspension, engine } = car;
  return useMemo(() => {
    const mesh = buildBody(car);
    const order: BodyGroup[] = ['paint', 'hood', 'lower', 'roof', 'glass', 'dark'];
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
    for (const g of order) {
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
  }, [model, wheels, suspension.rideHeight, engine.placement]);
}

function Body({
  car,
  mode,
  onSelect,
}: {
  car: Car;
  mode: ViewMode;
  onSelect: (s: string) => void;
}) {
  const { geometry, groups } = useBodyGeometry(car);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const xray = mode === 'xray';
  const materials = useMemo(() => {
    return groups.map((g) => {
      const transparent = xray
        ? { transparent: true, opacity: g === 'glass' ? 0.1 : 0.18, depthWrite: false }
        : {};
      switch (g) {
        case 'glass':
          return new THREE.MeshPhysicalMaterial({
            color: '#1b2430',
            metalness: 0.2,
            roughness: 0.05,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            ...transparent,
          });
        case 'dark':
          return new THREE.MeshStandardMaterial({
            color: '#101215',
            roughness: 0.9,
            side: THREE.DoubleSide,
            ...transparent,
          });
        case 'paint':
          return new THREE.MeshPhysicalMaterial({
            ...paintProps(car.paint.wrap ?? car.paint.base),
            side: THREE.DoubleSide,
            ...transparent,
          });
        default:
          return new THREE.MeshPhysicalMaterial({
            ...paintProps(zoneLayer(car, g)),
            side: THREE.DoubleSide,
            ...transparent,
          });
      }
    });
  }, [groups, car.paint, xray]);
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);

  const lift = mode === 'exploded' ? 0.45 : 0;
  return (
    <mesh
      geometry={geometry}
      material={materials}
      position={[0, lift, 0]}
      castShadow
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect('model');
      }}
    />
  );
}

function Wheel({
  car,
  axle,
  side,
  mode,
  onSelect,
}: {
  car: Car;
  axle: 0 | 1;
  side: 1 | -1;
  mode: ViewMode;
  onSelect: (s: string) => void;
}) {
  const l = bodyLayout(car);
  const w = l.wheels[axle]!;
  const tire = axle === 0 ? car.wheels.front : car.wheels.rear;
  const brake = axle === 0 ? car.brakes.front : car.brakes.rear;
  const rimR = car.wheels.rimDiameter / 2;
  const width = tire.width;
  const explode = mode === 'exploded' ? 0.35 : 0;
  const y = side * (w.track / 2 + explode);
  const position = iso(w.x, y, w.radius);
  const spokes = { steel: 0, 'five-spoke': 5, 'multi-spoke': 10, mesh: 14, aero: 0 }[
    car.wheels.rimDesign
  ];
  const rimColor =
    car.wheels.rimMaterial === 'steel'
      ? '#3a3d42'
      : car.wheels.rimMaterial === 'cfrp'
        ? '#1d1f22'
        : '#c7ccd3';
  const caliperColor = brake.pistons >= 4 ? '#c1121f' : '#4b5058';
  const discColor = brake.type === 'carbon-ceramic' ? '#2a2a2a' : '#8a8f96';
  const outer = side; // Außenseite in y-Richtung
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect('wheels');
      }}
    >
      {/* Reifen: Zylinderachse entlang three-z (= ISO −y) */}
      <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[w.radius, w.radius, width, 48, 1, true]} />
        <meshStandardMaterial color="#17181a" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[w.radius - width * 0.18, width * 0.18, 12, 48]} />
        <meshStandardMaterial color="#17181a" roughness={0.85} />
      </mesh>
      {/* Felge: Scheibe + Speichen an der Außenseite */}
      <group position={[0, 0, -outer * (width / 2 - 0.012)]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[rimR, rimR, 0.02, 40]} />
          <meshPhysicalMaterial
            color={spokes === 0 ? rimColor : '#0d0e10'}
            metalness={0.8}
            roughness={0.25}
          />
        </mesh>
        {Array.from({ length: spokes }, (_, i) => (
          <mesh
            key={i}
            rotation={[0, 0, (i / spokes) * Math.PI * 2]}
            position={[0, 0, -outer * 0.012]}
          >
            <boxGeometry args={[0.035 * (spokes > 8 ? 0.6 : 1), rimR * 1.9, 0.02]} />
            <meshPhysicalMaterial color={rimColor} metalness={0.85} roughness={0.2} />
          </mesh>
        ))}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -outer * 0.014]}>
          <torusGeometry args={[rimR, 0.012, 8, 40]} />
          <meshPhysicalMaterial color={rimColor} metalness={0.85} roughness={0.2} />
        </mesh>
      </group>
      {/* Bremse: Scheibe und Sattel innerhalb der Felge */}
      {brake.type !== 'drum' && (
        <group
          onClick={(e) => {
            e.stopPropagation();
            onSelect('brakes');
          }}
        >
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -outer * 0.03]}>
            <cylinderGeometry
              args={[
                Math.min(brake.diameter / 2, rimR - 0.02),
                Math.min(brake.diameter / 2, rimR - 0.02),
                0.025,
                40,
              ]}
            />
            <meshStandardMaterial color={discColor} metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh
            position={[
              -(axle === 0 ? 1 : -1) * brake.diameter * 0.32,
              brake.diameter * 0.2,
              -outer * 0.045,
            ]}
          >
            <boxGeometry args={[0.07, 0.12, 0.05]} />
            <meshStandardMaterial color={caliperColor} roughness={0.5} />
          </mesh>
        </group>
      )}
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
  const dims = analysis.engine.dimensions;
  const engineItem = analysis.mass.items.find((i) => i.group === 'engine');
  const transverse = car.engine.placement.endsWith('transverse');
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
    <mesh
      key={key}
      position={iso(...center)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(section);
      }}
    >
      <boxGeometry args={[size[0], size[2], size[1]]} />
      <meshStandardMaterial
        color={color}
        roughness={0.6}
        metalness={0.3}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
  const seats = Math.min(car.trim.seats, 9);
  const seatRows = Math.ceil(seats / (seats > 5 ? 3 : 2));
  return (
    <group>
      {box(
        'engine',
        [ex, 0, ez],
        transverse
          ? [dims.width, dims.length, dims.height]
          : [dims.length, dims.width, dims.height],
        '#d97706',
        'engine',
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
      {box(
        'tank',
        [-wb + 0.45, 0, car.suspension.rideHeight + 0.18 + explode * 0.5],
        [0.45, 0.8, 0.22],
        '#16a34a',
        'trim',
      )}
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

export function CarViewer({ car, analysis, mode, onSelect }: Props) {
  const [contextLost, setContextLost] = useState(false);
  const d = car.model.dimensions;
  const centerX = d.overhangFront - d.length / 2;
  if (contextLost) return <div className="viewer-fallback">WebGL nicht verfügbar</div>;
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [centerX + d.length * 0.9, d.height * 1.4, d.length * 0.85], fov: 35 }}
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      onCreated={({ gl }) =>
        gl.domElement.addEventListener('webglcontextlost', () => setContextLost(true))
      }
      onPointerMissed={() => onSelect('model')}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 6, 4]} intensity={1.2} castShadow />
      <Environment resolution={256}>
        <Lightformer
          form="rect"
          intensity={3}
          position={[0, 5, 0]}
          scale={[10, 2, 1]}
          rotation-x={Math.PI / 2}
        />
        <Lightformer
          form="rect"
          intensity={1.5}
          position={[-5, 1, -1]}
          scale={[10, 2, 1]}
          rotation-y={Math.PI / 2}
        />
        <Lightformer
          form="rect"
          intensity={1.5}
          position={[5, 1, 1]}
          scale={[10, 2, 1]}
          rotation-y={-Math.PI / 2}
        />
        <Lightformer form="ring" intensity={2} position={[0, 2, 6]} scale={3} />
      </Environment>
      <group position={[-centerX, 0, 0]}>
        <Body car={car} mode={mode} onSelect={onSelect} />
        {([0, 1] as const).flatMap((axle) =>
          ([1, -1] as const).map((side) => (
            <Wheel
              key={`${axle}${side}`}
              car={car}
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
      <ContactShadows position={[0, 0, 0]} opacity={0.45} scale={d.length * 2} blur={2.4} far={2} />
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={2.5}
        maxDistance={14}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, d.height * 0.4, 0]}
      />
    </Canvas>
  );
}
