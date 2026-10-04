// Reloj de la simulación: avanza el tiempo de cada sistema y avisa cuando un
// planeta completa una órbita (cruza la vertical). Sin DOM ni audio.
import type { Planet, System } from './systems';

/**
 * `frac` (0–1) es en qué punto del intervalo del fotograma ocurrió el cruce:
 * permite programar la nota en su instante exacto y no al inicio del fotograma,
 * para que el ritmo no baile con los ~16 ms de cada fotograma.
 */
export type CrossingHandler = (sys: System, sysIndex: number, planet: Planet, planetIndex: number, frac: number) => void;

/**
 * Avanza `dt` segundos reales. Si un planeta completa varias órbitas en un mismo
 * fotograma (velocidades extremas), solo se avisa del último cruce: las notas
 * intermedias serían inaudibles como notas separadas.
 */
export function advance(systems: System[], dt: number, mult: number, onCrossing: CrossingHandler): void {
  systems.forEach((sys, si) => {
    const d0 = sys.t;
    const d1 = d0 + dt * sys.baseSpeed * mult;
    sys.planets.forEach((p, pi) => {
      const done = Math.floor(d1 / p.period);
      if (done <= p.count) return; // implica d1 > d0: la división de abajo es segura
      p.count = done;
      onCrossing(sys, si, p, pi, (done * p.period - d0) / (d1 - d0));
    });
    sys.t = d1;
  });
}
