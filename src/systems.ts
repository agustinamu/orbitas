// Carga de public/data/systems.json (generado por scripts/build-systems.mjs) y
// cálculos que dependen solo de los datos: tamaño de órbita y resonancias.

export interface PlanetData {
  name: string;
  period: number; // días
  radius: number; // radios terrestres
}

export interface SystemData {
  name: string;
  star: string;
  dist: string;
  fact: string;
  teff: number;
  planets: PlanetData[];
}

export interface SystemsFile {
  source: string;
  retrieved: string;
  systems: SystemData[];
}

export interface Planet extends PlanetData {
  color: string;
  orbit: number; // radio de órbita normalizado (0–1]
  ratio: string | null; // resonancia con el planeta anterior, «3:2»
  count: number; // órbitas completadas (para detectar el cruce de la vertical)
  flash: number; // performance.now() del último cruce
  lastNote: number; // tiempo de audio de la última nota (límite de voces)
  midi: number;
  freq: number;
}

export interface System extends Omit<SystemData, 'planets'> {
  planets: Planet[];
  pMin: number;
  pMax: number;
  baseSpeed: number; // días por segundo a velocidad ×1
  inRhythm: boolean;
  compressed: boolean; // órbitas comprimidas para caber: no están a escala
  t: number; // días simulados
  k: number; // relación órbita → nota efectiva (ver music.ts)
}

// Colores locales de los planetas (como los de mapa en flagmaps: no son paleta del portal).
const COLORS = ['#e0564a', '#3fbf8c', '#b25cc9', '#e3b14a', '#5a9be6', '#ef86b4', '#9cc94f', '#f08c42'];

// Resonancias que se marcan «≈ p:q». Con 2 % de tolerancia salen las mismas marcas
// que en el vídeo: YZ Ceti (1,5 % de 3:2) sí, Gliese 581 (2,3 % de 5:3) no.
const RATIOS: [number, number][] = [[2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [5, 3], [8, 5], [3, 1], [5, 2]];
const RATIO_TOL = 0.02;

// Distancia máxima entre la órbita exterior y la interior; por encima se comprime.
export const MAX_ORBIT_SPREAD = 7;

function prepare(d: SystemData): System {
  const periods = d.planets.map((p) => p.period);
  const pMin = Math.min(...periods);
  const pMax = Math.max(...periods);
  // Tercera ley de Kepler: a ∝ P^(2/3). En sistemas muy anchos (el Solar) se comprime
  // con un exponente para que todo quepa, igual que hace el vídeo.
  const rel = periods.map((p) => Math.pow(p, 2 / 3));
  const rMax = Math.max(...rel);
  const spread = rMax / Math.min(...rel);
  const squash = spread > MAX_ORBIT_SPREAD ? Math.log(MAX_ORBIT_SPREAD) / Math.log(spread) : 1;

  const planets = d.planets.map<Planet>((p, i) => {
    let ratio: string | null = null;
    if (i > 0) {
      const r = p.period / d.planets[i - 1].period;
      const hit = RATIOS.find(([a, b]) => Math.abs(r / (a / b) - 1) < RATIO_TOL);
      if (hit) ratio = `${hit[0]}:${hit[1]}`;
    }
    return {
      ...p,
      color: COLORS[i % COLORS.length],
      orbit: Math.pow(rel[i] / rMax, squash),
      ratio,
      count: 0,
      flash: -Infinity,
      lastNote: -Infinity,
      midi: 0,
      freq: 0,
    };
  });

  return {
    ...d,
    planets,
    pMin,
    pMax,
    // El más rápido suena cada ~0,6 s, salvo en sistemas muy anchos, donde el más
    // lento no tarda más de 2 minutos (si no, Neptuno no sonaría nunca).
    baseSpeed: Math.max(pMin / 0.6, pMax / 120),
    inRhythm: planets.slice(1).every((p) => p.ratio),
    compressed: squash < 1,
    t: 0,
    k: 1,
  };
}

export function resetSystem(s: System): void {
  s.t = 0;
  for (const p of s.planets) {
    p.count = 0;
    p.flash = -Infinity;
    p.lastNote = -Infinity;
  }
}

export async function loadSystems(): Promise<{ file: SystemsFile; systems: System[] }> {
  const res = await fetch('data/systems.json');
  if (!res.ok) throw new Error(`systems.json: HTTP ${res.status}`);
  const file = (await res.json()) as SystemsFile;
  return { file, systems: file.systems.map(prepare) };
}
