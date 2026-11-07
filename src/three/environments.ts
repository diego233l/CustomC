/**
 * Entornos visuales. Todos los HDRI proceden de Poly Haven (CC0) y se sirven
 * localmente desde /hdri (sin dependencias de Internet en la red local).
 */
export interface EnvironmentPreset {
  id: string;
  name: string;
  description: string;
  /** HDRI usado para iluminación y reflejos. */
  file: string;
  /** HDRI de mayor resolución para el fondo (opcional). */
  backgroundFile?: string;
  /** Proyección del HDRI sobre un suelo (para escenas exteriores). */
  ground?: { height: number; radius: number };
  /** Si no hay proyección, color de fondo del estudio. */
  studio?: { background: string; floor: string };
  /** Dirección hacia el sol/luz principal (calculada a partir del HDRI). */
  sunDirection: [number, number, number];
  sunIntensity: number;
  sunColor?: string;
  environmentIntensity: number;
  /** Rotación del HDRI (radianes, eje Y) para encuadrar el fondo. */
  rotationY: number;
  exposure: number;
  backgroundBlur?: number;
  shadowOpacity: number;
  /** Calzada de asfalto generada sobre el suelo proyectado. */
  road?: boolean;
  /** Encender luces automáticamente en este entorno. */
  night?: boolean;
  credit: string;
}

export const ENVIRONMENTS: EnvironmentPreset[] = [
  {
    id: 'estudio',
    name: 'Estudio',
    description: 'Plató con softboxes y suelo pulido',
    file: 'hdri/studio_small_03_1k.hdr',
    studio: { background: '#1d1f22', floor: '#26282b' },
    sunDirection: [-0.114, 0.664, -0.739],
    sunIntensity: 1.6,
    environmentIntensity: 1.0,
    rotationY: 0,
    exposure: 1.0,
    shadowOpacity: 0.85,
    credit: 'Studio Small 03 — Sergej Majboroda, Poly Haven (CC0)',
  },
  {
    id: 'estudio-blanco',
    name: 'Estudio claro',
    description: 'Ciclorama blanco de fotografía de producto',
    file: 'hdri/studio_small_03_1k.hdr',
    studio: { background: '#cfd2d6', floor: '#c4c7cb' },
    sunDirection: [-0.114, 0.664, -0.739],
    sunIntensity: 1.3,
    environmentIntensity: 1.15,
    rotationY: 0,
    exposure: 0.95,
    shadowOpacity: 0.55,
    credit: 'Studio Small 03 — Sergej Majboroda, Poly Haven (CC0)',
  },
  {
    id: 'ciudad',
    name: 'Ciudad',
    description: 'Plaza urbana con edificios y cielo nublado',
    file: 'hdri/potsdamer_platz_1k.hdr',
    ground: { height: 1.7, radius: 60 },
    sunDirection: [0.561, 0.459, -0.689],
    sunIntensity: 1.2,
    environmentIntensity: 1.0,
    rotationY: 0,
    exposure: 1.0,
    backgroundBlur: 0,
    shadowOpacity: 0.7,
    credit: 'Potsdamer Platz — Greg Zaal, Poly Haven (CC0)',
  },
  {
    id: 'carretera',
    name: 'Carretera',
    description: 'Carretera comarcal al amanecer',
    file: 'hdri/spruit_sunrise_1k.hdr',
    backgroundFile: 'hdri/spruit_sunrise_4k.hdr.jpg',
    ground: { height: 1.6, radius: 120 },
    road: true,
    sunDirection: [0.803, 0.139, 0.579],
    sunIntensity: 2.4,
    sunColor: '#ffd2a1',
    environmentIntensity: 1.0,
    rotationY: 0,
    exposure: 0.9,
    shadowOpacity: 0.8,
    credit: 'Spruit Sunrise — Greg Zaal, Poly Haven (CC0); asfalto generado por la aplicación',
  },
  {
    id: 'amanecer',
    name: 'Campo al amanecer',
    description: 'Luz rasante y cálida en campo abierto',
    file: 'hdri/spruit_sunrise_1k.hdr',
    backgroundFile: 'hdri/spruit_sunrise_4k.hdr.jpg',
    ground: { height: 1.6, radius: 120 },
    sunDirection: [0.803, 0.139, 0.579],
    sunIntensity: 2.4,
    sunColor: '#ffd2a1',
    environmentIntensity: 1.0,
    rotationY: 0,
    exposure: 0.9,
    shadowOpacity: 0.8,
    credit: 'Spruit Sunrise — Greg Zaal, Poly Haven (CC0)',
  },
  {
    id: 'noche',
    name: 'Noche',
    description: 'Exterior nocturno con luces encendidas',
    file: 'hdri/dikhololo_night_1k.hdr',
    ground: { height: 1.6, radius: 60 },
    sunDirection: [-0.145, 0.45, -0.88],
    sunIntensity: 0.25,
    sunColor: '#b9c8ff',
    environmentIntensity: 1.4,
    rotationY: 0,
    exposure: 1.35,
    shadowOpacity: 0.6,
    night: true,
    credit: 'Dikhololo Night — Poly Haven (CC0)',
  },
];

export const getEnvironment = (id: string) => ENVIRONMENTS.find((e) => e.id === id) ?? ENVIRONMENTS[0];
