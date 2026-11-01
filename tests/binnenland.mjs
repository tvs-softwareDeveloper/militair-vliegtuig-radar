// de reden "vliegt Nederland in" (utils/binnenland.ts): ligt een punt in Nederland, en brengt de koers een vliegtuig binnen 10 minuten
// over de grens? met plekken die je kent. los te draaien met: node tests/binnenland.mjs
import { pathToFileURL } from 'node:url';
import { uitslag } from './hulp.mjs';
import { inNederland, vliegtNederlandIn } from '../utils/binnenland.ts';

const SNEL = 230; // m/s, een verkeersvliegtuig op kruishoogte

export default async function binnenlandTests(check) {
  const plekken = [
    ['Amsterdam', 52.37, 4.9, true],
    ['Utrecht', 52.09, 5.12, true],
    ['Groningen', 53.22, 6.57, true],
    ['Maastricht', 50.85, 5.69, true],
    ['Middelburg', 51.5, 3.61, true],
    ['Den Burg (Texel)', 53.05, 4.8, true],
    ['midden in het IJsselmeer', 52.8, 5.3, true],
    ['Lelystad', 52.52, 5.47, true],
    ['Antwerpen', 51.22, 4.4, false],
    ['Düsseldorf', 51.23, 6.78, false],
    ['Emden', 53.37, 7.21, false],
    ['Noordzee voor IJmuiden', 52.45, 4.2, false],
    ['Brussel', 50.85, 4.35, false],
  ];
  const fout = plekken.filter(([, lat, lon, verwacht]) => inNederland(lat, lon) !== verwacht).map(([naam]) => naam);
  check('in Nederland: steden en water goed herkend', fout.length === 0, fout.length ? `fout: ${fout.join(', ')}` : `${plekken.length} plekken`);

  const gevallen = [
    ['Noordzee (52,4 N 3,6 O), naar het oosten', 52.4, 3.6, 90, SNEL, true],
    ['zelfde plek, naar het westen (vliegt Nederland uit de buurt)', 52.4, 3.6, 270, SNEL, false],
    ['zelfde plek, naar het noorden (langs de kust)', 52.4, 3.6, 0, SNEL, false],
    ['zuid van Limburg (50,6 N), naar het oosten (er langs)', 50.6, 4.5, 90, SNEL, false],
    ['België (51,1 N 4,5 O), naar het oosten: komt in Limburg', 51.1, 4.5, 90, SNEL, true],
    ['Düsseldorf, naar het westen (naar de grens)', 51.23, 6.78, 270, SNEL, true],
    ['Düsseldorf, naar het oosten (er vandaan)', 51.23, 6.78, 90, SNEL, false],
    ['boven Utrecht, welke koers ook (al binnen)', 52.09, 5.12, 180, SNEL, false],
    ['Hamburg (53,55 N), naar het westen: blijft ten noorden van Nederland', 53.55, 10.0, 270, SNEL, false],
    ['Hannover (52,37 N), naar het westen: ±13 min, te ver voor 10 minuten', 52.37, 9.73, 270, SNEL, false],
    ['boven de Waddenzee (53,3 N 5,3 O), naar het zuiden', 53.3, 5.3, 180, SNEL, true],
    ['Noordzee, naar het oosten, maar bijna stil (3 m/s)', 52.4, 3.6, 90, 3, false],
  ];
  for (const [naam, lat, lon, koers, v, verwacht] of gevallen) {
    const uit = vliegtNederlandIn(lat, lon, koers, v);
    check(`vliegt Nederland in: ${naam}`, uit === verwacht, `${uit ? 'ja' : 'nee'}, verwacht ${verwacht ? 'ja' : 'nee'}`);
  }
  // OUD: Hamburg naar het westen binnen 20 minuten (fout gekozen: op 53,55 N blijft hij ten noorden van Nederland)
  check('Hannover naar het westen komt er wel binnen 20 minuten', vliegtNederlandIn(52.37, 9.73, 270, SNEL, 1200) === true);
  check('ontbrekende koers of snelheid: geen reden', vliegtNederlandIn(52.4, 3.6, null, SNEL) === false && vliegtNederlandIn(52.4, 3.6, 90, null) === false);

  // snelheid: 5000 vliegtuigen rond Nederland, één keer per pakket
  const start = performance.now();
  let ja = 0;
  for (let i = 0; i < 5000; i++) {
    const lat = 50 + ((i * 37) % 500) / 100;
    const lon = 2 + ((i * 53) % 800) / 100;
    if (vliegtNederlandIn(lat, lon, (i * 71) % 360, SNEL)) ja++;
  }
  const ms = performance.now() - start;
  check('5000 vliegtuigen beoordelen kost weinig', ms < 50, `${ms.toFixed(1)} ms (${ja} vliegen Nederland in)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check, telling } = uitslag();
  await binnenlandTests(check);
  console.log(`\n${telling.goed} goed, ${telling.fout} fout`);
  process.exit(telling.fout ? 1 : 0);
}
