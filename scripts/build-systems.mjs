// Genera public/data/systems.json con los 30 sistemas del vídeo de MathMotion
// («I Turned 30 Real Solar Systems into Sound»), desde la misma fuente que cita:
// NASA Exoplanet Archive, tabla Planetary Systems Composite Parameters (pscomppars).
// La respuesta cruda se cachea en data/cache/; `--refresh` fuerza a re-descargar.
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const CACHE = 'data/cache/pscomppars.json';
const OUT = 'public/data/systems.json';

// Orden del vídeo, agrupado por número de planetas. Kepler-90 figura en el
// archivo como KOI-351 (sus planetas b–h salen como «KOI-351 x»).
const ORDER = [
  'YZ Cet', 'GJ 581', 'Kepler-9', 'GJ 357', 'Kepler-47', 'TOI-270', 'K2-381', 'Kepler-60',
  'TOI-700', 'Kepler-37', 'Kepler-51', 'V1298 Tau', 'Kepler-138', 'Kepler-176', 'Kepler-223',
  'L 98-59', 'Kepler-62', 'Kepler-102', 'K2-384', 'HD 158259', 'Kepler-444',
  'Kepler-11', 'K2-138', 'Kepler-80', 'TOI-178', 'TOI-1136', 'HD 110067',
  'TRAPPIST-1',
  'KOI-351',
];
const NAMES = { 'YZ Cet': 'YZ Ceti', 'GJ 581': 'Gliese 581', 'GJ 357': 'Gliese 357', 'KOI-351': 'Kepler-90' };

const FACTS = {
  'YZ Cet': 'Uno de nuestros vecinos más cercanos',
  'GJ 581': 'Dos de sus «planetas» resultaron no existir',
  'Kepler-9': 'Los primeros planetas pillados tirando unos de otros',
  'GJ 357': 'Su planeta d está en la zona habitable',
  'Kepler-47': 'Sus planetas giran alrededor de dos soles, como Tatooine',
  'TOI-270': 'El telescopio James Webb ha estudiado la atmósfera de su planeta d',
  'K2-381': 'Encontrado en la segunda vida del telescopio Kepler, la misión K2',
  'Kepler-60': 'Sus tres planetas encadenan resonancias 5:4 y 4:3',
  'TOI-700': 'Dos planetas del tamaño de la Tierra en su zona habitable',
  'Kepler-37': 'Su planeta b es apenas más grande que la Luna',
  'Kepler-51': 'Planetas tan hinchados que se los llama de «algodón de azúcar»',
  'V1298 Tau': 'Una estrella bebé: unos 20 millones de años',
  'Kepler-138': 'Sus planetas c y d podrían ser mundos de agua',
  'Kepler-176': 'Sus tres planetas exteriores van casi a ritmo 2:1',
  'Kepler-223': 'Un ritmo 3:4:6:8 que conserva desde su formación',
  'L 98-59': 'A solo 35 años luz, uno de los objetivos del James Webb',
  'Kepler-62': 'Dos planetas, e y f, en la zona habitable',
  'Kepler-102': 'Su planeta b es más pequeño que Marte',
  'K2-384': 'Cinco planetas pequeños alrededor de una enana roja tenue',
  'HD 158259': 'Una cadena de planetas casi a ritmo 3:2',
  'Kepler-444': 'Uno de los sistemas más antiguos: unos 11.000 millones de años',
  'Kepler-11': 'Cinco de sus planetas cabrían dentro de la órbita de Mercurio',
  'K2-138': 'Descubierto por aficionados en un proyecto de ciencia ciudadana',
  'Kepler-80': 'Su sexto planeta lo encontró una inteligencia artificial',
  'TOI-178': 'Cinco planetas bailando en cadena 18:9:6:4:3',
  'TOI-1136': 'Una estrella joven con seis planetas en cadena de resonancias',
  'HD 110067': 'Seis planetas en una cadena de resonancias casi perfecta',
  'TRAPPIST-1': 'Siete planetas del tamaño de la Tierra, tres en la zona habitable',
  'KOI-351': 'Ocho planetas, como el nuestro; el octavo lo halló una IA',
};
const STAR_OVERRIDE = {
  'Kepler-47': 'Dos estrellas: una como el Sol y una enana roja',
  'V1298 Tau': 'Estrella muy joven',
};

// El Sistema Solar no está en el archivo de exoplanetas. Periodos siderales (días) y radios (Tierras).
const SOLAR = {
  name: 'Sistema Solar',
  star: 'El Sol, una enana amarilla',
  dist: 'A 8 minutos luz de la Tierra',
  fact: 'Nuestra casa',
  teff: 5772,
  planets: [
    ['Mercurio', 87.969, 0.383], ['Venus', 224.701, 0.949], ['Tierra', 365.256, 1],
    ['Marte', 686.98, 0.532], ['Júpiter', 4332.59, 11.21], ['Saturno', 10759.22, 9.45],
    ['Urano', 30688.5, 4.01], ['Neptuno', 60182, 3.88],
  ].map(([name, period, radius]) => ({ name, period, radius })),
};

const starLabel = (teff) =>
  teff < 3000 ? 'Enana roja ultrafría'
  : teff < 4000 ? 'Enana roja'
  : teff < 5300 ? 'Enana naranja'
  : teff < 6000 ? 'Estrella parecida al Sol'
  : 'Estrella algo más caliente que el Sol';

function distLabel(pc) {
  const ly = pc * 3.26156;
  const v = ly < 100 ? Math.round(ly) : Math.round(ly / 10) * 10;
  return `A ${v.toLocaleString('es-ES', { useGrouping: true })} años luz`;
}

async function fetchRows() {
  if (existsSync(CACHE) && !process.argv.includes('--refresh')) return JSON.parse(await readFile(CACHE, 'utf8'));
  const hosts = ORDER.map((h) => `'${h}'`).join(',');
  const query = `select hostname,pl_name,pl_orbper,pl_rade,sy_dist,st_teff from pscomppars where hostname in (${hosts})`;
  const res = await fetch(`${TAP}?${new URLSearchParams({ query, format: 'json' })}`);
  if (!res.ok) throw new Error(`NASA Exoplanet Archive respondió ${res.status}`);
  const rows = await res.json();
  await mkdir('data/cache', { recursive: true });
  await writeFile(CACHE, JSON.stringify(rows));
  return rows;
}

const rows = await fetchRows();
const systems = ORDER.map((host) => {
  const planets = rows.filter((r) => r.hostname === host).sort((a, b) => a.pl_orbper - b.pl_orbper);
  if (!planets.length) throw new Error(`Sin planetas para ${host}`);
  const teff = planets[0].st_teff;
  return {
    name: NAMES[host] ?? host,
    star: STAR_OVERRIDE[host] ?? starLabel(teff),
    dist: distLabel(planets[0].sy_dist),
    fact: FACTS[host],
    teff,
    planets: planets.map((r) => ({ name: r.pl_name.split(' ').at(-1), period: r.pl_orbper, radius: r.pl_rade ?? 1 })),
  };
});
systems.push(SOLAR);

const counts = systems.map((s) => s.planets.length).join(' ');
const expected = '3 3 3 3 3 3 3 3 4 4 4 4 4 4 4 5 5 5 5 5 5 6 6 6 6 6 6 7 8 8';
if (counts !== expected) throw new Error(`Número de planetas distinto al del vídeo:\n${counts}\n${expected}`);

const file = {
  source: 'NASA Exoplanet Archive · Planetary Systems Composite Parameters',
  // fecha de la descarga real (la caché), no de esta ejecución
  retrieved: (await stat(CACHE)).mtime.toISOString().slice(0, 10),
  systems,
};
await writeFile(OUT, JSON.stringify(file, null, 1) + '\n');
console.log(`${OUT}: ${systems.length} sistemas, ${systems.reduce((a, s) => a + s.planets.length, 0)} planetas`);
