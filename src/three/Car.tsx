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
import { buildProceduralWheel, classifyTriangles, detectWheelSlots, extractTriangles, keepTriangles, type WheelSlot } from './wheels';

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

/** Rueda preparada: grupo en el centro del buje con su neumático y su llanta. */
interface WheelRig {
  slot: WheelSlot;
  group: THREE.Group;
  /** Contenido dentro del aro (llanta original, buje, frenos) y llanta procedural. Se escala con el diámetro. */
  rim: THREE.Group;
  tires: { mesh: THREE.Mesh; base: Float32Array }[];
}

interface Prepared {
  root: THREE.Group;
  /** Carrocería (todo menos las ruedas): se desplaza con la suspensión. */
  body: THREE.Group;
  bodyBaseY: number;
  wheels: WheelRig[];
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
  pivot.name = 'carroceria';
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
  const wheels: WheelRig[] = slots.map((slot, i) => {
    const group = new THREE.Group();
    group.name = `rueda-${i}`;
    group.position.copy(slot.center);
    const rim = new THREE.Group();
    rim.name = 'llanta';
    group.add(rim);
    root.add(group);
    return { slot, group, rim, tires: [] };
  });
  root.updateMatrixWorld(true);

  /** Crea una malla con los triángulos dados en el espacio local de la rueda. */
  const toWheel = (mesh: THREE.Mesh, tris: number[], w: WheelRig, parent: THREE.Object3D) => {
    const m = new THREE.Matrix4().copy(w.group.matrixWorld).invert().multiply(mesh.matrixWorld);
    const piece = new THREE.Mesh(extractTriangles(mesh.geometry, tris, m), mesh.material);
    piece.name = `${mesh.name}-${w.group.name}`;
    piece.userData = { ...mesh.userData };
    piece.castShadow = mesh.castShadow;
    piece.receiveShadow = mesh.receiveShadow;
    parent.add(piece);
    return piece;
  };

  if (wheels.length) {
    // Neumáticos: cada triángulo va a su rueda.
    for (const mesh of [...parts.tires]) {
      const { perSlot } = classifyTriangles(mesh, root, slots, true);
      perSlot.forEach((tris, i) => {
        if (!tris.length) return;
        const piece = toWheel(mesh, tris, wheels[i], wheels[i].group);
        const pos = piece.geometry.getAttribute('position') as THREE.BufferAttribute;
        wheels[i].tires.push({ mesh: piece, base: (pos.array as Float32Array).slice() });
        parts.tires.push(piece);
      });
      mesh.removeFromParent();
      parts.tires.splice(parts.tires.indexOf(mesh), 1);
    }
    // Todo lo que cae dentro del aro (llanta, buje, frenos) se separa por
    // triángulos, aunque el archivo lo mezcle con la carrocería en un mismo material.
    for (const part of ['paint', 'rims', 'calipers', 'chrome', 'trim', 'other'] as const) {
      for (const mesh of [...parts[part]]) {
        const { perSlot, body } = classifyTriangles(mesh, root, slots, false);
        if (perSlot.every((t) => !t.length)) continue;
        perSlot.forEach((tris, i) => {
          if (!tris.length) return;
          const piece = toWheel(mesh, tris, wheels[i], wheels[i].rim);
          piece.userData.part = 'wheelzone';
          piece.userData.rimFinish = part === 'rims';
          piece.userData.caliper = part === 'calipers';
          parts.wheelzone.push(piece);
        });
        if (body.length) keepTriangles(mesh, body);
        else {
          mesh.removeFromParent();
          parts[part].splice(parts[part].indexOf(mesh), 1);
        }
      }
    }
  }

  const fronts = slots.filter((s) => s.front);
  const rears = slots.filter((s) => !s.front);
  const wheelbase = fronts.length && rears.length ? Math.abs(fronts[0].center.z - rears[0].center.z) : finalSize.z * 0.6;
  const frontWheel = fronts.find((s) => s.side < 0) ?? fronts[0] ?? null;

  return {
    root,
    body: pivot,
    bodyBaseY: pivot.position.y,
    wheels,
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

/**
 * «Plus sizing»: la llanta crece un factor k y el neumático reduce su perfil
 * para conservar el diámetro exterior.
 */
function applyRimScale(w: WheelRig, k: number) {
  const r = w.slot.rimRadius;
  const R = w.slot.tireRadius;
  w.rim.scale.set(1, k, k);
  for (const t of w.tires) {
    const pos = t.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const y = t.base[i + 1];
      const z = t.base[i + 2];
      const d = Math.hypot(y, z);
      let nd: number;
      if (d <= r) nd = d * k;
      else nd = r * k + ((Math.min(d, R) - r) * (R - r * k)) / Math.max(R - r, 1e-4) + Math.max(0, d - R);
      const f = d > 1e-6 ? nd / d : 1;
      arr[i] = t.base[i];
      arr[i + 1] = y * f;
      arr[i + 2] = z * f;
    }
    pos.needsUpdate = true;
    t.mesh.geometry.computeVertexNormals();
    t.mesh.geometry.computeBoundingSphere();
  }
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
    return {
      paint: createPaintMaterial(paint),
      glass: createGlassMaterial(config.glassTint),
      chrome: createChromeMaterial(),
      trim: createTrimMaterial(),
      caliper: new THREE.MeshPhysicalMaterial({ name: 'pinza', color: '#b01218', roughness: 0.35, clearcoat: 1 }),
      barrel: new THREE.MeshStandardMaterial({ name: 'barril', color: '#151515', roughness: 0.7, metalness: 0.4, side: THREE.DoubleSide }),
      brake: new THREE.MeshStandardMaterial({ name: 'disco', color: '#5d5f62', roughness: 0.45, metalness: 0.9 }),
      cap: new THREE.MeshPhysicalMaterial({ name: 'tapabujes', color: '#111', roughness: 0.25, metalness: 0.3, clearcoat: 1 }),
      bolts: new THREE.MeshStandardMaterial({ name: 'tuercas', color: '#c9ccd0', roughness: 0.25, metalness: 1 }),
      lights: new Map<string, THREE.MeshPhysicalMaterial>(),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepared]);

  // Asignación de materiales por pieza (una vez por modelo).
  useLayoutEffect(() => {
    const { parts } = prepared;
    for (const m of parts.paint) m.material = mats.paint;
    for (const m of parts.glass) m.material = mats.glass;
    // Un material de neumático por material original (conserva texturas propias o recibe dibujo procedural).
    const tireMats = new Map<string, THREE.Material>();
    for (const m of parts.tires) {
      const orig = m.userData.originalMaterial as THREE.Material;
      let tm = tireMats.get(orig.uuid);
      if (!tm) tireMats.set(orig.uuid, (tm = createTireMaterial(orig)));
      m.material = tm;
    }
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
    for (const m of [...parts.other, ...parts.rims, ...parts.calipers, ...parts.wheelzone]) {
      const mat = m.material as THREE.MeshStandardMaterial;
      // Mods de GTA convertidos con versiones anteriores: piezas sin textura en gris claro → plástico oscuro.
      if (/^gta_pieza_/.test(mat.name) && !mat.map && mat.color?.getHexString() === '7d8186') {
        mat.color.set('#1d1f22');
        mat.roughness = 0.45;
      }
      enhanceGenericMaterial(mat);
    }
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
  const finish = loaded.catalog.wheelFinishes.find((f) => f.id === config.wheelFinishId) ?? null;

  // Materiales del acabado elegido (cara de la llanta y color de acento para el bitono).
  const finishMats = useMemo(() => {
    if (!finish || finish.id === 'original') return null;
    const face = createWheelFinishMaterial(finish, `llanta:${finish.id}`);
    const accent = finish.accent
      ? new THREE.MeshPhysicalMaterial({ name: 'llanta:acento', color: finish.accent, metalness: 0.6, roughness: 0.4, clearcoat: 0.6 })
      : face;
    return { face, accent };
  }, [finish]);
  useEffect(() => () => finishMats?.face.dispose(), [finishMats]);

  // Llantas procedurales: una por rueda, dentro del grupo de llanta (se escala con el diámetro).
  useEffect(() => {
    if (!wheel || wheel.design === 'original' || !prepared.wheels.length) return;
    const face = finishMats?.face ?? createWheelFinishMaterial({ color: '#b9bcc0', metalness: 0.9, roughness: 0.3 });
    const accent = finishMats?.accent ?? face;
    const built = prepared.wheels.map((w) => {
      const g = buildProceduralWheel(wheel.design, w.slot, {
        face,
        accent: finishMats && finish?.accent ? accent : mats.barrel,
        barrel: mats.barrel,
        brake: mats.brake,
        caliper: mats.caliper,
        cap: mats.cap,
        bolts: mats.bolts,
      });
      w.rim.add(g);
      return g;
    });
    return () => built.forEach((g) => g.removeFromParent());
  }, [wheel, finishMats, finish, prepared, mats]);

  // Llantas originales (acabado), pinzas y visibilidad de la zona de rueda.
  useEffect(() => {
    mats.caliper.color.set(caliperColor ?? '#2a2a2a');
    const replace = !!wheel && wheel.design !== 'original';
    for (const m of prepared.parts.wheelzone) {
      m.visible = !replace;
      const orig = m.userData.originalMaterial as THREE.Material;
      m.material = m.userData.caliper && caliperColor ? mats.caliper : m.userData.rimFinish && finishMats ? finishMats.face : orig;
    }
    for (const m of prepared.parts.calipers) m.material = caliperColor ? mats.caliper : (m.userData.originalMaterial as THREE.Material);
  }, [wheel, finishMats, prepared, mats, caliperColor]);

  // Diámetro de llanta (plus sizing) con límite físico: el neumático conserva al menos un 25 % de perfil.
  useEffect(() => {
    for (const w of prepared.wheels) {
      const r = w.slot.rimRadius;
      const R = w.slot.tireRadius;
      const target = r + (config.rimDelta * 0.0254) / 2;
      const k = THREE.MathUtils.clamp(target / r, 0.6, (R - (R - r) * 0.25) / r);
      applyRimScale(w, k);
    }
  }, [config.rimDelta, prepared]);

  // Altura de la suspensión: la carrocería sube o baja; las ruedas siguen en el suelo.
  useEffect(() => {
    prepared.body.position.y = prepared.bodyBaseY + config.rideHeight / 100;
  }, [config.rideHeight, prepared]);

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
    </group>
  );
}
