// een straal tot 3000 km, "Hele wereld" en de scrollbalk van het zijpaneel (01-11-2026).
// eerst de server: het vak dat hij bij (nep-)opensky vraagt, ook over de datumgrens en de hele wereld zonder vak.
// dan de app met de nep-bron: de knop, de cirkel weg en terug, adsb.lol, en of de kaart vlot blijft met 10.000 vliegtuigen.
// los te draaien met: node tests/wereld.mjs
import { pathToFileURL } from 'node:url';
import { io } from 'socket.io-client';
import { bouw, browser, nepBronnen, preview, radarPagina, radarServer, uitslag, wacht } from './hulp.mjs';
import { APP_POORT, SERVER_POORT } from './kaart.mjs';

const NEP_POORT = 3195;
const LOS_POORT = 3114; // de server tegen de nep-bronnen
const WERELD_KM = 20050;

// het eerste pakket na een nieuw gebied, met het gebied dat de server erbij zegt. verwacht: de straal die de server terug moet sturen
function vraag(poort, wens, verwacht = wens.wereld ? WERELD_KM : wens.km, ms = 10000) {
  return new Promise((resolve, reject) => {
    const s = io(`http://127.0.0.1:${poort}`, { transports: ['websocket'] });
    const klok = setTimeout(() => (s.close(), reject(new Error(`geen pakket binnen ${ms} ms`))), ms);
    s.on('connect', () => s.emit('gebied', wens));
    s.on('flights', (vl, info) => {
      if (info?.gebied?.km !== verwacht) return; // nog het startgebied
      clearTimeout(klok);
      s.close();
      resolve({ vl, info });
    });
  });
}

// afstand in km over de aarde
const afstand = (lat1, lon1, lat2, lon2) => {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
};

async function serverTests(check) {
  const NEP = `http://127.0.0.1:${NEP_POORT}`;
  const bronnen = await nepBronnen(NEP_POORT);
  const server = await radarServer(LOS_POORT, [], {
    ADSBLOL_API_URL: NEP,
    OPENSKY_API_URL: `${NEP}/api`,
    OPENSKY_TOKEN_URL: `${NEP}/token`,
    OPENSKY_CLIENT_ID: 'test',
    OPENSKY_CLIENT_SECRET: 'test',
  });
  try {
    const vakken = async () => (await (await fetch(`${NEP}/log`)).json()).filter((x) => x.pad === '/api/states/all');
    const params = (zoek) => Object.fromEntries(new URLSearchParams(zoek));

    const groot = await vraag(LOS_POORT, { lat: 52.13, lon: 5.29, km: 3000 });
    const v1 = params((await vakken()).at(-1).zoek);
    check('3000 km: de server neemt hem aan (was max 1000)', groot.info.gebied.km === 3000, JSON.stringify(groot.info.gebied));
    check('3000 km rond nederland: een gewoon vak', Number(v1.lamin) > 24 && Number(v1.lamax) < 80 && Number(v1.lomin) > -180 && Number(v1.lomax) < 180, JSON.stringify(v1));

    const teVeel = await vraag(LOS_POORT, { lat: 40, lon: 5.29, km: 9000 }, 3000).catch(() => null);
    check('meer dan 3000 km wordt 3000', teVeel?.info.gebied.km === 3000, JSON.stringify(teVeel?.info.gebied));

    await vraag(LOS_POORT, { lat: 60, lon: 179, km: 500 });
    const v2 = params((await vakken()).at(-1).zoek);
    check('over de datumgrens: lengte van -180 tot 180', v2.lomin === '-180' && v2.lomax === '180', JSON.stringify(v2));

    await vraag(LOS_POORT, { lat: 80, lon: 10, km: 1500 });
    const v3 = params((await vakken()).at(-1).zoek);
    check('over de noordpool: tot 90 graden, elke lengte', v3.lamax === '90' && v3.lomin === '-180' && v3.lomax === '180', JSON.stringify(v3));

    const w = await vraag(LOS_POORT, { lat: 52.13, lon: 5.29, km: 250, wereld: true });
    const v4 = (await vakken()).at(-1);
    check('hele wereld: opensky zonder vak', v4.zoek === '', `zoek "${v4.zoek}"`);
    check('hele wereld: het pakket zegt straal 20050 en het eigen midden', w.info.gebied.km === WERELD_KM && w.info.gebied.lat === 52.13, JSON.stringify(w.info.gebied));
    check('hele wereld: ook een vliegtuig ver weg (boven afrika)', w.vl.some((p) => p[0] === 'bbb001' && p[6] === 10), `${w.vl.length} vliegtuigen`);
    check('hele wereld: in de log van de server', server.regels.some((r) => /hele wereld: \d+ vliegtuigen/.test(r)));

    // twee apps met een ander midden op de hele wereld delen één aanvraag
    const voor = (await vakken()).length;
    await Promise.all([
      vraag(LOS_POORT, { lat: 10, lon: 10, km: 250, wereld: true }),
      vraag(LOS_POORT, { lat: -30, lon: 100, km: 250, wereld: true }),
    ]);
    const erbij = (await vakken()).length - voor;
    check('hele wereld: twee apps met een ander midden delen het antwoord', erbij <= 1, `${erbij} aanvragen`);
  } finally {
    await server.stop();
    await bronnen.stop();
  }
}

async function nepTests(check) {
  // de nep-bron over de hele wereld en op 3000 km
  const server = await radarServer(LOS_POORT, ['--nep', '3000', '--elke', '5']);
  try {
    const w = await vraag(LOS_POORT, { lat: 52.13, lon: 5.29, km: 250, wereld: true });
    const lats = w.vl.map((p) => p[6]);
    const lons = w.vl.map((p) => p[5]);
    const west = lons.filter((x) => x < -90).length;
    const oost = lons.filter((x) => x > 90).length;
    check('nep-bron, hele wereld: over de hele aarde verspreid', west > 500 && oost > 500 && Math.max(...lats) <= 80.01 && Math.min(...lats) >= -80.01, `${west} ver west, ${oost} ver oost, breedte ${Math.min(...lats).toFixed(1)} tot ${Math.max(...lats).toFixed(1)}`);

    const g = await vraag(LOS_POORT, { lat: 52.13, lon: 5.29, km: 3000 });
    const verst = Math.max(...g.vl.map((p) => afstand(52.13, 5.29, p[6], p[5])));
    check('nep-bron, 3000 km: alles binnen de cirkel', verst <= 3000.5 && verst > 2500, `verste ${verst.toFixed(0)} km`);
  } finally {
    await server.stop();
  }
}

async function appTests(check, dist) {
  const server = await radarServer(SERVER_POORT, ['--nep', '10000', '--elke', '5']);
  const web = await preview(dist, APP_POORT);
  const b = await browser();
  const fouten = [];
  try {
    const page = await radarPagina(await b.newContext({ viewport: { width: 1440, height: 900 } }), `http://127.0.0.1:${APP_POORT}/?meten`, {
      minVliegtuigen: 9000,
      fouten,
    });
    const knop = page.getByRole('button', { name: 'Hele wereld', exact: true });
    const cirkels = () => page.evaluate(() => Object.values(window.__vliegtuigLaag.kaart._layers).filter((l) => typeof l.getRadius === 'function').length);
    const stand = () =>
      page.evaluate(() => ({
        zoom: window.__vliegtuigLaag.kaart.getZoom(),
        kop: document.querySelector('aside header p').textContent,
        schuif: Number(document.querySelector('input[type=range]').value),
        max: Number(document.querySelector('input[type=range]').max),
        totaal: window.__teller.totaal,
      }));

    const s0 = await stand();
    check('de schuif gaat tot 3000 km', s0.max === 3000, `max ${s0.max}`);

    // aan
    await knop.click();
    await page.waitForFunction(() => /hele wereld/.test(document.querySelector('aside header p').textContent) && !/laden/.test(document.querySelector('aside').textContent), null, { timeout: 20000 });
    await wacht(1500);
    const s1 = await stand();
    check('hele wereld: de knop staat aan', (await knop.getAttribute('aria-pressed')) === 'true');
    check('hele wereld: in de kop van het paneel', /hele wereld/.test(s1.kop), s1.kop);
    check('hele wereld: geen cirkel op de kaart', (await cirkels()) === 0);
    check('hele wereld: de kaart zoomt uit', s1.zoom <= 3, `zoom ${s1.zoom}`);
    const verspreid = await page.evaluate(() => {
      const s = [...window.__vliegtuigLaag.sporen.values()];
      // bx: de wereldpositie op zoom 0 (256 breed, lengte -180 = 0). onder 64 = verder west dan 90 graden west
      return { totaal: s.length, west: s.filter((x) => ((x.bx % 256) + 256) % 256 < 64).length };
    });
    check('hele wereld: de vliegtuigen van de hele aarde in de laag', verspreid.totaal >= 9000 && verspreid.west > 1000, `${verspreid.totaal}, ${verspreid.west} ver west`);
    const p1 = await page.evaluate(() => ({ puntjes: window.__teller.puntjes, zichtbaar: window.__teller.zichtbaar }));
    check('meer dan 5000 in beeld: puntjes in plaats van plaatjes', p1.puntjes === true, `${p1.zichtbaar} in beeld`);

    // vlot? beelden per seconde, terwijl de kaart een stukje schuift (dan tekent hij elk beeld opnieuw)
    const fps = await page.evaluate(async () => {
      const k = window.__vliegtuigLaag.kaart;
      let n = 0;
      let loopt = true;
      const tel = () => {
        n++;
        if (loopt) requestAnimationFrame(tel);
      };
      requestAnimationFrame(tel);
      const begin = performance.now();
      for (let i = 0; i < 20; i++) {
        k.panBy([i % 2 ? -40 : 40, 0], { animate: false });
        await new Promise((r) => setTimeout(r, 100));
      }
      loopt = false;
      return (n * 1000) / (performance.now() - begin);
    });
    check('hele wereld, 10.000 vliegtuigen: de kaart blijft vlot bij schuiven', fps >= 30, `${fps.toFixed(0)} beelden per seconde`);

    // de schuif: weer een cirkel
    await page.locator('input[type=range]').fill('500');
    await page.waitForFunction(() => !/hele wereld/.test(document.querySelector('aside header p').textContent), null, { timeout: 5000 });
    await wacht(1500);
    check('schuiven: de hele wereld gaat uit', (await knop.getAttribute('aria-pressed')) === 'false');
    check('schuiven: de cirkel is terug', (await cirkels()) === 1);
    const s2 = await stand();
    check('schuiven: de kaart zoomt weer in op de cirkel', s2.zoom > s1.zoom, `zoom ${s1.zoom} -> ${s2.zoom}`);
    await page.evaluate(() => window.__vliegtuigLaag.kaart.setZoom(9, { animate: false })); // ingezoomd: minder dan 5000 in beeld
    await wacht(500);
    const p2 = await page.evaluate(() => ({ puntjes: window.__teller.puntjes, zichtbaar: window.__teller.zichtbaar }));
    check('ingezoomd: weer plaatjes', p2.puntjes === false && p2.zichtbaar < 5000, `${p2.zichtbaar} in beeld`);

    // adsb.lol: de hele wereld kan daar niet, dan naar OpenSky (met de nep-bron wisselt alleen het paneel)
    await page.locator('[aria-label="Bron van de posities"] button', { hasText: 'adsb.lol' }).click();
    await wacht(800);
    await knop.click();
    await wacht(800);
    const bron = await page.locator('[aria-label="Bron van de posities"] button[aria-pressed="true"]').textContent();
    check('hele wereld bij adsb.lol: terug naar OpenSky, met uitleg', bron === 'OpenSky' && (await page.locator('aside', { hasText: 'De hele wereld kan alleen met OpenSky' }).count()) === 1, `bron ${bron}`);
    await page.locator('[aria-label="Bron van de posities"] button', { hasText: 'adsb.lol' }).click();
    await wacht(800);
    check('adsb.lol kiezen zet de hele wereld uit', (await knop.getAttribute('aria-pressed')) === 'false' && (await stand()).schuif <= 450);
    await page.locator('[aria-label="Bron van de posities"] button', { hasText: 'OpenSky' }).click();

    // scrollbalk: het zijpaneel en de lijst hebben de klasse, en chrome gebruikt de eigen balk (8 px)
    const balk = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      return { klasse: aside.classList.contains('radar-scroll'), breedte: getComputedStyle(aside, '::-webkit-scrollbar').width, lijst: document.querySelectorAll('aside .radar-scroll').length };
    });
    check('scrollbalk: zijpaneel en de lijst "Meest verdacht" in de stijl van de radar', balk.klasse && balk.lijst === 1 && balk.breedte === '8px', JSON.stringify(balk));

    check('wereld: geen fouten in de pagina', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally {
    await b.close();
    await web.stop();
    await server.stop();
  }
}

export default async function wereldTests(check, { dist } = {}) {
  await serverTests(check);
  await nepTests(check);
  dist ??= bouw('app-test', `http://127.0.0.1:${SERVER_POORT}`);
  await appTests(check, dist);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check, telling } = uitslag();
  await wereldTests(check);
  console.log(`\n${telling.goed} goed, ${telling.fout} fout`);
  process.exit(telling.fout ? 1 : 0);
}
