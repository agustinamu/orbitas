// De frecuencia orbital a nota, en dos pasos:
//   1. Relación: f_nota ∝ (f_orbital)^k. En semitonos respecto al planeta más rápido:
//      −k · 12 · log2(P / Pmin). Con k = 1 la relación es la real (órbita el doble de
//      rápida → una octava más aguda); con k < 1 el sistema se comprime.
//   2. Ajuste: la nota resultante se lleva a la más cercana de la escala elegida.
import type { System } from './systems';

export type ScaleId = 'penta' | 'major' | 'minor' | 'chrom' | 'free';

export const SCALES: Record<ScaleId, number[] | null> = {
  penta: [0, 2, 4, 7, 9],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  chrom: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  free: null,
};

export interface Tuning {
  kAuto: boolean;
  k: number;
  scale: ScaleId;
  top: number; // MIDI del planeta más rápido; también fija la tónica de la escala
}

// En modo Auto, distancia máxima entre el planeta más rápido y el más lento (2,5 octavas):
// los sistemas compactos usan la relación real y los anchos se comprimen hasta caber.
export const AUTO_SPAN = 30;

const NOTE_NAMES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export function noteName(m: number): string {
  const n = Math.round(m);
  return NOTE_NAMES[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
}

export function effectiveK(sys: System, t: Tuning): number {
  if (!t.kAuto) return t.k;
  const span = 12 * Math.log2(sys.pMax / sys.pMin);
  return Math.min(1, AUTO_SPAN / span);
}

function snap(m: number, steps: number[] | null, root: number): number {
  if (!steps) return m;
  let best = m;
  let bestDist = Infinity;
  for (let n = Math.floor(m) - 7; n <= Math.ceil(m) + 7; n++) {
    if (!steps.includes((((n - root) % 12) + 12) % 12)) continue;
    const d = Math.abs(n - m);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return best;
}

export function tune(systems: System[], t: Tuning): void {
  const steps = SCALES[t.scale];
  for (const sys of systems) {
    sys.k = effectiveK(sys, t);
    for (const p of sys.planets) {
      p.midi = snap(t.top - sys.k * 12 * Math.log2(p.period / sys.pMin), steps, t.top % 12);
      p.freq = mtof(p.midi);
    }
  }
}
