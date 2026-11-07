import type { Catalog, Generation, ResolvedGeneration, VehicleModel } from './types';

export const BUILTIN_CATALOG_URL = 'models/catalog.json';
/** Carpeta montada desde el host (volumen Docker). Puede no existir. */
export const CUSTOM_CATALOG_URL = 'custom/catalog.json';
/** Coches subidos desde la interfaz (mods de GTA V convertidos). Generado por el servidor. */
export const MODS_CATALOG_URL = 'mods/catalog.json';

export interface LoadedCatalog {
  catalog: Catalog;
  generations: Map<string, ResolvedGeneration>; // clave: `${modelId}/${generationId}`
  customLoaded: boolean;
  warnings: string[];
}

async function fetchJson(url: string): Promise<Catalog | null> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? '';
  // Algunos servidores devuelven index.html para rutas inexistentes.
  if (!type.includes('json')) return null;
  return (await res.json()) as Catalog;
}

function byId<T extends { id: string }>(base: T[], extra: T[] | undefined, merge?: (a: T, b: T) => T): T[] {
  const out = [...base];
  for (const item of extra ?? []) {
    const i = out.findIndex((x) => x.id === item.id);
    if (i === -1) out.push(item);
    else out[i] = merge ? merge(out[i], item) : item;
  }
  return out;
}

export const genKey = (modelId: string, genId: string) => `${modelId}/${genId}`;

export async function loadCatalog(): Promise<LoadedCatalog> {
  const warnings: string[] = [];
  const builtinUrl = new URL(BUILTIN_CATALOG_URL, document.baseURI).href;
  const customUrl = new URL(CUSTOM_CATALOG_URL, document.baseURI).href;

  const builtin = await fetchJson(builtinUrl);
  if (!builtin) throw new Error('No se pudo cargar el catálogo integrado (models/catalog.json).');

  const modsUrl = new URL(MODS_CATALOG_URL, document.baseURI).href;
  const [custom, mods] = await Promise.all([
    fetchJson(customUrl).catch(() => null),
    fetchJson(modsUrl).catch(() => null),
  ]);

  const generations = new Map<string, ResolvedGeneration>();
  const resolve = (m: VehicleModel, g: Generation, base: string, origin: ResolvedGeneration['origin']) => {
    const url = new URL(g.file, base).href;
    const variantUrls: Record<string, string> = {};
    for (const v of g.variants ?? []) variantUrls[v.id] = new URL(v.file, base).href;
    generations.set(genKey(m.id, g.id), { ...g, url, variantUrls, origin });
  };
  for (const m of builtin.models) for (const g of m.generations) resolve(m, g, builtinUrl, 'integrado');
  for (const m of custom?.models ?? []) for (const g of m.generations) resolve(m, g, customUrl, 'personalizado');
  for (const m of mods?.models ?? []) for (const g of m.generations) resolve(m, g, modsUrl, 'subido');

  const mergeModel = (a: VehicleModel, b: VehicleModel) => ({ ...a, ...b, generations: byId(a.generations, b.generations) });
  // Los mods asignados a un modelo (priority) van delante: pasan a ser la versión por defecto.
  const mergeMods = (a: VehicleModel, b: VehicleModel) =>
    b.priority
      ? { ...a, generations: [...b.generations, ...a.generations.filter((g) => !b.generations.some((x) => x.id === g.id))] }
      : mergeModel(a, b);
  const models = byId(byId(builtin.models, custom?.models, mergeModel), mods?.models, mergeMods);

  const catalog: Catalog = {
    version: builtin.version,
    models,
    paints: byId(builtin.paints, custom?.paints),
    wheels: byId(builtin.wheels, custom?.wheels),
    wheelFinishes: byId(builtin.wheelFinishes ?? [], custom?.wheelFinishes),
    caliperColors: byId(builtin.caliperColors ?? [], custom?.caliperColors),
  };

  for (const m of catalog.models) {
    for (const g of m.generations) {
      if (!g.paints) continue;
      for (const p of g.paints)
        if (!catalog.paints.some((x) => x.id === p)) warnings.push(`${m.name} ${g.label}: pintura desconocida "${p}"`);
    }
  }

  return { catalog, generations, customLoaded: !!custom, warnings };
}

/** Compila los selectores de material (nombre exacto o "/regex/flags"). */
export function compileSelectors(list: string[] | undefined): (name: string) => boolean {
  if (!list || list.length === 0) return () => false;
  const exact = new Set<string>();
  const regs: RegExp[] = [];
  for (const s of list) {
    const m = /^\/(.*)\/([gimsuy]*)$/.exec(s);
    if (m) regs.push(new RegExp(m[1], m[2]));
    else exact.add(s);
  }
  return (name: string) => exact.has(name) || regs.some((r) => r.test(name));
}
