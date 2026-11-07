import { Resource, joaat } from './rsc.ts';
import { readTextureDictionary, type GtaTexture } from './ytd.ts';

/** Nombres conocidos de shaders de vehículos y parámetros (se resuelven por hash). */
const SHADER_NAMES = [
  'vehicle_paint1', 'vehicle_paint1_enveff', 'vehicle_paint2', 'vehicle_paint2_enveff', 'vehicle_paint3',
  'vehicle_paint3_enveff', 'vehicle_paint3_lvr', 'vehicle_paint4', 'vehicle_paint4_enveff', 'vehicle_paint4_emissive',
  'vehicle_paint5_enveff', 'vehicle_paint6', 'vehicle_paint6_enveff', 'vehicle_paint7', 'vehicle_paint7_enveff',
  'vehicle_paint8', 'vehicle_paint9', 'vehicle_mesh', 'vehicle_mesh_enveff', 'vehicle_mesh2_enveff', 'vehicle_shuts',
  'vehicle_interior', 'vehicle_interior2', 'vehicle_tire', 'vehicle_tire_emissive', 'vehicle_vehglass',
  'vehicle_vehglass_inner', 'vehicle_lightsemissive', 'vehicle_lightsemissive_siren', 'vehicle_lights', 'vehicle_badges',
  'vehicle_decal', 'vehicle_decal2', 'vehicle_licenseplate', 'vehicle_dash_emissive', 'vehicle_dash_emissive_opaque',
  'vehicle_emissive_opaque', 'vehicle_emissive_alpha', 'vehicle_blurredrotor', 'vehicle_blurredrotor_emissive',
  'vehicle_detail', 'vehicle_detail2', 'vehicle_track', 'vehicle_track_ammo', 'vehicle_track2', 'vehicle_track_emissive',
  'vehicle_cloth', 'vehicle_cloth2', 'vehicle_cutout', 'vehicle_basic', 'vehicle_generic', 'vehicle_nosplash',
  'vehicle_nowater', 'vehicle_mesh_alpha', 'default', 'normal', 'normal_spec', 'spec', 'emissive', 'cutout', 'decal',
];
const PARAM_NAMES = [
  'DiffuseSampler', 'BumpSampler', 'SpecSampler', 'DetailSampler', 'DirtSampler', 'DamageSampler', 'EnvironmentSampler',
  'TintPaletteSampler', 'DiffuseSampler2', 'PlateBgSampler', 'PlateBgBumpSampler', 'FontSampler', 'FontNormalSampler',
  'TextureSampler', 'matDiffuseColor', 'matDiffuseColor2', 'specularColorFactor', 'specularFresnel', 'specularFalloffMult',
  'specularIntensityMult', 'bumpiness', 'emissiveMultiplier', 'dirtLevelMod', 'envEffScale',
];
const shaderByHash = new Map(SHADER_NAMES.map((n) => [joaat(n), n]));
const paramByHash = new Map(PARAM_NAMES.map((n) => [joaat(n), n]));

export interface GtaShader {
  name: string;
  textures: Record<string, string>;
  values: Record<string, number[]>;
}

export interface GtaBone {
  name: string;
  parent: number;
  translation: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
}

export interface GtaGeometry {
  shader: number;
  positions: Float32Array;
  normals: Float32Array | null;
  uv0: Float32Array | null;
  colors: Uint8Array | null;
  indices: Uint32Array;
  /** Hueso principal (índice del esqueleto) de cada vértice. */
  bones: Int16Array | null;
  /**
   * Hueso al que va unida la geometría si NO tiene piel (sus vértices están
   * en el espacio local del hueso); −1 si tiene piel (espacio del modelo).
   */
  rigidBone: number;
}

export interface GtaDrawable {
  name: string;
  bones: GtaBone[];
  geometries: GtaGeometry[];
  shaders: GtaShader[];
  embeddedTextures: GtaTexture[];
  bbox: { min: [number, number, number]; max: [number, number, number] };
}

// Tipos de componente de VertexDeclaration (gen8).
const COMP_SIZE = [0, 4, 4, 8, 4, 8, 12, 16, 4, 4, 4, 4, 4, 4, 4, 4];
const Comp = { Half2: 1, Float: 2, Half4: 3, Float2: 5, Float3: 6, Float4: 7, UByte4: 8, Colour: 9, Dec3N: 10 } as const;

function half(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

function readComponent(r: Resource, o: number, type: number, n: number): number[] {
  switch (type) {
    case Comp.Float:
      return [r.f32(o)];
    case Comp.Float2:
      return [r.f32(o), r.f32(o + 4)];
    case Comp.Float3:
      return [r.f32(o), r.f32(o + 4), r.f32(o + 8)];
    case Comp.Float4:
      return [r.f32(o), r.f32(o + 4), r.f32(o + 8), r.f32(o + 12)];
    case Comp.Half2:
      return [half(r.u16(o)), half(r.u16(o + 2))];
    case Comp.Half4:
      return [half(r.u16(o)), half(r.u16(o + 2)), half(r.u16(o + 4)), half(r.u16(o + 6))];
    case Comp.UByte4:
    case Comp.Colour:
      return [r.u8(o), r.u8(o + 1), r.u8(o + 2), r.u8(o + 3)];
    case Comp.Dec3N: {
      const v = r.u32(o);
      const c = (x: number) => (x & 0x200 ? x - 1024 : x) / 511;
      return [c(v & 0x3ff), c((v >> 10) & 0x3ff), c((v >> 20) & 0x3ff)];
    }
    default:
      return new Array(n).fill(0);
  }
}

function readShaders(r: Resource, group: number): GtaShader[] {
  const out: GtaShader[] = [];
  if (group < 0) return out;
  const list = r.ptrArray(r.ptr(group + 0x10), r.u16(group + 0x18));
  for (const s of list) {
    const hash = r.u32(s + 8);
    const shader: GtaShader = { name: shaderByHash.get(hash) ?? `shader_${hash.toString(16)}`, textures: {}, values: {} };
    const params = r.ptr(s);
    const count = r.u8(s + 0x10);
    if (params >= 0) {
      let dataSize = 0;
      for (let i = 0; i < count; i++) dataSize += r.u8(params + i * 16) * 16;
      const hashes = params + count * 16 + dataSize;
      for (let i = 0; i < count; i++) {
        const type = r.u8(params + i * 16);
        const data = r.ptr(params + i * 16 + 8);
        const ph = r.u32(hashes + i * 4);
        const name = paramByHash.get(ph) ?? `p_${ph.toString(16)}`;
        if (type === 0) {
          if (data >= 0) shader.textures[name] = r.str(r.ptr(data + 0x28)).toLowerCase();
        } else if (data >= 0) {
          shader.values[name] = [r.f32(data), r.f32(data + 4), r.f32(data + 8), r.f32(data + 12)];
        }
      }
    }
    out.push(shader);
  }
  return out;
}

function readBones(r: Resource, sk: number): GtaBone[] {
  if (sk < 0) return [];
  const bonesAt = r.ptr(sk + 0x20);
  const count = r.u16(sk + 0x5e);
  const bones: GtaBone[] = [];
  for (let i = 0; i < count; i++) {
    const b = bonesAt + i * 0x50;
    bones.push({
      rotation: [r.f32(b), r.f32(b + 4), r.f32(b + 8), r.f32(b + 12)],
      translation: [r.f32(b + 0x10), r.f32(b + 0x14), r.f32(b + 0x18)],
      scale: [r.f32(b + 0x20), r.f32(b + 0x24), r.f32(b + 0x28)],
      parent: r.i16(b + 0x32),
      name: r.str(r.ptr(b + 0x38)).toLowerCase(),
    });
  }
  return bones;
}

function readGeometry(r: Resource, g: number, shader: number, boneOfModel: number): GtaGeometry | null {
  const vb = r.ptr(g + 0x18);
  const ib = r.ptr(g + 0x38);
  if (vb < 0 || ib < 0) return null;
  const stride = r.u16(vb + 8);
  const count = r.u32(vb + 0x18);
  const data = r.ptr(vb + 0x10) >= 0 ? r.ptr(vb + 0x10) : r.ptr(vb + 0x20);
  const decl = r.ptr(vb + 0x30);
  if (data < 0 || decl < 0 || count === 0) return null;
  const flags = r.u32(decl);
  const lo = r.u32(decl + 8);
  const hi = r.u32(decl + 12);
  const typeOf = (i: number) => (i < 8 ? (lo >>> (i * 4)) & 0xf : (hi >>> ((i - 8) * 4)) & 0xf);
  const offsets: number[] = [];
  let acc = 0;
  for (let i = 0; i < 16; i++) {
    offsets.push(acc);
    if (flags & (1 << i)) acc += COMP_SIZE[typeOf(i)];
  }
  const has = (i: number) => (flags & (1 << i)) !== 0;
  const positions = new Float32Array(count * 3);
  const normals = has(3) ? new Float32Array(count * 3) : null;
  const uv0 = has(6) ? new Float32Array(count * 2) : null;
  const colors = has(4) ? new Uint8Array(count * 4) : null;
  // Mapa de huesos de la geometría (índices de mezcla → huesos del esqueleto).
  const boneIdsAt = r.ptr(g + 0x68);
  const boneIdsCount = r.u16(g + 0x72);
  const boneIds: number[] = [];
  for (let i = 0; i < boneIdsCount && boneIdsAt >= 0; i++) boneIds.push(r.u16(boneIdsAt + i * 2));
  const bones = has(2) || boneOfModel >= 0 ? new Int16Array(count) : null;
  for (let v = 0; v < count; v++) {
    const base = data + v * stride;
    const p = readComponent(r, base + offsets[0], typeOf(0), 3);
    positions.set([p[0], p[1], p[2]], v * 3);
    if (normals) {
      const n = readComponent(r, base + offsets[3], typeOf(3), 3);
      normals.set([n[0], n[1], n[2]], v * 3);
    }
    if (uv0) {
      const t = readComponent(r, base + offsets[6], typeOf(6), 2);
      uv0.set([t[0], t[1]], v * 2);
    }
    if (colors) colors.set(readComponent(r, base + offsets[4], typeOf(4), 4), v * 4);
    if (bones) {
      if (has(2)) {
        const w = has(1) ? readComponent(r, base + offsets[1], typeOf(1), 4) : [255, 0, 0, 0];
        const ix = readComponent(r, base + offsets[2], typeOf(2), 4);
        let best = 0;
        for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k;
        bones[v] = boneIds.length ? (boneIds[ix[best]] ?? ix[best]) : ix[best];
      } else bones[v] = boneOfModel;
    }
  }
  const icount = r.u32(ib + 8);
  const iat = r.ptr(ib + 0x10);
  const indices = new Uint32Array(icount);
  for (let i = 0; i < icount; i++) indices[i] = r.u16(iat + i * 2);
  return { shader, positions, normals, uv0, colors, indices, bones, rigidBone: boneOfModel };
}

/** Lee un Drawable/FragDrawable gen8 situado en `d`. */
export function readDrawable(r: Resource, d: number, name: string): GtaDrawable {
  const shaders = readShaders(r, r.ptr(d + 0x10));
  const group = r.ptr(d + 0x10);
  const embeddedTextures = group >= 0 ? readTextureDictionary(r, r.ptr(group + 0x08)) : [];
  const bones = readBones(r, r.ptr(d + 0x18));
  const geometries: GtaGeometry[] = [];
  const list = r.ptr(d + 0x50); // modelos de alto detalle
  if (list >= 0) {
    for (const m of r.ptrArray(r.ptr(list), r.u16(list + 8))) {
      if (m < 0) continue;
      const geoCount = r.u16(m + 0x10);
      const geos = r.ptrArray(r.ptr(m + 8), geoCount);
      const shaderMap = r.ptr(m + 0x20);
      const binding = r.u32(m + 0x28);
      const hasSkin = ((binding >>> 8) & 0xff) > 0;
      const boneIndex = (binding >>> 24) & 0xff;
      geos.forEach((g, k) => {
        if (g < 0) return;
        const geo = readGeometry(r, g, r.u16(shaderMap + k * 2), hasSkin ? -1 : boneIndex);
        if (geo) geometries.push(geo);
      });
    }
  }
  return {
    name,
    bones,
    geometries,
    shaders,
    embeddedTextures,
    bbox: {
      min: [r.f32(d + 0x30), r.f32(d + 0x34), r.f32(d + 0x38)],
      max: [r.f32(d + 0x40), r.f32(d + 0x44), r.f32(d + 0x48)],
    },
  };
}

/** Lee un .yft (FragType) y devuelve su drawable principal. */
export function readYft(r: Resource): GtaDrawable {
  if (r.header.version !== 162) throw new Error(`Versión de .yft no admitida (${r.header.version}).`);
  const drawable = r.ptr(0x30);
  if (drawable < 0) throw new Error('El .yft no contiene geometría.');
  const name = r.str(r.ptr(0x58)).replace(/^pack:\//, '');
  return readDrawable(r, drawable, name);
}

/** Lee un .ydr (Drawable suelto). */
export function readYdr(r: Resource, name: string): GtaDrawable {
  return readDrawable(r, 0, name);
}
