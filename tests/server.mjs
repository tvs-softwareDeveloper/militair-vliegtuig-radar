// servertests (fase 6): adsb.lol als tweede bron, tegen nep-adsb.lol en nep-opensky. kost geen tegoed.
// los te draaien met: node tests/server.mjs
import { pathToFileURL } from 'node:url';
import { io } from 'socket.io-client';
import { nepBronnen, radarServer, uitslag, wacht } from './hulp.mjs';

const NEP_POORT = 3193;
const SERVER_POORT = 3112;

export default async function serverTests(check) {
  const NEP = `http://127.0.0.1:${NEP_POORT}`;
  const bronnen = await nepBronnen(NEP_POORT);
  const server = await radarServer(SERVER_POORT, [], {
    ADSBLOL_API_URL: NEP,
    OPENSKY_API_URL: `${NEP}/api`,
    OPENSKY_TOKEN_URL: `${NEP}/token`,
    MIL_ELKE_S: '1',
    MIL_HOUD_S: '4',
    // een (nep-)account, ook op een laptop zonder .env: de token komt van nep-opensky
    OPENSKY_CLIENT_ID: 'test',
    OPENSKY_CLIENT_SECRET: 'test',
  });
  const apps = [];
  try {
    const mode = (m) => fetch(`${NEP}/mode?adsb=${m}`);
    const log = async () => (await fetch(`${NEP}/log`)).json();
    const punten = async (begin = '/v2/point') => (await log()).filter((x) => x.pad.startsWith(begin));
    const bijna = (a, b, marge = 0.01) => typeof a === 'number' && Math.abs(a - b) <= marge;

    // een app: houdt alle berichten bij, met het moment van binnenkomst
    const app = () => {
      const s = io(`http://127.0.0.1:${SERVER_POORT}`, { transports: ['websocket'] });
      s.berichten = [];
      for (const e of ['gebied', 'tegoed', 'flights', 'bron']) s.on(e, (...args) => s.berichten.push({ e, args, t: Date.now() }));
      s.volgende = (e, na = Date.now(), ms = 8000) =>
        new Promise((resolve, reject) => {
          const start = Date.now();
          const kijk = () => {
            const b = s.berichten.find((x) => x.e === e && x.t >= na);
            if (b) return resolve(b.args);
            if (Date.now() - start > ms) return reject(new Error(`geen ${e} binnen ${ms} ms`));
            setTimeout(kijk, 20);
          };
          kijk();
        });
      apps.push(s);
      return s;
    };

    await mode('ok');
    const a = app();
    const [g0] = await a.volgende('gebied', 0);
    check('start: opensky is de standaard (D6)', g0.bron === 'opensky', `stand ${g0.stand}`);

    // naar adsb.lol
    let t = Date.now();
    a.emit('bron', { bron: 'adsblol' });
    const [g1] = await a.volgende('gebied', t);
    const [tg1] = await a.volgende('tegoed', t);
    const [vl1, info1] = await a.volgende('flights', t);
    check('adsb.lol: gebied zegt bron adsblol', g1.bron === 'adsblol');
    check('adsb.lol: standen 15 / 5 / 2 s', g1.standen.zuinig === 15 && g1.standen.normaal === 5 && g1.standen.snel === 2, JSON.stringify(g1.standen));
    check('adsb.lol: geen tegoed (credits 0, perUur 0)', g1.credits === 0 && g1.perUur === 0);
    check('adsb.lol: tegoed-bericht bron adsblol, over null, geen pauze', tg1.bron === 'adsblol' && tg1.over === null && tg1.pauzeTot === null);
    check('adsb.lol: vliegtuig buiten de straal valt weg', vl1.length === 3 && !vl1.some((p) => p[0] === 'aaa004'), `${vl1.length} vliegtuigen`);
    check('pakket zegt voor welk gebied en welke bron het is', info1.gebied?.bron === 'adsblol' && info1.gebied?.km === 250, JSON.stringify(info1.gebied));
    const p1 = (await punten()).at(-1);
    check('adsb.lol: straal in zeemijl (250 km = 135 NM)', p1?.pad.endsWith('/135'), p1?.pad);
    check('adsb.lol: eigen User-Agent', /vliegtuig-radar/.test(p1?.ua ?? ''));

    const f16 = vl1.find((p) => p[0] === 'aaa001');
    check('omrekenen: hoogte 10000 ft = 3048 m (index 7)', bijna(f16[7], 3048));
    check('omrekenen: geo-hoogte 10500 ft = 3200,4 m (index 13)', bijna(f16[13], 3200.4));
    check('omrekenen: 400 kn = 205,78 m/s (index 9)', bijna(f16[9], 205.7776));
    check('omrekenen: 2000 ft/min = 10,16 m/s (index 11)', bijna(f16[11], 10.16));
    check('omrekenen: koers 90 (index 10)', f16[10] === 90);
    check('spi 1 wordt true (index 15)', f16[15] === true);
    check('callsign, squawk, geen land', f16[1] === 'TEST01  ' && f16[14] === '7700' && f16[2] === null);
    check('time_position = now - seen_pos (index 3)', bijna(f16[3], info1.tijd - 1.5, 0.001));
    check('last_contact = now - seen (index 4)', bijna(f16[4], info1.tijd - 0.5, 0.001));
    check('extra (index 17): type, registratie, militair, nood', f16[17]?.type === 'F16' && f16[17]?.registratie === 'J-001' && f16[17]?.militair === true && f16[17]?.nood === 'general', JSON.stringify(f16[17]));
    const grond = vl1.find((p) => p[0] === 'aaa002');
    check('op de grond: index 8 true, hoogte null, spi false', grond[8] === true && grond[7] === null && grond[15] === false);
    const mlat = vl1.find((p) => p[0] === 'aaa003');
    check('zonder baro_rate: geom_rate (-1000 ft/min = -5,08 m/s)', bijna(mlat[11], -5.08));
    check('zonder alt_geom: index 13 null; mlat = bron 2; geen callsign = null', mlat[13] === null && mlat[16] === 2 && mlat[1] === null);
    check('tijd van het pakket = now van adsb.lol (s)', Math.abs(info1.tijd - Date.now() / 1000) < 3);

    // 1000 km gevraagd: de server gaat tot 450
    t = Date.now();
    a.emit('gebied', { lat: 52.13, lon: 5.29, km: 1000 });
    const [g2] = await a.volgende('gebied', t);
    await a.volgende('flights', t);
    const p2 = (await punten()).at(-1);
    check('adsb.lol: 1000 km wordt 450 km', g2.km === 450, `km ${g2.km}`);
    check('adsb.lol: 450 km = 243 NM in de aanvraag', p2?.pad.endsWith('/243'), p2?.pad);

    // stand snel: elke 2 s een nieuwe aanvraag, niet steeds uit de cache
    a.emit('gebied', { lat: 52.13, lon: 5.29, km: 250 });
    await wacht(700);
    t = Date.now();
    a.emit('verversen', { stand: 'snel' });
    const [g3] = await a.volgende('gebied', t);
    check('snel: elke 2 s', g3.seconden === 2);
    const voor = (await punten()).length;
    await wacht(6300);
    const na = (await punten()).length;
    // 3 bij elke 2 s; 2 mag als de laptop even druk is (een aanvraag schuift dan net over de 6,3 s)
    check('snel: in 6,3 s 2-3 aanvragen (niet uit de cache)', na - voor >= 2 && na - voor <= 4, `${na - voor} aanvragen`);

    // twee apps, hetzelfde gebied: één aanvraag
    a.emit('verversen', { stand: 'zuinig' });
    await wacht(500);
    const b = app();
    const c = app();
    await Promise.all([b.volgende('gebied', 0), c.volgende('gebied', 0)]);
    b.emit('bron', { bron: 'adsblol' });
    c.emit('bron', { bron: 'adsblol' });
    b.emit('gebied', { lat: 40, lon: 10, km: 100 });
    c.emit('gebied', { lat: 40, lon: 10, km: 100 });
    await Promise.all([b.volgende('flights', Date.now()), c.volgende('flights', Date.now())]);
    await wacht(300);
    const bc = (await punten('/v2/point/40.0000/10.0000')).length;
    check('twee apps, zelfde gebied: één aanvraag bij adsb.lol', bc === 1, `${bc} aanvragen`);
    b.close();
    c.close();

    // zelfde gebied, andere bron: niet uit dezelfde cache
    const d = app();
    await d.volgende('gebied', 0);
    t = Date.now();
    d.emit('gebied', { lat: 52.13, lon: 5.29, km: 250 });
    const [vlD] = await d.volgende('flights', t);
    check('opensky en adsb.lol hebben een eigen cache', vlD.length === 1 && vlD[0][0] === 'bbb001', `${vlD.length} vliegtuigen, ${vlD[0]?.[0]}`);
    d.close();

    // fouten: 5 s, 10 s, dan terug naar opensky met een melding
    t = Date.now();
    await mode('500');
    a.emit('verversen', { stand: 'snel' });
    const [bron] = await a.volgende('bron', t, 25000);
    const fouten = (await punten()).filter((x) => x.tijd >= t);
    const gaten = fouten.slice(1).map((x, i) => Math.round((x.tijd - fouten[i].tijd) / 100) / 10);
    check('na 3 fouten: bron-bericht opensky met melding', bron.bron === 'opensky' && /OpenSky/.test(bron.melding ?? ''), bron.melding);
    check('3 aanvragen, wachten verdubbelt (±5 s, ±10 s)', fouten.length === 3 && Math.abs(gaten[0] - 5) < 1 && Math.abs(gaten[1] - 10) < 1, `gaten ${gaten.join(', ')} s`);
    // OUD: const tB = a.berichten.find((x) => x.e === 'bron' && x.t >= t).t; (en dan het eerste gebied met t >= tB)
    // op volgorde van binnenkomst, niet op tijd: het laatste gebied-bericht van adsb.lol kan in dezelfde milliseconde binnenkomen
    const iB = a.berichten.findIndex((x) => x.e === 'bron' && x.t >= t);
    const naBron = async (e) => {
      for (let i = 0; i < 400; i++) {
        const b = a.berichten.slice(iB + 1).find((x) => x.e === e);
        if (b) return b.args;
        await wacht(20);
      }
      throw new Error(`geen ${e} na het bron-bericht`);
    };
    const [g4] = await naBron('gebied');
    const [vl4] = await naBron('flights');
    check('daarna: gebied en vliegtuigen van opensky', g4.bron === 'opensky' && vl4.some((p) => p[0] === 'bbb001'), g4.bron);
    const telNa = (await punten()).length;
    await wacht(3000);
    check('daarna geen aanvragen meer bij adsb.lol', (await punten()).length === telNa);

    // onzin (200 zonder ac) telt ook als fout. na herstel weer gewoon
    await mode('rommel');
    t = Date.now();
    a.emit('bron', { bron: 'adsblol' });
    await wacht(1500);
    await mode('ok');
    const tOk = Date.now();
    const [vl5, info5] = await a.volgende('flights', tOk, 15000);
    check('na de fout: een nieuw pakket (niet het oude uit de cache)', info5.tijd * 1000 >= tOk - 100);
    check('na een fout (200 zonder ac) herstelt adsb.lol zelf', vl5.length === 3 && vl5[0][17]?.bron === 'adsb.lol', `${vl5.length} vliegtuigen`);
    check('één fout geeft nog geen wissel van bron', !a.berichten.some((x) => x.e === 'bron' && x.t >= t));

    // militaire lijst (fase 1 van het tweede plan): opensky-vliegtuigen die op /v2/mil van adsb.lol staan, krijgen index 17.
    // in deze test vraagt de server de lijst elke seconde (MIL_ELKE_S) en vergeet hij hem na 4 s zonder verse lijst (MIL_HOUD_S)
    const e = app();
    await e.volgende('gebied', 0);
    e.emit('verversen', { stand: 'snel' });
    t = Date.now();
    e.emit('gebied', { lat: 30, lon: 30, km: 200 }); // een eigen gebied, niet uit de cache van eerder
    const [vlE] = await e.volgende('flights', t, 15000);
    const os = vlE.find((p) => p[0] === 'bbb001');
    check('militair: opensky-vliegtuig op de lijst krijgt index 17', os?.[17]?.militair === true && os[17].type === 'A400' && os[17].registratie === '54+01' && os[17].bron === 'opensky', JSON.stringify(os?.[17]));
    check('militair: de lijst komt van adsb.lol /v2/mil', (await punten('/v2/mil')).length >= 1);
    await fetch(`${NEP}/mode?mil=500`);
    await wacht(9000);
    const [vlF] = await e.volgende('flights', Date.now(), 15000);
    check('militair: lijst te lang niet ververst, markering weg', !vlF.find((p) => p[0] === 'bbb001')?.[17]);
    await fetch(`${NEP}/mode?mil=ok`);
    await wacht(1500);
    const [vlG] = await e.volgende('flights', Date.now(), 15000);
    check('militair: lijst weer bereikbaar, markering terug', vlG.find((p) => p[0] === 'bbb001')?.[17]?.militair === true);

    // afgelegde route (bij het kiezen van een vliegtuig): de eigen punten van de server, aangevuld door opensky tracks als die er zijn.
    // e kijkt al een tijdje naar bbb001 (elke 5 s een pakket); de server bewaart elke 20 s een punt
    const route = (icao) =>
      new Promise((resolve) => {
        e.once('vlucht', resolve);
        e.emit('vlucht', { icao });
      });
    await fetch(`${NEP}/mode?tracks=404`);
    await wacht(25000); // minstens twee eigen punten, 20 s uit elkaar
    const r1 = await route('bbb001');
    check('route zonder opensky tracks: de eigen punten van de server', r1.bron === 'radar' && r1.punten?.length >= 2, `${r1.bron}, ${r1.punten?.length} punten${r1.fout ? `, ${r1.fout}` : ''}`);
    await fetch(`${NEP}/mode?tracks=ok`);
    await wacht(3100); // hoogstens één tracks-aanvraag per 3 s per app
    const r2 = await route('bbb001');
    check('route met opensky tracks: de hele vlucht plus de eigen punten erna', r2.bron === 'opensky' && r2.punten?.length >= 5 && r2.punten[0][0] === 29 && r2.eigen >= 2, `${r2.bron}, ${r2.punten?.length} punten (${r2.eigen} eigen)`);
    const r3 = await route('abcdef');
    check('route van een onbekend toestel: een nette melding', /Nog geen route/.test(r3.fout ?? ''), r3.fout);
  } finally {
    for (const s of apps) s.close();
    await server.stop();
    await bronnen.stop();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { check, telling } = uitslag();
  await serverTests(check);
  console.log(`\n${telling.goed} goed, ${telling.fout} fout`);
  process.exit(telling.fout ? 1 : 0);
}
