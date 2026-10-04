# Órbitas que suenan

30 sistemas planetarios reales convertidos en música: cada planeta toca una nota
cada vez que completa una órbita (al cruzar la vertical sobre su estrella), así
que el ritmo es el de sus periodos orbitales reales. Basado en el vídeo de
MathMotion [«I Turned 30 Real Solar Systems into Sound»](https://www.youtube.com/watch?v=lWXQJ95krF4),
con la afinación ajustable. Vite + TypeScript, sin frameworks; Canvas 2D y Web Audio.

## Uso

```sh
npm install
npm run dev        # desarrollo
npm run build      # producción (dist/)
```

## Cómo se asigna la nota

1. **Relación** (`k`): la frecuencia de la nota sigue a la frecuencia orbital
   elevada a `k`. En semitonos respecto al planeta más rápido:
   `−k · 12 · log2(P / Pmin)`. Con `k = 1` es la relación real (órbita el doble
   de rápida → una octava más aguda). En **auto**, cada sistema usa `k = 1`
   salvo que no quepa en 2,5 octavas (`AUTO_SPAN`); entonces se comprime.
2. **Ajuste**: la nota se lleva a la más cercana de la escala (pentatónica por
   defecto, como el vídeo; también mayor, menor, cromática o sin ajustar).

La velocidad (`1 segundo = X días`) acelera el tiempo por igual para todos los
planetas: el ritmo relativo es exacto. Las notas se programan en el instante del
cruce dentro de cada fotograma, no al inicio del fotograma.

## Escala de las órbitas

El radio de cada órbita sigue la tercera ley de Kepler (`a ∝ P^2/3`), exacta
dentro de un sistema sin conocer la masa de la estrella (se cancela). Las
órbitas están a escala dentro de su sistema, salvo cuando la exterior está a
más de 7 veces la distancia de la interior: entonces se comprimen con un
exponente y el panel lo indica con «escala comprimida» (Kepler-9, Kepler-62,
Kepler-90 y el Sistema Solar). No hay escala común entre sistemas (cada uno
llena la pantalla), y los tamaños de planetas y estrella no están a escala.

Los planetas arrancan alineados en la vertical: las fases iniciales reales no se usan.

«≈ 3:2» marca dos vecinos con periodos a menos de un 2 % de una razón sencilla;
«en ritmo», que todos los pares vecinos lo están.

## Datos

| Script | Genera | Fuente |
|---|---|---|
| `npm run build:systems` | `public/data/systems.json` | [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/), tabla *Planetary Systems Composite Parameters* (`pscomppars`) vía TAP; caché en `data/cache/` (`--refresh` para re-descargar) |

Los 30 sistemas, su orden, los nombres en español y los datos curiosos están en
`scripts/build-systems.mjs`. El script falla si el número de planetas por
sistema deja de coincidir con el del vídeo. Kepler-90 está en el archivo como
`KOI-351`. El Sistema Solar se añade a mano (no está en el archivo de exoplanetas).

## Módulos (`src/`)

- `systems.ts` — carga del JSON; tamaño de órbita (Kepler) y resonancias.
- `music.ts` — frecuencia orbital → nota (relación `k` + escala).
- `clock.ts` — reloj de la simulación: avanza el tiempo y avisa de cada cruce de
  la vertical con su instante exacto dentro del fotograma. Sin DOM ni audio.
- `audio.ts` — campana Web Audio con reverb de convolución, fondo ambiental y
  tope de voces simultáneas.
- `render.ts` — canvas: órbitas, estelas (degradado cónico), destellos y
  cuadrícula de «los 30».
- `panel.ts` — ficha del sistema y lecturas de la mesa de afinación.
- `dom.ts` — utilidades de DOM y formato.
- `main.ts` — estado de la interfaz, controles, bucle y recorrido.

## Límites de audio

Un planeta no suena más de una vez cada 80 ms (más rápido sería un zumbido) y
como mucho suenan 160 notas a la vez. Con todos los sistemas a la vez las colas
de las notas se acortan (×0,4): a velocidad ×1 quedan unas 90 voces y no se
pierde ninguna nota; el tope solo actúa a velocidades extremas.
