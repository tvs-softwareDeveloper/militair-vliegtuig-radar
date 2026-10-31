// npm run check: alle tests die niets kosten, achter elkaar. bouwt de app één keer, start en stopt zelf alle servers.
// duurt ±10 minuten (T8 en de sporen wachten elk ruim een minuut). de meting (npm run meten) en de echte opensky (npm run check:opensky) staan los
import { bouw, uitslag } from './hulp.mjs';
import serverTests from './server.mjs';
import kaartTests, { SERVER_POORT } from './kaart.mjs';
import bugTests from './bugs.mjs';
import militairTests from './militair.mjs';
import straalTests from './straal.mjs';
import bochtTests from './bochten.mjs';
import sporenTests from './sporen.mjs';

const { check, telling } = uitslag();
const begin = Date.now();
const delen = [];

console.log('bouwen…');
const dist = bouw('app-test', `http://127.0.0.1:${SERVER_POORT}`);

for (const [naam, test] of [
  ['server (adsb.lol, nep-bronnen)', () => serverTests(check)],
  ['kaart (testlijst T2-T13)', () => kaartTests(check, { dist })],
  ['bugs (fase 5, opgelost 31-10)', () => bugTests(check, { dist })],
  ['militair (fase 1, tweede plan)', () => militairTests(check, { dist })],
  ['straal (fase 2, tweede plan)', () => straalTests(check, { dist })],
  ['bochten (fase 3, tweede plan)', () => bochtTests(check, { dist })],
  ['sporen (fase 4, tweede plan)', () => sporenTests(check, { dist })],
]) {
  console.log(`\n== ${naam}`);
  const voor = { ...telling };
  try {
    await test();
  } catch (e) {
    check(`${naam}: liep vast`, false, e.message.split('\n')[0]);
  }
  delen.push(`${naam}: ${telling.goed - voor.goed} goed, ${telling.fout - voor.fout} fout`);
}

console.log('\n' + delen.join('\n'));
console.log(`\n${telling.goed} goed, ${telling.fout} fout (${Math.round((Date.now() - begin) / 1000)} s)`);
process.exit(telling.fout ? 1 : 0);
