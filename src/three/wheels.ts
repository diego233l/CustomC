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

/** ¿Está el punto (espacio del coche) dentro del volumen de alguna llanta? */
export function inWheelZone(p: THREE.Vector3, slots: WheelSlot[]): boolean {
  for (const s of slots) {
    if (Math.sign(p.x) !== s.side) continue;
    const dx = Math.abs(p.x - s.center.x);
    if (dx > s.width / 2 + 0.03 && !(Math.abs(p.x) < Math.abs(s.center.x) && dx < s.width / 2 + 0.2)) continue;
    const r = Math.hypot(p.y - s.center.y, p.z - s.center.z);
    if (r < Math.max(s.rimRadius * 1.1, s.tireRadius * 0.9)) return true;
  }
  return false;
}

/**
 * Divide una malla en dos según sus triángulos caigan dentro o fuera de las
 * zonas de llanta. Devuelve la malla nueva con los triángulos interiores
 * (o null si no hay ninguno). La malla original conserva el resto.
 */
export function splitByWheelZones(mesh: THREE.Mesh, root: THREE.Object3D, slots: WheelSlot[]): THREE.Mesh | null {
  const g = mesh.geometry;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  if (!pos || slots.length === 0) return null;
  const m = relativeMatrix(mesh, root);
  const index = g.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const idx = (i: number) => (index ? index.getX(i) : i);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const inside: number[] = [];
  const outside: number[] = [];
  for (let t = 0; t < triCount; t++) {
    const i0 = idx(t * 3);
    const i1 = idx(t * 3 + 1);
    const i2 = idx(t * 3 + 2);
    a.fromBufferAttribute(pos, i0).applyMatrix4(m);
    b.fromBufferAttribute(pos, i1).applyMatrix4(m);
    c.fromBufferAttribute(pos, i2).applyMatrix4(m);
    a.add(b).add(c).multiplyScalar(1 / 3);
    (inWheelZone(a, slots) ? inside : outside).push(i0, i1, i2);
  }
  if (inside.length === 0) return null;
  const make = (list: number[]) => {
    const ng = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) ng.setAttribute(name, attr);
    ng.setIndex(list);
    return ng;
  };
  const insideMesh = mesh.clone();
  insideMesh.geometry = make(inside);
  if (outside.length) mesh.geometry = make(outside);
  else mesh.visible = false;
  mesh.parent?.add(insideMesh);
  return insideMesh;
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
  const p3 = polar(rOut, a + aOut + curve);
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
  void p3;
  s.closePath();
  return s;
}

function faceShapes(design: WheelDesign): THREE.Shape[] {
  const shapes: THREE.Shape[] = [];
  const TAU = Math.PI * 2;
  switch (design) {
    case 'cinco-dobles': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        shapes.push(spokeShape(a - 0.13, 0.27, 0.97, 0.13, 0.1));
        shapes.push(spokeShape(a + 0.13, 0.27, 0.97, 0.13, 0.1));
      }
      break;
    }
    case 'multirradio': {
      for (let i = 0; i < 10; i++) shapes.push(spokeShape((i / 10) * TAU, 0.27, 0.97, 0.12, 0.075));
      break;
    }
    case 'y-radios': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        shapes.push(spokeShape(a, 0.27, 0.6, 0.2, 0.16));
        shapes.push(spokeShape(a - 0.16, 0.55, 0.97, 0.1, 0.11));
        shapes.push(spokeShape(a + 0.16, 0.55, 0.97, 0.1, 0.11));
      }
      break;
    }
    case 'turbina': {
      for (let i = 0; i < 12; i++) shapes.push(spokeShape((i / 12) * TAU, 0.3, 0.97, 0.13, 0.17, 0.32));
      break;
    }
    case 'aero': {
      // Tapa aerodinámica: disco casi cerrado con aberturas cerca del borde.
      const disc = new THREE.Shape();
      disc.absarc(0, 0, 0.97, 0, TAU, false);
      const hub = new THREE.Path();
      hub.absarc(0, 0, 0.27, 0, TAU, true);
      disc.holes.push(hub);
      for (let i = 0; i < 5; i++) {
        const a0 = (i / 5) * TAU + 0.18;
        const a1 = a0 + 0.62;
        const h = new THREE.Path();
        h.absarc(0, 0, 0.9, a0, a1, false);
        h.absarc(0, 0, 0.66, a1 - 0.05, a0 + 0.12, true);
        h.closePath();
        disc.holes.push(h);
      }
      shapes.push(disc);
      break;
    }
    default:
      break;
  }
  // Buje central común.
  const hub = new THREE.Shape();
  hub.absarc(0, 0, 0.3, 0, TAU, false);
  shapes.push(hub);
  return shapes;
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function getFaceGeometry(design: WheelDesign): THREE.BufferGeometry {
  let g = geometryCache.get(design);
  if (!g) {
    g = new THREE.ExtrudeGeometry(faceShapes(design), {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.012,
      bevelSegments: 3,
      curveSegments: 24,
    });
    g.computeVertexNormals();
    geometryCache.set(design, g);
  }
  return g;
}

export interface ProceduralWheelMaterials {
  face: THREE.Material;
  barrel: THREE.Material;
  brake: THREE.Material;
  caliper: THREE.Material;
  cap: THREE.Material;
}

/** Construye una llanta procedural ajustada a un hueco de rueda detectado. */
export function buildProceduralWheel(design: WheelDesign, slot: WheelSlot, mats: ProceduralWheelMaterials): THREE.Group {
  const r = slot.rimRadius;
  const group = new THREE.Group();
  group.name = `llanta-${slot.front ? 'del' : 'tra'}-${slot.side > 0 ? 'der' : 'izq'}`;

  // Pieza orientada con la cara hacia +Z, luego girada hacia el exterior (±X).
  const inner = new THREE.Group();
  const depth = Math.min(slot.width * 0.85, r * 0.9);

  // Cara de la llanta (diseño), ligeramente cóncava: se desplaza hacia dentro.
  const face = new THREE.Mesh(getFaceGeometry(design), mats.face);
  face.scale.set(r, r, r * 0.6);
  face.position.z = -r * 0.09;
  face.castShadow = true;
  face.receiveShadow = true;
  inner.add(face);

  // Pestaña exterior.
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.985, r * 0.03, 12, 96), mats.face);
  lip.position.z = -r * 0.02;
  inner.add(lip);

  // Tambor (barril) interior.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.97, r * 0.97, depth, 64, 1, true), mats.barrel);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -depth / 2 - r * 0.02;
  inner.add(barrel);

  // Fondo oscuro para que no se vea a través de la llanta.
  const back = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 48), mats.barrel);
  back.rotation.y = Math.PI;
  back.position.z = -depth;
  back.scale.setScalar(1);
  (back.material as THREE.Material).side = THREE.DoubleSide;
  inner.add(back);

  // Disco de freno y pinza.
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, r * 0.06, 64), mats.brake);
  disc.rotation.x = Math.PI / 2;
  disc.position.z = -depth * 0.55;
  inner.add(disc);
  const caliper = new THREE.Mesh(new THREE.BoxGeometry(r * 0.32, r * 0.5, r * 0.22), mats.caliper);
  const ca = slot.front ? Math.PI * 0.12 : Math.PI * 0.88;
  caliper.position.set(Math.cos(ca) * r * 0.66, Math.sin(ca) * r * 0.66, -depth * 0.45);
  caliper.rotation.z = ca;
  caliper.castShadow = true;
  inner.add(caliper);

  // Tapacubos central sin logotipo.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.13, r * 0.14, r * 0.05, 32), mats.cap);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = r * 0.0;
  inner.add(cap);

  // +Z local → exterior (+X en el lado derecho, −X en el izquierdo).
  inner.rotation.y = slot.side > 0 ? Math.PI / 2 : -Math.PI / 2;
  group.add(inner);
  group.position.set(slot.outerX - slot.side * slot.width * 0.1, slot.center.y, slot.center.z);
  return group;
}
