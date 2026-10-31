// sporen achter de vliegtuigen (fase 4 van het tweede plan, testlijst M10-M13), met de nep-bron.
// los te draaien met: node tests/sporen.mjs
import { pathToFileURL } from 'node:url';
import { bouw, browser, preview, radarPagina, radarServer, uitslag, wacht } from './hulp.mjs';
import { APP_POORT, SERVER_POORT } from './kaart.mjs';

export default async function sporenTests(check, { dist } = {}) {
  dist ??= bouw('app-test', `http://127.0.0.1:${SERVER_POORT}`);
  let server = await radarServer(SERVER_POORT, ['--nep', '1000', '--elke', '5']);
  const web = await preview(dist, APP_POORT);
  const b = await browser();
  const fouten = [];
  try {
    const context = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await radarPagina(context, `http://127.0.0.1:${APP_POORT}/?meten`, { minVliegtuigen: 900, fouten });
    const t = (fn, arg) => page.evaluate(fn, arg);
    const stand = () =>
      t(() => {
        const l = window.__vliegtuigLaag;
        const s = [...l.sporen.values()];
        const v = l.spoorVlak;
        const d = v.getContext('2d').getImageData(0, 0, v.width, v.height).data;
        let pixels = 0;
        for (let i = 3; i < d.length; i += 16) if (d[i] > 0) pixels++; //! elke 4e pixel is genoeg om te zien of er iets staat
        const nu = performance.now();
        return {
          getekend: window.__teller.sporenGetekend,
          pixels,
          maxPunten: Math.max(...s.map((x) => x.pad.length / 3)),
          oudsteS: Math.max(...s.filter((x) => x.pad.length).map((x) => (nu - x.pad[2]) / 1000)),
          metSpoor: s.filter((x) => x.pad.length >= 9).length,
          zoom: l.kaart.getZoom(),
        };
      });
    const zet = (zoom) => t((z) => window.__vliegtuigLaag.kaart.setView([52.13, 5.29], z, { animate: false }), zoom);

    // M10: ingezoomd sporen, na een paar punten
    await zet(10);
    await wacht(9000);
    const z10 = await stand();
    check('M10 ingezoomd (zoom 10): sporen achter de vliegtuigen in beeld', z10.getekend > 10 && z10.pixels > 200, `${z10.getekend} sporen, ${z10.pixels} pixels`);
    check('M10 elk vliegtuig houdt een spoor bij (ook buiten beeld)', z10.metSpoor > 900, `${z10.metSpoor} met 3 of meer punten`);

    // uitgezoomd: geen sporen, behalve het gekozen vliegtuig
    await zet(7);
    await wacht(1200);
    const z7 = await stand();
    check('M10 uitgezoomd (zoom 7): geen sporen', z7.getekend === 0 && z7.pixels === 0, `${z7.getekend} sporen, ${z7.pixels} pixels`);
    await page.locator('aside section', { hasText: 'Meest verdacht' }).locator('button').first().click();
    await wacht(2500);
    await zet(7);
    await wacht(1200);
    const gekozen = await stand();
    check('M10 uitgezoomd: wel het spoor van het gekozen vliegtuig', gekozen.getekend === 1 && gekozen.pixels > 0, `${gekozen.getekend} spoor`);

    // M13: de afgelegde route (nep): komt vanzelf bij het kiezen (eerst was er een knop "Hele vlucht"), weg bij een ander vliegtuig
    // OUD: knop "Hele vlucht" zoeken en aanklikken
    const vl = await t(() => ({ pad: window.__vliegtuigLaag.vluchtPad?.punten.length ?? 0, tekst: document.querySelector('.leaflet-popup-content')?.textContent ?? '' }));
    check('M13 kiezen toont meteen de afgelegde route', vl.pad === 62 && /Afgelegde route \(nep\), 31 punten/.test(vl.tekst), `${vl.pad / 2} punten, "${vl.tekst.match(/Afgelegde route[^A-Z]*/)?.[0] ?? ''}"`);
    check('M13 geen knop meer nodig', (await page.locator('.leaflet-popup-content button', { hasText: 'Hele vlucht' }).count()) === 0);
    // een ander vliegtuig kiezen (Esc werkt hier niet: de focus staat in de popup, niet op de kaart)
    const eerste = await t(() => window.__vliegtuigLaag.gekozenId);
    await page.locator('aside section', { hasText: 'Meest verdacht' }).locator('button').nth(1).click();
    await wacht(1500);
    // OUD: check('M13 ander vliegtuig gekozen: de vlucht is weg', vluchtPad === null) (toen kwam de route alleen met de knop)
    const wissel = await t(() => ({ gekozen: window.__vliegtuigLaag.gekozenId, route: window.__vliegtuigLaag.vluchtPad?.id ?? null }));
    check('M13 ander vliegtuig gekozen: de route is nu van dat vliegtuig', wissel.gekozen !== eerste && wissel.route === wissel.gekozen, `${eerste} -> ${wissel.gekozen}, route van ${wissel.route}`);

    // filter: alleen militair -> alleen hun sporen
    await zet(10);
    await page.locator('aside section', { has: page.locator('h2', { hasText: /^Militair$/ }) }).locator('button', { hasText: 'Alleen militair' }).click();
    await wacht(1200);
    const mil = await stand();
    const milInBeeld = await t(() => window.__teller.zichtbaar);
    check('het filter geldt ook voor de sporen', mil.getekend === milInBeeld, `${mil.getekend} sporen, ${milInBeeld} militair in beeld`);
    await page.locator('aside section', { has: page.locator('h2', { hasText: /^Militair$/ }) }).locator('button', { hasText: 'Alleen militair' }).click();

    // schakelaar uit: niets meer, en onthouden na herladen
    const schakelaar = page.locator('aside section', { has: page.locator('h2', { hasText: /^Sporen$/ }) }).locator('button');
    await schakelaar.click();
    await wacht(800);
    const uit = await stand();
    check('schakelaar "Sporen" uit: geen sporen meer', uit.getekend === 0 && uit.pixels === 0 && uit.maxPunten === 0, `${uit.getekend} sporen, ${uit.maxPunten} punten`);
    await page.reload();
    await page.waitForFunction(() => window.__vliegtuigLaag && (window.__teller?.totaal ?? 0) > 900, null, { timeout: 30000 });
    check('schakelaar onthouden na herladen', (await schakelaar.textContent()) === 'Uit');
    await schakelaar.click();
    await zet(10);

    // M10: hoogstens 30 punten en een minuut terug (na ruim een minuut)
    await wacht(66000);
    const lang = await stand();
    // opruimen gebeurt bij elk nieuw punt (elke ±2 s), dus bewaard kan iets ouder zijn dan 60 s. getekend wordt het niet
    check('na ruim een minuut: hoogstens 30 punten en ±60 s per spoor', lang.maxPunten <= 30 && lang.oudsteS <= 65, `${lang.maxPunten} punten, oudste ${lang.oudsteS.toFixed(1)} s`);
    check('sporen: geen fouten in de pagina', fouten.length === 0, fouten.slice(0, 3).join(' | '));
    await context.close();

    // M11: 5000 vliegtuigen, ingezoomd met sporen: pannen blijft soepel
    await server.stop();
    server = await radarServer(SERVER_POORT, ['--nep', '5000', '--elke', '10']);
    const p2 = await radarPagina(await b.newContext({ viewport: { width: 1440, height: 900 } }), `http://127.0.0.1:${APP_POORT}/?meten`, { minVliegtuigen: 4900, fouten });
    await p2.evaluate(() => window.__vliegtuigLaag.kaart.setView([52.13, 5.29], 8, { animate: false }));
    await wacht(12000); // sporen opbouwen
    const kr = await p2.locator('.leaflet-container').boundingBox();
    const mx = kr.x + kr.width / 2;
    const my = kr.y + kr.height / 2;
    await p2.evaluate(() => {
      window.__beelden = [];
      const lus = (tijd) => {
        window.__beelden.push(tijd);
        requestAnimationFrame(lus);
      };
      requestAnimationFrame(lus);
    });
    await p2.mouse.move(mx + 150, my);
    await p2.mouse.down();
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      const hoek = ((Date.now() - t0) / 6000) * 2 * Math.PI;
      await p2.mouse.move(mx + 150 * Math.cos(hoek), my + 150 * Math.sin(hoek));
      await wacht(16);
    }
    await p2.mouse.up();
    const perf = await p2.evaluate(() => {
      const b = window.__beelden;
      return { fps: ((b.length - 1) * 1000) / (b.at(-1) - b[0]), sporen: window.__teller.sporenGetekend, ms: window.__teller.spoorMs };
    });
    check('M11 5000 vliegtuigen, zoom 8, sporen aan: pannen ≥ 55 fps', perf.fps >= 55, `${perf.fps.toFixed(1)} fps, ${perf.sporen} sporen, ${perf.ms.toFixed(1)} ms per tekenbeurt van de sporen`);
    // en in rust (de sporen tekenen dan wel, 2× per seconde of minder vaak als het veel kost)
    const rust = await p2.evaluate(async () => {
      const start = window.__beelden.length;
      const t0 = performance.now();
      await new Promise((r) => setTimeout(r, 5000));
      return ((window.__beelden.length - start) * 1000) / (performance.now() - t0);
    });
    check('M11 5000 vliegtuigen, zoom 8, sporen aan: in rust ≥ 55 fps', rust >= 55, `${rust.toFixed(1)} fps`);
  } finally {
    await b.close();
    await web.stop();
    await server.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check, telling } = uitslag();
  await sporenTests(check);
  console.log(`\n${telling.goed} goed, ${telling.fout} fout`);
  process.exit(telling.fout ? 1 : 0);
}
