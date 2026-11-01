// kaarttests (testlijst T2-T8 en T10-T13 van fase 7) tegen een build met de nep-bron: 1000 vliegtuigen, elke 5 s een pakket.
// T1 is de meting (npm run meten), T9 de echte opensky (npm run check:opensky), T14 staat in tests/server.mjs.
// T15 (tab 5 min op de achtergrond) kan hier niet: bevriezen doet niets in de headless chromium, dat test je zelf.
// los te draaien met: node tests/kaart.mjs
import { pathToFileURL } from 'node:url';
import { bouw, browser, preview, radarPagina, radarServer, uitslag, wacht } from './hulp.mjs';

export const SERVER_POORT = 3101; // de nep-server, dit adres komt in de build
export const APP_POORT = 5191;
const NEP = ['--nep', '1000', '--elke', '5'];

// hulpjes in de pagina (alleen met ?meten zet de app de laag op window.__vliegtuigLaag)
const HULPJES = `
window.__t = {
  laag: () => window.__vliegtuigLaag,
  kaart: () => window.__vliegtuigLaag.kaart,
  scherm(id, op) {
    const k = this.kaart();
    const p = this.laag().positieVan(id, op);
    if (!p) return null;
    const c = k.latLngToContainerPoint(p);
    const r = k.getContainer().getBoundingClientRect();
    return { x: r.left + c.x, y: r.top + c.y };
  },
  // hoe ondoorzichtig het canvas is op de plek waar dit vliegtuig het laatst getekend is
  getekend(id) {
    const l = this.laag();
    const s = this.scherm(id, l.laatsteTekenTijd);
    const v = l.vlak, cr = v.getBoundingClientRect();
    const fx = v.width / cr.width, fy = v.height / cr.height;
    const d = v.getContext('2d').getImageData(Math.round((s.x - cr.left) * fx) - 3, Math.round((s.y - cr.top) * fy) - 3, 7, 7).data;
    let max = 0;
    for (let i = 3; i < d.length; i += 4) max = Math.max(max, d[i]);
    return max;
  },
  // een bewegend vliegtuig in beeld, niet te dicht bij de rand of een ander vliegtuig
  kiesVliegtuig(niveau) {
    const k = this.kaart(), l = this.laag();
    const r = k.getContainer().getBoundingClientRect();
    const pos = [...l.sporen.values()].filter((s) => s.v > 0 && !s.oud && (niveau === undefined || s.niveau === niveau)).map((s) => ({ s, p: this.scherm(s.id) }));
    for (const { s, p } of pos) {
      if (p.x < r.left + 150 || p.x > r.right - 150 || p.y < r.top + 150 || p.y > r.bottom - 150) continue;
      if (pos.some((o) => o.s !== s && Math.hypot(o.p.x - p.x, o.p.y - p.y) < 30)) continue;
      return s.id;
    }
    return null;
  },
  popup() {
    return Object.values(this.kaart()._layers).find((l) => l._container?.classList?.contains('leaflet-popup') && l.isOpen?.());
  },
  cirkel() {
    return Object.values(this.kaart()._layers).find((l) => typeof l.getRadius === 'function');
  },
  // de rand van de cirkel aan de oostkant, in schermpixels
  rand() {
    const k = this.kaart(), c = this.cirkel(), m = c.getLatLng();
    const p = k.latLngToContainerPoint([m.lat, m.lng + c.getRadius() / (111320 * Math.cos((m.lat * Math.PI) / 180))]);
    const r = k.getContainer().getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y, lat: m.lat, lng: m.lng, kaart: k.getCenter(), zoom: k.getZoom() };
  },
};`;

export default async function kaartTests(check, { dist } = {}) {
  dist ??= bouw('app-test', `http://127.0.0.1:${SERVER_POORT}`);
  let server = await radarServer(SERVER_POORT, NEP);
  const web = await preview(dist, APP_POORT);
  const b = await browser();
  const fouten = [];
  const URL = `http://127.0.0.1:${APP_POORT}/?meten`;
  const nepRegels = () => server.regels.filter((r) => / nep \d+ km/.test(r)).length;
  try {
    const context = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await radarPagina(context, URL, { minVliegtuigen: 900, fouten });
    await page.addScriptTag({ content: HULPJES });
    const t = (fn, arg) => page.evaluate(fn, arg);
    const zet = (midden, zoom) => t(([m, z]) => window.__t.kaart().setView(m, z, { animate: false }), [midden, zoom]);

    // T6: filter
    {
      const knop = page.locator('aside ul button', { hasText: '1 reden' }).first();
      const aantal = Number((await knop.textContent()).match(/(\d+)\s*$/)[1]);
      await knop.click();
      await wacht(800);
      const z1 = await t(() => window.__teller.zichtbaar);
      await knop.click();
      await wacht(800);
      const z2 = await t(() => ({ z: window.__teller.zichtbaar, tot: window.__teller.totaal }));
      check('T6 filter "1 reden": alleen die vliegtuigen getekend', z1 === aantal, `${z1} getekend, paneel zegt ${aantal}`);
      check('T6 filter eraf: alles weer getekend', z2.z === z2.tot, `${z2.z} van ${z2.tot}`);
    }

    // T2: culling bij Schiphol
    {
      await zet([52.31, 4.76], 12);
      await wacht(1500);
      const z = await t(() => ({ z: window.__teller.zichtbaar, tot: window.__teller.totaal }));
      check('T2 ingezoomd op Schiphol: maar een klein deel getekend', z.z < z.tot * 0.05, `${z.z} van ${z.tot}`);
    }

    // T3: uit beeld en terug
    {
      await zet([52.13, 5.29], 10);
      await wacht(1000);
      const id = await t(() => window.__t.kiesVliegtuig());
      await zet([52.13, 9.5], 10);
      await wacht(4000);
      await zet([52.13, 5.29], 10);
      await wacht(700);
      const alpha = await t((id) => window.__t.getekend(id), id);
      check('T3 vliegtuig uit beeld en terug: getekend op zijn berekende plek', alpha > 100, `${id}, alpha ${alpha}`);
    }

    // T4: klikken op de kaart, popup vliegt mee
    {
      const id = await t(() => window.__t.kiesVliegtuig(0));
      const p = await t((id) => window.__t.scherm(id), id);
      await page.mouse.click(p.x, p.y);
      await wacht(600);
      const inhoud = await page.locator('.leaflet-popup-content').textContent().catch(() => '');
      check('T4 klik op een vliegtuig: popup met zijn ICAO', inhoud.includes(id), id);
      await wacht(3000);
      const afstand = await t((id) => {
        const k = window.__t.kaart();
        const a = k.latLngToContainerPoint(window.__t.popup().getLatLng());
        const b = k.latLngToContainerPoint(window.__t.laag().positieVan(id, window.__t.laag().laatsteTekenTijd));
        return Math.hypot(a.x - b.x, a.y - b.y);
      }, id);
      check('T4 popup vliegt mee (3 s later)', afstand < 1, `${afstand.toFixed(3)} px naast het vliegtuig`);
      check('T4 witte ring: vliegtuig is gekozen', (await t(() => window.__t.laag().gekozenId)) === id);
      await page.keyboard.press('Escape');
      await wacht(300);
    }

    // T5: kiezen in de lijst, filter eraf
    {
      await page.locator('aside ul button', { hasText: 'Normaal' }).first().click();
      await wacht(300);
      const lijstKnop = page.locator('aside section', { hasText: 'Meest verdacht' }).locator('button').first();
      const callsign = (await lijstKnop.locator('span.font-semibold').first().textContent()).trim();
      await lijstKnop.click();
      await wacht(2500);
      const r = await t(() => {
        const k = window.__t.kaart();
        const p = k.latLngToContainerPoint(window.__t.laag().positieVan(window.__t.laag().gekozenId));
        const s = k.getSize();
        return {
          filterAan: document.querySelectorAll('aside ul button[aria-pressed="true"]').length > 0,
          popup: document.querySelector('.leaflet-popup-content')?.textContent ?? '',
          vanMidden: Math.hypot(p.x - s.x / 2, p.y - s.y / 2),
        };
      });
      check('T5 klik in de lijst: popup open', r.popup.includes(callsign), callsign);
      check('T5 filter op een ander niveau gaat eraf', !r.filterAan);
      check('T5 de kaart vliegt erheen', r.vanMidden < 60, `${r.vanMidden.toFixed(1)} px van het midden`);
      await page.keyboard.press('Escape');
    }

    // T7: geen sprong bij een update (zoom 10). onafgeronde schermposities: latLngToContainerPoint rondt af en gaf al √2 px.
    // meer dan ±200 px is bewust meteen goed gezet ('gesnapt'): de nep-bron zet een vliegtuig dat de cirkel uit vliegt aan de overkant terug
    {
      await zet([52.13, 5.29], 10);
      await wacht(1500);
      const r = await page.evaluate(async () => {
        const l = window.__vliegtuigLaag, k = l.kaart, z = k.getZoom();
        const reeks = [];
        let sporen = l.sporen, pakketten = 0, gesnapt = 0;
        const start = performance.now();
        while (performance.now() - start < 12000) {
          const nu = await new Promise(requestAnimationFrame);
          if (l.sporen !== sporen) {
            sporen = l.sporen;
            pakketten++;
            gesnapt += window.__teller.gesnapt;
          }
          const pos = {};
          for (const id of l.sporen.keys()) {
            const p = l.positieVan(id, nu);
            if (p) {
              const q = k.project(p, z);
              pos[id] = [q.x, q.y];
            }
          }
          reeks.push(pos);
        }
        let max = 0, gezet = 0;
        for (const id of new Set(reeks.flatMap((p) => Object.keys(p)))) {
          let m = 0;
          for (let i = 2; i < reeks.length; i++) {
            const a = reeks[i - 2][id], b = reeks[i - 1][id], c = reeks[i][id];
            if (a && b && c) m = Math.max(m, Math.hypot(c[0] - 2 * b[0] + a[0], c[1] - 2 * b[1] + a[1]));
          }
          if (m > 200) gezet++;
          else max = Math.max(max, m);
        }
        return { max, gezet, gesnapt, pakketten, beelden: reeks.length, correctie: window.__teller.correctieMediaanPx };
      });
      check('T7 update op zoom 10: correctie rechtdoor ±0 (mediaan)', r.correctie < 0.5, `mediaan ${r.correctie.toFixed(2)} px`);
      check('T7 geen sprong tussen twee beelden rond een pakket', r.pakketten >= 2 && r.max < 0.5, `grootste verandering van de stap ${r.max.toFixed(4)} px, ${r.pakketten} pakketten, ${r.beelden} beelden`);
      check('T7 grote sprongen alleen bij "meteen goed gezet"', r.gezet === r.gesnapt, `${r.gezet} in de beelden, ${r.gesnapt} volgens de laag`);
    }

    // T10 en T11: cirkel verslepen, Esc, dubbelklik elders
    {
      await zet([52.13, 5.29], 7);
      await wacht(800);
      const rand = await t(() => window.__t.rand());
      const regelsVoor = nepRegels();
      await page.mouse.move(rand.x, rand.y);
      await page.mouse.dblclick(rand.x, rand.y);
      await wacht(200);
      // binnenin drukken: de rand zelf is sinds fase 2 van het tweede plan de straal
      await page.mouse.move(rand.x - 60, rand.y);
      await page.mouse.down();
      for (let i = 1; i <= 20; i++) await page.mouse.move(rand.x - 60 - 6 * i, rand.y + 3 * i);
      await page.mouse.up();
      await wacht(400);
      const na = await t(() => window.__t.rand());
      await wacht(3000);
      check('T10 dubbelklik op de rand en slepen: cirkel verplaatst', Math.abs(na.lng - rand.lng) > 0.5, `${rand.lng.toFixed(2)} -> ${na.lng.toFixed(2)}`);
      check('T10 de kaart blijft staan', Math.abs(na.kaart.lat - rand.kaart.lat) < 1e-6 && Math.abs(na.kaart.lng - rand.kaart.lng) < 1e-6 && na.zoom === 7);
      check('T10 het nieuwe gebied wordt geladen', nepRegels() > regelsVoor, `${nepRegels() - regelsVoor} nieuwe aanvraag/aanvragen`);

      const rand2 = await t(() => window.__t.rand());
      await page.mouse.dblclick(rand2.x, rand2.y);
      await wacht(200);
      await page.mouse.move(rand2.x - 60, rand2.y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(rand2.x - 60 + 8 * i, rand2.y);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      await wacht(300);
      const terug = await t(() => window.__t.rand());
      check('T11 Esc tijdens slepen zet de cirkel terug', Math.abs(terug.lat - rand2.lat) < 1e-6 && Math.abs(terug.lng - rand2.lng) < 1e-6);

      const kr = await page.locator('.leaflet-container').boundingBox();
      const z0 = await t(() => window.__t.kaart().getZoom());
      await page.mouse.dblclick(kr.x + 120, kr.y + kr.height - 120);
      await wacht(800);
      const z1 = await t(() => window.__t.kaart().getZoom());
      check('T11 dubbelklik elders zoomt in', z1 === z0 + 1, `zoom ${z0} -> ${z1}`);
      // OUD: await page.locator('aside button', { hasText: 'Nederland' }).last().click();
      // (sinds de reden "vliegt Nederland in" raakte dat een vliegtuig in de lijst "Meest verdacht", niet de knop)
      await page.getByRole('button', { name: 'Nederland', exact: true }).click();
      await wacht(2500);
    }

    // T12: twee tabs, zelfde gebied, één aanvraag per interval
    {
      const tweede = await radarPagina(context, URL, { minVliegtuigen: 900, fouten });
      const voor = nepRegels();
      const alleVoor = server.regels.length;
      await wacht(15500);
      const regels = nepRegels() - voor;
      const erbij = server.regels.slice(alleVoor).join(' | ');
      check('T12 twee tabs met hetzelfde gebied: één aanvraag per interval', regels >= 2 && regels <= 4, `${regels} aanvragen in 15,5 s bij elke 5 s (twee los zou ±6 zijn)${regels > 4 ? `: ${erbij}` : ''}`);
      await tweede.close();
    }

    // T13: touch (nagebootst): dubbel tikken op de rand en doorschuiven
    {
      const touch = await b.newContext({ viewport: { width: 1000, height: 800 }, hasTouch: true });
      const tp = await radarPagina(touch, URL, { minVliegtuigen: 900, fouten });
      await tp.addScriptTag({ content: HULPJES });
      await tp.evaluate(() => window.__t.kaart().setView([52.13, 5.29], 7, { animate: false }));
      await wacht(800);
      const r = await tp.evaluate(() => window.__t.rand());
      const cdp = await touch.newCDPSession(tp);
      const raak = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
      await raak('touchStart', r.x, r.y);
      await raak('touchEnd');
      await wacht(120);
      await raak('touchStart', r.x, r.y);
      // langs de rand schuiven (de rand ligt hier oost van het midden, dus langs = omlaag): dat is verplaatsen.
      // van het midden af of ernaartoe is sinds fase 2 van het tweede plan de straal (tests/straal.mjs)
      for (let i = 1; i <= 15; i++) {
        await raak('touchMove', r.x - 2 * i, r.y + 8 * i);
        await wacht(16);
      }
      await raak('touchEnd');
      await wacht(500);
      const na = await tp.evaluate(() => window.__t.rand());
      // OUD: check('T13 …', Math.abs(na.lng - r.lng) > 0.5, …) (nu schuift de test langs de rand, vooral naar het zuiden)
      check(
        'T13 touch: dubbel tikken op de rand en langs de rand schuiven verplaatst de cirkel',
        Math.hypot(na.lat - r.lat, na.lng - r.lng) > 0.5,
        `${r.lat.toFixed(2)},${r.lng.toFixed(2)} -> ${na.lat.toFixed(2)},${na.lng.toFixed(2)}`,
      );
      check('T13 touch: de kaart blijft staan en zoomt niet', Math.abs(na.kaart.lng - r.kaart.lng) < 1e-6 && na.zoom === 7, `zoom ${na.zoom}`);
      await touch.close();
    }

    // T8: server uit: geen crash, melding, vliegtuigen stoppen na de horizon (60 s). daarna weer aan
    {
      await server.stop();
      await wacht(3000);
      const status = await t(() => document.querySelector('aside section')?.textContent ?? '');
      check('T8 server uit: paneel zegt "Geen verbinding"', /Geen verbinding/.test(status));
      await wacht(62000);
      const oud = await t(() => {
        const s = [...window.__t.laag().sporen.values()].filter((s) => s.v > 0);
        return { oud: s.filter((x) => x.oud).length, totaal: s.length };
      });
      check('T8 na de horizon (60 s) staan de vliegtuigen stil en half doorzichtig', oud.oud === oud.totaal, `${oud.oud} van ${oud.totaal}`);
      server = await radarServer(SERVER_POORT, NEP);
      await page.waitForFunction(() => /Live/.test(document.querySelector('aside section')?.textContent ?? ''), null, { timeout: 20000 });
      await wacht(3000);
      const weer = await t(() => [...window.__t.laag().sporen.values()].filter((s) => s.oud).length);
      check('T8 server weer aan: verbinding terug en vliegtuigen bewegen weer', weer === 0, `${weer} nog stil`);
    }

    check('kaart: geen fouten in de pagina', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally {
    await b.close();
    await web.stop();
    await server.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check, telling } = uitslag();
  await kaartTests(check);
  console.log(`\n${telling.goed} goed, ${telling.fout} fout`);
  process.exit(telling.fout ? 1 : 0);
}
