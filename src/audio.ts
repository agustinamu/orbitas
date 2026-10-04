// Síntesis con Web Audio: campana (parciales senoidales con caída exponencial) por
// una reverb de convolución generada, y un fondo ambiental opcional.
import { mtof } from './music';

// [múltiplo de frecuencia, nivel, caída en s]: el fundamental dura y los armónicos se apagan antes.
const PARTIALS: [number, number, number][] = [
  [1, 1, 3.2],
  [2, 0.28, 1.2],
  [3.01, 0.08, 0.5],
];
const BELL_TAIL = Math.max(...PARTIALS.map(([, , d]) => d)) + 0.05;

// Tope de notas sonando a la vez (cada una son 7 nodos). A velocidad ×1 un sistema
// llega como mucho a ~33; solo se alcanza con todos a la vez o a velocidades extremas.
const MAX_VOICES = 160;

export class Synth {
  readonly ctx: AudioContext;
  private master: GainNode;
  private dry: GainNode;
  private reverb: ConvolverNode;
  private drone: { gain: GainNode; oscs: OscillatorNode[] } | null = null;
  private voiceEnds: number[] = []; // fin de cada nota sonando, en orden de inicio

  constructor(volume: number) {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = new GainNode(ctx, { gain: volume });
    // El compresor evita la saturación cuando coinciden muchas notas (modo «los 30 a la vez»).
    const comp = new DynamicsCompressorNode(ctx, { threshold: -18, ratio: 4 });
    this.master.connect(comp).connect(ctx.destination);

    this.reverb = new ConvolverNode(ctx, { buffer: impulse(ctx, 3.5) });
    this.reverb.connect(new GainNode(ctx, { gain: 0.5 })).connect(this.master);
    this.dry = new GainNode(ctx, { gain: 0.75 });
    this.dry.connect(this.master);
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  setVolume(v: number): void {
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** `decay` escala la duración (las colas largas se amontonan con muchos sistemas). Devuelve si sonó. */
  bell(freq: number, when: number, amp: number, pan: number, decay = 1): boolean {
    if (freq < 20 || freq > 12000) return false;
    const ctx = this.ctx;
    // Con latencia constante, las notas terminan casi en el orden en que empiezan (salvo al
    // cambiar de modo, por la cola distinta): basta para un tope aproximado sin ordenar.
    while (this.voiceEnds.length && this.voiceEnds[0] < ctx.currentTime) this.voiceEnds.shift();
    if (this.voiceEnds.length >= MAX_VOICES) return false;
    this.voiceEnds.push(when + BELL_TAIL * decay);
    const out = new StereoPannerNode(ctx, { pan });
    out.connect(this.dry);
    out.connect(this.reverb);
    for (const [mul, level, seconds] of PARTIALS) {
      const end = when + seconds * decay;
      const osc = new OscillatorNode(ctx, { frequency: freq * mul });
      const g = new GainNode(ctx, { gain: 0 });
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(amp * level, when + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g).connect(out);
      osc.start(when);
      osc.stop(end + 0.05);
    }
    return true;
  }

  // Tónica, quinta y octava graves con un paso bajo: colchón suave en la tonalidad elegida.
  setDrone(on: boolean, rootMidi = 48): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (this.drone) {
      const { gain, oscs } = this.drone;
      this.drone = null;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + 1.5);
      oscs.forEach((o) => o.stop(now + 1.6));
    }
    if (!on) return;
    const base = 36 + (rootMidi % 12);
    const gain = new GainNode(ctx, { gain: 0 });
    gain.gain.setValueAtTime(0, now); // ancla: sin ella la rampa arranca del último evento (ninguno)
    gain.gain.linearRampToValueAtTime(0.05, now + 3);
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 500 });
    lp.connect(gain);
    gain.connect(this.master);
    gain.connect(this.reverb);
    const voices: [number, OscillatorType, number][] = [
      [base, 'sine', 0],
      [base + 7, 'sine', 3],
      [base + 12, 'triangle', -4],
    ];
    const oscs = voices.map(([m, type, detune]) => {
      const o = new OscillatorNode(ctx, { type, frequency: mtof(m), detune });
      o.connect(lp);
      o.start();
      return o;
    });
    this.drone = { gain, oscs };
  }
}

function impulse(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}
