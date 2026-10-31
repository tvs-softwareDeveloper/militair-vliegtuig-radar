// de meting van fase 0 en 7: fps in rust, tijdens pannen en tijdens zoomen, met 1000, 3000 en 5000 nep-vliegtuigen.
//   npm run meten                                  de huidige versie (wat nu in de map staat)
//   node tests/meten.mjs --versie a1a9094          ook een oudere commit, op dezelfde manier (zo is in fase 7 oud tegen nieuw gemeten)
//   node tests/meten.mjs --aantallen 1000          alleen deze aantallen
//   npm run meten --versie=a1a9094 --aantallen=1000  hetzelfde via npm. "npm run meten -- --versie …" werkt niet in powershell:
//                                                  die slikt de -- in, en dan ziet npm de opties als zijn eigen instellingen
// opzet: productiebuild, 1440x900, kaarttegels geblokkeerd, nep-bron met elke 10 s een pakket. rust = 12 s, pannen = 8 s een
// rondje slepen, zoomen = 3 stappen in en 3 uit met het scrollwiel. fps en traagste beeld uit een eigen teller per beeld (werkt ook
// in oude versies zonder meter), teken-ms en zichtbaar/totaal uit de meter (?meten, alleen versies vanaf fase 2).
// alleen verhoudingen op dezelfde laptop zijn te vergelijken: andere hardware geeft andere getallen
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { MAP, UITVOER, bouw, browser, poortVrij, preview, radarServer, wacht } from './hulp.mjs';

// een optie uit de opdrachtregel, of anders uit npm (npm run meten --versie=… zet npm_config_versie)
const arg = (naam) => {
  const i = process.argv.indexOf(naam);
  if (i !== -1) return process.argv[i + 1];
  return process.env[`npm_config_${naam.replace(/^--/, '')}`] || null;
};
const AANTALLEN = (arg('--aantallen') ?? '1000,3000,5000').split(',').map(Number);
const VERSIE = arg('--versie');
const APP_POORT = 5193;

// een oudere commit uitpakken en bouwen. versies van vóór fase 3 praten vast met localhost:3001 (nog geen VITE_SERVER)
function bouwVersie(commit) {
  const map = path.join(UITVOER, `versie-${commit}`);
  rmSync(map, { recursive: true, force: true });
  mkdirSync(map, { recursive: true });
  const tar = path.join(UITVOER, `versie-${commit}.tar`);
  execFileSync('git', ['archive', commit, '-o', tar], { cwd: MAP });
  execFileSync('tar', ['-xf', tar, '-C', map]);
  rmSync(tar);
  symlinkSync(path.join(MAP, 'node_modules'), path.join(map, 'node_modules'), 'junction'); // zelfde pakketten, niet opnieuw installeren
  const socket = path.join(map, 'services', 'socket.ts');
  const vast = existsSync(socket) && !readFileSync(socket, 'utf8').includes('VITE_SERVER');
  const serverPoort = vast ? 3001 : 3103;
  return { dist: bouw(`dist-${commit}`, `http://127.0.0.1:${serverPoort}`, map), serverPoort };
}

async function meet(url, aantal) {
  const b = await browser();
  const page = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.route(/arcgisonline\.com/, (r) => r.abort());
  await page.addInitScript(() => {
    window.__beelden = [];
    const lus = (t) => {
      window.__beelden.push(t);
      requestAnimationFrame(lus);
    };
    requestAnimationFrame(lus);
  });
  await page.goto(url, { timeout: 120000 });
  await page.waitForFunction(
    (n) => (window.__teller?.totaal ?? 0) >= n || document.querySelectorAll('.leaflet-marker-icon').length >= n * 0.95,
    aantal,
    { timeout: 300000, polling: 500 },
  );
  await wacht(3000);
  const kaart = await page.locator('.leaflet-container').boundingBox();
  const mx = kaart.x + kaart.width / 2;
  const my = kaart.y + kaart.height / 2;

  // één fase: de beelden in het venster, en de tekentellers ervoor en erna
  async function fase(doe) {
    const voor = await page.evaluate(() => ({
      i: window.__beelden.length,
      t: performance.now(),
      som: window.__teller?.tekenMsSom ?? 0,
      beurten: window.__teller?.tekenbeurten ?? 0,
    }));
    let maxMs = 0;
    let bezig = true;
    // de meter zet tekenMsMax elke seconde terug, dus vaak uitlezen
    const lezer = (async () => {
      while (bezig) {
        maxMs = Math.max(maxMs, await page.evaluate(() => window.__teller?.tekenMsMax ?? 0).catch(() => 0));
        await wacht(100);
      }
    })();
    await doe();
    bezig = false;
    await lezer;
    const r = await page.evaluate((v) => {
      const b = window.__beelden.slice(v.i);
      const nu = performance.now();
      let traagst = 0;
      let vorige = window.__beelden[v.i - 1] ?? v.t;
      for (const t of b) {
        traagst = Math.max(traagst, t - vorige);
        vorige = t;
      }
      traagst = Math.max(traagst, nu - vorige);
      const beurten = (window.__teller?.tekenbeurten ?? 0) - v.beurten;
      return {
        fps: (b.length * 1000) / (nu - v.t),
        traagst,
        tekenGem: beurten ? ((window.__teller?.tekenMsSom ?? 0) - v.som) / beurten : null,
        zichtbaar: window.__teller?.zichtbaar ?? null,
        totaal: window.__teller?.totaal ?? null,
      };
    }, voor);
    return { ...r, tekenMax: maxMs };
  }

  const rust = await fase(() => wacht(12000));
  const pannen = await fase(async () => {
    await page.mouse.move(mx + 150, my);
    await page.mouse.down();
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const hoek = ((Date.now() - t0) / 8000) * 2 * Math.PI;
      await page.mouse.move(mx + 150 * Math.cos(hoek), my + 150 * Math.sin(hoek));
      await wacht(16);
    }
    await page.mouse.up();
  });
  const zoomen = await fase(async () => {
    await page.mouse.move(mx, my);
    for (const dy of [-120, -120, -120, 120, 120, 120]) {
      await page.mouse.wheel(0, dy);
      await wacht(600);
    }
    await wacht(600);
  });
  await b.close();
  return { rust, pannen, zoomen };
}

const getal = (x, d = 1) => (x === null || x === undefined ? '–' : Number(x).toLocaleString('nl-NL', { maximumFractionDigits: d }));
const cel = (f) => `${getal(f.fps)} (${getal(f.traagst, 0)} ms)`;

const versies = [{ naam: 'nu', ...{ dist: bouw('meten-nu', 'http://127.0.0.1:3103'), serverPoort: 3103 } }];
if (VERSIE) versies.push({ naam: VERSIE, ...bouwVersie(VERSIE) });

const rijen = [];
for (const aantal of AANTALLEN) {
  for (const v of versies) {
    if (!(await poortVrij(v.serverPoort))) {
      console.log(`poort ${v.serverPoort} is in gebruik (draait je eigen radarserver?). ${v.naam} overgeslagen`);
      continue;
    }
    const server = await radarServer(v.serverPoort, ['--nep', String(aantal), '--elke', '10']);
    const web = await preview(v.dist, APP_POORT);
    try {
      const m = await meet(`http://127.0.0.1:${APP_POORT}/?meten`, aantal);
      const teken = m.rust.tekenGem === null ? '–' : `gem ${getal(m.rust.tekenGem)} · max ${getal(Math.max(m.rust.tekenMax, m.pannen.tekenMax, m.zoomen.tekenMax))}`;
      const zicht = m.rust.zichtbaar === null ? 'alles' : `${m.rust.zichtbaar}/${m.rust.totaal}`;
      const rij = `| ${aantal.toLocaleString('nl-NL')} | ${v.naam} | ${cel(m.rust)} | ${cel(m.pannen)} | ${cel(m.zoomen)} | ${teken} | ${zicht} |`;
      console.log(rij);
      rijen.push(rij);
    } finally {
      await web.stop();
      await server.stop();
    }
  }
}

console.log('\n| Nep-vliegtuigen | Versie | fps in rust | fps pannen | fps zoomen | teken-ms | zichtbaar/totaal |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rijen) console.log(r);
console.log('\n(tussen haakjes het traagste beeld)');
