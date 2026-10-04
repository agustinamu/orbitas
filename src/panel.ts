// Panel lateral (ficha del sistema, como en el vídeo) y lecturas de la mesa de afinación.
import { $, esc, fmt } from './dom';
import { AUTO_SPAN, noteName, type Tuning } from './music';
import { MAX_ORBIT_SPREAD, type System } from './systems';

const HIT_MS = 140; // duración del resaltado de la fila al sonar

const fmtDays = (p: number) => fmt(p, p < 100 ? 2 : p < 1000 ? 1 : 0);

export interface TuningView {
  sys: System; // sistema visible (para la velocidad en días y su k)
  all: boolean;
  mult: number;
  tuning: Tuning;
  volume: number;
}

export class Panel {
  private info = $('#info');
  private rows: HTMLElement[] = [];
  private timers: number[] = [];
  private el = {
    rate: $('#rate'),
    speed: $<HTMLInputElement>('#speed'),
    speedOut: $('#speed-out'),
    speedReset: $<HTMLButtonElement>('#speed-reset'),
    k: $<HTMLInputElement>('#k'),
    kOut: $('#k-out'),
    kHint: $('#k-hint'),
    volOut: $('#vol-out'),
  };

  showSystem(sys: System): void {
    const wide = sys.planets.some((p) => p.name.length > 2); // «Mercurio» frente a «b»
    const badges = [
      sys.inRhythm ? '<span class="badge">en ritmo</span>' : '',
      sys.compressed
        ? `<span class="badge dim" title="La órbita exterior está más de ${MAX_ORBIT_SPREAD} veces más lejos que la interior: se comprimen para que quepan">escala comprimida</span>`
        : '',
    ].join('');
    this.info.innerHTML = `<h2>${esc(sys.name)}</h2>
      <p class="star">${esc(sys.star)}</p><p class="dist">${esc(sys.dist)}</p>
      <p class="fact">${esc(sys.fact)}</p>
      <div class="badges">${badges}</div>
      <ul class="planets${wide ? ' wide' : ''}">${sys.planets
        .map(
          (p) => `<li style="--c:${p.color}">
            <span class="name">${esc(p.name)}</span>
            <span class="period">${fmtDays(p.period)} días</span>
            <span class="ratio">${p.ratio ? `≈ ${p.ratio}` : ''}</span>
            <span class="note" title="${fmt(p.freq, 1)} Hz">${p.freq < 20 ? 'inaudible' : noteName(p.midi)}</span>
          </li>`,
        )
        .join('')}</ul>`;
    this.rows = [...this.info.querySelectorAll<HTMLElement>('li')];
  }

  showAll(systems: System[]): void {
    const n = systems.reduce((a, s) => a + s.planets.length, 0);
    this.info.innerHTML = `<h2>Los ${systems.length} a la vez</h2>
      <p class="star">${n} planetas</p><p class="dist">Cada sistema a su propia velocidad</p>
      <p class="fact">Haz clic en un sistema para escucharlo solo</p>`;
    this.rows = [];
  }

  showError(): void {
    this.info.innerHTML = '<p class="error">No se pudieron cargar los datos. Recarga la página.</p>';
  }

  flash(i: number): void {
    const li = this.rows[i];
    if (!li) return;
    li.classList.add('hit');
    clearTimeout(this.timers[i]);
    this.timers[i] = window.setTimeout(() => li.classList.remove('hit'), HIT_MS);
  }

  showTuning({ sys, all, mult, tuning, volume }: TuningView): void {
    const { el } = this;
    const daysPerSec = sys.baseSpeed * mult;
    const rate = all ? `velocidad × ${fmt(mult, mult < 10 ? 2 : 0)}` : `1 segundo = ${fmt(daysPerSec, daysPerSec < 10 ? 1 : 0)} días`;
    el.speedOut.textContent = rate;
    el.rate.textContent = rate;
    // En la cuadrícula pisaría la etiqueta del último sistema; ya está en la mesa de afinación.
    el.rate.hidden = all;
    el.speed.value = String(Math.log10(mult));
    el.speedReset.disabled = mult === 1;

    // En auto con todos a la vez no hay un k único: cada sistema tiene el suyo.
    const k = tuning.kAuto ? (all ? null : sys.k) : tuning.k;
    el.k.disabled = tuning.kAuto;
    if (k !== null) el.k.value = String(k);
    el.kOut.textContent = k === null ? 'k auto' : `k = ${fmt(k, 2)}`;
    el.kHint.innerHTML =
      k === null
        ? `Cada sistema se comprime hasta caber en ${fmt(AUTO_SPAN / 12, 1)} octavas.`
        : `Órbita el doble de rápida → nota <b>${fmt(12 * k, 1)}</b> semitonos más aguda${k === 1 ? ' (relación real)' : ''}.`;
    el.volOut.textContent = `${Math.round(volume * 100)} %`;
  }
}
