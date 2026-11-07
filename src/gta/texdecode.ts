/**
 * Decodificadores de texturas de GTA V (DirectX) a RGBA de 8 bits.
 * Formatos: DXT1/BC1, DXT3/BC2, DXT5/BC3, ATI1/BC4, ATI2/BC5, BC7,
 * A8R8G8B8, X8R8G8B8, A1R5G5B5, A8 y L8.
 */

export const FOURCC = {
  DXT1: 0x31545844,
  DXT3: 0x33545844,
  DXT5: 0x35545844,
  ATI1: 0x31495441,
  ATI2: 0x32495441,
  BC7: 0x20374342,
} as const;
export const D3DFMT = { A8R8G8B8: 21, X8R8G8B8: 22, A1R5G5B5: 25, A8: 28, L8: 50 } as const;

export function formatName(f: number): string {
  for (const [k, v] of Object.entries(FOURCC)) if (v === f) return k;
  for (const [k, v] of Object.entries(D3DFMT)) if (v === f) return k;
  return `0x${f.toString(16)}`;
}

/** Tamaño en bytes del nivel de mip con dimensiones w×h. */
export function levelSize(format: number, w: number, h: number): number {
  const bw = Math.max(1, (w + 3) >> 2);
  const bh = Math.max(1, (h + 3) >> 2);
  switch (format) {
    case FOURCC.DXT1:
    case FOURCC.ATI1:
      return bw * bh * 8;
    case FOURCC.DXT3:
    case FOURCC.DXT5:
    case FOURCC.ATI2:
    case FOURCC.BC7:
      return bw * bh * 16;
    case D3DFMT.A8R8G8B8:
    case D3DFMT.X8R8G8B8:
      return w * h * 4;
    case D3DFMT.A1R5G5B5:
      return w * h * 2;
    case D3DFMT.A8:
    case D3DFMT.L8:
      return w * h;
    default:
      return -1;
  }
}

export const isSupported = (format: number) => levelSize(format, 4, 4) > 0;

function rgb565(c: number, out: number[], o: number) {
  const r = (c >> 11) & 31;
  const g = (c >> 5) & 63;
  const b = c & 31;
  out[o] = (r << 3) | (r >> 2);
  out[o + 1] = (g << 2) | (g >> 4);
  out[o + 2] = (b << 3) | (b >> 2);
}

function decodeColorBlock(src: Uint8Array, s: number, out: Uint8ClampedArray, w: number, h: number, bx: number, by: number, forceFour: boolean, writeAlpha: boolean) {
  const c0 = src[s] | (src[s + 1] << 8);
  const c1 = src[s + 2] | (src[s + 3] << 8);
  const pal = new Array<number>(16).fill(255);
  rgb565(c0, pal, 0);
  rgb565(c1, pal, 4);
  if (c0 > c1 || forceFour) {
    for (let k = 0; k < 3; k++) {
      pal[8 + k] = (2 * pal[k] + pal[4 + k] + 1) / 3;
      pal[12 + k] = (pal[k] + 2 * pal[4 + k] + 1) / 3;
    }
  } else {
    for (let k = 0; k < 3; k++) {
      pal[8 + k] = (pal[k] + pal[4 + k]) >> 1;
      pal[12 + k] = 0;
    }
    pal[15] = 0;
  }
  const bits = src[s + 4] | (src[s + 5] << 8) | (src[s + 6] << 16) | (src[s + 7] << 24);
  for (let i = 0; i < 16; i++) {
    const x = bx * 4 + (i & 3);
    const y = by * 4 + (i >> 2);
    if (x >= w || y >= h) continue;
    const idx = (bits >>> (i * 2)) & 3;
    const o = (y * w + x) * 4;
    out[o] = pal[idx * 4];
    out[o + 1] = pal[idx * 4 + 1];
    out[o + 2] = pal[idx * 4 + 2];
    if (writeAlpha) out[o + 3] = pal[idx * 4 + 3];
  }
}

/** Bloque de 8 bytes con interpolación de 8 valores (alfa BC3 / BC4 / BC5). */
function decodeAlphaBlock(src: Uint8Array, s: number): Uint8Array {
  const a0 = src[s];
  const a1 = src[s + 1];
  const pal = new Uint8Array(8);
  pal[0] = a0;
  pal[1] = a1;
  if (a0 > a1) for (let i = 1; i < 7; i++) pal[i + 1] = ((7 - i) * a0 + i * a1 + 3) / 7;
  else {
    for (let i = 1; i < 5; i++) pal[i + 1] = ((5 - i) * a0 + i * a1 + 2) / 5;
    pal[6] = 0;
    pal[7] = 255;
  }
  const out = new Uint8Array(16);
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(src[s + 2 + i]) << BigInt(8 * i);
  for (let i = 0; i < 16; i++) out[i] = pal[Number((bits >> BigInt(3 * i)) & 7n)];
  return out;
}

function forEachBlock(w: number, h: number, fn: (bx: number, by: number, blockIndex: number) => void) {
  const bw = Math.max(1, (w + 3) >> 2);
  const bh = Math.max(1, (h + 3) >> 2);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) fn(bx, by, by * bw + bx);
}

function writeChannel(out: Uint8ClampedArray, w: number, h: number, bx: number, by: number, vals: Uint8Array, ch: number) {
  for (let i = 0; i < 16; i++) {
    const x = bx * 4 + (i & 3);
    const y = by * 4 + (i >> 2);
    if (x < w && y < h) out[(y * w + x) * 4 + ch] = vals[i];
  }
}

// --------------------------------------------------------------------------
// BC7
// --------------------------------------------------------------------------

const BC7_PARTITIONS2 = [
  0xcccc, 0x8888, 0xeeee, 0xecc8, 0xc880, 0xfeec, 0xfec8, 0xec80, 0xc800, 0xffec, 0xfe80, 0xe800, 0xffe8, 0xff00, 0xfff0, 0xf000,
  0xf710, 0x008e, 0x7100, 0x08ce, 0x008c, 0x7310, 0x3100, 0x8cce, 0x088c, 0x3110, 0x6666, 0x366c, 0x17e8, 0x0ff0, 0x718e, 0x399c,
  0xaaaa, 0xf0f0, 0x5a5a, 0x33cc, 0x3c3c, 0x55aa, 0x9696, 0xa55a, 0x73ce, 0x13c8, 0x324c, 0x3bdc, 0x6996, 0xc33c, 0x9966, 0x0660,
  0x0272, 0x04e4, 0x4e40, 0x2720, 0xc936, 0x936c, 0x39c6, 0x639c, 0x9336, 0x9cc6, 0x817e, 0xe718, 0xccf0, 0x0fcc, 0x7744, 0xee22,
];
// Particiones de 3 subconjuntos: 2 bits por píxel.
const BC7_PARTITIONS3 = [
  0xaa685050, 0x6a5a5040, 0x5a5a4200, 0x5450a0a8, 0xa5a50000, 0xa0a05050, 0x5555a0a0, 0x5a5a5050, 0xaa550000, 0xaa555500, 0xaaaa5500,
  0x90909090, 0x94949494, 0xa4a4a4a4, 0xa9a59450, 0x2a0a4250, 0xa5945040, 0x0a425054, 0xa5a5a500, 0x55a0a0a0, 0xa8a85454, 0x6a6a4040,
  0xa4a45000, 0x1a1a0500, 0x0050a4a4, 0xaaa59090, 0x14696914, 0x69691400, 0xa08585a0, 0xaa821414, 0x50a4a450, 0x6a5a0200, 0xa9a58000,
  0x5090a0a8, 0xa8a09050, 0x24242424, 0x00aa5500, 0x24924924, 0x24499224, 0x50a50a50, 0x500aa550, 0xaaaa4444, 0x66660000, 0xa5a0a5a0,
  0x50a050a0, 0x69286928, 0x44aaaa44, 0x66666600, 0xaa444444, 0x54a854a8, 0x95809580, 0x96969600, 0xa85454a8, 0x80959580, 0xaa141414,
  0x96960000, 0xaaaa1414, 0xa05050a0, 0xa0a5a5a0, 0x96000000, 0x40804080, 0xa9a8a9a8, 0xaaaaaa44, 0x2a4a5254,
];
const BC7_ANCHOR2 = [
  15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2, 15, 15, 6, 8, 2, 8, 15, 15,
  2, 8, 2, 2, 2, 15, 15, 6, 6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15,
];
const BC7_ANCHOR3A = [
  3, 3, 15, 15, 8, 3, 15, 15, 8, 8, 6, 6, 6, 5, 3, 3, 3, 3, 8, 15, 3, 3, 6, 10, 5, 8, 8, 6, 8, 5, 15, 15, 8, 15, 3, 5, 6, 10, 8, 15, 15, 3,
  15, 5, 15, 15, 15, 15, 3, 15, 5, 5, 5, 8, 5, 10, 5, 10, 8, 13, 15, 12, 3, 3,
];
const BC7_ANCHOR3B = [
  15, 8, 8, 3, 15, 15, 3, 8, 15, 15, 15, 15, 15, 15, 15, 8, 15, 8, 15, 3, 15, 8, 15, 8, 3, 15, 6, 10, 15, 15, 10, 8, 15, 3, 15, 10, 10, 8, 9,
  10, 6, 15, 8, 15, 3, 6, 6, 8, 15, 3, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 3, 15, 15, 8,
];
const W2 = [0, 21, 43, 64];
const W3 = [0, 9, 18, 27, 37, 46, 55, 64];
const W4 = [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64];
const WEIGHTS: Record<number, number[]> = { 2: W2, 3: W3, 4: W4 };

interface Bc7Mode {
  ns: number; // subconjuntos
  pb: number; // bits de partición
  rb: number; // bits de rotación
  isb: number; // bit de selector de índice
  cb: number; // bits de color
  ab: number; // bits de alfa
  epb: number; // bit P por extremo
  spb: number; // bit P compartido
  ib: number; // bits de índice
  ib2: number; // bits de índice secundario
}
const BC7_MODES: Bc7Mode[] = [
  { ns: 3, pb: 4, rb: 0, isb: 0, cb: 4, ab: 0, epb: 1, spb: 0, ib: 3, ib2: 0 },
  { ns: 2, pb: 6, rb: 0, isb: 0, cb: 6, ab: 0, epb: 0, spb: 1, ib: 3, ib2: 0 },
  { ns: 3, pb: 6, rb: 0, isb: 0, cb: 5, ab: 0, epb: 0, spb: 0, ib: 2, ib2: 0 },
  { ns: 2, pb: 6, rb: 0, isb: 0, cb: 7, ab: 0, epb: 1, spb: 0, ib: 2, ib2: 0 },
  { ns: 1, pb: 0, rb: 2, isb: 1, cb: 5, ab: 6, epb: 0, spb: 0, ib: 2, ib2: 3 },
  { ns: 1, pb: 0, rb: 2, isb: 0, cb: 7, ab: 8, epb: 0, spb: 0, ib: 2, ib2: 2 },
  { ns: 1, pb: 0, rb: 0, isb: 0, cb: 7, ab: 7, epb: 1, spb: 0, ib: 4, ib2: 0 },
  { ns: 2, pb: 6, rb: 0, isb: 0, cb: 5, ab: 5, epb: 1, spb: 0, ib: 2, ib2: 0 },
];

class BitReader {
  private lo: bigint;
  private pos = 0;
  constructor(src: Uint8Array, s: number) {
    let v = 0n;
    for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(src[s + i]);
    this.lo = v;
  }
  read(n: number): number {
    if (n === 0) return 0;
    const v = Number((this.lo >> BigInt(this.pos)) & ((1n << BigInt(n)) - 1n));
    this.pos += n;
    return v;
  }
}

function subsetOf(ns: number, partition: number, i: number): number {
  if (ns === 1) return 0;
  if (ns === 2) return (BC7_PARTITIONS2[partition] >> i) & 1;
  return (BC7_PARTITIONS3[partition] >>> (i * 2)) & 3;
}
function isAnchor(ns: number, partition: number, subset: number, i: number): boolean {
  if (i === 0 && subset === 0) return true;
  if (ns === 2) return subset === 1 && i === BC7_ANCHOR2[partition];
  if (ns === 3) return (subset === 1 && i === BC7_ANCHOR3A[partition]) || (subset === 2 && i === BC7_ANCHOR3B[partition]);
  return false;
}

function decodeBc7Block(src: Uint8Array, s: number, out: Uint8ClampedArray, w: number, h: number, bx: number, by: number) {
  let modeIndex = 0;
  while (modeIndex < 8 && !(src[s] & (1 << modeIndex))) modeIndex++;
  const px = (i: number) => {
    const x = bx * 4 + (i & 3);
    const y = by * 4 + (i >> 2);
    return x < w && y < h ? (y * w + x) * 4 : -1;
  };
  if (modeIndex >= 8) {
    for (let i = 0; i < 16; i++) {
      const o = px(i);
      if (o >= 0) out.set([0, 0, 0, 0], o);
    }
    return;
  }
  const m = BC7_MODES[modeIndex];
  const br = new BitReader(src, s);
  br.read(modeIndex + 1);
  const partition = br.read(m.pb);
  const rotation = br.read(m.rb);
  const indexSel = br.read(m.isb);
  const ne = m.ns * 2;
  const ep: number[][] = Array.from({ length: ne }, () => [0, 0, 0, 255]);
  for (let c = 0; c < 3; c++) for (let e = 0; e < ne; e++) ep[e][c] = br.read(m.cb);
  if (m.ab) for (let e = 0; e < ne; e++) ep[e][3] = br.read(m.ab);
  let cbits = m.cb;
  let abits = m.ab;
  if (m.epb) {
    for (let e = 0; e < ne; e++) {
      const p = br.read(1);
      for (let c = 0; c < 4; c++) ep[e][c] = (ep[e][c] << 1) | p;
    }
    cbits++;
    if (abits) abits++;
  } else if (m.spb) {
    for (let sb = 0; sb < m.ns; sb++) {
      const p = br.read(1);
      for (let e = sb * 2; e < sb * 2 + 2; e++) for (let c = 0; c < 4; c++) ep[e][c] = (ep[e][c] << 1) | p;
    }
    cbits++;
    if (abits) abits++;
  }
  const expand = (v: number, bits: number) => {
    v = v << (8 - bits);
    return v | (v >> bits);
  };
  for (const e of ep) {
    for (let c = 0; c < 3; c++) e[c] = expand(e[c], cbits);
    e[3] = abits ? expand(e[3], abits) : 255;
  }
  const idx1 = new Array<number>(16);
  for (let i = 0; i < 16; i++) {
    const sb = subsetOf(m.ns, partition, i);
    idx1[i] = br.read(isAnchor(m.ns, partition, sb, i) ? m.ib - 1 : m.ib);
  }
  const idx2 = new Array<number>(16).fill(0);
  if (m.ib2) for (let i = 0; i < 16; i++) idx2[i] = br.read(i === 0 ? m.ib2 - 1 : m.ib2);
  for (let i = 0; i < 16; i++) {
    const o = px(i);
    if (o < 0) continue;
    const sb = subsetOf(m.ns, partition, i);
    const e0 = ep[sb * 2];
    const e1 = ep[sb * 2 + 1];
    let cw: number;
    let aw: number;
    if (m.ib2) {
      const wc = indexSel ? WEIGHTS[m.ib2][idx2[i]] : WEIGHTS[m.ib][idx1[i]];
      const wa = indexSel ? WEIGHTS[m.ib][idx1[i]] : WEIGHTS[m.ib2][idx2[i]];
      cw = wc;
      aw = wa;
    } else {
      cw = aw = WEIGHTS[m.ib][idx1[i]];
    }
    const px4 = [0, 0, 0, 0];
    for (let c = 0; c < 3; c++) px4[c] = ((64 - cw) * e0[c] + cw * e1[c] + 32) >> 6;
    px4[3] = ((64 - aw) * e0[3] + aw * e1[3] + 32) >> 6;
    if (rotation) {
      const t = px4[3];
      px4[3] = px4[rotation - 1];
      px4[rotation - 1] = t;
    }
    out[o] = px4[0];
    out[o + 1] = px4[1];
    out[o + 2] = px4[2];
    out[o + 3] = px4[3];
  }
}

// --------------------------------------------------------------------------

/**
 * Decodifica el nivel de mip indicado a RGBA. `normal` reconstruye el eje Z
 * de mapas de normales de dos canales (BC5).
 */
export function decodeToRgba(format: number, w: number, h: number, src: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  out.fill(255);
  switch (format) {
    case FOURCC.DXT1:
      forEachBlock(w, h, (bx, by, b) => decodeColorBlock(src, b * 8, out, w, h, bx, by, false, true));
      break;
    case FOURCC.DXT3:
      forEachBlock(w, h, (bx, by, b) => {
        const s = b * 16;
        decodeColorBlock(src, s + 8, out, w, h, bx, by, true, false);
        const a = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
          const v = (src[s + (i >> 1)] >> ((i & 1) * 4)) & 15;
          a[i] = v * 17;
        }
        writeChannel(out, w, h, bx, by, a, 3);
      });
      break;
    case FOURCC.DXT5:
      forEachBlock(w, h, (bx, by, b) => {
        const s = b * 16;
        decodeColorBlock(src, s + 8, out, w, h, bx, by, true, false);
        writeChannel(out, w, h, bx, by, decodeAlphaBlock(src, s), 3);
      });
      break;
    case FOURCC.ATI1:
      forEachBlock(w, h, (bx, by, b) => {
        const v = decodeAlphaBlock(src, b * 8);
        for (let c = 0; c < 3; c++) writeChannel(out, w, h, bx, by, v, c);
      });
      break;
    case FOURCC.ATI2:
      forEachBlock(w, h, (bx, by, b) => {
        const r = decodeAlphaBlock(src, b * 16);
        const g = decodeAlphaBlock(src, b * 16 + 8);
        writeChannel(out, w, h, bx, by, r, 0);
        writeChannel(out, w, h, bx, by, g, 1);
        const z = new Uint8Array(16);
        for (let i = 0; i < 16; i++) {
          const nx = r[i] / 127.5 - 1;
          const ny = g[i] / 127.5 - 1;
          z[i] = (Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * 0.5 + 0.5) * 255;
        }
        writeChannel(out, w, h, bx, by, z, 2);
      });
      break;
    case FOURCC.BC7:
      forEachBlock(w, h, (bx, by, b) => decodeBc7Block(src, b * 16, out, w, h, bx, by));
      break;
    case D3DFMT.A8R8G8B8:
    case D3DFMT.X8R8G8B8:
      for (let i = 0; i < w * h; i++) {
        out[i * 4] = src[i * 4 + 2];
        out[i * 4 + 1] = src[i * 4 + 1];
        out[i * 4 + 2] = src[i * 4];
        out[i * 4 + 3] = format === D3DFMT.X8R8G8B8 ? 255 : src[i * 4 + 3];
      }
      break;
    case D3DFMT.A1R5G5B5:
      for (let i = 0; i < w * h; i++) {
        const v = src[i * 2] | (src[i * 2 + 1] << 8);
        out[i * 4] = ((v >> 10) & 31) * 8.226;
        out[i * 4 + 1] = ((v >> 5) & 31) * 8.226;
        out[i * 4 + 2] = (v & 31) * 8.226;
        out[i * 4 + 3] = v & 0x8000 ? 255 : 0;
      }
      break;
    case D3DFMT.A8:
      for (let i = 0; i < w * h; i++) {
        out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255;
        out[i * 4 + 3] = src[i];
      }
      break;
    case D3DFMT.L8:
      for (let i = 0; i < w * h; i++) out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = src[i];
      break;
    default:
      throw new Error(`Formato de textura no admitido: ${formatName(format)}`);
  }
  return out;
}
