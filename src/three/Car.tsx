import { useGLTF } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import { compileSelectors } from '../catalog/loadCatalog';
import type { PartSelectors, ResolvedGeneration } from '../catalog/types';
import { useStore } from '../state/store';
import {
  createChromeMaterial,
  createGlassMaterial,
  createLightMaterial,
  createPaintMaterial,
  createTireMaterial,
  createTrimMaterial,
  createWheelFinishMaterial,
  enhanceGenericMaterial,
  setLightsOn,
  updateGlassMaterial,
  updatePaintMaterial,
} from './materials';
import { buildProceduralWheel, detectWheelSlots, splitByWheelZones, type WheelSlot } from './wheels';

export interface CarBounds {
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  frontWheel: THREE.Vector3 | null;
}

type PartName = keyof PartSelectors | 'other' | 'wheelzone';
const PART_ORDER: (keyof PartSelectors)[] = [
  'hide',
  'paint',
  'rims',
  'tires',
  'glass',
  'headlights',
  'taillights',
  'calipers',
  'chrome',
  'trim',
];

const FORWARD_ROT: Record<ResolvedGeneration['forward'], number> = {
  '+z': 0,
  '-z': Math.PI,
  '+x': -Math.PI / 2,
  '-x': Math.PI / 2,
};

const DRACO_PATH = new URL('draco/', document.baseURI).href;

interface Prepared {
  root: THREE.Group;
  parts: Record<PartName, THREE.Mesh[]>;
  slots: WheelSlot[];
  bounds: CarBounds;
  materialNames: string[];
}

function prepare(scene: THREE.Group, gen: ResolvedGeneration): Prepared {
  const model = scene.clone(true);
  const root = new THREE.Group();
  root.name = 'vehiculo';
  const pivot = new THREE.Group();
  pivot.add(model);
  pivot.rotation.y = FORWARD_ROT[gen.forward] + THREE.MathUtils.degToRad(gen.rotationOffsetDeg ?? 0);
  root.add(pivot);

  const matchers = Object.fromEntries(PART_ORDER.map((p) => [p, compileSelectors(gen.parts[p])])) as Record<
    keyof PartSelectors,
    (n: string) => boolean
  >;
  const parts = Object.fromEntries([...PART_ORDER, 'other', 'wheelzone'].map((p) => [p, [] as THREE.Mesh[]])) as Record<
    PartName,
    THREE.Mesh[]
  >;
  const names = new Set<string>();

  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.Material;
    const name = mat?.name ?? '';
    names.add(name);
    mesh.userData.originalMaterial = mat;
    mesh.userData.materialName = name;
    const part = PART_ORDER.find((p) => matchers[p](name)) ?? 'other';
    mesh.userData.part = part;
    parts[part].push(mesh);
    if (part === 'hide') mesh.visible = false;
    mesh.castShadow = part !== 'glass';
    mesh.receiveShadow = part !== 'glass';
  });

  // Escala y centrado: frontal hacia +Z, suelo en y=0.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const [p, list] of Object.entries(parts)) if (p !== 'hide') for (const m of list) box.expandByObject(m, true);
  const size = box.getSize(new THREE.Vector3());
  const scale = gen.lengthMeters / Math.max(size.z, 1e-6);
  pivot.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  box.makeEmpty();
  for (const [p, list] of Object.entries(parts)) if (p !== 'hide') for (const m of list) box.expandByObject(m, true);
  const c = box.getCenter(new THREE.Vector3());
  pivot.position.set(-c.x, -box.min.y, -c.z);
  root.updateMatrixWorld(true);
  const finalSize = box.getSize(new THREE.Vector3());

  const slots = detectWheelSlots(root, parts.tires);

  // Todo lo que cae dentro del volumen de cada llanta (llanta, buje, frenos)
  // se separa por triángulos: así se puede ocultar o recolorear aunque el
  // archivo original mezcle esas piezas con la carrocería en un mismo material.
  for (const part of ['paint', 'rims', 'calipers', 'chrome', 'trim', 'other'] as const) {
    for (const mesh of [...parts[part]]) {
      const inside = splitByWheelZones(mesh, root, slots);
      if (!inside) continue;
      inside.userData.originalMaterial = mesh.userData.originalMaterial;
      inside.userData.part = 'wheelzone';
      inside.userData.rimFinish = part === 'rims';
      inside.userData.caliper = part === 'calipers';
      parts.wheelzone.push(inside);
      if (!mesh.visible) parts[part].splice(parts[part].indexOf(mesh), 1);
    }
  }
  const fronts = slots.filter((s) => s.front);
  const rears = slots.filter((s) => !s.front);
  const wheelbase =
    fronts.length && rears.length ? Math.abs(fronts[0].center.z - rears[0].center.z) : finalSize.z * 0.6;
  const frontWheel = fronts.find((s) => s.side < 0) ?? fronts[0] ?? null;

  return {
    root,
    parts,
    slots,
    bounds: {
      length: finalSize.z,
      width: finalSize.x,
      height: finalSize.y,
      wheelbase,
      frontWheel: frontWheel ? frontWheel.center.clone().setX(frontWheel.outerX) : null,
    },
    materialNames: [...names].sort(),
  };
}

const HIGHLIGHT = new THREE.MeshBasicMaterial({ color: '#ff00d4', name: 'resaltado' });

export function Car({ gen, onBounds }: { gen: ResolvedGeneration; onBounds: (b: CarBounds) => void }) {
  const config = useStore((s) => s.config);
  const loaded = useStore((s) => s.loaded)!;
  const highlight = useStore((s) => s.highlightMaterial);
  const url = config.variantId ? (gen.variantUrls[config.variantId] ?? gen.url) : gen.url;
  const gltf = useGLTF(url, DRACO_PATH, true);

  const prepared = useMemo(() => prepare(gltf.scene as THREE.Group, gen), [gltf.scene, gen]);

  // Materiales compartidos por instancia del coche.
  const mats = useMemo(() => {
    const paint = loaded.catalog.paints.find((p) => p.id === config.paintId) ?? loaded.catalog.paints[0];
    const tireSrc = prepared.parts.tires[0]?.userData.originalMaterial as THREE.Material | undefined;
    return {
      paint: createPaintMaterial(paint),
      glass: createGlassMaterial(config.glassTint),
      tire: createTireMaterial(tireSrc),
      chrome: createChromeMaterial(),
      trim: createTrimMaterial(),
      caliper: new THREE.MeshPhysicalMaterial({ name: 'pinza', color: '#b01218', roughness: 0.35, clearcoat: 1 }),
      barrel: new THREE.MeshStandardMaterial({ name: 'barril', color: '#151515', roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
      brake: new THREE.MeshStandardMaterial({ name: 'disco', color: '#5d5f62', roughness: 0.45, metalness: 0.9 }),
      cap: new THREE.MeshPhysicalMaterial({ name: 'tapabujes', color: '#111', roughness: 0.25, metalness: 0.3, clearcoat: 1 }),
      lights: new Map<string, THREE.MeshPhysicalMaterial>(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared]);

  // Asignación de materiales por pieza (una vez por modelo).
  useLayoutEffect(() => {
    const { parts } = prepared;
    for (const m of parts.paint) m.material = mats.paint;
    for (const m of parts.glass) m.material = mats.glass;
    for (const m of parts.tires) m.material = mats.tire;
    for (const m of parts.chrome) m.material = mats.chrome;
    for (const m of parts.trim) m.material = mats.trim;
    for (const kind of ['headlights', 'taillights'] as const) {
      for (const m of parts[kind]) {
        const orig = m.userData.originalMaterial as THREE.Material;
        let lm = mats.lights.get(orig.uuid);
        if (!lm) mats.lights.set(orig.uuid, (lm = createLightMaterial(orig, kind === 'headlights' ? 'head' : 'tail')));
        m.material = lm;
      }
    }
    for (const m of [...parts.other, ...parts.rims, ...parts.calipers, ...parts.wheelzone])
      enhanceGenericMaterial(m.material as THREE.Material);
    onBounds(prepared.bounds);
    useStore.getState().set({ materialNames: prepared.materialNames, carReady: url });
    (window as unknown as Record<string, unknown>).__carDebug = {
      parts: Object.fromEntries(Object.entries(prepared.parts).map(([k, v]) => [k, v.length])),
      slots: prepared.slots.map((s) => ({ c: s.center.toArray().map((x) => +x.toFixed(3)), r: +s.rimRadius.toFixed(3), t: +s.tireRadius.toFixed(3), w: +s.width.toFixed(3), x: +s.outerX.toFixed(3) })),
      bounds: prepared.bounds,
    };
  }, [prepared, mats, onBounds, url]);

  // Pintura.
  useEffect(() => {
    const p = loaded.catalog.paints.find((x) => x.id === config.paintId);
    if (p) updatePaintMaterial(mats.paint, p);
  }, [config.paintId, mats, loaded]);

  // Cristales.
  useEffect(() => updateGlassMaterial(mats.glass, config.glassTint), [config.glassTint, mats]);

  // Luces.
  useEffect(() => {
    for (const lm of mats.lights.values()) setLightsOn(lm, config.lightsOn);
  }, [config.lightsOn, mats]);

  const caliperColor = loaded.catalog.caliperColors?.find((c) => c.id === config.caliperId)?.color ?? null;
  const wheel = loaded.catalog.wheels.find((w) => w.id === config.wheelId);
  const proceduralWheels = useMemo(() => {
    if (!wheel || wheel.design === 'original' || prepared.slots.length === 0) return null;
    const face = createWheelFinishMaterial(wheel.finish ?? { color: '#b9bcc0', metalness: 0.9, roughness: 0.3 });
    const group = new THREE.Group();
    for (const slot of prepared.slots)
      group.add(buildProceduralWheel(wheel.design, slot, { face, barrel: mats.barrel, brake: mats.brake, caliper: mats.caliper, cap: mats.cap }));
    return group;
  }, [wheel, prepared, mats]);

  // Llantas originales (acabado), pinzas y visibilidad de la zona de rueda.
  useEffect(() => {
    mats.caliper.color.set(caliperColor ?? '#2a2a2a');
    const replace = !!proceduralWheels;
    const finish = wheel?.design === 'original' && wheel.finish ? createWheelFinishMaterial(wheel.finish) : null;
    for (const m of prepared.parts.wheelzone) {
      m.visible = !replace;
      const orig = m.userData.originalMaterial as THREE.Material;
      m.material = m.userData.caliper && caliperColor ? mats.caliper : m.userData.rimFinish && finish ? finish : orig;
    }
    for (const m of prepared.parts.calipers) m.material = caliperColor ? mats.caliper : (m.userData.originalMaterial as THREE.Material);
    return () => finish?.dispose();
  }, [proceduralWheels, wheel, prepared, mats, caliperColor]);

  // Inspector de materiales: resalta el material seleccionado.
  useEffect(() => {
    const touched: THREE.Mesh[] = [];
    if (highlight) {
      prepared.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.userData.materialName === highlight) {
          m.userData.beforeHighlight = m.material;
          m.userData.visibleBeforeHighlight = m.visible;
          m.material = HIGHLIGHT;
          m.visible = true;
          touched.push(m);
        }
      });
    }
    return () => {
      for (const m of touched) {
        m.material = m.userData.beforeHighlight;
        m.visible = m.userData.visibleBeforeHighlight;
      }
    };
  }, [highlight, prepared]);

  return (
    <group>
      <primitive object={prepared.root} />
      {proceduralWheels && <primitive object={proceduralWheels} />}
    </group>
  );
}
