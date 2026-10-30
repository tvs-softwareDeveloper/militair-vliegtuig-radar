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

// seconds between two requests for this area and stand: the budget divided over the cost, never faster than opensky has data
function secondsFor(area, stand) {
  if (NEP) return NEP_EVERY;
  const credits = creditsFor(boxAround(area).squareDegrees);
  return Math.max(minSeconden(), (credits * 3600) / STANDEN[stand]);
}

// what opensky told us about the credits: how many are left (it sends that with every answer) and,
// after a 429 (used up), until when we have to wait
const tegoed = { over: null, pauzeTot: 0 };

const tegoedInfo = () => ({
  bron: NEP ? 'nep' : 'opensky',
  account, // logged in with a key
  over: NEP ? null : tegoed.over, // credits left, null = not known yet
  pauzeTot: !NEP && tegoed.pauzeTot > Date.now() ? tegoed.pauzeTot : null, // credits used up: no new data until then (ms)
  minSeconden: NEP ? NEP_EVERY : minSeconden(),
});

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
  return { flights, tijd: data.time }; // tijd: opensky's time of this snapshot, in seconds
}

const server = createServer();
const io = new Server(server, { cors: { origin: '*' } });

// last answer per area, so two apps with the same area cost one call
const answers = new Map();
const keyOf = ({ lat, lon, km }) => `${lat.toFixed(2)},${lon.toFixed(2)},${km}`;
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
    });
  }
  return { planes, time: Date.now(), random: seeded(NEP + 1) };
}

// let every plane fly on for the time since the last answer
function advanceFleet(fleet, area, now) {
  const seconds = (now - fleet.time) / 1000;
  fleet.time = now;
  for (const p of fleet.planes) {
    if (p.onGround) continue;
    p.track = (((p.track + p.turn * seconds) % 360) + 360) % 360;
    p.lat += (Math.cos(p.track * RAD) * p.speed * seconds) / M_PER_DEGREE;
    p.lon += (Math.sin(p.track * RAD) * p.speed * seconds) / (M_PER_DEGREE * Math.cos(p.lat * RAD));
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
    const lat = p.lat - (Math.cos(p.track * RAD) * p.speed * back) / M_PER_DEGREE;
    const lon = p.lon - (Math.sin(p.track * RAD) * p.speed * back) / (M_PER_DEGREE * Math.cos(p.lat * RAD));
    const lonNormal = ((((lon + 180) % 360) + 360) % 360) - 180;
    return [
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
      p.track,
      p.vertical,
      null,
      p.altitude,
      p.squawk,
      p.spi,
      0,
    ];
  });
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
async function flightsFor(area, waitMs) {
  const key = keyOf(area);
  const now = Date.now();
  // forget old answers, otherwise every area that was ever looked at (dragging the circle!) stays in memory
  for (const [k, answer] of answers) if (now - answer.time > KEEP_MS) answers.delete(k);
  const last = answers.get(key);
  if (last && now - last.time < waitMs - 2000) return last;
  // credits used up: don't ask until opensky allows it again, keep the last flights
  if (!NEP && now < tegoed.pauzeTot) return last ?? EMPTY;
  // is this area being asked right now (two apps that start at the same time, or a page reload)? then wait for that answer
  if (running.has(key)) return running.get(key);
  const request = askFor(area, key);
  running.set(key, request);
  request.finally(() => running.get(key) === request && running.delete(key));
  return request;
}

async function askFor(area, key) {
  try {
    const fresh = NEP ? { flights: nepFlights(area), tijd: Date.now() / 1000 } : await askOpensky(area);
    if (!fresh) return answers.get(key) ?? EMPTY;
    const answer = { time: Date.now(), ...fresh };
    answers.set(key, answer);
    const credits = NEP ? '' : `, tegoed ${tegoed.over ?? '?'}${account ? ' (account)' : ''}`;
    console.log(`${new Date().toLocaleTimeString()}  ${NEP ? 'nep ' : ''}${area.km} km: ${fresh.flights.length} vliegtuigen${credits}`);
    return answer;
  } catch (error) {
    console.log('opensky not reachable:', error.message);
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
  const area = socket.data.area;
  const stand = socket.data.stand;
  const seconden = secondsFor(area, stand);
  const answer = await flightsFor(area, seconden * 1000);
  if (version !== socket.data.version || socket.disconnected) return;

  const credits = NEP ? 0 : creditsFor(boxAround(area).squareDegrees);
  // OUD: socket.emit('gebied', { ...area, seconden, stand, credits, perUur: NEP ? 0 : Math.round((credits * 3600) / seconden) });
  // standen: the seconds of every stand for this area, so the app can show them on its buttons without knowing the rules
  const standen = Object.fromEntries(Object.keys(STANDEN).map((s) => [s, secondsFor(area, s)]));
  socket.emit('gebied', { ...area, seconden, stand, standen, credits, perUur: NEP ? 0 : Math.round((credits * 3600) / seconden) });
  socket.emit('tegoed', tegoedInfo());
  // the same snapshot again (credits used up, or opensky had nothing newer yet): the app already has it, don't send it twice
  const snapshot = `${keyOf(area)}|${answer.tijd ?? `t${answer.time}`}`;
  if (snapshot !== socket.data.lastSent) {
    socket.data.lastSent = snapshot;
    // extra argument, older apps simply ignore it: when the snapshot is from (tijd, seconds) and the server clock right now (nu, ms).
    // with nu the app works out how far its own clock is off, so the dead reckoning doesn't depend on the clock of the pc
    socket.emit('flights', answer.flights, { tijd: answer.tijd ?? null, nu: Date.now() });
  }
  // next time: after the interval, or when opensky allows it again if the credits are used up
  const waitMs = Math.max(seconden * 1000, NEP ? 0 : tegoed.pauzeTot - Date.now() + 1000);
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
  socket.data.version = 0;
  send(socket);

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
});
