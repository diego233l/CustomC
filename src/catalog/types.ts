/**
 * Tipos del catálogo. El catálogo se carga en tiempo de ejecución desde
 * /models/catalog.json (incluido en la imagen) y, opcionalmente, desde
 * /custom/catalog.json (carpeta montada desde Unraid). Ver README.
 */

/** Lista de selectores de material: nombre exacto o expresión regular "/patrón/i". */
export type MaterialSelector = string[];

export interface PartSelectors {
  /** Pintura de carrocería (se sustituye por el material de pintura elegido). */
  paint?: MaterialSelector;
  /** Llantas originales del modelo (se ocultan si se elige un diseño alternativo). */
  rims?: MaterialSelector;
  /** Neumáticos. */
  tires?: MaterialSelector;
  /** Cristales (lunas y techo). */
  glass?: MaterialSelector;
  /** Faros delanteros (emisivos al encender luces). */
  headlights?: MaterialSelector;
  /** Pilotos traseros (emisivos al encender luces). */
  taillights?: MaterialSelector;
  /** Pinzas de freno (color seleccionable). */
  calipers?: MaterialSelector;
  /** Cromados y metales pulidos. */
  chrome?: MaterialSelector;
  /** Plásticos negros/embellecedores. */
  trim?: MaterialSelector;
  /** Materiales que se ocultan (p. ej. matrículas del autor original). */
  hide?: MaterialSelector;
}

export interface Credits {
  title: string;
  author: string;
  authorUrl?: string;
  source: string;
  license: string;
  licenseUrl: string;
  modifications?: string;
}

export interface Variant {
  id: string;
  label: string;
  /** Ruta al GLB/GLTF relativa al catálogo que lo declara. */
  file: string;
}

export interface Generation {
  id: string;
  label: string;
  years?: string;
  /** Ruta al GLB/GLTF relativa al catálogo que lo declara. */
  file: string;
  /** Variantes alternativas del mismo archivo (p. ej. puertas abiertas). */
  variants?: Variant[];
  /** Longitud real del vehículo en metros (para escalar el modelo). */
  lengthMeters: number;
  /** Eje del archivo que apunta hacia el frontal del coche. */
  forward: '+x' | '-x' | '+z' | '-z';
  /** Ajuste fino de rotación (grados, eje vertical). */
  rotationOffsetDeg?: number;
  /** Diámetro de llanta original en pulgadas (informativo). */
  originalWheelInches?: number;
  parts: PartSelectors;
  /** Ids de pinturas compatibles (por defecto todas). */
  paints?: string[];
  /** Ids de diseños de llanta compatibles (por defecto todos). */
  wheels?: string[];
  /** El modelo no trae llantas propias: se ocultan las opciones «originales». */
  noOriginalWheels?: boolean;
  defaultPaint?: string;
  defaultWheel?: string;
  defaultWheelFinish?: string;
  credits: Credits;
  /** Si es false, se muestra como "pendiente" (sin archivo disponible). */
  available?: boolean;
  /** Nota visible en la interfaz (limitaciones del modelo). */
  note?: string;
}

export interface VehicleModel {
  id: string;
  name: string;
  generations: Generation[];
  /** Si es true (mods asignados), sus generaciones se muestran primero. */
  priority?: boolean;
}

export type PaintFinish = 'solido' | 'metalizado' | 'perlado' | 'mate';

export interface Paint {
  id: string;
  name: string;
  color: string;
  finish: PaintFinish;
  /** Color secundario para el efecto perlado (flop). */
  flopColor?: string;
  metalness?: number;
  roughness?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  flakeIntensity?: number;
}

export type WheelDesign =
  | 'original'
  | 'aero'
  | 'cinco-dobles'
  | 'multirradio'
  | 'turbina'
  | 'y-radios'
  | 'seis-radios'
  | 'malla'
  | 'estrella'
  | 'disco'
  | 'concava'
  | 'radios-finos';

export interface WheelFinish {
  id: string;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  clearcoat?: number;
  /** Color de los huecos/fondo (bitono «mecanizado»). */
  accent?: string;
}

/** Diseño de llanta. El acabado se elige aparte (lista `wheelFinishes`). */
export interface Wheel {
  id: string;
  name: string;
  design: WheelDesign;
  description?: string;
  /** Acabado por defecto del diseño. */
  defaultFinish?: string;
}

export interface Catalog {
  version: number;
  models: VehicleModel[];
  paints: Paint[];
  wheels: Wheel[];
  wheelFinishes: WheelFinish[];
  caliperColors?: { id: string; name: string; color: string }[];
}

/** Generación con la URL ya resuelta y su origen. */
export interface ResolvedGeneration extends Generation {
  url: string;
  variantUrls: Record<string, string>;
  origin: 'integrado' | 'personalizado' | 'subido';
}
