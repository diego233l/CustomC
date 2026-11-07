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

/** Convierte un mapa de alturas (0..1) en un mapa de normales RGBA. */
function heightToNormal(h: Float32Array, w: number, ht: number, strength: number, wrap = true): THREE.DataTexture {
  const data = new Uint8Array(w * ht * 4);
  const at = (x: number, y: number) => {
    if (wrap) {
      x = (x + w) % w;
      y = (y + ht) % ht;
    } else {
      x = Math.min(w - 1, Math.max(0, x));
      y = Math.min(ht - 1, Math.max(0, y));
    }
    return h[y * w + x];
  };
  for (let y = 0; y < ht; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      data[i] = (-dx / len) * 127.5 + 127.5;
      data[i + 1] = (-dy / len) * 127.5 + 127.5;
      data[i + 2] = (1 / len) * 127.5 + 127.5;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, w, ht, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

let orangePeel: THREE.Texture | null = null;
/** «Piel de naranja» del barniz: ondulación suave que da realismo a los reflejos. */
export function getOrangePeelMap(): THREE.Texture {
  if (orangePeel) return orangePeel;
  const n = 256;
  const h = new Float32Array(n * n);
  // Suma de ondas aleatorias periódicas (se repite sin costuras).
  let seed = 99;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const waves = Array.from({ length: 28 }, () => ({ fx: Math.round(rand() * 14) + 2, fy: Math.round(rand() * 14) + 2, p: rand() * 6.28, a: rand() }));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      let v = 0;
      for (const w of waves) v += w.a * Math.sin(((x * w.fx + y * w.fy) / n) * Math.PI * 2 + w.p);
      h[y * n + x] = v / 28;
    }
  orangePeel = heightToNormal(h, n, n, 6);
  orangePeel.repeat.set(12, 12);
  return orangePeel;
}

let treadMap: THREE.Texture | null = null;
/**
 * Dibujo de neumático para los neumáticos generados (perfil de revolución):
 * U recorre la circunferencia y V el perfil (flanco → banda → flanco).
 */
export function getTireTreadMap(): THREE.Texture {
  if (treadMap) return treadMap;
  const w = 1024;
  const ht = 256;
  const h = new Float32Array(w * ht);
  const blocks = 96;
  for (let y = 0; y < ht; y++) {
    const v = y / ht;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      let val = 0.5;
      if (v > 0.3 && v < 0.7) {
        // Banda de rodadura: 4 surcos longitudinales y laminillas diagonales.
        const grooves = [0.38, 0.46, 0.54, 0.62].some((g) => Math.abs(v - g) < 0.012);
        const sipe = Math.abs(((u * blocks + (v - 0.5) * 3) % 1) - 0.5) < 0.06 && Math.abs(v - 0.5) > 0.05;
        val = grooves ? 0 : sipe ? 0.25 : 0.75;
      } else if ((v > 0.22 && v <= 0.3) || (v >= 0.7 && v < 0.78)) {
        // Hombros con bloques.
        val = Math.abs(((u * blocks * 0.5) % 1) - 0.5) < 0.12 ? 0.15 : 0.7;
      } else {
        // Flancos: anillos finos.
        val = 0.5 + 0.08 * Math.sin(v * 220);
      }
      h[y * w + x] = val;
    }
  }
  treadMap = heightToNormal(h, w, ht, 3, true);
  return treadMap;
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
  // El barniz tiene su propia ondulación sutil («piel de naranja»), independiente de las escamas.
  m.clearcoatNormalMap = m.clearcoat > 0 ? getOrangePeelMap() : null;
  m.clearcoatNormalScale.set(0.06, 0.06);
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

export function createWheelFinishMaterial(f: Pick<WheelFinish, 'color' | 'metalness' | 'roughness' | 'clearcoat'>, name = 'llanta'): THREE.MeshPhysicalMaterial {
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
  // Los neumáticos generados (mods sin ruedas) reciben un dibujo procedural.
  const generated = src?.name === 'gta_neumatico_generado';
  return new THREE.MeshPhysicalMaterial({
    name: 'neumatico',
    color: new THREE.Color('#1a1a1a'),
    map: src?.map ?? null,
    normalMap: src?.normalMap ?? (generated ? getTireTreadMap() : null),
    normalScale: new THREE.Vector2(1.2, 1.2),
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
