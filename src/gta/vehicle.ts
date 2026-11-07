/**
 * Convierte un vehículo de GTA V (drawable + texturas) en una escena de
 * three.js con materiales PBR nombrados por pieza, lista para exportar a GLB.
 *
 * Convenciones de nombres de material del GLB resultante (las usa el
 * catálogo para identificar las piezas):
 *   gta_pintura_*        carrocería (shaders vehicle_paint*)
 *   gta_neumatico_*      neumáticos (vehicle_tire*)
 *   gta_cristal_*        lunas (vehicle_vehglass*)
 *   gta_lente_*          tulipas de faros y pilotos (vehglass con textura de luz)
 *   gta_luz_delantera_*  emisivos delanteros (vehicle_lightsemissive, y > 0)
 *   gta_luz_trasera_*    emisivos traseros
 *   gta_pieza_*          resto de piezas
 */
import * as THREE from 'three';
import { decodeTexture, type GtaTexture } from './ytd.ts';
import type { GtaDrawable, GtaGeometry, GtaShader } from './yft.ts';

export type Role = 'pintura' | 'neumatico' | 'cristal' | 'lente' | 'luz' | 'matricula' | 'adhesivo' | 'interior' | 'pieza';

export interface ConversionReport {
  triangles: number;
  meshes: number;
  textures: number;
  missingTextures: string[];
  roles: Partial<Record<Role, number>>;
  lengthMeters: number;
  widthMeters: number;
  heightMeters: number;
  wheelsDuplicated: boolean;
  /** El mod no trae ruedas propias (usa las del juego): se han generado neumáticos. */
  generatedTires: boolean;
}

function roleOf(s: GtaShader): Role {
  const n = s.name;
  const diff = s.textures.DiffuseSampler ?? '';
  if (n.startsWith('vehicle_paint')) return 'pintura';
  if (n.startsWith('vehicle_tire')) return 'neumatico';
  if (n.startsWith('vehicle_vehglass')) return /light|lamp|tail|lens|red|amber|indic|emis|mpower/.test(diff) ? 'lente' : 'cristal';
  if (n.startsWith('vehicle_lightsemissive') || n === 'vehicle_lights') return 'luz';
  if (n === 'vehicle_licenseplate') return 'matricula';
  if (n.startsWith('vehicle_badges') || n.startsWith('vehicle_decal') || n === 'vehicle_cutout') return 'adhesivo';
  if (n.startsWith('vehicle_interior') || n.startsWith('vehicle_dash')) return 'interior';
  return 'pieza';
}

/** Texturas genéricas del juego (vehshare.ytd) que no vienen en los mods. */
const GENERIC_TEXTURE = /^(vehicle_generic|vehshare|generic_|givemechecker|nxg_|vehicle_genericmud)/;

// GTA usa Z arriba e Y hacia delante; glTF usa Y arriba. (x, y, z) → (x, z, −y).
const toGltf = (x: number, y: number, z: number, out: Float32Array, o: number) => {
  out[o] = x;
  out[o + 1] = z;
  out[o + 2] = -y;
};

function boneWorldMatrices(d: GtaDrawable): THREE.Matrix4[] {
  const world: THREE.Matrix4[] = [];
  d.bones.forEach((b, i) => {
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...b.translation),
      new THREE.Quaternion(...b.rotation),
      new THREE.Vector3(...b.scale.map((v) => (v === 0 ? 1 : v)) as [number, number, number]),
    );
    world[i] = b.parent >= 0 && b.parent < i && world[b.parent] ? world[b.parent].clone().multiply(local) : local;
  });
  return world;
}

interface TextureCache {
  get(name: string, kind: 'color' | 'normal'): { texture: THREE.Texture; hasAlpha: boolean } | null;
  missing: Set<string>;
  count: number;
}

function createTextureCache(textures: Map<string, GtaTexture>, maxSize: number): TextureCache {
  const cache = new Map<string, { texture: THREE.Texture; hasAlpha: boolean } | null>();
  const missing = new Set<string>();
  const state: TextureCache = {
    missing,
    count: 0,
    get(name, kind) {
      const key = `${kind}:${name}`;
      if (cache.has(key)) return cache.get(key)!;
      const t = textures.get(name);
      let result: { texture: THREE.Texture; hasAlpha: boolean } | null = null;
      if (!t) {
        if (!GENERIC_TEXTURE.test(name)) missing.add(name);
      } else {
        const dec = decodeTexture(t, maxSize);
        if (dec) {
          let alphaPixels = 0;
          for (let i = 3; i < dec.rgba.length; i += 4) if (dec.rgba[i] < 250) alphaPixels++;
          const hasAlpha = kind === 'color' && alphaPixels > dec.rgba.length / 4 / 200;
          if (kind === 'normal') for (let i = 3; i < dec.rgba.length; i += 4) dec.rgba[i] = 255;
          const canvas = document.createElement('canvas');
          canvas.width = dec.width;
          canvas.height = dec.height;
          canvas.getContext('2d')!.putImageData(new ImageData(dec.rgba as Uint8ClampedArray<ArrayBuffer>, dec.width, dec.height), 0, 0);
          const texture = new THREE.CanvasTexture(canvas);
          texture.name = name;
          texture.flipY = false;
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
          texture.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.userData.mimeType = hasAlpha || kind === 'normal' ? 'image/png' : 'image/jpeg';
          result = { texture, hasAlpha };
          state.count++;
        }
      }
      cache.set(key, result);
      return result;
    },
  };
  return state;
}

function buildMaterial(s: GtaShader, index: number, role: Role, tex: TextureCache): THREE.MeshStandardMaterial {
  const diffName = s.textures.DiffuseSampler;
  const diffuse = diffName && !GENERIC_TEXTURE.test(diffName) ? tex.get(diffName, 'color') : null;
  const bumpName = s.textures.BumpSampler;
  const normal = bumpName && !GENERIC_TEXTURE.test(bumpName) && role !== 'pintura' ? tex.get(bumpName, 'normal') : null;
  const chrome = /chrome|chrom|mirror|metal_polish/.test(diffName ?? '');
  const tag = role === 'luz' ? 'luz' : role;
  const m = new THREE.MeshStandardMaterial({
    name: `gta_${tag}_${index}`,
    color: diffuse ? '#ffffff' : role === 'interior' ? '#2a2a2a' : role === 'neumatico' ? '#1b1b1b' : '#7d8186',
    map: diffuse?.texture ?? null,
    normalMap: normal?.texture ?? null,
    roughness: chrome ? 0.08 : role === 'neumatico' ? 0.85 : role === 'interior' ? 0.7 : 0.45,
    metalness: chrome ? 1 : 0,
  });
  if (role === 'cristal' || role === 'lente') {
    m.transparent = true;
    m.opacity = role === 'lente' ? 0.35 : 0.6;
    m.roughness = 0.03;
  } else if (diffuse?.hasAlpha) {
    if (role === 'luz') m.transparent = true;
    else m.alphaTest = 0.4;
  }
  m.userData.gtaShader = s.name;
  return m;
}

/** Convierte la geometría GTA en BufferGeometry glTF, opcionalmente filtrando triángulos. */
function toBufferGeometry(g: GtaGeometry, boneMatrix: THREE.Matrix4 | null, keep?: (cy: number) => boolean, mirrorX = false): THREE.BufferGeometry | null {
  const n = g.positions.length / 3;
  const pos = new Float32Array(n * 3);
  const nor = g.normals ? new Float32Array(n * 3) : null;
  const v = new THREE.Vector3();
  const nm = boneMatrix ? new THREE.Matrix3().getNormalMatrix(boneMatrix) : null;
  for (let i = 0; i < n; i++) {
    v.fromArray(g.positions, i * 3);
    if (boneMatrix) v.applyMatrix4(boneMatrix);
    if (mirrorX) v.x = -v.x;
    toGltf(v.x, v.y, v.z, pos, i * 3);
    if (nor && g.normals) {
      v.fromArray(g.normals, i * 3);
      if (nm) v.applyMatrix3(nm).normalize();
      if (mirrorX) v.x = -v.x;
      toGltf(v.x, v.y, v.z, nor, i * 3);
    }
  }
  let idx = g.indices;
  if (keep) {
    const out: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      const cy = (g.positions[idx[t] * 3 + 1] + g.positions[idx[t + 1] * 3 + 1] + g.positions[idx[t + 2] * 3 + 1]) / 3;
      if (keep(cy)) out.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    if (!out.length) return null;
    idx = new Uint32Array(out);
  }
  if (mirrorX) {
    // La simetría invierte el sentido de los triángulos.
    const flipped = new Uint32Array(idx.length);
    for (let t = 0; t < idx.length; t += 3) {
      flipped[t] = idx[t];
      flipped[t + 1] = idx[t + 2];
      flipped[t + 2] = idx[t + 1];
    }
    idx = flipped;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (nor) geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (g.uv0) geo.setAttribute('uv', new THREE.BufferAttribute(g.uv0.slice(), 2));
  geo.setIndex(new THREE.BufferAttribute(n > 65535 ? idx : new Uint16Array(idx), 1));
  if (!nor) geo.computeVertexNormals();
  return geo;
}

/** Neumático genérico (perfil de sección redondeada) con el eje en X. */
function createTireGeometry(radius: number, width: number): THREE.BufferGeometry {
  const inner = radius * 0.7;
  const half = width / 2;
  const pts: THREE.Vector2[] = [];
  const shoulder = Math.min(radius * 0.12, half * 0.6);
  pts.push(new THREE.Vector2(inner, -half * 0.92));
  pts.push(new THREE.Vector2(inner + (radius - inner) * 0.5, -half));
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - shoulder + Math.sin(a) * shoulder, -half + shoulder - Math.cos(a) * shoulder));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(radius - shoulder + Math.cos(a) * shoulder, half - shoulder + Math.sin(a) * shoulder));
  }
  pts.push(new THREE.Vector2(inner + (radius - inner) * 0.5, half));
  pts.push(new THREE.Vector2(inner, half * 0.92));
  const lathe = new THREE.LatheGeometry(pts, 72);
  lathe.rotateZ(Math.PI / 2); // eje de giro: Y → X
  lathe.computeVertexNormals();
  return lathe;
}

export interface BuildOptions {
  maxTextureSize?: number;
  onProgress?: (msg: string) => void;
}

export async function buildVehicle(
  drawable: GtaDrawable,
  textureList: GtaTexture[],
  opts: BuildOptions = {},
): Promise<{ scene: THREE.Group; report: ConversionReport }> {
  const textures = new Map<string, GtaTexture>();
  // Los primeros tienen prioridad (texturas «+hi» antes que las normales).
  for (const t of [...textureList, ...drawable.embeddedTextures]) {
    const key = t.name.toLowerCase();
    if (!textures.has(key) && t.levels > 0) textures.set(key, t);
  }
  const tex = createTextureCache(textures, opts.maxTextureSize ?? 2048);
  const scene = new THREE.Group();
  scene.name = drawable.name;
  const boneWorld = boneWorldMatrices(drawable);
  const boneIndex = new Map(drawable.bones.map((b, i) => [b.name, i]));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const roles: Partial<Record<Role, number>> = {};
  let triangles = 0;
  let meshes = 0;

  const getMaterial = (shaderIndex: number, role: Role, suffix = '') => {
    const key = `${shaderIndex}${suffix}`;
    let m = materials.get(key);
    if (!m) {
      m = buildMaterial(drawable.shaders[shaderIndex], shaderIndex, role, tex);
      if (suffix) m.name = `gta_${suffix}_${shaderIndex}`;
      materials.set(key, m);
    }
    return m;
  };

  const addMesh = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, role: Role) => {
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    scene.add(mesh);
    triangles += (geo.index?.count ?? 0) / 3;
    meshes++;
    roles[role] = (roles[role] ?? 0) + 1;
  };

  // Ruedas sin piel: GTA suele incluir solo «wheel_lf» y la reutiliza en las demás.
  const wheelBones = ['wheel_lf', 'wheel_rf', 'wheel_lr', 'wheel_rr'];
  const rigidOn = new Set(drawable.geometries.filter((g) => g.rigidBone >= 0).map((g) => drawable.bones[g.rigidBone]?.name));
  let wheelsDuplicated = false;

  for (let gi = 0; gi < drawable.geometries.length; gi++) {
    const g = drawable.geometries[gi];
    const shader = drawable.shaders[g.shader];
    if (!shader) continue;
    const role = roleOf(shader);
    if (role === 'matricula') continue;
    const boneName = g.rigidBone >= 0 ? drawable.bones[g.rigidBone]?.name : undefined;
    const matrix = g.rigidBone >= 0 ? (boneWorld[g.rigidBone] ?? null) : null;
    const name = `${shader.name}_${gi}`;

    if (role === 'luz') {
      addMesh(toBufferGeometry(g, matrix, (cy) => cy >= 0), getMaterial(g.shader, role, 'luz_delantera'), `${name}_del`, role);
      addMesh(toBufferGeometry(g, matrix, (cy) => cy < 0), getMaterial(g.shader, role, 'luz_trasera'), `${name}_tra`, role);
    } else {
      addMesh(toBufferGeometry(g, matrix), getMaterial(g.shader, role), name, role);
    }

    if (boneName === 'wheel_lf') {
      for (const other of wheelBones.slice(1)) {
        const bi = boneIndex.get(other);
        if (bi === undefined || rigidOn.has(other)) continue;
        const right = other.startsWith('wheel_r');
        // Se coloca la rueda en el hueso de destino; en el lado derecho se refleja.
        const local = new THREE.Matrix4().copy(boneWorld[bi]);
        const target = right ? local.multiply(new THREE.Matrix4().makeScale(-1, 1, 1)) : local;
        const geo = toBufferGeometry(g, target, undefined, false);
        if (geo && right) {
          // Escala negativa: hay que invertir el sentido de los triángulos.
          const ix = geo.index!;
          for (let t = 0; t < ix.count; t += 3) {
            const b = ix.getX(t + 1);
            ix.setX(t + 1, ix.getX(t + 2));
            ix.setX(t + 2, b);
          }
        }
        addMesh(geo, getMaterial(g.shader, role), `${name}_${other}`, role);
        wheelsDuplicated = true;
      }
    }
    if (gi % 8 === 0) {
      opts.onProgress?.(`Convirtiendo piezas ${gi + 1}/${drawable.geometries.length}…`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Muchos mods no incluyen ruedas (el juego usa sus llantas genéricas). Si en
  // los huesos de rueda no hay un neumático de tamaño real, se genera uno.
  let generatedTires = false;
  const modelBox = new THREE.Box3().setFromObject(scene);
  const length = modelBox.getSize(new THREE.Vector3()).z;
  const tireRadius = THREE.MathUtils.clamp(length * 0.075, 0.3, 0.48);
  const tireBox = new THREE.Box3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).name.startsWith('gta_neumatico_')) tireBox.expandByObject(m);
  });
  const tireHeight = tireBox.isEmpty() ? 0 : tireBox.getSize(new THREE.Vector3()).y;
  const wheelPositions = wheelBones
    .map((n) => boneIndex.get(n))
    .filter((i): i is number => i !== undefined)
    .map((i) => new THREE.Vector3().setFromMatrixPosition(boneWorld[i]));
  if (tireHeight < tireRadius && wheelPositions.length >= 4) {
    const tireMat = new THREE.MeshStandardMaterial({ name: 'gta_neumatico_generado', color: '#151515', roughness: 0.85 });
    const geo = createTireGeometry(tireRadius, Math.min(0.32, length * 0.054));
    for (const p of wheelPositions) {
      const mesh = new THREE.Mesh(geo, tireMat);
      mesh.name = 'neumatico_generado';
      mesh.position.set(p.x, p.z, -p.y);
      scene.add(mesh);
      meshes++;
    }
    triangles += ((geo.index?.count ?? 0) / 3) * wheelPositions.length;
    roles.neumatico = (roles.neumatico ?? 0) + wheelPositions.length;
    generatedTires = true;
  }

  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  return {
    scene,
    report: {
      triangles,
      meshes,
      textures: tex.count,
      missingTextures: [...tex.missing].sort(),
      roles,
      lengthMeters: +size.z.toFixed(3),
      widthMeters: +size.x.toFixed(3),
      heightMeters: +size.y.toFixed(3),
      wheelsDuplicated,
      generatedTires,
    },
  };
}
