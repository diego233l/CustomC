/**
 * Extrae los archivos relevantes (.yft, .ytd, .ydr) de lo que suba el
 * usuario: archivos sueltos, .zip, .oiv (paquete de OpenIV, que es un zip)
 * o .rar. Los .rpf cifrados y los .7z no se admiten.
 */
import { unzipSync } from 'fflate';

export interface ModFile {
  name: string; // ruta dentro del archivo
  base: string; // nombre sin carpeta, en minúsculas
  data: Uint8Array;
  /** Recurso ya descomprimido (cuando procede de un .rpf). */
  resource?: import('./rsc.ts').Resource;
}

const WANTED = /\.(yft|ytd|ydr)$/i;

/**
 * Extrae los recursos RSC7 de un .rpf sin descifrar su índice: en los
 * paquetes de mods, el índice de archivos va cifrado (NG), pero los recursos
 * (.yft/.ytd) se guardan sin cifrar y comienzan por la cabecera «RSC7», así
 * que se localizan directamente. Los nombres se reconstruyen a partir del
 * propio contenido (el .yft guarda su nombre).
 */
async function fromRpf(name: string, data: Uint8Array): Promise<ModFile[]> {
  const { Resource } = await import('./rsc.ts');
  const out: ModFile[] = [];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let ytdIndex = 0;
  for (let o = 0; o + 16 < data.length; o += 16) {
    if (dv.getUint32(o, true) !== 0x37435352) continue;
    const version = dv.getUint32(o + 4, true);
    if (version !== 162 && version !== 13 && version !== 165) continue;
    try {
      const r = await Resource.load(data.subarray(o));
      const raw = data.subarray(o); // el inflado se detiene al final del flujo
      if (version === 162) {
        const resName = r.str(r.ptr(0x58)).replace(/^pack:\//, '').toLowerCase() || `rpf_${o.toString(16)}`;
        out.push({ name: `${name}/${resName}.yft`, base: `${resName}.yft`, data: raw, resource: r });
      } else if (version === 13) {
        out.push({ name: `${name}/textures_${ytdIndex}.ytd`, base: `rpf_textures_${ytdIndex++}.ytd`, data: raw, resource: r });
      }
    } catch {
      /* falso positivo: no es un recurso válido */
    }
  }
  if (!out.length) throw new Error('No se han encontrado modelos dentro del .rpf (puede que esté cifrado por completo).');
  return out;
}

const baseName = (p: string) => p.split(/[\\/]/).pop()!.toLowerCase();

async function fromZip(data: Uint8Array): Promise<ModFile[]> {
  const entries = unzipSync(data, { filter: (f) => WANTED.test(f.name) || /\.(zip|oiv|rar|rpf)$/i.test(f.name) });
  const out: ModFile[] = [];
  for (const [name, bytes] of Object.entries(entries)) out.push(...(await expand(name, bytes)));
  return out;
}

async function fromRar(data: Uint8Array): Promise<ModFile[]> {
  const worker = new Worker(new URL('./rarWorker.ts', import.meta.url), { type: 'module', name: 'rarWorker' });
  try {
    const result = await new Promise<{ files?: { name: string; data: Uint8Array }[]; error?: string }>((resolveP, reject) => {
      worker.onmessage = (e) => resolveP(e.data);
      worker.onerror = (e) => reject(new Error(e.message || 'Error al abrir el .rar'));
      const copy = data.slice().buffer;
      worker.postMessage(copy, [copy]);
    });
    if (result.error) throw new Error(result.error);
    const out: ModFile[] = [];
    for (const f of result.files ?? []) out.push(...(await expand(f.name, f.data)));
    return out;
  } finally {
    worker.terminate();
  }
}

async function expand(name: string, data: Uint8Array): Promise<ModFile[]> {
  const lower = name.toLowerCase();
  if (lower.endsWith('.zip') || lower.endsWith('.oiv')) return fromZip(data);
  if (lower.endsWith('.rar')) return fromRar(data);
  if (WANTED.test(lower)) return [{ name, base: baseName(name), data }];
  if (lower.endsWith('.7z')) throw new Error('Los archivos .7z no se admiten: descomprímelo y sube los .yft/.ytd o un .zip.');
  if (lower.endsWith('.rpf')) return fromRpf(name, data);
  return [];
}

export async function collectModFiles(files: File[]): Promise<ModFile[]> {
  const out: ModFile[] = [];
  for (const f of files) out.push(...(await expand(f.name, new Uint8Array(await f.arrayBuffer()))));
  return out;
}

export interface VehicleCandidate {
  /** Nombre del modelo (p. ej. «untesla»). */
  id: string;
  yft: ModFile;
  textures: ModFile[];
  /** Triángulos del modelo de alto detalle (se rellena al analizar). */
  triangles?: number;
}

/**
 * Agrupa los archivos por vehículo. Usa «nombre_hi.yft» (alto detalle) si
 * existe y combina «nombre.ytd» con «nombre+hi.ytd» (texturas en alta).
 */
export function findVehicles(files: ModFile[]): VehicleCandidate[] {
  const yfts = files.filter((f) => f.base.endsWith('.yft'));
  const all = new Set(yfts.map((f) => f.base.replace(/\.yft$/, '').replace(/_hi$/, '')));
  // «modelx_bumf_1a», «modelx_wing_2»… son piezas de tuneo de «modelx», no vehículos.
  const ids = new Set([...all].filter((id) => ![...all].some((other) => other !== id && id.startsWith(`${other}_`))));
  const result: VehicleCandidate[] = [];
  for (const id of ids) {
    // No se tratan como vehículo las piezas de tuneo sueltas (p. ej. «untesla_wing_1»).
    const yft = yfts.find((f) => f.base === `${id}_hi.yft`) ?? yfts.find((f) => f.base === `${id}.yft`);
    if (!yft) continue;
    // Prioridad: «nombre+hi.ytd», «nombre.ytd» y, después, cualquier otro .ytd del paquete.
    const rank = (f: ModFile) => (f.base === `${id}+hi.ytd` ? 0 : f.base === `${id}.ytd` ? 1 : 2);
    const textures = files.filter((f) => f.base.endsWith('.ytd')).sort((a, b) => rank(a) - rank(b));
    result.push({ id, yft, textures });
  }
  // Primero los que tienen texturas propias; las piezas sueltas suelen no tenerlas.
  result.sort((a, b) => a.id.length - b.id.length);
  return result;
}
