// de twee bugs uit fase 5 (opgelost op 31-10-2026):
//  1. dimmen en "Nieuw gebied laden…" verdwenen te vroeg als er na het loslaten nog een pakket van het oude gebied binnenkwam
//  2. een cirkel over de datumgrens stond op een andere kopie van de wereld dan de vliegtuigen
// de nep-server stuurt elke seconde een pakket, zodat er vaak een oud pakket binnenkomt in de 500 ms na het loslaten.
// los te draaien met: node tests/bugs.mjs
import { pathToFileURL } from 'node:url';
import { bouw, browser, preview, radarPagina, radarServer, uitslag, wacht } from './hulp.mjs';
import { APP_POORT, SERVER_POORT } from './kaart.mjs';

export default async function bugTests(check, { dist } = {}) {
  dist ??= bouw('app-test', `http://127.0.0.1:${SERVER_POORT}`);
  const server = await radarServer(SERVER_POORT, ['--nep', '1000', '--elke', '1']);
  const web = await preview(dist, APP_POORT);
  const b = await browser();
  const fouten = [];
  try {
    const page = await radarPagina(await b.newContext({ viewport: { width: 1440, height: 900 } }), `http://127.0.0.1:${APP_POORT}/?meten`, {
      minVliegtuigen: 900,
      fouten,
    });

    // de rand van de cirkel aan de oostkant, in schermpixels
    const cirkel = () =>
      page.evaluate(() => {
        const k = window.__vliegtuigLaag.kaart;
        const c = Object.values(k._layers).find((l) => typeof l.getRadius === 'function');
        const m = c.getLatLng();
        const oost = k.latLngToContainerPoint([m.lat, m.lng + c.getRadius() / (111320 * Math.cos((m.lat * Math.PI) / 180))]);
        const r = k.getContainer().getBoundingClientRect();
        return { x: r.left + oost.x, y: r.top + oost.y };
      });

    // cirkel slepen en vanaf het loslaten 3 s volgen: elk pakket (een nieuwe Map met sporen), "laden" in het paneel en het dimmen
    async function sleep(dx) {
      const r = await cirkel();
      await page.mouse.move(r.x, r.y);
      await page.mouse.dblclick(r.x, r.y);
      await wacht(150);
      // binnenin drukken: de rand zelf is sinds fase 2 van het tweede plan de straal
      await page.mouse.move(r.x - 60, r.y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(r.x - 60 + (dx * i) / 10, r.y);
      const volg = page.evaluate(async () => {
        const l = window.__vliegtuigLaag;
        const start = performance.now();
        let sporen = l.sporen;
        let pakketten = 0;
        const lijst = [];
        while (performance.now() - start < 3000) {
          await new Promise((r) => setTimeout(r, 20));
          if (l.sporen !== sporen) {
            sporen = l.sporen;
            pakketten++;
          }
          lijst.push({
            t: performance.now() - start,
            pakketten,
            laden: /Nieuw gebied laden/.test(document.querySelector('aside section')?.textContent ?? ''),
            dim: l.voorlopig !== null,
          });
        }
        return lijst;
      });
      await page.mouse.up();
      return volg;
    }

    // bug 1
    await page.evaluate(() => window.__vliegtuigLaag.kaart.setView([52.13, 5.29], 7, { animate: false }));
    await wacht(1500);
    let gevallen = 0;
    let teVroeg = 0;
    let eindGoed = 0;
    for (let i = 0; i < 6; i++) {
      const lijst = await sleep(i % 2 ? 110 : -110);
      // een pakket in de eerste 450 ms na het loslaten is nog van het oude gebied (de nieuwe aanvraag gaat pas na 500 ms weg)
      const oud = lijst.filter((x) => x.t < 450 && x.pakketten > 0);
      if (oud.length) {
        gevallen++;
        if (oud.some((x) => !x.laden || !x.dim)) teVroeg++;
      }
      const eind = lijst.at(-1);
      if (!eind.laden && !eind.dim) eindGoed++;
      await wacht(800);
    }
    check('bug 1: na een pakket van het oude gebied blijven "laden" en het dimmen staan', gevallen > 0 && teVroeg === 0, `${gevallen} van 6 keer een oud pakket, ${teVroeg} keer te vroeg weg`);
    check('bug 1: met de data van het nieuwe gebied zijn "laden" en het dimmen weg', eindGoed === 6, `${eindGoed} van 6`);

    // bug 2: cirkel over de datumgrens (midden 180,8: de vliegtuigen liggen aan beide kanten)
    await page.evaluate(() => window.__vliegtuigLaag.kaart.setView([50, 175], 5, { animate: false }));
    await wacht(500);
    await page.locator('aside button', { hasText: 'Midden van de kaart' }).click();
    await wacht(3000);
    const dx = await page.evaluate(() => {
      const k = window.__vliegtuigLaag.kaart;
      const m = Object.values(k._layers).find((l) => typeof l.getRadius === 'function').getLatLng();
      return k.latLngToContainerPoint([m.lat, 180.8]).x - k.latLngToContainerPoint(m).x;
    });
    await sleep(dx);
    await wacht(2500);
    const r2 = await page.evaluate(() => {
      const l = window.__vliegtuigLaag, k = l.kaart;
      const c = Object.values(k._layers).find((x) => typeof x.getRadius === 'function');
      const m = c.getLatLng(), mw = k.project(m, 0);
      const straal = (c.getRadius() * 256) / (2 * Math.PI * 6378137 * Math.cos((m.lat * Math.PI) / 180));
      const s = [...l.sporen.values()];
      const lon = s.map((x) => k.unproject([x.x, x.y], 0).lng);
      return {
        midden: m.lng,
        totaal: s.length,
        binnen: s.filter((x) => Math.hypot(x.x - mw.x, x.y - mw.y) <= straal * 1.15).length,
        oost: lon.filter((x) => x > 180).length,
        west: lon.filter((x) => x <= 180).length,
      };
    });
    check('bug 2: cirkel staat voorbij de datumgrens', r2.midden > 180, `midden ${r2.midden.toFixed(2)}`);
    check('bug 2: alle vliegtuigen in de cirkel (zelfde kopie van de wereld)', r2.totaal > 900 && r2.binnen === r2.totaal, `${r2.binnen} van ${r2.totaal}; ${r2.west} links en ${r2.oost} rechts van 180`);

    // klikken voorbij de grens: eerst inzoomen, anders staan ze te dicht op elkaar
    await page.evaluate(() => {
      const k = window.__vliegtuigLaag.kaart;
      k.setView([k.getCenter().lat, 181.5], 10, { animate: false });
    });
    await wacht(1200);
    const klik = await page.evaluate(() => {
      const l = window.__vliegtuigLaag, k = l.kaart;
      const r = k.getContainer().getBoundingClientRect();
      const alle = [...l.sporen.values()].map((s) => ({ s, p: k.latLngToContainerPoint(l.positieVan(s.id)) }));
      const keus = alle.find(
        ({ s, p }) =>
          k.unproject([s.x, s.y], 0).lng > 180.5 &&
          p.x > 60 && p.y > 60 && p.x < r.width - 60 && p.y < r.height - 60 &&
          !alle.some((o) => o.s !== s && Math.hypot(o.p.x - p.x, o.p.y - p.y) < 30),
      );
      return keus ? { id: keus.s.id, x: r.left + keus.p.x, y: r.top + keus.p.y } : null;
    });
    if (klik) {
      await page.mouse.click(klik.x, klik.y);
      await wacht(800);
      const inhoud = await page.locator('.leaflet-popup-content').textContent().catch(() => '');
      check('bug 2: klik op een vliegtuig voorbij de grens opent zijn popup', inhoud.includes(klik.id), klik.id);
    } else check('bug 2: vliegtuig voorbij de grens gevonden om op te klikken', false);

    check('bugs: geen fouten in de pagina', fouten.length === 0, fouten.slice(0, 2).join(' | '));
  } finally {
    await b.close();
    await web.stop();
    await server.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check, telling } = uitslag();
  await bugTests(check);
  console.log(`\n${telling.goed} goed, ${telling.fout} fout`);
  process.exit(telling.fout ? 1 : 0);
}
