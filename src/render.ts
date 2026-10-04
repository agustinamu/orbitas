// Dibujo en canvas: estrella, órbitas, planetas con estela y la vertical donde suenan.
import type { System } from './systems';

export interface Cell {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

const TAU = Math.PI * 2;
// Duración del destello tras cruzar la vertical (constante de tiempo, s).
const FLASH_TAU = 0.35;
const TRAIL_ALPHA = 0.85;

const BG_STARS = Array.from({ length: 260 }, () => ({
  x: Math.random(),
  y: Math.random(),
  size: Math.random() * 0.9 + 0.2,
  phase: Math.random() * Math.PI * 2,
}));

function starRgb(teff: number): string {
  if (teff < 3300) return '255,140,100';
  if (teff < 4200) return '255,180,120';
  if (teff < 5300) return '255,214,160';
  if (teff < 6000) return '255,244,220';
  return '230,238,255';
}

const rgbCache = new Map<string, string>();
function rgba(hex: string, a: number): string {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
    rgbCache.set(hex, rgb);
  }
  return `rgba(${rgb},${a.toFixed(3)})`;
}

export class Renderer {
  private g: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  cells: Cell[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas 2D no disponible');
    this.g = g;
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = r.width;
    this.h = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
  }

  cellAt(x: number, y: number): Cell | undefined {
    return this.cells.find((c) => x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
  }

  draw(systems: System[], current: number, all: boolean, mult: number, now: number): void {
    const { g, w, h } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    for (const s of BG_STARS) {
      const tw = this.reduceMotion ? 0.6 : 0.45 + 0.35 * Math.sin(now / 1400 + s.phase);
      g.fillStyle = `rgba(236,229,211,${(0.3 * s.size * tw).toFixed(3)})`;
      g.fillRect(s.x * w, s.y * h, s.size, s.size);
    }

    this.cells = [];
    if (!all) {
      const R = (Math.min(w, h) / 2) * 0.9;
      this.system(systems[current], w / 2, h / 2 + R * 0.03, R, mult, now, false);
      return;
    }
    // Cuadrícula con tantas columnas como pida la proporción del lienzo.
    const n = systems.length;
    const cols = Math.max(3, Math.round(Math.sqrt((n * w) / Math.max(1, h))));
    const rows = Math.ceil(n / cols);
    const cw = w / cols;
    const ch = h / rows;
    const R = Math.min(cw, ch) * 0.36;
    g.font = `500 ${Math.max(10, Math.min(12, cw / 11))}px 'IBM Plex Mono', monospace`;
    g.textAlign = 'center';
    systems.forEach((sys, i) => {
      const x0 = (i % cols) * cw;
      const y0 = Math.floor(i / cols) * ch;
      this.cells.push({ index: i, x: x0, y: y0, w: cw, h: ch });
      const cx = x0 + cw / 2;
      const cy = y0 + ch * 0.45;
      this.system(sys, cx, cy, R, mult, now, true);
      g.fillStyle = 'rgba(154,147,127,0.95)'; // --paper-dim
      g.fillText(sys.name, cx, cy + R + Math.min(16, ch * 0.12));
    });
  }

  private system(sys: System, cx: number, cy: number, R: number, mult: number, now: number, mini: boolean): void {
    const g = this.g;

    // Vertical: cada planeta suena al cruzarla.
    g.strokeStyle = 'rgba(236,229,211,0.25)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx, cy - R * 1.04);
    g.stroke();

    const rgb = starRgb(sys.teff);
    const sr = Math.max(2, R * (mini ? 0.045 : 0.03));
    const glow = g.createRadialGradient(cx, cy, 0, cx, cy, sr * 5);
    glow.addColorStop(0, `rgba(${rgb},0.9)`);
    glow.addColorStop(0.25, `rgba(${rgb},0.25)`);
    glow.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = glow;
    g.beginPath();
    g.arc(cx, cy, sr * 5, 0, TAU);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(cx, cy, sr, 0, TAU);
    g.fill();

    for (const p of sys.planets) {
      // Proporcional al semieje real: a escala dentro del sistema salvo si está comprimido.
      const r = R * p.orbit;
      // Antihorario desde las 12, como en el vídeo (en canvas el eje y va hacia abajo).
      const th = -Math.PI / 2 - ((sys.t / p.period) % 1) * TAU;
      const hot = Math.exp(-Math.max(0, now - p.flash) / 1000 / FLASH_TAU);

      g.strokeStyle = rgba(p.color, 0.13 + 0.45 * hot);
      g.lineWidth = 1 + hot * 1.5;
      g.beginPath();
      g.arc(cx, cy, r, 0, TAU);
      g.stroke();

      // Estela: medio segundo de recorrido, entre 0,25 rad y ~100°; crece al arrancar.
      // Un solo trazo con degradado cónico centrado en la estrella (antes, N trazos
      // de opacidad decreciente: ~1.100 arcos por fotograma con los 30 sistemas).
      const turnsPerSec = (sys.baseSpeed * mult) / p.period;
      const trail = Math.min(Math.PI * 0.55, Math.max(0.25, turnsPerSec * Math.PI)) * Math.min(1, (sys.t / p.period) * 4);
      const fade = g.createConicGradient(th, cx, cy);
      fade.addColorStop(0, rgba(p.color, TRAIL_ALPHA));
      fade.addColorStop(trail / TAU, rgba(p.color, 0));
      g.strokeStyle = fade;
      g.lineCap = 'butt';
      g.lineWidth = mini ? 1.5 : Math.max(2, R * 0.009);
      g.beginPath();
      g.arc(cx, cy, r, th, th + trail);
      g.stroke();

      const x = cx + r * Math.cos(th);
      const y = cy + r * Math.sin(th);
      const size = mini
        ? Math.max(1.6, 1 + Math.sqrt(p.radius) * 0.8)
        : Math.max(3, Math.min(10, 2 + 1.7 * Math.sqrt(p.radius))) * Math.max(0.7, R / 320);
      if (hot > 0.02) {
        const halo = g.createRadialGradient(x, y, 0, x, y, size * 6);
        halo.addColorStop(0, rgba(p.color, 0.7 * hot));
        halo.addColorStop(1, rgba(p.color, 0));
        g.fillStyle = halo;
        g.beginPath();
        g.arc(x, y, size * 6, 0, TAU);
        g.fill();
      }
      g.fillStyle = p.color;
      g.shadowColor = p.color;
      g.shadowBlur = mini ? 0 : 10;
      g.beginPath();
      g.arc(x, y, size * (1 + 0.5 * hot), 0, TAU);
      g.fill();
      g.shadowBlur = 0;
    }
  }
}
