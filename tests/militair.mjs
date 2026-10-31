// militaire herkenning in de app (fase 1 van het tweede plan), met de nep-bron: van de 1000 nep-vliegtuigen is elk 97e militair (11 stuks).
// teller, filter (ook samen met een niveau), de lijst, de popup, kiezen met het filter aan, en of op de kaart echt de militaire vorm staat.
// los te draaien met: node tests/militair.mjs
import { pathToFileURL } from 'node:url';
import { bouw, browser, preview, radarPagina, radarServer, uitslag, wacht } from './hulp.mjs';
import { APP_POORT, SERVER_POORT } from './kaart.mjs';

const MILITAIR = 11; // nep-vliegtuig 0, 97, 194 … 970

export default async function militairTests(check, { dist } = {}) {
  dist ??= bouw('app-test', `http://127.0.0.1:${SERVER_POORT}`);
  const server = await radarServer(SERVER_POORT, ['--nep', '1000', '--elke', '5']);
  const web = await preview(dist, APP_POORT);
  const b = await browser();
  const fouten = [];
  try {
    const page = await radarPagina(await b.newContext({ viewport: { width: 1440, height: 900 } }), `http://127.0.0.1:${APP_POORT}/?meten`, {
      minVliegtuigen: 900,
      fouten,
    });
    const t = (fn, arg) => page.evaluate(fn, arg);
    const telling = () =>
      t(() => {
        const s = [...window.__vliegtuigLaag.sporen.values()];
        return { militair: s.filter((x) => x.militair).length, zichtbaar: window.__teller.zichtbaar, totaal: window.__teller.totaal };
      });
    const militairSectie = page.locator('aside section', { has: page.locator('h2', { hasText: /^Militair$/ }) });

    // teller en laag
    const tegel = Number(await page.locator('aside section').first().locator('div', { hasText: 'Militair' }).locator('p').nth(1).textContent());
    const st = await telling();
    check('teller "Militair" in het paneel', tegel === MILITAIR, `${tegel}`);
    check('de laag kent dezelfde militaire toestellen', st.militair === MILITAIR, `${st.militair}`);
    const lijst = await militairSectie.locator('li').count();
    check('lijst "Militair" toont ze allemaal', lijst === MILITAIR, `${lijst} in de lijst`);

    // filter "alleen militair"
    const knop = militairSectie.locator('button', { hasText: 'Alleen militair' });
    await knop.click();
    await wacht(800);
    const f1 = await telling();
    check('filter "Alleen militair": alleen die getekend', f1.zichtbaar === MILITAIR, `${f1.zichtbaar} getekend`);
    check('filterknop staat aan', (await knop.getAttribute('aria-pressed')) === 'true');

    // samen met een niveau: alleen militair én dat niveau
    const metNiveau = await t(() => {
      const s = [...window.__vliegtuigLaag.sporen.values()].filter((x) => x.militair);
      const tel = [0, 0, 0, 0, 0];
      for (const x of s) tel[x.niveau]++;
      const niveau = tel.findIndex((n, i) => i > 0 && n > 0);
      return { niveau, aantal: tel[niveau] };
    });
    const namen = ['Normaal', '1 reden', '2 redenen', '3 redenen', '4+ redenen'];
    await page.locator('aside ul button', { hasText: namen[metNiveau.niveau] }).first().click();
    await wacht(800);
    const f2 = await telling();
    check('filter militair + niveau samen', f2.zichtbaar === metNiveau.aantal, `${f2.zichtbaar} getekend, verwacht ${metNiveau.aantal} (${namen[metNiveau.niveau]})`);
    await page.locator('aside button', { hasText: 'Toon alles' }).click();
    await knop.click(); // "alleen militair" weer uit
    await wacht(500);
    const f3 = await telling();
    check('beide filters uit: alles weer getekend', f3.zichtbaar === f3.totaal, `${f3.zichtbaar} van ${f3.totaal}`);

    // kiezen in de lijst: popup met "militair" en type
    await militairSectie.locator('li button').first().click();
    await wacht(2000);
    const popup = (await page.locator('.leaflet-popup-content').textContent().catch(() => '')) ?? '';
    check('popup van een militair toestel zegt "militair" en het type', /militair/i.test(popup) && /(C17|A400|F16|K35R|C30J|NH90)/.test(popup) && /NEP-\d{4}/.test(popup), popup.slice(0, 60));
    await page.keyboard.press('Escape');

    // filter aan en een gewoon toestel kiezen in "Meest verdacht": het filter gaat eraf, anders staat hij niet op de kaart
    await knop.click();
    await wacht(300);
    check('filter weer aan', (await knop.getAttribute('aria-pressed')) === 'true');
    const gewoon = page.locator('aside section', { hasText: 'Meest verdacht' }).locator('button').first();
    await gewoon.click();
    await wacht(1500);
    check('kiezen van een gewoon toestel zet "alleen militair" uit', (await knop.getAttribute('aria-pressed')) === 'false');
    check('en zijn popup staat open', (await page.locator('.leaflet-popup-content').count()) === 1);
    await page.keyboard.press('Escape');

    // de vorm op de kaart: tel de pixels van een vliegtuig op het canvas en vergelijk met beide vormen in de atlas (zelfde niveau en hoek).
    // ingezoomd, zodat er niets anders in het blokje staat
    const vorm = async (militair) => {
      const id = await t((m) => [...window.__vliegtuigLaag.sporen.values()].find((s) => s.militair === m && !s.oud)?.id, militair);
      await t((id) => {
        const l = window.__vliegtuigLaag;
        l.kaart.setView(l.positieVan(id), 13, { animate: false });
      }, id);
      await wacht(1200);
      return t((id) => {
        const l = window.__vliegtuigLaag, k = l.kaart;
        const s = l.sporen.get(id);
        const p = k.latLngToContainerPoint(l.positieVan(id, l.laatsteTekenTijd));
        const v = l.vlak, cr = v.getBoundingClientRect(), kr = k.getContainer().getBoundingClientRect();
        const f = v.width / cr.width;
        const cel = l.atlas.cel;
        const x = Math.round((kr.left + p.x - cr.left) * f - cel / 2), y = Math.round((kr.top + p.y - cr.top) * f - cel / 2);
        const tel = (data) => {
          let n = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 128) n++;
          return n;
        };
        const opKaart = tel(v.getContext('2d').getImageData(x, y, cel, cel).data);
        const atlas = l.atlas.beeld.getContext('2d');
        const cell = (vorm) => tel(atlas.getImageData((s.hoek % 12) * cel, ((vorm * 5 + s.niveau) * 6 + Math.floor(s.hoek / 12)) * cel, cel, cel).data);
        return { opKaart, gewoon: cell(0), militair: cell(1) };
      }, id);
    };
    const m = await vorm(true);
    const g = await vorm(false);
    check('militair toestel heeft op de kaart de militaire vorm', Math.abs(m.opKaart - m.militair) < Math.abs(m.opKaart - m.gewoon), `pixels ${m.opKaart}, militaire vorm ${m.militair}, gewone ${m.gewoon}`);
    check('gewoon toestel heeft de gewone vorm', Math.abs(g.opKaart - g.gewoon) < Math.abs(g.opKaart - g.militair), `pixels ${g.opKaart}, gewone vorm ${g.gewoon}, militaire ${g.militair}`);

    check('militair: geen fouten in de pagina', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally {
    await b.close();
    await web.stop();
    await server.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check, telling } = uitslag();
  await militairTests(check);
  console.log(`\n${telling.goed} goed, ${telling.fout} fout`);
  process.exit(telling.fout ? 1 : 0);
}
