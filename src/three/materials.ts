import * as THREE from 'three';
import type { Paint, WheelFinish } from '../catalog/types';

let flakeTexture: THREE.Texture | null = null;

/**
 * Mapa de normales procedural con "escamas" para pintura metalizada.
 * Cada celda recibe una normal aleatoria ligeramente inclinada, lo que
 * produce el centelleo característico bajo luz directa.
 */
export function getFlakeNormalMap(): THREE.Texture {
  if (flakeTexture) return flakeTexture;
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const cell = 2;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const a = rand() * Math.PI * 2;
      const tilt = Math.pow(rand(), 1.5) * 0.55;
      const nx = Math.cos(a) * tilt;
      const ny = Math.sin(a) * tilt;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      for (let dy = 0; dy < cell; dy++)
        for (let dx = 0; dx < cell; dx++) {
          const i = ((y + dy) * size + (x + dx)) * 4;
          data[i] = (nx * 0.5 + 0.5) * 255;
          data[i + 1] = (ny * 0.5 + 0.5) * 255;
          data[i + 2] = nz * 255;
          data[i + 3] = 255;
        }
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(40, 40);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  flakeTexture = tex;
  return tex;
}

/** Material de pintura de automoción: base + escamas + barniz (clearcoat). */
export function createPaintMaterial(p: Paint): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({ name: `pintura:${p.id}` });
  updatePaintMaterial(m, p);
  return m;
}

export function updatePaintMaterial(m: THREE.MeshPhysicalMaterial, p: Paint) {
  const finish = p.finish;
  m.color.set(p.color);
  m.metalness = p.metalness ?? (finish === 'solido' ? 0.0 : finish === 'mate' ? 0.4 : 0.65);
  m.roughness = p.roughness ?? (finish === 'solido' ? 0.32 : finish === 'mate' ? 0.55 : 0.38);
  m.clearcoat = p.clearcoat ?? (finish === 'mate' ? 0.0 : 1.0);
  m.clearcoatRoughness = p.clearcoatRoughness ?? (finish === 'mate' ? 0.6 : 0.02);
  m.envMapIntensity = 1.0;
  const flakes = (p.flakeIntensity ?? (finish === 'metalizado' ? 0.35 : finish === 'perlado' ? 0.2 : 0)) > 0;
  if (flakes) {
    m.normalMap = getFlakeNormalMap();
    const k = p.flakeIntensity ?? (finish === 'metalizado' ? 0.35 : 0.2);
    m.normalScale.set(k, k);
  } else {
    m.normalMap = null;
  }
  // El barniz conserva la superficie lisa por encima de las escamas.
  m.clearcoatNormalMap = null;
  if (finish === 'perlado') {
    // Ligero cambio de tono en ángulos rasantes (efecto multicapa).
    m.sheen = 0.18;
    m.sheenRoughness = 0.5;
    m.sheenColor.set(p.flopColor ?? '#c9d6ff');
    m.iridescence = 0;
  } else {
    m.sheen = 0;
    m.iridescence = 0;
  }
  m.needsUpdate = true;
}

export function createWheelFinishMaterial(f: WheelFinish, name = 'llanta'): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    name,
    color: new THREE.Color(f.color),
    metalness: f.metalness,
    roughness: f.roughness,
    clearcoat: f.clearcoat ?? 0.6,
    clearcoatRoughness: 0.08,
  });
}

export function createTireMaterial(original?: THREE.Material): THREE.MeshPhysicalMaterial {
  const src = original as THREE.MeshStandardMaterial | undefined;
  return new THREE.MeshPhysicalMaterial({
    name: 'neumatico',
    color: new THREE.Color('#1a1a1a'),
    map: src?.map ?? null,
    normalMap: src?.normalMap ?? null,
    roughness: 0.82,
    metalness: 0,
    sheen: 0.25,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color('#3a3a3a'),
  });
}

/** Cristal tintado. tint: 0 claro – 1 muy oscuro. */
export function createGlassMaterial(tint: number): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    name: 'cristal',
    color: new THREE.Color('#0b0d10'),
    metalness: 0,
    roughness: 0.02,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 1.4,
    clearcoat: 1,
    clearcoatRoughness: 0,
    ior: 1.52,
    specularIntensity: 1,
  });
  updateGlassMaterial(m, tint);
  return m;
}

export function updateGlassMaterial(m: THREE.MeshPhysicalMaterial, tint: number) {
  m.opacity = THREE.MathUtils.lerp(0.25, 0.92, tint);
  m.needsUpdate = true;
}

export function createChromeMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ name: 'cromado', color: '#d8d8d8', metalness: 1, roughness: 0.12 });
}

export function createTrimMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    name: 'embellecedor',
    color: '#0c0c0c',
    metalness: 0.1,
    roughness: 0.35,
    clearcoat: 0.6,
    clearcoatRoughness: 0.15,
  });
}

/** Mejora un material de luz para que pueda encenderse (emisivo). */
export function createLightMaterial(original: THREE.Material, kind: 'head' | 'tail'): THREE.MeshPhysicalMaterial {
  const src = original as THREE.MeshStandardMaterial;
  const m = new THREE.MeshPhysicalMaterial({
    name: kind === 'head' ? 'faro' : 'piloto',
    color: src.color?.clone() ?? new THREE.Color(kind === 'head' ? '#dddddd' : '#7a0000'),
    map: src.map ?? null,
    metalness: 0.2,
    roughness: 0.08,
    transparent: src.transparent,
    opacity: src.opacity,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    emissive: new THREE.Color(kind === 'head' ? '#f2f6ff' : '#ff1a12'),
    emissiveIntensity: 0,
  });
  m.userData.lightKind = kind;
  return m;
}

export function setLightsOn(m: THREE.MeshPhysicalMaterial, on: boolean) {
  m.emissiveIntensity = on ? (m.userData.lightKind === 'head' ? 6 : 4) : 0;
}

/**
 * Corrige materiales genéricos de exportaciones de Sketchfab (metalness 0,
 * roughness 1) para que respondan mejor a la iluminación basada en imagen.
 */
export function enhanceGenericMaterial(m: THREE.Material) {
  const s = m as THREE.MeshStandardMaterial;
  if (!('roughness' in s)) return;
  if (s.roughness === 1 && !s.roughnessMap) s.roughness = 0.6;
  s.envMapIntensity = 1;
}
