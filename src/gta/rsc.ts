import { inflateSync } from 'fflate';

/**
 * Lector de recursos RAGE «RSC7» (GTA V para PC, formato gen8).
 * El archivo es una cabecera de 16 bytes seguida de datos comprimidos con
 * deflate sin cabecera. Una vez descomprimidos, las páginas «de sistema»
 * (punteros 0x5XXXXXXX) van seguidas de las páginas «gráficas» (0x6XXXXXXX).
 */

export class RscError extends Error {}

export function sizeFromFlags(flags: number): number {
  const s =
    (((flags >>> 27) & 0x1) << 0) +
    (((flags >>> 26) & 0x1) << 1) +
    (((flags >>> 25) & 0x1) << 2) +
    (((flags >>> 24) & 0x1) << 3) +
    (((flags >>> 17) & 0x7f) << 4) +
    (((flags >>> 11) & 0x3f) << 5) +
    (((flags >>> 7) & 0xf) << 6) +
    (((flags >>> 5) & 0x3) << 7) +
    (((flags >>> 4) & 0x1) << 8);
  return (0x200 << (flags & 0xf)) * s;
}

export interface RscHeader {
  version: number;
  systemFlags: number;
  graphicsFlags: number;
}

export function readHeader(buf: Uint8Array): RscHeader {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 16 || dv.getUint32(0, true) !== 0x37435352)
    throw new RscError('No es un recurso RSC7 de GTA V para PC (¿formato de la edición Enhanced o archivo cifrado?).');
  return { version: dv.getUint32(4, true), systemFlags: dv.getUint32(8, true), graphicsFlags: dv.getUint32(12, true) };
}

/**
 * Descomprime deflate sin cabecera. Se usa fflate (y no DecompressionStream)
 * porque muchos archivos tienen bytes de relleno tras el final del flujo, que
 * el descompresor nativo del navegador rechaza.
 */
export function inflateRaw(data: Uint8Array, expectedSize: number): Uint8Array {
  const out = inflateSync(data, expectedSize > 0 ? { out: new Uint8Array(expectedSize) } : undefined);
  return out;
}

export class Resource {
  readonly dv: DataView;
  readonly bytes: Uint8Array;
  readonly sysSize: number;
  readonly header: RscHeader;
  constructor(data: Uint8Array, header: RscHeader) {
    this.header = header;
    this.bytes = data;
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.sysSize = sizeFromFlags(header.systemFlags);
  }

  static async load(file: Uint8Array): Promise<Resource> {
    const header = readHeader(file);
    const expected = sizeFromFlags(header.systemFlags) + sizeFromFlags(header.graphicsFlags);
    let data = inflateRaw(file.subarray(16), expected);
    if (data.length < expected) {
      const full = new Uint8Array(expected);
      full.set(data);
      data = full;
    }
    return new Resource(data, header);
  }

  /** Convierte un puntero virtual/físico en desplazamiento dentro del buffer. */
  off(ptr: number | bigint): number {
    const p = typeof ptr === 'bigint' ? Number(ptr & 0xffffffffn) : ptr >>> 0;
    if (p === 0) return -1;
    const kind = p >>> 28;
    const o = p & 0x0fffffff;
    if (kind === 5) return o;
    if (kind === 6) return this.sysSize + o;
    throw new RscError(`Puntero no válido 0x${p.toString(16)}`);
  }

  u8 = (o: number) => this.dv.getUint8(o);
  u16 = (o: number) => this.dv.getUint16(o, true);
  i16 = (o: number) => this.dv.getInt16(o, true);
  u32 = (o: number) => this.dv.getUint32(o, true);
  f32 = (o: number) => this.dv.getFloat32(o, true);
  /** Puntero de 64 bits ya resuelto a desplazamiento (−1 si es nulo). */
  ptr = (o: number) => {
    const hi = this.dv.getUint32(o + 4, true);
    const lo = this.dv.getUint32(o, true);
    if (lo === 0 && hi === 0) return -1;
    return this.off(lo);
  };

  str(o: number): string {
    if (o < 0) return '';
    let end = o;
    while (end < this.bytes.length && this.bytes[end] !== 0) end++;
    return new TextDecoder().decode(this.bytes.subarray(o, end));
  }

  /** Lista de punteros de 64 bits (ResourcePointerList64 / array). */
  ptrArray(o: number, count: number): number[] {
    const out: number[] = [];
    if (o < 0) return out;
    for (let i = 0; i < count; i++) out.push(this.ptr(o + i * 8));
    return out;
  }
}

/** Hash «Jenkins one-at-a-time» usado por RAGE para nombres. */
export function joaat(text: string): number {
  let h = 0;
  const s = text.toLowerCase();
  for (let i = 0; i < s.length; i++) {
    h = (h + s.charCodeAt(i)) >>> 0;
    h = (h + (h << 10)) >>> 0;
    h = (h ^ (h >>> 6)) >>> 0;
  }
  h = (h + (h << 3)) >>> 0;
  h = (h ^ (h >>> 11)) >>> 0;
  h = (h + (h << 15)) >>> 0;
  return h >>> 0;
}
