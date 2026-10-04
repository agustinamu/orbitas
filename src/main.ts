// Orquestación: estado de la interfaz, controles, bucle de animación y recorrido.
import './style.css';
import { $, esc } from './dom';
import { loadSystems, resetSystem, type System } from './systems';
import { mtof, noteName, tune, type ScaleId, type Tuning } from './music';
import { Synth } from './audio';
import { Renderer } from './render';
import { Panel } from './panel';
import { advance } from './clock';

const TOUR_SECONDS = 24; // por sistema
const TOUR_ALL_SECONDS = 45; // final con todos a la vez
const AMP_ONE = 0.16; // nivel de cada nota con un sistema
const AMP_ALL = 0.035; // con todos sonando a la vez
const DECAY_ALL = 0.4; // colas más cortas con todos: ~150 voces a ×1 en vez de ~380
const AUDIO_LATENCY = 0.05; // s: margen para programar en el futuro del reloj de audio
// Un planeta que suena más de ~12 veces por segundo ya es un zumbido: no se programan
// más notas suyas (el tope global de voces está en audio.ts).
const MIN_NOTE_GAP = 0.08; // s entre notas del mismo planeta
const SPEED_SNAP = 0.03; // en log10: imán alrededor de ×1 en el deslizador

interface UiState {
  current: number; // sistema visible
  all: boolean; // todos a la vez
  playing: boolean;
  sound: boolean;
  tour: boolean;
  tourT: number; // s transcurridos en la etapa actual del recorrido
  mult: number; // multiplicador sobre la velocidad recomendada (baseSpeed) de cada sistema
  volume: number;
  ambient: boolean;
}

const state: UiState = { current: 0, all: false, playing: true, sound: false, tour: false, tourT: 0, mult: 1, volume: 0.7, ambient: false };
const tuning: Tuning = { kAuto: true, k: 1, scale: 'penta', top: 84 };
let systems: System[] = [];
let synth: Synth | null = null; // el AudioContext solo puede nacer tras un gesto del usuario

const panel = new Panel();
const canvas = $<HTMLCanvasElement>('#canvas');
const renderer = new Renderer(canvas);
const select = $<HTMLSelectElement>('#system-select');
const tourProgress = $('#tour-progress');
const buttons = {
  sound: $('#btn-sound'),
  play: $('#btn-play'),
  tour: $('#btn-tour'),
  all: $('#btn-all'),
};

// ── Refresco de la interfaz ──────────────────────────────────────────
const currentSystem = () => systems[state.current];
const activeSystems = () => (state.all ? systems : [currentSystem()]);

function showTuning(): void {
  panel.showTuning({ sys: currentSystem(), all: state.all, mult: state.mult, tuning, volume: state.volume });
}

// La afinación cambia notas y textos del panel: se recalcula y se repinta todo junto.
function retune(): void {
  tune(systems, tuning);
  if (state.all) panel.showAll(systems);
  else panel.showSystem(currentSystem());
  showTuning();
}

function sync(): void {
  const press = (btn: HTMLElement, on: boolean) => btn.setAttribute('aria-pressed', String(on));
  press(buttons.all, state.all);
  press(buttons.tour, state.tour);
  press(buttons.play, !state.playing);
  press(buttons.sound, state.sound);
  buttons.play.textContent = state.playing ? 'Pausa' : 'Seguir';
  buttons.sound.textContent = state.sound ? 'Silenciar' : 'Activar sonido';
  canvas.classList.toggle('pick', state.all);
  select.value = String(state.current);
  retune();
}

// ── Navegación ───────────────────────────────────────────────────────
function choose(i: number, keepTour = false): void {
  state.current = (i + systems.length) % systems.length;
  state.all = false;
  state.tourT = 0;
  if (!keepTour) state.tour = false;
  resetSystem(currentSystem());
  sync();
}

function showAll(on: boolean): void {
  state.all = on;
  state.tourT = 0;
  activeSystems().forEach(resetSystem);
  sync();
}

function setSpeed(mult: number): void {
  state.mult = mult;
  showTuning();
}

function toggleSound(): void {
  synth ??= new Synth(state.volume);
  state.sound = !state.sound;
  if (state.sound) void synth.ctx.resume();
  synth.setDrone(state.sound && state.ambient, tuning.top);
  sync();
}

function bindControls(): void {
  const on = <T extends HTMLElement>(sel: string, type: string, fn: (el: T) => void) => {
    const el = $<T>(sel);
    el.addEventListener(type, () => fn(el));
  };

  on<HTMLSelectElement>('#system-select', 'change', (el) => choose(Number(el.value)));
  on('#btn-prev', 'click', () => choose(state.current - 1));
  on('#btn-next', 'click', () => choose(state.current + 1));
  on('#btn-sound', 'click', toggleSound);
  on('#btn-play', 'click', () => {
    state.playing = !state.playing;
    sync();
  });
  on('#btn-restart', 'click', () => activeSystems().forEach(resetSystem));
  on('#btn-all', 'click', () => {
    state.tour = false;
    showAll(!state.all);
  });
  on('#btn-tour', 'click', () => {
    state.tour = !state.tour;
    if (!state.tour) return sync();
    state.playing = true;
    choose(0, true);
  });

  on<HTMLInputElement>('#speed', 'input', (el) => {
    const v = Number(el.value);
    // Imán en ×1: sin él es casi imposible volver exactamente a la recomendada arrastrando.
    setSpeed(Math.abs(v) < SPEED_SNAP ? 1 : Math.pow(10, v));
  });
  on('#speed-reset', 'click', () => setSpeed(1));
  on('#speed', 'dblclick', () => setSpeed(1));

  on<HTMLInputElement>('#k', 'input', (el) => {
    tuning.k = Number(el.value);
    retune();
  });
  on<HTMLInputElement>('#k-auto', 'change', (el) => {
    tuning.kAuto = el.checked;
    // Al pasar a manual se parte del k que tenía el sistema visible: sin saltos de afinación.
    if (!tuning.kAuto) tuning.k = state.all ? 1 : currentSystem().k;
    retune();
  });
  on<HTMLSelectElement>('#scale', 'change', (el) => {
    tuning.scale = el.value as ScaleId;
    retune();
  });
  on<HTMLSelectElement>('#top', 'change', (el) => {
    tuning.top = Number(el.value);
    retune();
    if (state.sound && state.ambient) synth?.setDrone(true, tuning.top); // el fondo sigue a la tónica
  });
  on<HTMLInputElement>('#vol', 'input', (el) => {
    state.volume = Number(el.value);
    synth?.setVolume(state.volume);
    showTuning();
  });
  on<HTMLInputElement>('#ambient', 'change', (el) => {
    state.ambient = el.checked;
    if (state.sound) synth?.setDrone(state.ambient, tuning.top);
  });

  canvas.addEventListener('click', (e) => {
    if (!state.all) return;
    const r = canvas.getBoundingClientRect();
    const cell = renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
    if (cell) choose(cell.index);
  });

  document.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea')) return;
    if (e.key === ' ') {
      if (target.closest('button')) return; // el espacio ya pulsa el botón enfocado
      e.preventDefault();
      buttons.play.click();
    } else if (e.key === 'ArrowLeft') choose(state.current - 1);
    else if (e.key === 'ArrowRight') choose(state.current + 1);
  });
}

// ── Bucle ────────────────────────────────────────────────────────────
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000); // tras una pestaña oculta, no saltar de golpe
  last = now;
  if (state.playing) {
    step(dt, now);
    if (state.tour) stepTour(dt);
  }
  const stage = state.all ? TOUR_ALL_SECONDS : TOUR_SECONDS;
  tourProgress.style.transform = `scaleX(${state.tour ? Math.min(1, state.tourT / stage) : 0})`;
  renderer.draw(systems, state.current, state.all, state.mult, now);
  requestAnimationFrame(frame);
}

function step(dt: number, now: number): void {
  const audio = state.sound ? synth : null;
  const t0 = audio ? audio.now + AUDIO_LATENCY : 0;
  advance(activeSystems(), dt, state.mult, (sys, si, p, pi, frac) => {
    p.flash = now + frac * dt * 1000;
    if (!state.all) panel.flash(pi);
    if (!audio) return;
    const when = t0 + frac * dt;
    if (when - p.lastNote < MIN_NOTE_GAP) return;
    // Estéreo: con un sistema, los planetas de izquierda (rápidos) a derecha (lentos);
    // con todos, cada columna de la cuadrícula en su sitio.
    const n = sys.planets.length;
    const pan = state.all ? ((si % 6) / 5 - 0.5) * 1.2 : n > 1 ? (pi / (n - 1) - 0.5) * 0.9 : 0;
    if (audio.bell(p.freq, when, state.all ? AMP_ALL : AMP_ONE, pan, state.all ? DECAY_ALL : 1)) p.lastNote = when;
  });
}

function stepTour(dt: number): void {
  state.tourT += dt;
  if (state.tourT < (state.all ? TOUR_ALL_SECONDS : TOUR_SECONDS)) return;
  if (state.all) {
    state.tour = false;
    sync();
  } else if (state.current === systems.length - 1) showAll(true);
  else choose(state.current + 1, true);
}

// ── Arranque ─────────────────────────────────────────────────────────
function fillSelects(): void {
  // Un <optgroup> por número de planetas (los datos vienen ordenados así).
  const groups = new Map<number, string>();
  systems.forEach((s, i) => {
    const n = s.planets.length;
    groups.set(n, (groups.get(n) ?? '') + `<option value="${i}">${esc(s.name)}</option>`);
  });
  select.innerHTML = [...groups].map(([n, opts]) => `<optgroup label="${n} planetas">${opts}</optgroup>`).join('');
  select.disabled = false;

  const top = $<HTMLSelectElement>('#top');
  let opts = '';
  for (let m = 96; m >= 60; m--) opts += `<option value="${m}">${noteName(m)} · ${Math.round(mtof(m))} Hz</option>`;
  top.innerHTML = opts;
  top.value = String(tuning.top);
}

loadSystems()
  .then(({ file, systems: loaded }) => {
    systems = loaded;
    $('#data-credit').title = `${file.source}, consultado el ${file.retrieved}`;
    fillSelects();
    bindControls();
    sync();
    requestAnimationFrame(frame);
  })
  .catch((err: unknown) => {
    console.error(err);
    panel.showError();
  });
