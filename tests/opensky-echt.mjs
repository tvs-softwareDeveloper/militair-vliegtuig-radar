// T9 met de echte opensky: kloppen het interval en het tegoed in het paneel met de terminal van de server?
// kost echt tegoed (±40 bij een account) en duurt ±4 minuten. daarom niet in npm run check, maar los: npm run check:opensky
// zonder OPENSKY_CLIENT_ID en OPENSKY_CLIENT_SECRET in .env test hij anoniem (dan 400 tegoed per dag, en Snel = 10 s)
// let op: sluit andere tabbladen met de radar. elke open app is een eigen kijker en vraagt ook data op (zo ging T9 op 31-10 eerst mis)
import { pathToFileURL } from 'node:url';
import { bouw, browser, preview, radarServer, uitslag, wacht } from './hulp.mjs';

const SERVER_POORT = 3104;
const APP_POORT = 5194;

export default async function openskyTests(check) {
  const dist = bouw('app-opensky', `http://127.0.0.1:${SERVER_POORT}`);
  const server = await radarServer(SERVER_POORT);
  const web = await preview(dist, APP_POORT);
  const b = await browser();
  try {
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    await page.route(/arcgisonline\.com/, (r) => r.abort());
    await page.addInitScript(() => localStorage.setItem('radar.bron', 'opensky'));
    await page.goto(`http://127.0.0.1:${APP_POORT}/`);
    await page.waitForFunction(() => /tegoed per uur/.test(document.body.textContent), null, { timeout: 30000 });
    const account = server.regels.some((r) => /with the api client/.test(r));
    console.log(account ? 'met OpenSky-account (.env)' : 'anoniem (geen key in .env)');

    // de aanvragen in de log van de server: tijdstip en tegoed dat over is
    const aanvragen = () =>
      server.regels
        .map((r) => r.match(/^(\d\d):(\d\d):(\d\d)\s+250 km: \d+ vliegtuigen, tegoed (\d+)/))
        .filter(Boolean)
        .map((m) => ({ sec: +m[1] * 3600 + +m[2] * 60 + +m[3], over: +m[4] }));

    for (const [stand, duur] of [['Zuinig', 130], ['Normaal', 45], ['Snel', 32]]) {
      await page.locator('[aria-label="Hoe vaak verversen"] button', { hasText: stand }).click();
      await wacht(1500);
      const voor = aanvragen().length;
      await wacht(duur * 1000);
      const r = aanvragen().slice(voor);
      const paneel = await page.evaluate(() => ({
        elke: Number(document.querySelector('[aria-label="Hoe vaak verversen"]')?.closest('section')?.querySelector('h2 + span')?.textContent.match(/\d+/)?.[0]),
        perUur: Number([...document.querySelectorAll('aside p')].map((p) => p.textContent).find((t) => /tegoed per uur/.test(t))?.match(/^(\d+)/)?.[1]),
        over: Number([...document.querySelectorAll('aside p')].map((p) => p.textContent).find((t) => /tegoed per uur/.test(t))?.match(/nog (\d+)/)?.[1]),
      }));
      const gaten = r.slice(1).map((x, i) => x.sec - r[i].sec);
      const kost = r.slice(1).map((x, i) => r[i].over - x.over);
      const gemGat = gaten.length ? gaten.reduce((a, x) => a + x, 0) / gaten.length : NaN;
      const gemKost = kost.length ? kost.reduce((a, x) => a + x, 0) / kost.length : NaN;
      check(`T9 ${stand}: interval in het paneel = tijd tussen de aanvragen`, gaten.length >= 1 && Math.abs(gemGat - paneel.elke) <= 1.5, `paneel elke ${paneel.elke} s, server ${gaten.join(', ')} s`);
      check(`T9 ${stand}: tegoed per uur = kosten per aanvraag × aanvragen per uur`, Math.abs((gemKost * 3600) / paneel.elke - paneel.perUur) <= 1, `paneel ${paneel.perUur}/uur, ${gemKost} per aanvraag`);
      check(`T9 ${stand}: tegoed in het paneel = tegoed in de log`, paneel.over === r.at(-1)?.over, `paneel ${paneel.over}, log ${r.at(-1)?.over}`);
    }
  } finally {
    await b.close();
    await web.stop();
    await server.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check, telling } = uitslag();
  await openskyTests(check);
  console.log(`\n${telling.goed} goed, ${telling.fout} fout`);
  process.exit(telling.fout ? 1 : 0);
}
