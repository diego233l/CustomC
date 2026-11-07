import { Resource } from './rsc.ts';
import { decodeToRgba, formatName, isSupported, levelSize } from './texdecode.ts';

export interface GtaTexture {
  name: string;
  width: number;
  height: number;
  format: number;
  formatName: string;
  levels: number;
  /** Datos de todos los niveles de mip, consecutivos. */
  data: Uint8Array;
}

/** Lee un diccionario de texturas (raíz de un .ytd o incrustado en un drawable). */
export function readTextureDictionary(r: Resource, at: number): GtaTexture[] {
  const out: GtaTexture[] = [];
  if (at < 0) return out;
  const list = r.ptr(at + 0x30);
  const count = r.u16(at + 0x38);
  for (const t of r.ptrArray(list, count)) {
    if (t < 0) continue;
    const width = r.u16(t + 0x50);
    const height = r.u16(t + 0x52);
    const format = r.u32(t + 0x58);
    const levels = Math.max(1, r.u8(t + 0x5d));
    const dataAt = r.ptr(t + 0x70);
    if (dataAt < 0 || !isSupported(format)) {
      out.push({ name: r.str(r.ptr(t + 0x28)), width, height, format, formatName: formatName(format), levels: 0, data: new Uint8Array() });
      continue;
    }
    let total = 0;
    for (let l = 0, w = width, h = height; l < levels; l++, w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) total += levelSize(format, w, h);
    const end = Math.min(r.bytes.length, dataAt + total);
    out.push({ name: r.str(r.ptr(t + 0x28)), width, height, format, formatName: formatName(format), levels, data: r.bytes.subarray(dataAt, end) });
  }
  return out;
}

/**
 * Devuelve el primer nivel de mip cuyo lado mayor no supere `maxSize`,
 * decodificado a RGBA.
 */
export function decodeTexture(t: GtaTexture, maxSize = 2048): { width: number; height: number; rgba: Uint8ClampedArray } | null {
  if (!t.levels || !isSupported(t.format)) return null;
  let off = 0;
  let w = t.width;
  let h = t.height;
  for (let l = 0; l < t.levels; l++) {
    const size = levelSize(t.format, w, h);
    if (Math.max(w, h) <= maxSize || l === t.levels - 1) {
      if (off + size > t.data.length) return null;
      return { width: w, height: h, rgba: decodeToRgba(t.format, w, h, t.data.subarray(off, off + size)) };
    }
    off += size;
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
  }
  return null;
}
