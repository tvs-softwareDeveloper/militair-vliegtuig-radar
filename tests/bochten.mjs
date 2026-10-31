// bochten voorspellen meten (fase 3 van het tweede plan): hoe ver zat de voorspelling ernaast bij het volgende pakket, apart voor
// vliegtuigen die rechtdoor vlogen en die draaiden. per boogduur een eigen tabblad (?bocht=…), allemaal tegelijk op dezelfde server,
// dus op precies dezelfde data. bocht=0 is altijd rechtdoor (zoals vóór fase 3).
//   node tests/bochten.mjs                 nep-bron, elke 30 s en elke 10 s een pakket
//   node tests/bochten.mjs --echt          echte data: opensky Normaal (20 s) en Snel (5 s), en adsb.lol (5 s). kost opensky-tegoed:
//                                          ±25 met een account. zonder account zijn Normaal en Snel langzamer
// let op: zoom 10 rond het midden van nederland, de correctie is in pixels op die zoom
// sinds 31-10 schat de laag de draaisnelheid alleen uit pakketten die hoogstens 25 s uit elkaar liggen: bij Zuinig rekent hij rechtdoor
import { pathToFileURL } from 'node:url';
import { bouw, browser, preview, radarServer, wacht } from './hulp.mjs';
import { APP_POORT as TEST_APP, SERVER_POORT as TEST_SERVER } from './kaart.mjs';

const ECHT = process.argv.includes('--echt');
// OUD: const BOOGDUREN = [0, 15, 30, 60, 120];
const BOOGDUREN = [0, 10, 15, 30];
const SERVER_POORT = 3106;
const APP_POORT = 5196;
const MIN_PAKKETTEN = 8; // vanaf het 3e tellen ze mee, dus 6 bruikbare
const MAX_MIN = 6; // hoogstens zoveel minuten per ronde

const p95 = (l) => {
  const s = [...l].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.95))] : NaN;
};
const mediaan = (l) => {
  const s = [...l].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

// OUD: async function ronde(naam, serverArgs) {
async function ronde(naam, serverArgs, { bron = 'opensky', stand = 'zuinig' } = {}) {
  const dist = bouw('app-bochten', `http://127.0.0.1:${SERVER_POORT}`);
  const server = await radarServer(SERVER_POORT, serverArgs);
  const web = await preview(dist, APP_POORT);
  const b = await browser();
  try {
    const paginas = [];
    for (const boog of BOOGDUREN) {
      const page = await b.newPage({ viewport: { width: 1200, height: 800 } });
      await page.route(/arcgisonline\.com/, (r) => r.abort());
      await page.addInitScript(
        ([bron, stand]) => {
          localStorage.setItem('radar.bron', bron);
          localStorage.setItem('radar.verversen', stand);
        },
        [bron, stand],
      );
      await page.goto(`http://127.0.0.1:${APP_POORT}/?meten&bocht=${boog}`);
      await page.waitForFunction(() => window.__vliegtuigLaag && (window.__teller?.totaal ?? 0) > 0, null, { timeout: 60000 });
      await page.evaluate(() => {
        window.__vliegtuigLaag.kaart.setView([52.13, 5.29], 10, { animate: false });
        // elk pakket de correctie bewaren (de meter overschrijft hem bij het volgende)
        window.__pakketten = [];
        let laatste = window.__teller.pakketten;
        setInterval(() => {
          const t = window.__teller;
          if (t.pakketten === laatste) return;
          laatste = t.pakketten;
          window.__pakketten.push({ recht: { ...t.correctieRecht }, bocht: { ...t.correctieBocht }, zoom: t.correctieZoom });
        }, 100);
      });
      paginas.push({ boog, page });
    }
    const start = Date.now();
    while (Date.now() - start < MAX_MIN * 60000) {
      const n = await paginas[0].page.evaluate(() => window.__pakketten.length);
      if (n >= MIN_PAKKETTEN) break;
      await wacht(2000);
    }
    console.log(`\n== ${naam}`);
    console.log('| boogduur | pakketten | rechtdoor p95 | bocht mediaan | bocht p95 | draaiend per pakket |');
    console.log('|---|---|---|---|---|---|');
    for (const { boog, page } of paginas) {
      const lijst = (await page.evaluate(() => window.__pakketten)).slice(2); // de eerste twee tellen niet mee
      const r = lijst.map((x) => x.recht.p95);
      const bm = lijst.map((x) => x.bocht.mediaan);
      const bp = lijst.map((x) => x.bocht.p95);
      const aantal = lijst.map((x) => x.bocht.aantal);
      const f = (x) => (Number.isFinite(x) ? x.toFixed(1) : '–');
      console.log(`| ${boog === 0 ? '0 (rechtdoor)' : `${boog} s`} | ${lijst.length} | ${f(mediaan(r))} | ${f(mediaan(bm))} | ${f(mediaan(bp))} | ${f(mediaan(aantal))} |`);
    }
    console.log('(per pakket uitgerekend; in de tabel de mediaan over de pakketten, vanaf het 3e. px op zoom 10)');
  } finally {
    await b.close();
    await web.stop();
    await server.stop();
  }
}

// de korte controle voor npm run check: rechtdoor tegen de standaard boog, nep-bron met elke 5 s een pakket.
// de boog moet in bochten duidelijk beter zijn, en rechtdoor moet ±0 blijven
export default async function bochtTests(check, { dist } = {}) {
  dist ??= bouw('app-test', `http://127.0.0.1:${TEST_SERVER}`);
  const server = await radarServer(TEST_SERVER, ['--nep', '1000', '--elke', '5']);
  const web = await preview(dist, TEST_APP);
  const b = await browser();
  try {
    const meet = async (boog) => {
      const page = await b.newPage({ viewport: { width: 1200, height: 800 } });
      await page.route(/arcgisonline\.com/, (r) => r.abort());
      await page.goto(`http://127.0.0.1:${TEST_APP}/?meten${boog === null ? '' : `&bocht=${boog}`}`);
      await page.waitForFunction(() => window.__vliegtuigLaag && (window.__teller?.totaal ?? 0) > 900, null, { timeout: 30000 });
      await page.evaluate(() => {
        window.__vliegtuigLaag.kaart.setView([52.13, 5.29], 10, { animate: false });
        window.__pakketten = [];
        let laatste = window.__teller.pakketten;
        setInterval(() => {
          const t = window.__teller;
          if (t.pakketten === laatste) return;
          laatste = t.pakketten;
          window.__pakketten.push({ recht: { ...t.correctieRecht }, bocht: { ...t.correctieBocht } });
        }, 100);
      });
      return page;
    };
    const [recht, standaard] = await Promise.all([meet(0), meet(null)]);
    await standaard.waitForFunction(() => window.__pakketten.length >= 6, null, { timeout: 60000, polling: 500 });
    const lees = async (page) => (await page.evaluate(() => window.__pakketten)).slice(2);
    const r = await lees(recht);
    const s = await lees(standaard);
    const zonder = mediaan(r.map((x) => x.bocht.p95));
    const met = mediaan(s.map((x) => x.bocht.p95));
    check('bochten: rechtdoor vliegende vliegtuigen blijven ±0 (p95)', mediaan(s.map((x) => x.recht.p95)) < 0.5, `${mediaan(s.map((x) => x.recht.p95)).toFixed(2)} px`);
    check('bochten: in bochten zit de voorspelling er veel minder naast', met <= Math.max(0.5, zonder / 3), `p95 ${zonder.toFixed(1)} px rechtdoor voorspeld, ${met.toFixed(1)} px met de boog (zoom 10, elke 5 s)`);
    check('bochten: de draaiende vliegtuigen worden herkend', mediaan(s.map((x) => x.bocht.aantal)) > 100, `${mediaan(s.map((x) => x.bocht.aantal))} per pakket`);
  } finally {
    await b.close();
    await web.stop();
    await server.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (ECHT) {
    // OUD: await ronde('echte OpenSky, Zuinig (250 km)', []);
    await ronde('echte OpenSky, Normaal (250 km, 20 s met account)', [], { stand: 'normaal' });
    await ronde('echte OpenSky, Snel (250 km, 5 s met account)', [], { stand: 'snel' });
    await ronde('adsb.lol, Normaal (250 km, 5 s, met track_rate)', [], { bron: 'adsblol', stand: 'normaal' });
  } else {
    await ronde('nep-bron, elke 30 s een pakket', ['--nep', '1000', '--elke', '30']);
    await ronde('nep-bron, elke 10 s een pakket', ['--nep', '1000', '--elke', '10']);
  }
}
