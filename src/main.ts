import './style.css';
import { loadSystems, resetSystem, type System } from './systems';
import { AUTO_SPAN, mtof, noteName, tune, type ScaleId, type Tuning } from './music';
import { Synth } from './audio';
import { Renderer } from './render';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Falta el elemento ${sel}`);
  return el;
};

const TOUR_SECONDS = 24;
const TOUR_ALL_SECONDS = 45;
const AMP_ONE = 0.16; // nivel de cada nota con un sistema
const AMP_ALL = 0.035; // con los 30 sonando a la vez
const MAX_NOTES_PER_FRAME = 4; // por planeta: a velocidades extremas no se programan cientos

const info = $('#info');
const select = $<HTMLSelectElement>('#system-select');
const canvas = $<HTMLCanvasElement>('#canvas');
const renderer = new Renderer(canvas);

const state = {
  current: 0,
  all: false,
  playing: true,
  sound: false,
  tour: false,
  tourT: 0,
  mult: 1, // multiplicador sobre la velocidad base de cada sistema
  volume: 0.7,
  ambient: false,
};
const tuning: Tuning = { kAuto: true, k: 1, scale: 'penta', top: 84 };
let systems: System[] = [];
let synth: Synth | null = null;

const fmt = (n: number, d: number) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDays = (p: number) => fmt(p, p < 100 ? 2 : p < 1000 ? 1 : 0);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

// ── Panel del sistema ────────────────────────────────────────────────
function renderInfo(): void {
  if (state.all) {
    const n = systems.reduce((a, s) => a + s.planets.length, 0);
    info.innerHTML = `<h2>Los 30 a la vez</h2>
      <p class="star">${n} planetas</p><p class="dist">Cada sistema a su propia velocidad</p>
      <p class="fact">Haz clic en un sistema para escucharlo solo</p>`;
    return;
  }
  const sys = systems[state.current];
  const wide = sys.planets.some((p) => p.name.length > 2);
  info.innerHTML = `<h2>${esc(sys.name)}</h2>
    <p class="star">${esc(sys.star)}</p><p class="dist">${esc(sys.dist)}</p>
    <p class="fact">${esc(sys.fact)}</p>
    ${sys.inRhythm ? '<span class="badge">en ritmo</span>' : ''}
    <ul class="planets${wide ? ' wide' : ''}">${sys.planets
      .map(
        (p, i) => `<li data-i="${i}" style="--c:${p.color}">
          <span class="name">${esc(p.name)}</span>
          <span class="period">${fmtDays(p.period)} días</span>
          <span class="ratio">${p.ratio ? `≈ ${p.ratio}` : ''}</span>
          <span class="note" title="${fmt(p.freq, 1)} Hz">${p.freq < 20 ? 'inaudible' : noteName(p.midi)}</span>
        </li>`,
      )
      .join('')}</ul>`;
}

function flashRow(i: number): void {
  const li = info.querySelector<HTMLElement & { _t?: number }>(`li[data-i="${i}"]`);
  if (!li) return;
  li.classList.add('hit');
  clearTimeout(li._t);
  li._t = window.setTimeout(() => li.classList.remove('hit'), 140);
}

// ── Mesa de afinación ────────────────────────────────────────────────
function renderTuning(): void {
  const sys = systems[state.current];
  const dps = sys.baseSpeed * state.mult;
  const rate = state.all ? `velocidad × ${fmt(state.mult, state.mult < 10 ? 2 : 0)}` : `1 segundo = ${fmt(dps, dps < 10 ? 1 : 0)} días`;
  $('#speed-out').textContent = rate;
  $('#rate').textContent = rate;
  $<HTMLInputElement>('#speed').value = String(Math.log10(state.mult));
  $<HTMLButtonElement>('#speed-reset').disabled = state.mult === 1;

  const kInput = $<HTMLInputElement>('#k');
  kInput.disabled = tuning.kAuto;
  // En auto con los 30 no hay un k único: cada sistema tiene el suyo.
  const k = tuning.kAuto ? (state.all ? null : sys.k) : tuning.k;
  if (k !== null) kInput.value = String(k);
  $('#k-out').textContent = k === null ? 'k auto' : `k = ${fmt(k, 2)}`;
  $('#k-hint').innerHTML =
    k === null
      ? `Cada sistema se comprime hasta caber en ${fmt(AUTO_SPAN / 12, 1)} octavas.`
      : `Órbita el doble de rápida → nota <b>${fmt(12 * k, 1)}</b> semitonos más aguda${k === 1 ? ' (relación real)' : ''}.`;
  $('#vol-out').textContent = `${Math.round(state.volume * 100)} %`;
}

function retune(): void {
  tune(systems, tuning);
  renderInfo();
  renderTuning();
}

function sync(): void {
  const press = (id: string, on: boolean) => $(id).setAttribute('aria-pressed', String(on));
  press('#btn-all', state.all);
  press('#btn-tour', state.tour);
  press('#btn-play', !state.playing);
  press('#btn-sound', state.sound);
  $('#btn-play').textContent = state.playing ? 'Pausa' : 'Seguir';
  $('#btn-sound').textContent = state.sound ? 'Silenciar' : 'Activar sonido';
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
  resetSystem(systems[state.current]);
  sync();
}

function showAll(on: boolean): void {
  state.all = on;
  state.tourT = 0;
  if (on) systems.forEach(resetSystem);
  else resetSystem(systems[state.current]);
  sync();
}

function bindControls(): void {
  select.addEventListener('change', () => choose(Number(select.value)));
  $('#btn-prev').addEventListener('click', () => choose(state.current - 1));
  $('#btn-next').addEventListener('click', () => choose(state.current + 1));
  $('#btn-play').addEventListener('click', () => {
    state.playing = !state.playing;
    sync();
  });
  $('#btn-restart').addEventListener('click', () => (state.all ? systems.forEach(resetSystem) : resetSystem(systems[state.current])));
  $('#btn-all').addEventListener('click', () => {
    state.tour = false;
    showAll(!state.all);
  });
  $('#btn-tour').addEventListener('click', () => {
    state.tour = !state.tour;
    if (state.tour) {
      state.playing = true;
      choose(0, true);
    } else sync();
  });
  $('#btn-sound').addEventListener('click', () => {
    // El AudioContext solo puede nacer tras un gesto del usuario.
    synth ??= new Synth(state.volume);
    state.sound = !state.sound;
    if (state.sound) {
      void synth.ctx.resume();
      synth.setDrone(state.ambient, tuning.top);
    } else synth.setDrone(false);
    sync();
  });

  $<HTMLInputElement>('#speed').addEventListener('input', (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    // Imán en ×1: sin él es casi imposible volver exactamente a la recomendada arrastrando.
    state.mult = Math.abs(v) < 0.03 ? 1 : Math.pow(10, v);
    renderTuning();
  });
  // ×1 es la velocidad recomendada de cada sistema (baseSpeed en systems.ts).
  const resetSpeed = () => {
    state.mult = 1;
    renderTuning();
  };
  $('#speed-reset').addEventListener('click', resetSpeed);
  $('#speed').addEventListener('dblclick', resetSpeed);
  $<HTMLInputElement>('#k').addEventListener('input', (e) => {
    tuning.k = Number((e.target as HTMLInputElement).value);
    retune();
  });
  $<HTMLInputElement>('#k-auto').addEventListener('change', (e) => {
    tuning.kAuto = (e.target as HTMLInputElement).checked;
    // Al pasar a manual se parte del k que tenía el sistema visible: sin saltos de afinación.
    if (!tuning.kAuto) tuning.k = state.all ? 1 : systems[state.current].k;
    retune();
  });
  $<HTMLSelectElement>('#scale').addEventListener('change', (e) => {
    tuning.scale = (e.target as HTMLSelectElement).value as ScaleId;
    retune();
  });
  $<HTMLSelectElement>('#top').addEventListener('change', (e) => {
    tuning.top = Number((e.target as HTMLSelectElement).value);
    retune();
    if (synth && state.sound && state.ambient) synth.setDrone(true, tuning.top);
  });
  $<HTMLInputElement>('#vol').addEventListener('input', (e) => {
    state.volume = Number((e.target as HTMLInputElement).value);
    synth?.setVolume(state.volume);
    renderTuning();
  });
  $<HTMLInputElement>('#ambient').addEventListener('change', (e) => {
    state.ambient = (e.target as HTMLInputElement).checked;
    if (synth && state.sound) synth.setDrone(state.ambient, tuning.top);
  });

  canvas.addEventListener('click', (e) => {
    if (!state.all) return;
    const r = canvas.getBoundingClientRect();
    const cell = renderer.cellAt(e.clientX - r.left, e.clientY - r.top);
    if (cell) choose(cell.index);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).closest('input, select, textarea, button')) return;
    if (e.key === ' ') {
      e.preventDefault();
      $('#btn-play').click();
    } else if (e.key === 'ArrowLeft') choose(state.current - 1);
    else if (e.key === 'ArrowRight') choose(state.current + 1);
  });
}

// ── Bucle: avanza el tiempo y programa una nota en cada cruce de la vertical ──
// La nota se programa en el instante exacto del cruce dentro del frame (no al
// inicio del frame), así el ritmo no baila con los 16 ms de cada fotograma.
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.playing) {
    advance(dt, now);
    if (state.tour) advanceTour(dt);
  }
  $('#tour-progress').style.transform = `scaleX(${state.tour ? Math.min(1, state.tourT / (state.all ? TOUR_ALL_SECONDS : TOUR_SECONDS)) : 0})`;
  renderer.draw(systems, state.current, state.all, state.mult, now);
  requestAnimationFrame(frame);
}

function advance(dt: number, now: number): void {
  const audible = synth && state.sound;
  const t0 = audible ? synth!.now + 0.05 : 0;
  const active = state.all ? systems : [systems[state.current]];
  active.forEach((sys, si) => {
    const d0 = sys.t;
    const d1 = d0 + dt * sys.baseSpeed * state.mult;
    sys.planets.forEach((p, i) => {
      const done = Math.floor(d1 / p.period);
      if (done <= p.count) return;
      for (let c = Math.max(p.count + 1, done - MAX_NOTES_PER_FRAME + 1); c <= done; c++) {
        const frac = (c * p.period - d0) / (d1 - d0);
        if (audible) {
          const n = sys.planets.length;
          const pan = state.all ? ((si % 6) / 5 - 0.5) * 1.2 : n > 1 ? (i / (n - 1) - 0.5) * 0.9 : 0;
          synth!.bell(p.freq, t0 + frac * dt, state.all ? AMP_ALL : AMP_ONE, pan);
        }
        p.flash = now + frac * dt * 1000;
      }
      p.count = done;
      if (!state.all) flashRow(i);
    });
    sys.t = d1;
  });
}

function advanceTour(dt: number): void {
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
  let html = '';
  let group = 0;
  systems.forEach((s, i) => {
    if (s.planets.length !== group) {
      if (group) html += '</optgroup>';
      group = s.planets.length;
      html += `<optgroup label="${group} planetas">`;
    }
    html += `<option value="${i}">${esc(s.name)}</option>`;
  });
  select.innerHTML = `${html}</optgroup>`;
  select.disabled = false;

  let tops = '';
  for (let m = 96; m >= 60; m--) tops += `<option value="${m}">${noteName(m)} · ${Math.round(mtof(m))} Hz</option>`;
  const top = $<HTMLSelectElement>('#top');
  top.innerHTML = tops;
  top.value = String(tuning.top);
}

loadSystems()
  .then(({ file, systems: loaded }) => {
    systems = loaded;
    $('#credit').textContent = `datos: ${file.source} (${file.retrieved}) · idea: MathMotion`;
    fillSelects();
    bindControls();
    sync();
    requestAnimationFrame(frame);
  })
  .catch((err: unknown) => {
    console.error(err);
    info.innerHTML = '<p class="error">No se pudieron cargar los datos. Recarga la página.</p>';
  });
