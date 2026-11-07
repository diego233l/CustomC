import type * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { collectModFiles, findVehicles, type VehicleCandidate } from './archive.ts';
import { Resource } from './rsc.ts';
import { buildVehicle, type ConversionReport } from './vehicle.ts';
import { readTextureDictionary, type GtaTexture } from './ytd.ts';
import { readYft } from './yft.ts';

export interface ConvertedMod {
  vehicleId: string;
  glb: ArrayBuffer;
  report: ConversionReport;
  candidates: string[];
}

export async function inspectUpload(files: File[]): Promise<VehicleCandidate[]> {
  const all = await collectModFiles(files);
  const vehicles = findVehicles(all);
  if (!vehicles.length)
    throw new Error('No se ha encontrado ningún .yft de vehículo. Sube el .rar/.zip/.oiv del mod o los archivos .yft y .ytd.');
  return vehicles;
}

/** Convierte un vehículo de GTA V a GLB en el propio navegador. */
export async function convertVehicle(
  candidate: VehicleCandidate,
  all: VehicleCandidate[],
  onProgress: (msg: string) => void,
): Promise<ConvertedMod> {
  onProgress('Leyendo geometría…');
  const res = await Resource.load(candidate.yft.data);
  const drawable = readYft(res);
  const textures: GtaTexture[] = [];
  for (const [i, t] of candidate.textures.entries()) {
    onProgress(`Leyendo texturas (${i + 1}/${candidate.textures.length})…`);
    try {
      const r = await Resource.load(t.data);
      textures.push(...readTextureDictionary(r, 0));
    } catch (e) {
      console.warn('Diccionario de texturas no válido', t.name, e);
    }
  }
  onProgress('Decodificando texturas y materiales…');
  const { scene, report } = await buildVehicle(drawable, textures, { onProgress, maxTextureSize: 2048 });
  onProgress('Generando archivo GLB…');
  await new Promise((r) => setTimeout(r, 0));
  const glb = (await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, maxTextureSize: 2048 })) as ArrayBuffer;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  return { vehicleId: candidate.id, glb, report, candidates: all.map((c) => c.id) };
}
