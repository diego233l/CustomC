import * as THREE from 'three';
import type { WheelDesign } from '../catalog/types';

export interface WheelSlot {
  /** Centro del buje en coordenadas del coche. */
  center: THREE.Vector3;
  /** Lado: +1 derecho (x>0), -1 izquierdo. */
  side: 1 | -1;
  /** Delantera (z>0) o trasera. */
  front: boolean;
  tireRadius: number;
  /** Radio interior del neumático (asiento de la llanta). */
  rimRadius: number;
  /** Coordenada x de la cara exterior del neumático. */
  outerX: number;
  width: number;
}

const tmp = new THREE.Vector3();

function relativeMatrix(mesh: THREE.Object3D, root: THREE.Object3D) {
  return new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(mesh.matrixWorld);
}

/** Recorre los vértices de las mallas indicadas (en espacio del objeto raíz). */
function collectPoints(meshes: THREE.Mesh[], root: THREE.Object3D, maxPerMesh = 40000): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos) continue;
    const m = relativeMatrix(mesh, root);
    const step = Math.max(1, Math.floor(pos.count / maxPerMesh));
    for (let i = 0; i < pos.count; i += step) pts.push(tmp.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
  }
  return pts;
}

const quadrantKey = (p: THREE.Vector3) => `${p.x >= 0 ? 'D' : 'I'}${p.z >= 0 ? 'F' : 'T'}`;

/**
 * Localiza las cuatro ruedas a partir de las mallas de neumático.
 * El coche debe estar ya normalizado: frontal hacia +Z, eje vertical +Y,
 * centrado en x=0 y z=0.
 */
export function detectWheelSlots(root: THREE.Object3D, tires: THREE.Mesh[]): WheelSlot[] {
  root.updateMatrixWorld(true);
  const pts = collectPoints(tires, root);
  const groups = new Map<string, THREE.Vector3[]>();
  for (const p of pts) {
    const k = quadrantKey(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const slots: WheelSlot[] = [];
  for (const [key, list] of groups) {
    const box = new THREE.Box3().setFromPoints(list);
    const size = box.getSize(new THREE.Vector3());
    if (size.y < 0.3 || size.z < 0.3 || size.y > 1.4) continue;
    const center = box.getCenter(new THREE.Vector3());
    const tireRadius = (size.y + size.z) / 4;
    // Radio interior: percentil bajo de la distancia radial de los vértices.
    const radial = list.map((p) => Math.hypot(p.y - center.y, p.z - center.z)).sort((a, b) => a - b);
    let inner = radial[Math.floor(radial.length * 0.02)] ?? tireRadius * 0.68;
    if (inner < tireRadius * 0.45 || inner > tireRadius * 0.9) inner = tireRadius * 0.68;
    const side = key[0] === 'D' ? 1 : -1;
    slots.push({
      center,
      side,
      front: key[1] === 'F',
      tireRadius,
      rimRadius: inner,
      outerX: side > 0 ? box.max.x : box.min.x,
      width: size.x,
    });
  }
  return slots;
}

/** Índice de la rueda en cuyo volumen de llanta cae el punto, o −1. */
export function wheelZoneOf(p: THREE.Vector3, slots: WheelSlot[]): number {
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (Math.sign(p.x) !== s.side) continue;
    const dx = Math.abs(p.x - s.center.x);
    if (dx > s.width / 2 + 0.03 && !(Math.abs(p.x) < Math.abs(s.center.x) && dx < s.width / 2 + 0.2)) continue;
    const r = Math.hypot(p.y - s.center.y, p.z - s.center.z);
    if (r < Math.max(s.rimRadius * 1.1, s.tireRadius * 0.9)) return i;
  }
  return -1;
}

/** Rueda más cercana (para repartir los neumáticos). */
export function nearestSlot(p: THREE.Vector3, slots: WheelSlot[]): number {
  let best = -1;
  let dist = Infinity;
  slots.forEach((s, i) => {
    const d = p.distanceToSquared(s.center);
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

/**
 * Crea una geometría compacta con los triángulos indicados, transformada por
 * `matrix` (posiciones, normales). Copia uv, uv1 y color si existen.
 */
export function extractTriangles(g: THREE.BufferGeometry, tris: number[], matrix: THREE.Matrix4): THREE.BufferGeometry {
  const index = g.getIndex();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute | undefined;
  const extra = (['uv', 'uv1', 'color'] as const)
    .map((n) => [n, g.getAttribute(n) as THREE.BufferAttribute | undefined] as const)
    .filter((e): e is readonly [typeof e[0], THREE.BufferAttribute] => !!e[1]);
  const remap = new Map<number, number>();
  const order: number[] = [];
  const newIndex = new Uint32Array(tris.length * 3);
  let k = 0;
  for (const t of tris) {
    for (let c = 0; c < 3; c++) {
      const v = index ? index.getX(t * 3 + c) : t * 3 + c;
      let n = remap.get(v);
      if (n === undefined) {
        n = order.length;
        remap.set(v, n);
        order.push(v);
      }
      newIndex[k++] = n;
    }
  }
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  const P = new Float32Array(order.length * 3);
  const N = nor ? new Float32Array(order.length * 3) : null;
  const v = new THREE.Vector3();
  order.forEach((src, i) => {
    v.fromBufferAttribute(pos, src).applyMatrix4(matrix).toArray(P, i * 3);
    if (N && nor) v.fromBufferAttribute(nor, src).applyMatrix3(nm).normalize().toArray(N, i * 3);
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  if (N) out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  for (const [name, attr] of extra) {
    const size = attr.itemSize;
    const arr = new Float32Array(order.length * size);
    order.forEach((src, i) => {
      for (let c = 0; c < size; c++) arr[i * size + c] = attr.getComponent(src, c);
    });
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.setIndex(new THREE.BufferAttribute(order.length > 65535 ? newIndex : new Uint16Array(newIndex), 1));
  if (!N) out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}

/**
 * Reparte los triángulos de una malla entre las ruedas. Si `all` es true,
 * cada triángulo va a la rueda más cercana (neumáticos); si no, solo los que
 * caen dentro del volumen de alguna llanta. Devuelve, por rueda, la lista de
 * triángulos, y la lista de triángulos que se quedan en la carrocería.
 */
export function classifyTriangles(mesh: THREE.Mesh, root: THREE.Object3D, slots: WheelSlot[], all: boolean) {
  const g = mesh.geometry;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const m = relativeMatrix(mesh, root);
  const index = g.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const idx = (i: number) => (index ? index.getX(i) : i);
  const perSlot: number[][] = slots.map(() => []);
  const body: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, idx(t * 3)).applyMatrix4(m);
    b.fromBufferAttribute(pos, idx(t * 3 + 1)).applyMatrix4(m);
    c.fromBufferAttribute(pos, idx(t * 3 + 2)).applyMatrix4(m);
    a.add(b).add(c).multiplyScalar(1 / 3);
    const slot = all ? nearestSlot(a, slots) : wheelZoneOf(a, slots);
    if (slot >= 0) perSlot[slot].push(t);
    else body.push(t);
  }
  return { perSlot, body };
}

/** Deja en la malla solo los triángulos indicados (geometría compacta, misma transformación). */
export function keepTriangles(mesh: THREE.Mesh, tris: number[]) {
  const old = mesh.geometry;
  mesh.geometry = extractTriangles(old, tris, new THREE.Matrix4());
}

// ---------------------------------------------------------------------------
// Diseños de llanta procedurales (genéricos, no reproducen diseños oficiales).
// Se construyen en el plano (x, y) con la cara mirando a +Z y radio 1.
// ---------------------------------------------------------------------------

const polar = (r: number, a: number) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);

function spokeShape(a: number, rIn: number, rOut: number, wIn: number, wOut: number, curve = 0): THREE.Shape {
  const s = new THREE.Shape();
  const aIn = wIn / rIn / 2;
  const aOut = wOut / rOut / 2;
  const p1 = polar(rIn, a - aIn);
  const p2 = polar(rOut, a - aOut + curve);
  const p4 = polar(rIn, a + aIn);
  const mid = (rIn + rOut) / 2;
  s.moveTo(p1.x, p1.y);
  if (curve !== 0) {
    const c1 = polar(mid, a - (aIn + aOut) / 2 + curve * 0.35);
    s.quadraticCurveTo(c1.x, c1.y, p2.x, p2.y);
  } else s.lineTo(p2.x, p2.y);
  s.absarc(0, 0, rOut, a - aOut + curve, a + aOut + curve, false);
  if (curve !== 0) {
    const c2 = polar(mid, a + (aIn + aOut) / 2 + curve * 0.35);
    s.quadraticCurveTo(c2.x, c2.y, p4.x, p4.y);
  } else s.lineTo(p4.x, p4.y);
  s.closePath();
  return s;
}

const TAU = Math.PI * 2;
const R_OUT = 0.965;

interface DesignSpec {
  shapes: () => THREE.Shape[];
  /** Profundidad del cóncavo (fracción del radio): el buje queda hundido. */
  concave: number;
  depth: number;
}

function discWithSlots(count: number, rIn: number, rOut: number, span: number): THREE.Shape {
  const disc = new THREE.Shape();
  disc.absarc(0, 0, R_OUT, 0, TAU, false);
  const hub = new THREE.Path();
  hub.absarc(0, 0, 0.28, 0, TAU, true);
  disc.holes.push(hub);
  for (let i = 0; i < count; i++) {
    const a0 = (i / count) * TAU + 0.1;
    const a1 = a0 + span;
    const h = new THREE.Path();
    h.absarc(0, 0, rOut, a0, a1, false);
    h.absarc(0, 0, rIn, a1 - 0.04, a0 + 0.06, true);
    h.closePath();
    disc.holes.push(h);
  }
  return disc;
}

const DESIGNS: Record<Exclude<WheelDesign, 'original'>, DesignSpec> = {
  aero: { concave: 0.03, depth: 0.06, shapes: () => [discWithSlots(5, 0.66, 0.9, 0.62)] },
  disco: { concave: 0.0, depth: 0.05, shapes: () => [discWithSlots(10, 0.8, 0.9, 0.22)] },
  'cinco-dobles': {
    concave: 0.1,
    depth: 0.07,
    shapes: () => Array.from({ length: 5 }, (_, i) => [spokeShape((i / 5) * TAU - 0.13, 0.27, R_OUT, 0.13, 0.1), spokeShape((i / 5) * TAU + 0.13, 0.27, R_OUT, 0.13, 0.1)]).flat(),
  },
  multirradio: { concave: 0.08, depth: 0.065, shapes: () => Array.from({ length: 10 }, (_, i) => spokeShape((i / 10) * TAU, 0.27, R_OUT, 0.12, 0.075)) },
  turbina: { concave: 0.06, depth: 0.065, shapes: () => Array.from({ length: 12 }, (_, i) => spokeShape((i / 12) * TAU, 0.3, R_OUT, 0.13, 0.17, 0.32)) },
  'y-radios': {
    concave: 0.12,
    depth: 0.07,
    shapes: () =>
      Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * TAU;
        return [spokeShape(a, 0.27, 0.6, 0.2, 0.16), spokeShape(a - 0.16, 0.55, R_OUT, 0.1, 0.11), spokeShape(a + 0.16, 0.55, R_OUT, 0.1, 0.11)];
      }).flat(),
  },
  'seis-radios': { concave: 0.09, depth: 0.075, shapes: () => Array.from({ length: 6 }, (_, i) => spokeShape((i / 6) * TAU, 0.27, R_OUT, 0.24, 0.2)) },
  concava: { concave: 0.24, depth: 0.08, shapes: () => Array.from({ length: 5 }, (_, i) => spokeShape((i / 5) * TAU, 0.27, R_OUT, 0.26, 0.15)) },
  estrella: { concave: 0.05, depth: 0.06, shapes: () => Array.from({ length: 7 }, (_, i) => spokeShape((i / 7) * TAU, 0.3, R_OUT, 0.09, 0.07)) },
  'radios-finos': { concave: 0.07, depth: 0.05, shapes: () => Array.from({ length: 20 }, (_, i) => spokeShape((i / 20) * TAU, 0.29, R_OUT, 0.05, 0.035)) },
  malla: {
    concave: 0.1,
    depth: 0.05,
    shapes: () =>
      Array.from({ length: 10 }, (_, i) => [spokeShape((i / 10) * TAU, 0.29, R_OUT, 0.06, 0.045, 0.3), spokeShape((i / 10) * TAU, 0.29, R_OUT, 0.06, 0.045, -0.3)]).flat(),
  },
};

const geometryCache = new Map<string, THREE.BufferGeometry>();

function getFaceGeometry(design: Exclude<WheelDesign, 'original'>): THREE.BufferGeometry {
  let g = geometryCache.get(design);
  if (!g) {
    const spec = DESIGNS[design];
    const hub = new THREE.Shape();
    hub.absarc(0, 0, 0.3, 0, TAU, false);
    g = new THREE.ExtrudeGeometry([...spec.shapes(), hub], {
      depth: spec.depth,
      bevelEnabled: true,
      bevelThickness: 0.018,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 28,
    });
    // Cóncavo: la cara se hunde hacia el buje (z menor cuanto menor es el radio).
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      const t = THREE.MathUtils.clamp((R_OUT - r) / (R_OUT - 0.3), 0, 1);
      pos.setZ(i, pos.getZ(i) - spec.concave * Math.sin((t * Math.PI) / 2));
    }
    g.computeVertexNormals();
    geometryCache.set(design, g);
  }
  return g;
}

export interface ProceduralWheelMaterials {
  face: THREE.Material;
  accent: THREE.Material;
  barrel: THREE.Material;
  brake: THREE.Material;
  caliper: THREE.Material;
  cap: THREE.Material;
  bolts: THREE.Material;
}

/**
 * Construye una llanta procedural en el espacio local de la rueda (origen en
 * el centro del buje, eje X hacia fuera en el lado derecho).
 */
export function buildProceduralWheel(design: WheelDesign, slot: WheelSlot, mats: ProceduralWheelMaterials): THREE.Group {
  const r = slot.rimRadius;
  const group = new THREE.Group();
  group.name = `llanta-${slot.front ? 'del' : 'tra'}-${slot.side > 0 ? 'der' : 'izq'}`;
  if (design === 'original') return group;
  const spec = DESIGNS[design];
  const inner = new THREE.Group();
  const depth = Math.min(slot.width * 0.85, r * 0.95);
  const shadowed = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const face = shadowed(new THREE.Mesh(getFaceGeometry(design), mats.face));
  face.scale.set(r, r, r * 0.7);
  face.position.z = -r * 0.06;
  inner.add(face);

  // Pestaña exterior con labio redondeado.
  const lip = shadowed(new THREE.Mesh(new THREE.TorusGeometry(r * 0.985, r * 0.032, 16, 120), mats.face));
  lip.position.z = -r * 0.02;
  inner.add(lip);
  const lip2 = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.0, r * 0.985, r * 0.05, 120, 1, true), mats.face));
  lip2.rotation.x = Math.PI / 2;
  lip2.position.z = -r * 0.045;
  inner.add(lip2);

  // Fondo de la llanta (en bitono, color de acento).
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.965, r * 0.94, depth, 96, 1, true), mats.barrel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -depth / 2 - r * 0.05;
  inner.add(barrel);
  const back = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 64), mats.accent);
  back.position.z = -depth * 0.62;
  inner.add(back);

  // Disco perforado, pinza y buje.
  const disc = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, r * 0.07, 96), mats.brake));
  disc.rotation.x = Math.PI / 2;
  disc.position.z = -depth * 0.5;
  inner.add(disc);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.4, r * 0.16, 48), mats.barrel);
  bell.rotation.x = Math.PI / 2;
  bell.position.z = -depth * 0.42;
  inner.add(bell);
  const caliper = shadowed(new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 0.56, r * 0.24), mats.caliper));
  const ca = slot.front ? Math.PI * 0.08 : Math.PI * 0.92;
  caliper.position.set(Math.cos(ca) * r * 0.67, Math.sin(ca) * r * 0.67, -depth * 0.42);
  caliper.rotation.z = ca;
  inner.add(caliper);

  // Tuercas (5) y tapabujes sin logotipo.
  const boltGeo = new THREE.CylinderGeometry(r * 0.032, r * 0.036, r * 0.06, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + Math.PI / 2;
    const bolt = new THREE.Mesh(boltGeo, mats.bolts);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(Math.cos(a) * r * 0.19, Math.sin(a) * r * 0.19, -r * 0.06 - spec.concave * r * 0.7 + r * 0.06);
    inner.add(bolt);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.11, r * 0.12, r * 0.05, 40), mats.cap);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = -r * 0.06 - spec.concave * r * 0.7 + r * 0.075;
  inner.add(cap);

  // +Z local → exterior (+X en el lado derecho, −X en el izquierdo).
  inner.rotation.y = slot.side > 0 ? Math.PI / 2 : -Math.PI / 2;
  group.add(inner);
  group.position.set(slot.outerX - slot.center.x - slot.side * slot.width * 0.1, 0, 0);
  return group;
}
