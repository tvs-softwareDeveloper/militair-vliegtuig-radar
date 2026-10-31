// stand-in for the backend that isn't in this repo: gets live flights from opensky and sends them to the app over
// socket.io. every app picks its own area (a centre and a radius in km) and how often it wants new data.
// opensky works without login (a limited number of credits a day). with an opensky api client in .env the server
// logs in to opensky itself: more credits and newer data. the people who look at the radar never log in
// OUD: // (no login, so a limited number of credits a day) and sends them to the app over
// OUD: // socket.io. every app picks its own area: a centre and a radius in km
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';

// .env next to this file (OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET, see .env.example), if it's there.
// process.loadEnvFile is built into node 20.12 and newer, so no extra package. without .env everything stays anonymous
try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)));
} catch (error) {
  if (error.code !== 'ENOENT') console.log('.env could not be read:', error.message);
}

const START = { lat: 52.13, lon: 5.29, km: 250 }; // middle of the netherlands
const MIN_KM = 25;
const MAX_KM = 1000;

// --nep <count> [--elke <seconds>]: fake flights instead of opensky, so measuring costs no credits.
// the same count always gives the same planes (seeded), so two measurements can be compared
const argAfter = (flag) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? null : process.argv[i + 1];
};
const NEP = process.argv.includes('--nep') ? Math.max(1, Math.round(Number(argAfter('--nep')) || 2000)) : 0;
const NEP_EVERY = Math.max(1, Number(argAfter('--elke')) || 10); // seconds between two fake answers
// --poort <port>: another port than 3001, so a test server can run next to the real one (the app then needs VITE_SERVER)
const PORT = Number(argAfter('--poort')) || 3001;

// ---- opensky: addresses, login and credits ----

// the addresses can be changed for testing against a fake opensky (OPENSKY_API_URL, OPENSKY_TOKEN_URL)
const OPENSKY_API = process.env.OPENSKY_API_URL || 'https://opensky-network.org/api';
const OPENSKY_TOKEN =
  process.env.OPENSKY_TOKEN_URL || 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
const CLIENT_ID = process.env.OPENSKY_CLIENT_ID || '';
const CLIENT_SECRET = process.env.OPENSKY_CLIENT_SECRET || '';
let account = Boolean(CLIENT_ID && CLIENT_SECRET); // becomes false if opensky refuses the login, then we go on anonymously

// how often to refresh, as a budget in credits per hour. a bigger area costs more per request, so it is asked less
// often, like before. 'zuinig' gives exactly the old table (30, 60, 90 or 120 seconds). 'snel' is as fast as opensky has new data
const STANDEN = { zuinig: 120, normaal: 360, snel: Infinity };
const standaardStand = () => (account ? 'normaal' : 'zuinig'); // without a key the credits run out fast, so zuinig by default
const minSeconden = () => (account ? 5 : 10); // opensky has no newer data than this: anonymous every 10 s, with an account every 5 s

// OUD: // opensky charges more credits for a bigger box, so a bigger box is asked less often
// OUD: function everySeconds(squareDegrees) {
// OUD:   if (squareDegrees <= 25) return 30;
// OUD:   if (squareDegrees <= 100) return 60;
// OUD:   if (squareDegrees <= 400) return 90;
// OUD:   return 120;
// OUD: }

// what one request costs at opensky, by the size of the box in square degrees
function creditsFor(squareDegrees) {
  if (squareDegrees <= 25) return 1;
  if (squareDegrees <= 100) return 2;
  if (squareDegrees <= 400) return 3;
  return 4;
}

// seconds between two requests for this area and stand: the budget divided over the cost, never faster than opensky has data.
// adsb.lol costs nothing, there every stand is just a fixed pace
// OUD: function secondsFor(area, stand) {
function secondsFor(area, stand, bron = 'opensky') {
  if (NEP) return NEP_EVERY;
  if (bron === 'adsblol') return ADSB_SECONDEN[stand];
  const credits = creditsFor(boxAround(area).squareDegrees);
  return Math.max(minSeconden(), (credits * 3600) / STANDEN[stand]);
}

// what opensky told us about the credits: how many are left (it sends that with every answer) and,
// after a 429 (used up), until when we have to wait
const tegoed = { over: null, pauzeTot: 0 };

// OUD: const tegoedInfo = () => ({
// OUD:   bron: NEP ? 'nep' : 'opensky',
// OUD:   account, // logged in with a key
// OUD:   over: NEP ? null : tegoed.over, // credits left, null = not known yet
// OUD:   pauzeTot: !NEP && tegoed.pauzeTot > Date.now() ? tegoed.pauzeTot : null, // credits used up: no new data until then (ms)
// OUD:   minSeconden: NEP ? NEP_EVERY : minSeconden(),
// OUD: });
// adsb.lol has no credits, so for that source only the pause after errors counts
const tegoedInfo = (bron) => ({
  bron: NEP ? 'nep' : bron,
  account, // logged in with a key
  over: NEP || bron !== 'opensky' ? null : tegoed.over, // credits left, null = not known yet (or no credits at all)
  pauzeTot: NEP || bron !== 'opensky' ? null : tegoed.pauzeTot > Date.now() ? tegoed.pauzeTot : null, // credits used up: no new data until then (ms)
  minSeconden: NEP ? NEP_EVERY : bron === 'adsblol' ? ADSB_SECONDEN.snel : minSeconden(),
});

// ---- adsb.lol: the second source (fase 6) ----

// free, no key and no credits, positions often less than a second old. no fixed limits ("dynamic based on the environment load"),
// so opensky stays the default and the safety net. the address can be changed for testing against a fake adsb.lol
const ADSB_API = process.env.ADSBLOL_API_URL || 'https://api.adsb.lol';
const ADSB_MAX_KM = 450; // the api goes up to 250 nautical miles (463 km), the app's slider stops at 450
const ADSB_SECONDEN = { zuinig: 15, normaal: 5, snel: 2 };
const ADSB_MAX_FOUTEN = 3; // this many errors in a row: every app on adsb.lol goes back to opensky

// errors in a row and how long to wait after one. every error doubles the wait, up to a minute
const adsb = { fouten: 0, wacht: 0, pauzeTot: 0 };

const FEET = 0.3048;
const KNOT = 0.514444; // m/s
const FEET_PER_MIN = 0.00508; // m/s

// one adsb.lol plane as an opensky state vector (same indexes), so the threat rules, the panel and the popup stay the same.
// adsb.lol has no country of origin, the popup shows the type and registration instead (index 17, see below)
function adsbAsState(a, now) {
  const onGround = a.alt_baro === 'ground';
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const baro = onGround ? null : num(a.alt_baro);
  const geo = num(a.alt_geom);
  const rate = num(a.baro_rate) ?? num(a.geom_rate); // baro_rate is missing quite often, geom_rate is the same thing from gps
  return [
    a.hex,
    typeof a.flight === 'string' ? a.flight : null,
    null, // no country
    num(a.seen_pos) === null ? null : now - a.seen_pos, // time_position: now minus how long ago the position came in (seconds)
    num(a.seen) === null ? now : now - a.seen, // last_contact
    a.lon,
    a.lat,
    baro === null ? null : baro * FEET,
    onGround,
    num(a.gs) === null ? null : a.gs * KNOT,
    num(a.track),
    rate === null ? null : rate * FEET_PER_MIN,
    null, // sensors
    geo === null ? null : geo * FEET,
    typeof a.squawk === 'string' ? a.squawk : null,
    a.spi === 1 || a.spi === true, // adsb.lol sends 0 or 1, the rules check for true
    a.type === 'mlat' ? 2 : 0, // position source like opensky: 0 = ads-b, 2 = mlat
    // extra, opensky only fills index 17 with extended=1 and we never ask that. the rules and the map don't read it
    {
      bron: 'adsb.lol',
      type: a.t ?? null, // aircraft type, like B738
      registratie: a.r ?? null,
      militair: typeof a.dbFlags === 'number' && (a.dbFlags & 1) === 1, // bit 1 = military in their database, not used yet
      nood: typeof a.emergency === 'string' && a.emergency !== 'none' ? a.emergency : null, // not used yet either
      draai: num(a.track_rate), // how fast the track turns, degrees per second (null = not known). the app predicts turns with it
    },
  ];
}

// one request for the flights in an area at adsb.lol. null = nothing new (error), the caller keeps the last flights
async function askAdsb(area) {
  const nm = Math.min(250, Math.ceil(area.km / 1.852)); // the api wants nautical miles
  const url = `${ADSB_API}/v2/point/${area.lat.toFixed(4)}/${area.lon.toFixed(4)}/${nm}`;
  let response = null;
  try {
    response = await fetch(url, { headers: { 'User-Agent': 'vliegtuig-radar (hobby project)' }, signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    console.log('adsb.lol not reachable:', error.message);
  }
  let data = null;
  if (response?.ok) data = await response.json().catch(() => null);
  if (!data || !Array.isArray(data.ac)) {
    adsbFout(!response ? 'adsb.lol gave no answer' : response.ok ? 'adsb.lol answered without a list of planes' : `adsb.lol answered ${response.status}`);
    return null;
  }
  adsb.fouten = 0;
  adsb.wacht = 0;
  const now = (Number(data.now) || Date.now()) / 1000; // their clock, in seconds like opensky's time
  const flights = data.ac
    .filter((a) => typeof a.lat === 'number' && typeof a.lon === 'number' && distanceKm(area.lat, area.lon, a.lat, a.lon) <= area.km)
    .map((a) => adsbAsState(a, now));
  return { flights, tijd: now };
}

// ---- military list (fase 1 of the second plan) ----

// opensky doesn't know which planes are military, adsb.lol does (dbFlags & 1, from their database of known aircraft).
// /v2/mil gives all of them worldwide in one small answer. we ask it at most once a minute, and only while an app looks at
// opensky (asking happens from askOpensky). if it keeps failing, the list is forgotten after 10 minutes. both times can be
// changed for testing (MIL_ELKE_S, MIL_HOUD_S)
const MIL_ELKE_MS = (Number(process.env.MIL_ELKE_S) || 60) * 1000;
const MIL_HOUD_MS = (Number(process.env.MIL_HOUD_S) || 600) * 1000;
const militair = { lijst: new Map(), tijd: 0, gevraagd: 0, bezig: null }; // lijst: hex -> { type, registratie }

// ask the list again if it's older than a minute. one request at a time, also with many apps
function ververstMilitair() {
  const nu = Date.now();
  if (militair.bezig || nu - militair.gevraagd < MIL_ELKE_MS) return militair.bezig;
  militair.gevraagd = nu;
  militair.bezig = (async () => {
    try {
      const response = await fetch(`${ADSB_API}/v2/mil`, {
        headers: { 'User-Agent': 'vliegtuig-radar (hobby project)' },
        signal: AbortSignal.timeout(10_000),
      });
      const data = response.ok ? await response.json().catch(() => null) : null;
      if (!data || !Array.isArray(data.ac)) throw new Error(`answered ${response.status}`);
      const lijst = new Map();
      for (const a of data.ac) {
        if (typeof a.hex === 'string' && !a.hex.startsWith('~')) lijst.set(a.hex.toLowerCase(), { type: a.t ?? null, registratie: a.r ?? null });
      }
      militair.lijst = lijst;
      militair.tijd = Date.now();
    } catch (error) {
      console.log('military list from adsb.lol failed:', error.message);
      // too long without a fresh list: forget it, an old list would keep marking planes that may not be there anymore
      if (Date.now() - militair.tijd > MIL_HOUD_MS && militair.lijst.size) {
        militair.lijst = new Map();
        console.log('military list forgotten (no fresh list for too long)');
      }
    } finally {
      militair.bezig = null;
    }
  })();
  return militair.bezig;
}

// opensky planes that are on the military list get the same extra as adsb.lol planes (index 17)
function markeerMilitair(flights) {
  if (!militair.lijst.size) return;
  for (const s of flights) {
    const m = militair.lijst.get(String(s[0]).toLowerCase());
    if (m) s[17] = { bron: 'opensky', type: m.type, registratie: m.registratie, militair: true, nood: null };
  }
}

// 429, 5xx, a timeout or nonsense: wait twice as long as last time (5, 10, 20 … 60 s). after a few in a row adsb.lol is
// probably down or doesn't want us right now, then every app on it goes back to opensky
function adsbFout(waarom) {
  adsb.fouten++;
  adsb.wacht = Math.min(60, Math.max(5, adsb.wacht * 2));
  adsb.pauzeTot = Date.now() + adsb.wacht * 1000;
  if (adsb.fouten < ADSB_MAX_FOUTEN) {
    console.log(`${waarom}, error ${adsb.fouten} in a row, waiting ${adsb.wacht} s`);
    return;
  }
  console.log(`${waarom}, error ${adsb.fouten} in a row`);
  adsb.fouten = 0;
  adsb.wacht = 0;
  adsb.pauzeTot = 0;
  console.log('adsb.lol keeps failing, apps on adsb.lol go back to opensky');
  // after the current request is done, so the answer of this one doesn't cross the switch
  setTimeout(() => {
    for (const socket of io.of('/').sockets.values()) {
      if (socket.data.bron !== 'adsblol') continue;
      socket.data.bron = 'opensky';
      socket.emit('bron', { bron: 'opensky', melding: 'adsb.lol gaf een paar keer geen antwoord, daarom terug naar OpenSky.' });
      send(socket);
    }
  }, 0);
}

// the box around the circle, opensky only knows boxes
function boxAround({ lat, lon, km }) {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    lamin: Math.max(lat - dLat, -90),
    lamax: Math.min(lat + dLat, 90),
    lomin: lon - dLon,
    lomax: lon + dLon,
    squareDegrees: 4 * dLat * dLon,
  };
}

// distance in km between two points on the earth
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

// login with the api client from .env (oauth2 client credentials, the only way opensky accepts now). gives a token that is
// valid for 30 minutes; we ask a new one a minute before it runs out, or when opensky says it isn't valid anymore (401)
let token = null; // { value, until }
let tokenRequest = null; // a running login, so two requests at the same time log in once

async function getToken(fresh = false) {
  if (!account) return null;
  if (!fresh && token && token.until - Date.now() > 60_000) return token.value;
  if (!tokenRequest) {
    tokenRequest = (async () => {
      try {
        const response = await fetch(OPENSKY_TOKEN, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
        });
        if (response.status === 400 || response.status === 401) {
          // wrong id or secret: don't keep trying, go on anonymously so the radar keeps working
          account = false;
          token = null;
          console.log('opensky refused the login (check OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET in .env), going on anonymously');
          return null;
        }
        if (!response.ok) {
          console.log(`opensky login answered ${response.status}, this request goes anonymously`);
          return null;
        }
        const data = await response.json();
        token = { value: data.access_token, until: Date.now() + (Number(data.expires_in) || 1800) * 1000 };
        console.log(`${new Date().toLocaleTimeString()}  logged in to opensky, token valid for ${Math.round((token.until - Date.now()) / 60000)} min`);
        return token.value;
      } catch (error) {
        console.log('opensky login not reachable:', error.message, '- this request goes anonymously');
        return null;
      }
    })();
    tokenRequest.finally(() => (tokenRequest = null));
  }
  return tokenRequest;
}

// one request for the flights in an area. null = nothing new (error, or credits used up), the caller keeps the last flights
async function askOpensky(area) {
  const lijst = ververstMilitair(); // at the same time as the flights, not after them
  const box = boxAround(area);
  const url = `${OPENSKY_API}/states/all?lamin=${box.lamin}&lomin=${box.lomin}&lamax=${box.lamax}&lomax=${box.lomax}`;
  const ask = (key) => fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
  let key = await getToken();
  let response = await ask(key);
  if (response.status === 401 && key) {
    // token ran out or was withdrawn: get a new one and try once more
    key = await getToken(true);
    response = await ask(key);
  }
  // opensky sends the credits that are left with every answer
  const left = Number(response.headers.get('x-rate-limit-remaining'));
  if (response.headers.has('x-rate-limit-remaining') && Number.isFinite(left)) tegoed.over = left;
  if (response.status === 429) {
    // used up: opensky says how long to wait. until then we don't ask at all
    const seconds = Number(response.headers.get('x-rate-limit-retry-after-seconds')) || 600;
    tegoed.over = 0;
    tegoed.pauzeTot = Date.now() + seconds * 1000;
    console.log(`opensky credits used up, waiting until ${new Date(tegoed.pauzeTot).toLocaleTimeString()} (the last flights stay)`);
    return null;
  }
  if (!response.ok) {
    console.log(`opensky answered ${response.status}, keeping the last flights`);
    return null;
  }
  const data = await response.json();
  const flights = (data.states ?? []).filter(
    (s) => typeof s[6] === 'number' && typeof s[5] === 'number' && distanceKm(area.lat, area.lon, s[6], s[5]) <= area.km,
  );
  // OUD: if (!militair.tijd && lijst) await Promise.race([lijst, new Promise((r) => setTimeout(r, 3000))]);
  // no list (the first time, or after it was forgotten) and one is coming in right now: wait for it a little (not long,
  // adsb.lol can be slow). a new list is asked at most once a minute, so this wait happens at most once a minute too
  if (!militair.lijst.size && lijst) await Promise.race([lijst, new Promise((r) => setTimeout(r, 3000))]);
  markeerMilitair(flights);
  return { flights, tijd: data.time }; // tijd: opensky's time of this snapshot, in seconds
}

const server = createServer();
const io = new Server(server, { cors: { origin: '*' } });

// last answer per area, so two apps with the same area cost one call
const answers = new Map();
const keyOf = ({ lat, lon, km }) => `${lat.toFixed(2)},${lon.toFixed(2)},${km}`;
// the same area from another source is another answer
const answerKey = (area, bron) => `${NEP ? 'nep' : bron}|${keyOf(area)}`;
const running = new Map(); // area -> the request that is running for it now
const EMPTY = { time: 0, flights: [], tijd: null };
const KEEP_MS = 10 * 60_000; // answers older than this are forgotten

// ---- fake flights (--nep) ----

const M_PER_DEGREE = 111320;
const RAD = Math.PI / 180;

// small seeded random generator (mulberry32), gives the same numbers every run
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNTRIES = ['Netherlands', 'Germany', 'United Kingdom', 'France', 'Belgium', 'United States', 'Poland', 'Spain', 'Turkey'];
const MIL_TYPES = ['C17', 'A400', 'F16', 'K35R', 'C30J', 'NH90']; // types of the fake military planes

// NEP planes spread evenly over the circle. a mix that gives every threat level:
// airliners, a few fast jets, small slow low planes and some on the ground
function makeFleet(area) {
  const random = seeded(NEP);
  const planes = [];
  for (let i = 0; i < NEP; i++) {
    const dist = Math.sqrt(random()) * area.km * 1000; // sqrt keeps the density even
    const angle = random() * 2 * Math.PI;
    const kind = random();
    const onGround = kind < 0.04;
    let speed;
    let altitude;
    if (onGround) {
      speed = random() * 12;
      altitude = null;
    } else if (kind < 0.14) {
      speed = 55 + random() * 40; // small plane or helicopter: slow and low
      altitude = 100 + random() * 1700;
    } else if (kind < 0.17) {
      speed = 240 + random() * 40; // fast jet
      altitude = 2000 + random() * 10000;
    } else {
      speed = 170 + random() * 85; // airliner
      altitude = 3000 + random() * 9000;
    }
    const anonymous = random() < 0.03; // no callsign and no squawk
    const rate = random();
    planes.push({
      icao: (0x400000 + i * 37).toString(16).padStart(6, '0'),
      callsign: anonymous ? null : `NEP${String(1000 + Math.floor(random() * 9000))}`,
      country: COUNTRIES[Math.floor(random() * COUNTRIES.length)],
      squawk: anonymous ? null : Math.floor(random() * 4096).toString(8).padStart(4, '0'),
      lat: area.lat + (dist * Math.cos(angle)) / M_PER_DEGREE,
      lon: area.lon + (dist * Math.sin(angle)) / (M_PER_DEGREE * Math.cos(area.lat * RAD)),
      speed,
      track: random() * 360,
      turn: random() < 0.2 ? (random() - 0.5) * 3 : 0, // degrees per second, a fifth of them are turning
      altitude,
      onGround,
      vertical: onGround ? 0 : rate < 0.7 ? (random() - 0.5) : rate < 0.985 ? (random() - 0.5) * 24 : (random() < 0.5 ? -1 : 1) * (16 + random() * 9),
      spi: random() < 0.003,
      // about 1 in 97 is military. picked by number, not with random(): then the rest of the fleet stays exactly the same as before
      militair: i % 97 === 0 ? { type: MIL_TYPES[(i / 97) % MIL_TYPES.length], registratie: `NEP-${String(i).padStart(4, '0')}` } : null,
    });
  }
  return { planes, time: Date.now(), random: seeded(NEP + 1) };
}

// how far a plane gets in some seconds, in meters north and east. a turning plane follows an arc (its track changes by turn
// degrees per second), a plane that doesn't turn flies straight
function vlucht(speed, track, turn, seconds) {
  if (!turn) return { north: Math.cos(track * RAD) * speed * seconds, east: Math.sin(track * RAD) * speed * seconds };
  const w = turn * RAD;
  const a = track * RAD;
  const b = a + w * seconds;
  return { north: (speed / w) * (Math.sin(b) - Math.sin(a)), east: (speed / w) * (Math.cos(a) - Math.cos(b)) };
}

// let every plane fly on for the time since the last answer
// OUD: (first the new track, then the whole time straight on that new track: a turning plane went in straight pieces,
// OUD:  with long intervals far from the arc it should fly. that made predicting turns look worse than it is)
// OUD:   p.track = (((p.track + p.turn * seconds) % 360) + 360) % 360;
// OUD:   p.lat += (Math.cos(p.track * RAD) * p.speed * seconds) / M_PER_DEGREE;
// OUD:   p.lon += (Math.sin(p.track * RAD) * p.speed * seconds) / (M_PER_DEGREE * Math.cos(p.lat * RAD));
function advanceFleet(fleet, area, now) {
  const seconds = (now - fleet.time) / 1000;
  fleet.time = now;
  for (const p of fleet.planes) {
    if (p.onGround) continue;
    const weg = vlucht(p.speed, p.track, p.turn, seconds);
    p.track = (((p.track + p.turn * seconds) % 360) + 360) % 360;
    p.lat += weg.north / M_PER_DEGREE;
    p.lon += weg.east / (M_PER_DEGREE * Math.cos(p.lat * RAD));
    // out of the circle: come back in on the other side, so the number of planes stays the same
    if (distanceKm(area.lat, area.lon, p.lat, p.lon) > area.km) {
      p.lat = area.lat - 0.97 * (p.lat - area.lat);
      p.lon = area.lon - 0.97 * (p.lon - area.lon);
    }
  }
}

const fleets = new Map(); // fake planes per area, so they keep flying between two answers

// the fleet as opensky state vectors, same order as the real ones. like the real thing the
// position is 0 to 10 seconds old: time_position says when the plane was there
function nepFlights(area) {
  const key = keyOf(area);
  const now = Date.now();
  let fleet = fleets.get(key);
  if (!fleet) {
    fleet = makeFleet(area);
    fleets.set(key, fleet);
    while (fleets.size > 8) fleets.delete(fleets.keys().next().value); // only the latest areas
  } else {
    advanceFleet(fleet, area, now);
  }
  const unix = Math.floor(now / 1000);
  return fleet.planes.map((p) => {
    // OUD: const age = p.onGround ? 0 : fleet.random() * 10;
    // OUD: (position 'age' seconds back, time_position rounded down: up to 1 s off)
    // the position is exactly where the plane was at the whole second time_position, so the app's dead reckoning
    // can be checked against it: a plane that flies straight must land exactly on its next position
    const age = p.onGround ? 0 : fleet.random() * 10;
    const timePosition = Math.floor(now / 1000 - age);
    const back = p.onGround ? 0 : now / 1000 - timePosition;
    // OUD: const lat = p.lat - (Math.cos(p.track * RAD) * p.speed * back) / M_PER_DEGREE;
    // OUD: const lon = p.lon - (Math.sin(p.track * RAD) * p.speed * back) / (M_PER_DEGREE * Math.cos(p.lat * RAD));
    // back along the arc to time_position, and the track as it was then: position and track belong to the same moment,
    // like real data. before, a turning plane got its track of now with a position up to 10 s older
    const trackThen = p.track - p.turn * back;
    const weg = vlucht(p.speed, trackThen, p.turn, back);
    const lat = p.lat - weg.north / M_PER_DEGREE;
    const lon = p.lon - weg.east / (M_PER_DEGREE * Math.cos(p.lat * RAD));
    const lonNormal = ((((lon + 180) % 360) + 360) % 360) - 180;
    const state = [
      p.icao,
      p.callsign,
      p.country,
      // OUD: Math.floor(unix - age),
      timePosition,
      unix - Math.floor(age / 2),
      lonNormal,
      lat,
      p.altitude,
      p.onGround,
      p.speed,
      // OUD: p.track,
      (((trackThen % 360) + 360) % 360), // the track at time_position, like the position
      p.vertical,
      null,
      p.altitude,
      p.squawk,
      p.spi,
      0,
    ];
    // OUD: return [ … ] (without index 17)
    // the fake military planes get the same extra as real ones (index 17)
    if (p.militair) state.push({ bron: 'nep', type: p.militair.type, registratie: p.militair.registratie, militair: true, nood: null });
    return state;
  });
}

// ---- routes: where a plane has been (shown as a dashed line when you click it) ----

// the server remembers the route of every plane it gets, from every source, so it can show it without asking anything extra:
// a point every 20 s, up to 2 hours back. opensky tracks (with an account) give the whole flight, but only about one point per
// 10 minutes; these points fill in the last part. without an account, or with adsb.lol, they are the whole route
const ROUTE_ELKE_S = 20;
const ROUTE_HOUD_S = 2 * 3600;
const routes = new Map(); // icao -> [time, lat, lon, time, lat, lon, …] (time in seconds, oldest first)
let routesOpgeruimd = 0;

function onthoudRoutes(flights) {
  const nu = Date.now() / 1000;
  for (const s of flights) {
    if (typeof s[5] !== 'number' || typeof s[6] !== 'number' || s[8]) continue; // no position, or on the ground
    const t = typeof s[3] === 'number' ? s[3] : nu;
    const id = String(s[0]).toLowerCase();
    let r = routes.get(id);
    if (!r) routes.set(id, (r = []));
    if (r.length && t - r[r.length - 3] < ROUTE_ELKE_S) continue;
    r.push(t, s[6], s[5]);
  }
  // once a minute: drop old points, and planes we haven't seen for 2 hours
  if (nu - routesOpgeruimd < 60) return;
  routesOpgeruimd = nu;
  for (const [id, r] of routes) {
    let weg = 0;
    while (weg < r.length && r[weg] < nu - ROUTE_HOUD_S) weg += 3;
    if (weg) r.splice(0, weg);
    if (!r.length) routes.delete(id);
  }
}

// the whole flight from opensky tracks (with an account), remembered for 5 minutes per plane. null = not available.
// at most one request every 3 s per app: clicking through planes quickly then gives the server's own route for the rest
const trackCache = new Map(); // icao -> { tijd, data }
async function openskyTrack(icao, socket) {
  const bewaard = trackCache.get(icao);
  if (bewaard && Date.now() - bewaard.tijd < 5 * 60_000) return bewaard.data;
  if (!account || NEP || Date.now() - (socket.data.vluchtTijd ?? 0) < 3000) return null;
  socket.data.vluchtTijd = Date.now();
  try {
    const ask = async (key) =>
      fetch(`${OPENSKY_API}/tracks/all?icao24=${icao}&time=0`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
    let response = await ask(await getToken());
    if (response.status === 401) response = await ask(await getToken(true));
    const data = response.ok ? await response.json() : null;
    if (!response.ok && response.status !== 404) console.log(`opensky tracks answered ${response.status} for ${icao}`);
    // OUD: trackCache.set(icao, { tijd: Date.now(), data });
    if (data) trackCache.set(icao, { tijd: Date.now(), data }); // only answers that worked: a 404 can be a flight that just started
    while (trackCache.size > 500) trackCache.delete(trackCache.keys().next().value);
    return data;
  } catch (error) {
    console.log(`opensky tracks not reachable for ${icao}:`, error.message);
    return null;
  }
}

// the route of one plane: opensky's whole flight, followed by our own points after its last point. punten = [lat, lon] oldest first
async function routeVan(icao, socket) {
  const eigen = routes.get(icao) ?? [];
  const track = NEP ? null : await openskyTrack(icao, socket);
  // opensky path: [time, latitude, longitude, baro_altitude, true_track, on_ground]
  const pad = (track?.path ?? []).filter((p) => typeof p[1] === 'number' && typeof p[2] === 'number');
  const punten = pad.map((p) => [p[1], p[2]]);
  const laatste = pad.length ? pad[pad.length - 1][0] : -Infinity;
  let eigenErbij = 0;
  for (let i = 0; i < eigen.length; i += 3) {
    if (eigen[i] <= laatste) continue;
    punten.push([eigen[i + 1], eigen[i + 2]]);
    eigenErbij++;
  }
  const van = pad.length ? (track.startTime ?? pad[0][0]) : eigen.length ? eigen[0] : null;
  return { icao, punten, van, bron: pad.length ? 'opensky' : 'radar', eigen: eigenErbij };
}

// a fake whole flight for --nep: the last hour straight back along the plane's track, 31 points. enough to test the button
function nepVlucht(icao) {
  for (const fleet of fleets.values()) {
    const p = fleet.planes.find((x) => x.icao === icao);
    if (!p) continue;
    const punten = [];
    for (let i = 30; i >= 0; i--) {
      const weg = vlucht(p.speed, p.track, 0, -i * 120);
      punten.push([p.lat + weg.north / M_PER_DEGREE, p.lon + weg.east / (M_PER_DEGREE * Math.cos(p.lat * RAD))]);
    }
    // OUD: return { icao, punten, van: Math.floor(Date.now() / 1000) - 3600 };
    return { icao, punten, van: Math.floor(Date.now() / 1000) - 3600, bron: 'nep', eigen: 0 };
  }
  return { icao, fout: 'Dit nep-vliegtuig bestaat niet (meer).' };
}

// OUD: async function flightsFor(area) {
// OUD:   const key = keyOf(area);
// OUD:   const box = boxAround(area);
// OUD:   // OUD: const wait = everySeconds(box.squareDegrees) * 1000;
// OUD:   // the fake source has its own pace, it doesn't spend credits
// OUD:   const wait = (NEP ? NEP_EVERY : everySeconds(box.squareDegrees)) * 1000;
// OUD:   const last = answers.get(key);
// OUD:   if (last && Date.now() - last.time < wait - 2000) return last;
// OUD:   if (NEP) { ... nepFlights, answers.set, return answer }
// OUD:   const query = `lamin=${box.lamin}&lomin=${box.lomin}&lamax=${box.lamax}&lomax=${box.lomax}`;
// OUD:   try {
// OUD:     const response = await fetch(`https://opensky-network.org/api/states/all?${query}`);
// OUD:     if (!response.ok) {
// OUD:       console.log(`opensky answered ${response.status} (credits used up?), keeping the last flights`);
// OUD:       return last ?? { time: 0, flights: [], wait };
// OUD:     }
// OUD:     const data = await response.json();
// OUD:     const flights = (data.states ?? []).filter(...binnen de cirkel...);
// OUD:     const answer = { time: Date.now(), flights, wait, tijd: data.time };
// OUD:     answers.set(key, answer);
// OUD:     console.log(`${new Date().toLocaleTimeString()}  ${area.km} km: ${flights.length} vliegtuigen`);
// OUD:     return answer;
// OUD:   } catch (error) {
// OUD:     console.log('opensky not reachable:', error.message);
// OUD:     return last ?? { time: 0, flights: [], wait };
// OUD:   }
// OUD: }

// the flights for an area, no older than waitMs. from the cache if it's fresh enough, otherwise one new request
// OUD: async function flightsFor(area, waitMs) {
// OUD:   const key = keyOf(area);
async function flightsFor(area, waitMs, bron = 'opensky') {
  const key = answerKey(area, bron);
  const now = Date.now();
  // forget old answers, otherwise every area that was ever looked at (dragging the circle!) stays in memory
  for (const [k, answer] of answers) if (now - answer.time > KEEP_MS) answers.delete(k);
  const last = answers.get(key);
  // OUD: if (last && now - last.time < waitMs - 2000) return last;
  // (2 s slack is fine for opensky's 5 to 120 s, but adsb.lol 'snel' is every 2 s: then it would always come from the cache)
  if (last && now - last.time < waitMs - Math.min(2000, waitMs / 4)) return last;
  // OUD: if (!NEP && now < tegoed.pauzeTot) return last ?? EMPTY;
  // credits used up: don't ask until opensky allows it again, keep the last flights. same after an error at adsb.lol
  if (!NEP && now < (bron === 'adsblol' ? adsb.pauzeTot : tegoed.pauzeTot)) return last ?? EMPTY;
  // is this area being asked right now (two apps that start at the same time, or a page reload)? then wait for that answer
  if (running.has(key)) return running.get(key);
  // OUD: const request = askFor(area, key);
  const request = askFor(area, key, bron);
  running.set(key, request);
  request.finally(() => running.get(key) === request && running.delete(key));
  return request;
}

// OUD: async function askFor(area, key) {
async function askFor(area, key, bron) {
  try {
    // OUD: const fresh = NEP ? { flights: nepFlights(area), tijd: Date.now() / 1000 } : await askOpensky(area);
    const fresh = NEP
      ? { flights: nepFlights(area), tijd: Date.now() / 1000 }
      : bron === 'adsblol'
        ? await askAdsb(area)
        : await askOpensky(area);
    if (!fresh) return answers.get(key) ?? EMPTY;
    onthoudRoutes(fresh.flights);
    const answer = { time: Date.now(), ...fresh };
    answers.set(key, answer);
    // OUD: const credits = NEP ? '' : `, tegoed ${tegoed.over ?? '?'}${account ? ' (account)' : ''}`;
    // OUD: console.log(`${new Date().toLocaleTimeString()}  ${NEP ? 'nep ' : ''}${area.km} km: ${fresh.flights.length} vliegtuigen${credits}`);
    const credits = NEP || bron !== 'opensky' ? '' : `, tegoed ${tegoed.over ?? '?'}${account ? ' (account)' : ''}`;
    const naam = NEP ? 'nep ' : bron === 'adsblol' ? 'adsb.lol ' : '';
    console.log(`${new Date().toLocaleTimeString()}  ${naam}${area.km} km: ${fresh.flights.length} vliegtuigen${credits}`);
    return answer;
  } catch (error) {
    console.log(`${bron} not reachable:`, error.message);
    return answers.get(key) ?? EMPTY;
  }
}

// OUD: async function send(socket) {
// OUD:   const area = socket.data.area;
// OUD:   const answer = await flightsFor(area);
// OUD:   socket.emit('gebied', { ...area, seconden: answer.wait / 1000 });
// OUD:   // OUD: socket.emit('flights', answer.flights);
// OUD:   socket.emit('flights', answer.flights, { tijd: answer.tijd ?? null, nu: Date.now() });
// OUD:   clearTimeout(socket.data.timer);
// OUD:   socket.data.timer = setTimeout(() => send(socket), answer.wait);
// OUD: }

async function send(socket) {
  clearTimeout(socket.data.timer);
  // every request gets a number. if a newer one starts while this one waits for opensky (other area or stand),
  // this answer is too late: without this an old area could arrive after the new one and stay on screen
  const version = ++socket.data.version;
  // OUD: const area = socket.data.area;
  const bron = socket.data.bron;
  // adsb.lol goes up to 450 km. the app's slider stops there too, this is for an app that doesn't know yet
  const area = bron === 'adsblol' ? { ...socket.data.area, km: Math.min(socket.data.area.km, ADSB_MAX_KM) } : socket.data.area;
  const stand = socket.data.stand;
  // OUD: const seconden = secondsFor(area, stand);
  // OUD: const answer = await flightsFor(area, seconden * 1000);
  const seconden = secondsFor(area, stand, bron);
  const answer = await flightsFor(area, seconden * 1000, bron);
  if (version !== socket.data.version || socket.disconnected) return;

  // OUD: const credits = NEP ? 0 : creditsFor(boxAround(area).squareDegrees);
  const credits = NEP || bron !== 'opensky' ? 0 : creditsFor(boxAround(area).squareDegrees);
  // OUD: socket.emit('gebied', { ...area, seconden, stand, credits, perUur: NEP ? 0 : Math.round((credits * 3600) / seconden) });
  // standen: the seconds of every stand for this area, so the app can show them on its buttons without knowing the rules
  // OUD: const standen = Object.fromEntries(Object.keys(STANDEN).map((s) => [s, secondsFor(area, s)]));
  // OUD: socket.emit('gebied', { ...area, seconden, stand, standen, credits, perUur: NEP ? 0 : Math.round((credits * 3600) / seconden) });
  // OUD: socket.emit('tegoed', tegoedInfo());
  const standen = Object.fromEntries(Object.keys(STANDEN).map((s) => [s, secondsFor(area, s, bron)]));
  socket.emit('gebied', { ...area, seconden, stand, standen, credits, perUur: Math.round((credits * 3600) / seconden), bron });
  socket.emit('tegoed', tegoedInfo(bron));
  // the same snapshot again (credits used up, or opensky had nothing newer yet): the app already has it, don't send it twice
  // OUD: const snapshot = `${keyOf(area)}|${answer.tijd ?? `t${answer.time}`}`;
  const snapshot = `${answerKey(area, bron)}|${answer.tijd ?? `t${answer.time}`}`;
  if (snapshot !== socket.data.lastSent) {
    socket.data.lastSent = snapshot;
    // extra argument, older apps simply ignore it: when the snapshot is from (tijd, seconds) and the server clock right now (nu, ms).
    // with nu the app works out how far its own clock is off, so the dead reckoning doesn't depend on the clock of the pc
    // OUD: socket.emit('flights', answer.flights, { tijd: answer.tijd ?? null, nu: Date.now() });
    // gebied: which area and source this answer is for. the app asks a new area half a second after you let go of the circle,
    // an answer for the old area can still come in before that. with this the app knows it's not the new data yet
    socket.emit('flights', answer.flights, { tijd: answer.tijd ?? null, nu: Date.now(), gebied: { lat: area.lat, lon: area.lon, km: area.km, bron } });
  }
  // next time: after the interval, or when opensky allows it again if the credits are used up
  // OUD: const waitMs = Math.max(seconden * 1000, NEP ? 0 : tegoed.pauzeTot - Date.now() + 1000);
  // (for adsb.lol: when the wait after an error is over)
  const pauze = NEP ? 0 : bron === 'adsblol' ? adsb.pauzeTot : tegoed.pauzeTot;
  const waitMs = Math.max(seconden * 1000, pauze - Date.now() + (bron === 'adsblol' ? 100 : 1000));
  socket.data.timer = setTimeout(() => send(socket), waitMs);
}

// a number from the app, or the default. 0 is a real number (equator, greenwich), not "missing"
const numberOr = (value, fallback) => {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};

io.on('connection', (socket) => {
  socket.data.area = { ...START };
  socket.data.stand = standaardStand();
  socket.data.bron = 'opensky'; // D6: opensky is the default, adsb.lol a choice in the panel
  socket.data.version = 0;
  // OUD: send(socket);
  // wait a moment: the app sends its own choices (source, stand) right after connecting. asking opensky first would cost
  // credits for an answer nobody wants (every page reload with adsb.lol chosen). a choice that comes in starts send itself
  socket.data.timer = setTimeout(() => send(socket), 150);

  // the app picked another source: opensky or adsb.lol
  socket.on('bron', (wish) => {
    const bron = wish?.bron === 'adsblol' || wish?.bron === 'opensky' ? wish.bron : null;
    if (!bron || bron === socket.data.bron) return;
    socket.data.bron = bron;
    socket.data.lastSent = null; // other source, so always send its flights
    send(socket);
  });

  // the app picked another centre or radius
  socket.on('gebied', (wish) => {
    // OUD: const km = Math.round(Math.min(Math.max(Number(wish?.km) || START.km, MIN_KM), MAX_KM));
    // OUD: const lat = Math.min(Math.max(Number(wish?.lat) || START.lat, -85), 85);
    // OUD: const lon = ((((Number(wish?.lon) || START.lon) + 180) % 360) + 360) % 360 - 180;
    // (|| made a latitude or longitude of exactly 0 the middle of the netherlands)
    const km = Math.round(Math.min(Math.max(numberOr(wish?.km, START.km), MIN_KM), MAX_KM));
    const lat = Math.min(Math.max(numberOr(wish?.lat, START.lat), -85), 85);
    const lon = ((((numberOr(wish?.lon, START.lon) + 180) % 360) + 360) % 360) - 180;
    socket.data.area = { lat, lon, km };
    socket.data.lastSent = null; // a new area always gets its flights, also when they come from the cache (otherwise the app keeps waiting)
    send(socket);
  });

  // the app picked how often it wants new data: zuinig, normaal or snel
  socket.on('verversen', (wish) => {
    const stand = typeof wish?.stand === 'string' && Object.hasOwn(STANDEN, wish.stand) ? wish.stand : null;
    if (!stand || stand === socket.data.stand) return;
    socket.data.stand = stand;
    send(socket);
  });

  // OUD: the whole flight of one plane ("Hele vlucht" button): only opensky tracks, only with an account, else an error.
  // OUD: socket.on('vlucht', async (wish) => {
  // OUD:   … if (Date.now() - (socket.data.vluchtTijd ?? 0) < 3000) return socket.emit('vlucht', { icao, fout: 'Even wachten, net al gevraagd.' });
  // OUD:   … if (!account) return socket.emit('vlucht', { icao, fout: 'Alleen met een OpenSky-account.' });
  // OUD:   … fetch tracks/all, 404 → 'OpenSky kent geen vlucht van dit toestel.', else emit { icao, punten, van }
  // OUD: });

  // the route a plane has flown, asked by the app as soon as you click a plane: opensky's whole flight (with an account) plus
  // the server's own points after it, or only the own points (no account, adsb.lol, or opensky doesn't know the flight)
  socket.on('vlucht', async (wish) => {
    const icao = typeof wish?.icao === 'string' ? wish.icao.toLowerCase() : '';
    if (!/^[0-9a-f]{6}$/.test(icao)) return socket.emit('vlucht', { icao, fout: 'Geen geldig ICAO-adres.' });
    if (NEP) return socket.emit('vlucht', nepVlucht(icao));
    const route = await routeVan(icao, socket);
    if (route.punten.length < 2) return socket.emit('vlucht', { icao, fout: 'Nog geen route: de radar ziet dit toestel net.' });
    console.log(`${new Date().toLocaleTimeString()}  route of ${icao}: ${route.punten.length} points (${route.bron}, ${route.eigen} own)`);
    socket.emit('vlucht', route);
  });

  socket.on('disconnect', () => {
    clearTimeout(socket.data.timer);
    socket.data.version++; // a request that is still running for this app doesn't schedule a next one
  });
});

// OUD: server.listen(3001, () => {
// OUD:   console.log('radar server on http://localhost:3001');
server.listen(PORT, () => {
  console.log(`radar server on http://localhost:${PORT}`);
  if (NEP) console.log(`nep: ${NEP} fake planes, new answer every ${NEP_EVERY} s, opensky is not called`);
  else if (account) console.log('opensky: with the api client from .env (more credits, new data every 5 s)');
  else console.log('opensky: anonymous (400 credits a day, new data every 10 s). an api client in .env gives more, see .env.example');
  if (process.env.OPENSKY_API_URL) console.log(`opensky address changed to ${OPENSKY_API}`);
  if (!NEP) console.log('adsb.lol: second source, pick it in the panel (no key, no credits, up to 450 km)');
  if (process.env.ADSBLOL_API_URL) console.log(`adsb.lol address changed to ${ADSB_API}`);
});
