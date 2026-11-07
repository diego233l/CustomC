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
}

const WANTED = /\.(yft|ytd|ydr)$/i;

const baseName = (p: string) => p.split(/[\\/]/).pop()!.toLowerCase();

async function fromZip(data: Uint8Array): Promise<ModFile[]> {
  const entries = unzipSync(data, { filter: (f) => WANTED.test(f.name) || /\.(zip|oiv|rar)$/i.test(f.name) });
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
  if (lower.endsWith('.rpf')) throw new Error('Los .rpf no se admiten: extrae los .yft/.ytd con OpenIV o CodeWalker.');
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
}

/**
 * Agrupa los archivos por vehículo. Usa «nombre_hi.yft» (alto detalle) si
 * existe y combina «nombre.ytd» con «nombre+hi.ytd» (texturas en alta).
 */
export function findVehicles(files: ModFile[]): VehicleCandidate[] {
  const yfts = files.filter((f) => f.base.endsWith('.yft'));
  const ids = new Set(yfts.map((f) => f.base.replace(/\.yft$/, '').replace(/_hi$/, '')));
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
