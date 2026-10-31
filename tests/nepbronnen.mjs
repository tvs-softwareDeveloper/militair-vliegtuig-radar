// nep-adsb.lol en nep-opensky voor de servertests, zodat die nooit echte aanvragen doen of tegoed kosten.
// node tests/nepbronnen.mjs <poort>. de radarserver praat ermee via ADSBLOL_API_URL, OPENSKY_API_URL en OPENSKY_TOKEN_URL.
// /mode?adsb=ok|500|429|rommel stuurt het gedrag van nep-adsb.lol, /mode?mil=ok|500 dat van de militaire lijst (/v2/mil),
// /log geeft alle aanvragen
import { createServer } from 'node:http';

const POORT = Number(process.argv[2]) || 3093;
let mode = 'ok';
let milMode = 'ok';
let tracksMode = 'ok'; // /mode?tracks=ok|404: kent nep-opensky de hele vlucht van bbb001?
const log = [];

// vier vliegtuigen met bekende waarden, zodat de omrekening in de server te controleren is
const adsbAntwoord = (lat, lon) => {
  const now = Date.now();
  return {
    ac: [
      // militair, snel, noodsignaal
      { hex: 'aaa001', type: 'adsb_icao', flight: 'TEST01  ', r: 'J-001', t: 'F16', alt_baro: 10000, alt_geom: 10500, gs: 400, track: 90, baro_rate: 2000, geom_rate: 2100, squawk: '7700', emergency: 'general', spi: 1, dbFlags: 1, lat: lat + 0.1, lon: lon + 0.1, seen_pos: 1.5, seen: 0.5 },
      // op de grond
      { hex: 'aaa002', type: 'adsb_icao', flight: 'GRND    ', r: 'PH-ABC', t: 'B738', alt_baro: 'ground', gs: 5, track: 180, squawk: '1000', spi: 0, lat: lat - 0.1, lon, seen_pos: 0.2, seen: 0.1 },
      // mlat, zonder baro_rate (dan geom_rate), zonder alt_geom, zonder callsign
      { hex: 'aaa003', type: 'mlat', alt_baro: 2000, gs: 100, track: 45, geom_rate: -1000, lat: lat + 0.2, lon: lon - 0.2, seen_pos: 3, seen: 2 },
      // ver buiten elke straal: moet eruit
      { hex: 'aaa004', type: 'adsb_icao', flight: 'VER     ', alt_baro: 30000, gs: 450, track: 270, lat: lat + 20, lon, seen_pos: 0.1, seen: 0.1 },
    ],
    msg: 'No error',
    now,
    total: 4,
  };
};

createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/mode') {
    mode = url.searchParams.get('adsb') ?? mode;
    milMode = url.searchParams.get('mil') ?? milMode;
    tracksMode = url.searchParams.get('tracks') ?? tracksMode;
    res.end(`${mode} ${milMode} ${tracksMode}`);
    return;
  }
  if (url.pathname === '/log') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(log));
    return;
  }
  log.push({ tijd: Date.now(), pad: url.pathname, ua: req.headers['user-agent'] });
  // de militaire lijst: het opensky-vliegtuig bbb001 staat erop, en een adres met ~ (geen echt icao-adres) dat de server moet overslaan
  if (url.pathname === '/v2/mil') {
    if (milMode === '500') {
      res.statusCode = 500;
      res.end('boem');
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ac: [{ hex: 'bbb001', t: 'A400', r: '54+01', dbFlags: 1 }, { hex: 'aaa001', t: 'F16', r: 'J-001', dbFlags: 1 }, { hex: '~123abc', dbFlags: 1 }], now: Date.now() }));
    return;
  }
  const point = url.pathname.match(/^\/v2\/point\/([-\d.]+)\/([-\d.]+)\/(\d+)$/);
  if (point) {
    if (mode === '500') {
      res.statusCode = 500;
      res.end('boem');
      return;
    }
    if (mode === '429') {
      res.statusCode = 429;
      res.end('te veel');
      return;
    }
    res.setHeader('content-type', 'application/json');
    if (mode === 'rommel') {
      res.end('{"geen":"ac"}');
      return;
    }
    res.end(JSON.stringify(adsbAntwoord(Number(point[1]), Number(point[2]))));
    return;
  }
  if (url.pathname === '/token') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ access_token: 'nep', expires_in: 1800 }));
    return;
  }
  // de hele vlucht van bbb001: drie punten, de laatste 1000 s geleden (de server vult daarna aan met zijn eigen punten)
  if (url.pathname === '/api/tracks/all') {
    const t = Math.floor(Date.now() / 1000);
    if (tracksMode === '404' || url.searchParams.get('icao24') !== 'bbb001') {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ icao24: 'bbb001', startTime: t - 3600, endTime: t - 1000, path: [[t - 3600, 29, 29, 1000, 45, false], [t - 2400, 29.5, 29.5, 3000, 45, false], [t - 1000, 29.9, 29.9, 3000, 45, false]] }));
    return;
  }
  if (url.pathname === '/api/states/all') {
    const lat = (Number(url.searchParams.get('lamin')) + Number(url.searchParams.get('lamax'))) / 2;
    const lon = (Number(url.searchParams.get('lomin')) + Number(url.searchParams.get('lomax'))) / 2;
    const t = Math.floor(Date.now() / 1000);
    res.setHeader('content-type', 'application/json');
    res.setHeader('x-rate-limit-remaining', '3999');
    res.end(JSON.stringify({ time: t, states: [['bbb001', 'OSKY1   ', 'Netherlands', t - 2, t - 1, lon, lat, 3000, false, 200, 90, 0, null, 3100, '1234', false, 0]] }));
    return;
  }
  res.statusCode = 404;
  res.end();
}).listen(POORT, '127.0.0.1', () => console.log(`nepbronnen op ${POORT}`));
