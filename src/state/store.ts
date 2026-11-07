import { create } from 'zustand';
import { loadCatalog, type LoadedCatalog } from '../catalog/loadCatalog';

export type Quality = 'alta' | 'media' | 'baja';

export interface Configuration {
  modelId: string;
  generationId: string;
  variantId: string | null;
  paintId: string;
  wheelId: string;
  /** Acabado de la llanta ('original' conserva el material del modelo). */
  wheelFinishId: string;
  /** Pulgadas de llanta añadidas (+) o quitadas (−) respecto al original. */
  rimDelta: number;
  /** Altura de la suspensión en centímetros (negativo = rebajado). */
  rideHeight: number;
  caliperId: string | null;
  glassTint: number; // 0 (claro) – 1 (muy oscuro)
  environmentId: string;
  lightsOn: boolean;
}

export interface SavedConfiguration {
  id: string;
  name: string;
  createdAt: string;
  config: Configuration;
  thumbnail?: string;
}

export type CameraViewId =
  | 'tres-cuartos-delantero'
  | 'frontal'
  | 'lateral'
  | 'tres-cuartos-trasero'
  | 'trasera'
  | 'superior'
  | 'llanta';

interface State {
  loaded: LoadedCatalog | null;
  config: Configuration;
  view: CameraViewId;
  viewNonce: number;
  autoRotate: boolean;
  quality: Quality;
  loadingModel: boolean;
  loadError: string | null;
  inspector: boolean;
  highlightMaterial: string | null;
  materialNames: string[];
  /** URL del último modelo ya preparado y añadido a la escena. */
  carReady: string | null;
  saved: SavedConfiguration[];
  setLoaded: (l: LoadedCatalog) => void;
  /** Vuelve a cargar el catálogo (p. ej. tras subir un coche) conservando la selección. */
  reloadCatalog: (select?: Partial<Configuration>) => Promise<void>;
  update: (patch: Partial<Configuration>) => void;
  setView: (v: CameraViewId) => void;
  set: (patch: Partial<Omit<State, 'config'>>) => void;
  saveCurrent: (name: string, thumbnail?: string) => void;
  removeSaved: (id: string) => void;
  applySaved: (id: string) => void;
}

const SAVED_KEY = 'configurador-tesla.guardadas.v1';
const LAST_KEY = 'configurador-tesla.ultima.v1';
const PREFS_KEY = 'configurador-tesla.preferencias.v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

function defaultQuality(): Quality {
  const mobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return mobile ? 'media' : 'alta';
}

const emptyConfig: Configuration = {
  modelId: '',
  generationId: '',
  variantId: null,
  paintId: '',
  wheelId: 'original',
  wheelFinishId: 'original',
  rimDelta: 0,
  rideHeight: 0,
  caliperId: null,
  glassTint: 0.55,
  environmentId: 'estudio',
  lightsOn: false,
};

/** Completa/corrige una configuración contra el catálogo cargado. */
export function sanitize(c: Partial<Configuration>, loaded: LoadedCatalog): Configuration {
  const base = sanitizeBase(c, loaded);
  const wheel = loaded.catalog.wheels.find((w) => w.id === base.wheelId);
  const finishes = loaded.catalog.wheelFinishes.filter((f) => f.id !== 'original' || wheel?.design === 'original');
  const finish =
    c.wheelFinishId && finishes.some((f) => f.id === c.wheelFinishId)
      ? c.wheelFinishId
      : finishes.some((f) => f.id === wheel?.defaultFinish)
        ? wheel!.defaultFinish!
        : (finishes[0]?.id ?? 'original');
  return { ...base, wheelFinishId: finish };
}

function sanitizeBase(c: Partial<Configuration>, loaded: LoadedCatalog): Configuration {
  const { catalog, generations } = loaded;
  const available = catalog.models.filter((m) => m.generations.some((g) => g.available !== false));
  // Garaje vacío: no hay coche seleccionado, pero se conservan entorno y preferencias.
  if (!available.length)
    return {
      ...emptyConfig,
      ...c,
      modelId: '',
      generationId: '',
      variantId: null,
      paintId: c.paintId && catalog.paints.some((p) => p.id === c.paintId) ? c.paintId : (catalog.paints[0]?.id ?? ''),
      wheelId: 'original',
      wheelFinishId: '',
      rimDelta: Math.round(Math.min(4, Math.max(-3, Number(c.rimDelta) || 0))),
      rideHeight: Math.min(5, Math.max(-8, Number(c.rideHeight) || 0)),
      caliperId: null,
      glassTint: typeof c.glassTint === 'number' ? Math.min(1, Math.max(0, c.glassTint)) : emptyConfig.glassTint,
    };
  const model = catalog.models.find((m) => m.id === c.modelId && m.generations.some((g) => g.available !== false)) ?? available[0];
  const gens = model.generations.filter((g) => g.available !== false);
  const gen = gens.find((g) => g.id === c.generationId) ?? gens[0];
  const resolved = generations.get(`${model.id}/${gen.id}`);
  const paints = gen.paints ?? catalog.paints.map((p) => p.id);
  const wheels = (gen.wheels ?? catalog.wheels.map((w) => w.id)).filter(
    (id) => !(gen.noOriginalWheels && catalog.wheels.find((w) => w.id === id)?.design === 'original'),
  );
  const variantId = c.variantId && resolved?.variantUrls[c.variantId] ? c.variantId : null;
  return {
    ...emptyConfig,
    ...c,
    modelId: model.id,
    generationId: gen.id,
    variantId,
    paintId: c.paintId && paints.includes(c.paintId) ? c.paintId : (gen.defaultPaint ?? paints[0]),
    wheelId: c.wheelId && wheels.includes(c.wheelId) ? c.wheelId : wheels.includes(gen.defaultWheel ?? '') ? gen.defaultWheel! : wheels[0],
    wheelFinishId: '',
    rimDelta: Math.round(Math.min(4, Math.max(-3, Number(c.rimDelta) || 0))),
    rideHeight: Math.min(5, Math.max(-8, Number(c.rideHeight) || 0)),
    caliperId: c.caliperId && catalog.caliperColors?.some((x) => x.id === c.caliperId) ? c.caliperId : null,
    glassTint: typeof c.glassTint === 'number' ? Math.min(1, Math.max(0, c.glassTint)) : emptyConfig.glassTint,
  };
}

const prefs = readJson<{ quality?: Quality; autoRotate?: boolean }>(PREFS_KEY, {});

export const useStore = create<State>((set, get) => ({
  loaded: null,
  config: emptyConfig,
  view: 'tres-cuartos-delantero',
  viewNonce: 0,
  autoRotate: prefs.autoRotate ?? false,
  quality: prefs.quality ?? defaultQuality(),
  loadingModel: false,
  loadError: null,
  inspector: false,
  highlightMaterial: null,
  materialNames: [],
  carReady: null,
  saved: readJson<SavedConfiguration[]>(SAVED_KEY, []),

  setLoaded: (loaded) => {
    const fromHash = decodeHash(window.location.hash);
    const last = readJson<Partial<Configuration>>(LAST_KEY, {});
    const config = sanitize({ ...last, ...fromHash }, loaded);
    set({ loaded, config });
    history.replaceState(null, '', encodeHash(config));
  },
  reloadCatalog: async (select) => {
    const loaded = await loadCatalog();
    const config = sanitize({ ...get().config, ...select }, loaded);
    set({ loaded, config });
    writeJson(LAST_KEY, config);
    history.replaceState(null, '', encodeHash(config));
  },
  update: (patch) => {
    const { loaded, config } = get();
    if (!loaded) return;
    const next = { ...config, ...patch };
    // Al cambiar de modelo o generación, se reajustan pintura/llantas compatibles.
    if (patch.modelId && patch.modelId !== config.modelId) {
      next.generationId = '';
      next.variantId = null;
    }
    if (patch.generationId && patch.generationId !== config.generationId) next.variantId = null;
    if (patch.wheelId && patch.wheelId !== config.wheelId && !patch.wheelFinishId) {
      const prevDesign = loaded.catalog.wheels.find((w) => w.id === config.wheelId)?.design;
      const nextWheel = loaded.catalog.wheels.find((w) => w.id === patch.wheelId);
      // Se conserva el acabado elegido salvo al pasar de/a las llantas originales.
      if (prevDesign === 'original' || nextWheel?.design === 'original') next.wheelFinishId = '';
    }
    const clean = sanitize(next, loaded);
    set({ config: clean });
    writeJson(LAST_KEY, clean);
    history.replaceState(null, '', encodeHash(clean));
  },
  setView: (view) => set((s) => ({ view, viewNonce: s.viewNonce + 1 })),
  set: (patch) => {
    set(patch as Partial<State>);
    if ('quality' in patch || 'autoRotate' in patch) {
      const { quality, autoRotate } = get();
      writeJson(PREFS_KEY, { quality, autoRotate });
    }
  },
  saveCurrent: (name, thumbnail) => {
    const entry: SavedConfiguration = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      name,
      createdAt: new Date().toISOString(),
      config: get().config,
      thumbnail,
    };
    const saved = [entry, ...get().saved].slice(0, 30);
    set({ saved });
    writeJson(SAVED_KEY, saved);
  },
  removeSaved: (id) => {
    const saved = get().saved.filter((s) => s.id !== id);
    set({ saved });
    writeJson(SAVED_KEY, saved);
  },
  applySaved: (id) => {
    const s = get().saved.find((x) => x.id === id);
    if (s) get().update(s.config);
  },
}));

const HASH_KEYS: Record<string, keyof Configuration> = {
  m: 'modelId',
  g: 'generationId',
  v: 'variantId',
  p: 'paintId',
  w: 'wheelId',
  f: 'wheelFinishId',
  d: 'rimDelta',
  h: 'rideHeight',
  c: 'caliperId',
  t: 'glassTint',
  e: 'environmentId',
  l: 'lightsOn',
};

export function encodeHash(c: Configuration): string {
  const params = new URLSearchParams();
  for (const [k, key] of Object.entries(HASH_KEYS)) {
    const v = c[key];
    if (v === null || v === '' || v === undefined) continue;
    params.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  return `#${params.toString()}`;
}

function decodeHash(hash: string): Partial<Configuration> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const out: Record<string, unknown> = {};
  for (const [k, key] of Object.entries(HASH_KEYS)) {
    const v = params.get(k);
    if (v === null) continue;
    if (key === 'glassTint' || key === 'rimDelta' || key === 'rideHeight') out[key] = Number(v);
    else if (key === 'lightsOn') out[key] = v === '1';
    else out[key] = v;
  }
  return out as Partial<Configuration>;
}
