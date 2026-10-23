// stand-in for the backend that isn't in this repo: gets live flights from opensky
// (no login, so a limited number of credits a day) and sends them to the app over
// socket.io. every app picks its own area: a centre and a radius in km
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const START = { lat: 52.13, lon: 5.29, km: 250 }; // middle of the netherlands
const MIN_KM = 25;
const MAX_KM = 1000;

// opensky charges more credits for a bigger box, so a bigger box is asked less often
function everySeconds(squareDegrees) {
  if (squareDegrees <= 25) return 30;
  if (squareDegrees <= 100) return 60;
  if (squareDegrees <= 400) return 90;
  return 120;
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

const server = createServer();
const io = new Server(server, { cors: { origin: '*' } });

// last answer per area, so two apps with the same area cost one call
const answers = new Map();
const keyOf = ({ lat, lon, km }) => `${lat.toFixed(2)},${lon.toFixed(2)},${km}`;

async function flightsFor(area) {
  const key = keyOf(area);
  const box = boxAround(area);
  const wait = everySeconds(box.squareDegrees) * 1000;
  const last = answers.get(key);
  if (last && Date.now() - last.time < wait - 2000) return last;

  const query = `lamin=${box.lamin}&lomin=${box.lomin}&lamax=${box.lamax}&lomax=${box.lomax}`;
  try {
    const response = await fetch(`https://opensky-network.org/api/states/all?${query}`);
    if (!response.ok) {
      console.log(`opensky answered ${response.status} (credits used up?), keeping the last flights`);
      return last ?? { time: 0, flights: [], wait };
    }
    const data = await response.json();
    const flights = (data.states ?? []).filter(
      (s) => typeof s[6] === 'number' && typeof s[5] === 'number' && distanceKm(area.lat, area.lon, s[6], s[5]) <= area.km,
    );
    const answer = { time: Date.now(), flights, wait };
    answers.set(key, answer);
    console.log(`${new Date().toLocaleTimeString()}  ${area.km} km: ${flights.length} vliegtuigen`);
    return answer;
  } catch (error) {
    console.log('opensky not reachable:', error.message);
    return last ?? { time: 0, flights: [], wait };
  }
}

async function send(socket) {
  const area = socket.data.area;
  const answer = await flightsFor(area);
  socket.emit('gebied', { ...area, seconden: answer.wait / 1000 });
  socket.emit('flights', answer.flights);
  clearTimeout(socket.data.timer);
  socket.data.timer = setTimeout(() => send(socket), answer.wait);
}

io.on('connection', (socket) => {
  socket.data.area = { ...START };
  send(socket);

  // the app picked another centre or radius
  socket.on('gebied', (wish) => {
    const km = Math.round(Math.min(Math.max(Number(wish?.km) || START.km, MIN_KM), MAX_KM));
    const lat = Math.min(Math.max(Number(wish?.lat) || START.lat, -85), 85);
    const lon = ((((Number(wish?.lon) || START.lon) + 180) % 360) + 360) % 360 - 180;
    socket.data.area = { lat, lon, km };
    send(socket);
  });

  socket.on('disconnect', () => clearTimeout(socket.data.timer));
});

server.listen(3001, () => console.log('radar server on http://localhost:3001'));
