// de straal slepen aan de rand (fase 2 van het tweede plan, testlijst M5-M7 en touch), met de nep-bron.
// los te draaien met: node tests/straal.mjs
import { pathToFileURL } from 'node:url';
import { bouw, browser, preview, radarPagina, radarServer, uitslag, wacht } from './hulp.mjs';
import { APP_POORT, SERVER_POORT } from './kaart.mjs';

// hulpjes in de pagina: de cirkel, zijn rand aan de oostkant in schermpixels, en de kaart
const HULPJES = `
window.__s = {
  kaart: () => window.__vliegtuigLaag.kaart,
  cirkel() {
    return Object.values(this.kaart()._layers).find((l) => typeof l.getRadius === 'function');
  },
  stand() {
    const k = this.kaart(), c = this.cirkel(), m = c.getLatLng();
    const oost = k.latLngToContainerPoint([m.lat, m.lng + c.getRadius() / (111320 * Math.cos((m.lat * Math.PI) / 180))]);
    const mid = k.latLngToContainerPoint(m);
    const r = k.getContainer().getBoundingClientRect();
    return {
      x: r.left + oost.x, y: r.top + oost.y, mx: r.left + mid.x, my: r.top + mid.y,
      km: c.getRadius() / 1000, lat: m.lat, lng: m.lng,
      kaart: k.getCenter(), zoom: k.getZoom(),
      schuif: Number(document.querySelector('input[type=range]').value),
      max: Number(document.querySelector('input[type=range]').max),
      klassen: k.getContainer().className,
      label: [...document.querySelectorAll('.leaflet-tooltip.radar-hint')].map((t) => t.textContent).join(' | '),
      voorlopig: window.__vliegtuigLaag.voorlopig,
    };
  },
};`;

export default async function straalTests(check, { dist } = {}) {
  dist ??= bouw('app-test', `http://127.0.0.1:${SERVER_POORT}`);
  const server = await radarServer(SERVER_POORT, ['--nep', '1000', '--elke', '5']);
  const web = await preview(dist, APP_POORT);
  const b = await browser();
  const fouten = [];
  // de straal van de laatste aanvraag bij de server ("nep 350 km: …"), en hoeveel aanvragen er waren
  const aanvragen = () => server.regels.map((r) => r.match(/ nep (\d+) km/)).filter(Boolean).map((m) => Number(m[1]));
  try {
    const context = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await radarPagina(context, `http://127.0.0.1:${APP_POORT}/?meten`, { minVliegtuigen: 900, fouten });
    await page.addScriptTag({ content: HULPJES });
    const stand = () => page.evaluate(() => window.__s.stand());
    const zoom7 = async () => {
      await page.evaluate(() => window.__s.kaart().setView([52.13, 5.29], 7, { animate: false }));
      await wacht(800);
    };

    // M5: de rand slepen van 250 naar ±325 km
    await zoom7();
    const s0 = await stand();
    await page.mouse.move(s0.x, s0.y);
    await page.mouse.dblclick(s0.x, s0.y);
    await wacht(200);
    const na = await stand();
    check('M5 dubbelklik op de rand: pijl-cursor voor de straal', /radar-gebied-maat-ew/.test(na.klassen));
    await page.mouse.move(s0.x - 80, s0.y);
    await wacht(100);
    const binnen = await stand();
    check('M5 binnenin: de verplaats-cursor', /radar-gebied-greep/.test(binnen.klassen) && !/radar-gebied-maat/.test(binnen.klassen));
    await page.mouse.move(s0.x, s0.y);
    await page.mouse.down();
    const voorSlepen = aanvragen().length;
    for (let i = 1; i <= 20; i++) await page.mouse.move(s0.x + 5 * i, s0.y);
    await wacht(700); // langer dan de 500 ms wachttijd: tijdens het slepen mag er niets naar de server
    const tijdens = await stand();
    check('M5 tijdens het slepen: de cirkel wordt groter, met een label in km', tijdens.km > s0.km && new RegExp(`${Math.round(tijdens.km)} km`).test(tijdens.label), `${s0.km} -> ${tijdens.km} km, label "${tijdens.label}"`);
    check('M5 tijdens het slepen: stappen van 25 km', tijdens.km % 25 === 0, `${tijdens.km} km`);
    check('M5 tijdens het slepen: geen aanvraag bij de server', aanvragen().length === voorSlepen);
    await page.mouse.up();
    await wacht(300);
    const los = await stand();
    check('M5 loslaten: de schuif in het paneel loopt mee', los.schuif === tijdens.km, `schuif ${los.schuif}`);
    check('M5 loslaten: de kaart blijft staan (K5)', Math.abs(los.kaart.lat - s0.kaart.lat) < 1e-9 && Math.abs(los.kaart.lng - s0.kaart.lng) < 1e-9 && los.zoom === s0.zoom);
    check('M5 loslaten: het midden blijft waar het was', Math.abs(los.lat - s0.lat) < 1e-9 && Math.abs(los.lng - s0.lng) < 1e-9);
    await wacht(1500);
    check('M5 na het loslaten: één aanvraag met de nieuwe straal', aanvragen().at(-1) === tijdens.km, `laatste aanvraag ${aanvragen().at(-1)} km`);
    check('M5 label weg en cursor terug', !/km/.test((await stand()).label) && !/radar-gebied-maat/.test((await stand()).klassen));

    // kleiner maken: vliegtuigen buiten de nieuwe cirkel worden gedimd tot de data er is
    await wacht(4000); // eerst het pakket van de vorige stap binnen
    const s1 = await stand();
    await page.mouse.dblclick(s1.x, s1.y);
    await wacht(200);
    // ook als er een vliegtuig op de rand vliegt: de klikken zijn voor de cirkel (geen popup die de kaart opzij schuift, geen zoom)
    check('dubbelklik op de rand: geen zoom en geen popup', (await stand()).zoom === s1.zoom && (await page.locator('.leaflet-popup').count()) === 0);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(s1.x - 12 * i, s1.y);
    const klein = await stand();
    await page.mouse.up();
    const meteen = await stand();
    check('kleiner gemaakt: vliegtuigen buiten de nieuwe cirkel gedimd tot de data er is', meteen.voorlopig !== null && klein.km < s1.km, `${s1.km} -> ${klein.km} km`);
    await page.waitForFunction(() => window.__vliegtuigLaag.voorlopig === null, null, { timeout: 15000 }).catch(() => {});
    check('kleiner gemaakt: met de nieuwe data is het dimmen weg', (await stand()).voorlopig === null);

    // M6: Esc tijdens het slepen van de straal zet hem terug, er gaat niets naar de server
    const s2 = await stand();
    const voorEsc = aanvragen().length;
    await page.mouse.dblclick(s2.x, s2.y);
    await wacht(200);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(s2.x + 8 * i, s2.y);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await wacht(800);
    const esc = await stand();
    check('M6 Esc tijdens de straal: straal en schuif terug', esc.km === s2.km && esc.schuif === s2.schuif, `${esc.km} km, schuif ${esc.schuif}`);
    // (aanvragen die gewoon op het interval komen tellen niet: die hebben de oude straal)
    check('M6 Esc: geen aanvraag met een andere straal', aanvragen().slice(voorEsc).every((km) => km === s2.km), aanvragen().slice(voorEsc).join(', ') || 'geen');

    // M5/M6: de schuif zoomt wel nog, zoals altijd
    const zoomVoor = (await stand()).zoom;
    await page.locator('input[type=range]').fill('500');
    await wacht(1500);
    check('de schuif in het paneel zoomt nog wel mee', (await stand()).zoom !== zoomVoor, `zoom ${zoomVoor} -> ${(await stand()).zoom}`);

    // grens: niet groter dan 1000 km
    await zoom7();
    await page.evaluate(() => window.__s.kaart().setZoom(5, { animate: false }));
    await wacht(800);
    const s3 = await stand();
    await page.mouse.dblclick(s3.x, s3.y);
    await wacht(200);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(Math.min(s3.x + 30 * i, 1430), s3.y);
    const groot = await stand();
    await page.mouse.up();
    check('grens: hoogstens 1000 km', groot.km === 1000, `${groot.km} km`);

    // M7: bij adsb.lol tot 450 km
    await page.locator('[aria-label="Bron van de posities"] button', { hasText: 'adsb.lol' }).click();
    await wacht(1500);
    const s4 = await stand();
    check('M7 adsb.lol: de schuif gaat tot 450', s4.max === 450 && s4.schuif === 450, `max ${s4.max}, schuif ${s4.schuif}`);
    await page.mouse.dblclick(s4.x, s4.y);
    await wacht(200);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) await page.mouse.move(Math.min(s4.x + 20 * i, 1430), s4.y);
    const adsb = await stand();
    await page.mouse.up();
    check('M7 adsb.lol: de straal slepen stopt op 450 km', adsb.km === 450, `${adsb.km} km`);
    await page.locator('[aria-label="Bron van de posities"] button', { hasText: 'OpenSky' }).click();
    await wacht(1000);

    // touch: dubbel tikken op de rand en van het midden af schuiven = de straal
    const touch = await b.newContext({ viewport: { width: 1000, height: 800 }, hasTouch: true });
    const tp = await radarPagina(touch, `http://127.0.0.1:${APP_POORT}/?meten`, { minVliegtuigen: 900, fouten });
    await tp.addScriptTag({ content: HULPJES });
    await tp.evaluate(() => window.__s.kaart().setView([52.13, 5.29], 7, { animate: false }));
    await wacht(800);
    const t0 = await tp.evaluate(() => window.__s.stand());
    const cdp = await touch.newCDPSession(tp);
    const raak = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await raak('touchStart', t0.x, t0.y);
    await raak('touchEnd');
    await wacht(120);
    await raak('touchStart', t0.x, t0.y);
    for (let i = 1; i <= 15; i++) {
      await raak('touchMove', t0.x + 6 * i, t0.y + 1 * i);
      await wacht(16);
    }
    await raak('touchEnd');
    await wacht(500);
    const t1 = await tp.evaluate(() => window.__s.stand());
    check('touch: dubbel tikken op de rand en naar buiten schuiven maakt de straal groter', t1.km > t0.km && Math.abs(t1.lng - t0.lng) < 1e-9, `${t0.km} -> ${t1.km} km, midden bleef staan`);
    check('touch: de kaart blijft staan', Math.abs(t1.kaart.lng - t0.kaart.lng) < 1e-9 && t1.zoom === t0.zoom);
    await touch.close();

    check('straal: geen fouten in de pagina', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally {
    await b.close();
    await web.stop();
    await server.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check, telling } = uitslag();
  await straalTests(check);
  console.log(`\n${telling.goed} goed, ${telling.fout} fout`);
  process.exit(telling.fout ? 1 : 0);
}
