// stand-in for the backend that isn't in this repo: gets live flights above the
// netherlands from opensky (no login, so a limited number of calls a day) and
// sends them to the app over socket.io, like the old server did
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const AREA = 'lamin=50&lomin=3&lamax=54&lomax=8'; // same box as openskyClient.ts
const EVERY = 30_000; // ms, anonymous opensky only updates every 10 s anyway

const server = createServer();
const io = new Server(server, { cors: { origin: '*' } });
let flights = [];

async function update() {
  try {
    const response = await fetch(`https://opensky-network.org/api/states/all?${AREA}`);
    if (!response.ok) {
      console.log(`opensky answered ${response.status}, trying again later`);
      return;
    }
    const data = await response.json();
    flights = data.states ?? [];
    io.emit('flights', flights);
    console.log(`${new Date().toLocaleTimeString()}  ${flights.length} vliegtuigen`);
  } catch (error) {
    console.log('opensky not reachable:', error.message);
  }
}

// someone who opens the page gets the last known flights straight away
io.on('connection', (socket) => socket.emit('flights', flights));

server.listen(3001, () => console.log('radar server on http://localhost:3001'));
update();
setInterval(update, EVERY);
