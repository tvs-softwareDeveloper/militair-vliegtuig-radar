// gedeelde hulpjes voor de tests: servers starten en stoppen, wachten tot een poort antwoordt, de uitslag bijhouden.
// alles draait op eigen poorten (31xx en 51xx), zodat een radar die je zelf op 3001 en 5173 hebt draaien er niet last van heeft
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

export const MAP = path.resolve(fileURLToPath(new URL('..', import.meta.url))); // de map van het project
export const UITVOER = path.join(MAP, 'tests', '.uitvoer'); // builds en logs van de tests, staat in .gitignore
const VITE = path.join(MAP, 'node_modules', 'vite', 'bin', 'vite.js');

export const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

// de uitslag: elke controle een regel GOED of FOUT, aan het eind de telling
export function uitslag() {
  const telling = { goed: 0, fout: 0 };
  const check = (naam, ok, extra = '') => {
    ok ? telling.goed++ : telling.fout++;
    console.log(`${ok ? 'GOED' : 'FOUT'}  ${naam}${extra ? '  ' + extra : ''}`);
  };
  return { check, telling };
}

// de app bouwen. server: het adres van de radarserver dat in de build komt (VITE_SERVER)
export function bouw(naam, server, map = MAP) {
  const uit = path.join(UITVOER, naam);
  mkdirSync(UITVOER, { recursive: true });
  const r = spawnSync(process.execPath, [VITE, 'build', '--outDir', uit, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: map,
    env: { ...process.env, VITE_SERVER: server ?? '' },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`bouwen mislukt:\n${r.stderr || r.stdout}`);
  return uit;
}

// een proces dat we zelf starten en weer stoppen, met zijn uitvoer als lijst regels
function proces(args, opties = {}) {
  const kind = spawn(process.execPath, args, { cwd: opties.cwd ?? MAP, env: { ...process.env, ...opties.env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const regels = [];
  const lees = (buf) => regels.push(...buf.toString().split(/\r?\n/).filter(Boolean));
  kind.stdout.on('data', lees);
  kind.stderr.on('data', lees);
  return {
    kind,
    regels,
    stop: () =>
      new Promise((klaar) => {
        if (kind.exitCode !== null || kind.signalCode !== null) return klaar();
        kind.once('exit', () => klaar());
        kind.kill();
      }),
  };
}

// wacht tot een adres antwoordt (een server die net start)
export async function wachtOp(url, ms = 15000) {
  const tot = Date.now() + ms;
  while (Date.now() < tot) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // nog niet bereikbaar
    }
    await wacht(150);
  }
  throw new Error(`${url} antwoordt niet binnen ${ms / 1000} s`);
}

// is er al iets op deze poort? dan stoppen we liever dan iemands eigen server te raken
export async function poortVrij(poort) {
  try {
    await fetch(`http://127.0.0.1:${poort}/`, { signal: AbortSignal.timeout(1000) });
    return false;
  } catch (e) {
    return e.cause?.code === 'ECONNREFUSED' || e.name !== 'TimeoutError';
  }
}

// de radarserver (dev-server.mjs). args bv. ['--nep', '1000', '--elke', '5']; env bv. de adressen van de nep-bronnen
export async function radarServer(poort, args = [], env = {}) {
  if (!(await poortVrij(poort))) throw new Error(`poort ${poort} is al in gebruik`);
  const p = proces(['dev-server.mjs', '--poort', String(poort), ...args], { env });
  await wachtOp(`http://127.0.0.1:${poort}/socket.io/?EIO=4&transport=polling`);
  return p;
}

// de nep-bronnen (nepbronnen.mjs): nep-adsb.lol en nep-opensky
export async function nepBronnen(poort) {
  if (!(await poortVrij(poort))) throw new Error(`poort ${poort} is al in gebruik`);
  const p = proces([path.join(MAP, 'tests', 'nepbronnen.mjs'), String(poort)]);
  await wachtOp(`http://127.0.0.1:${poort}/log`);
  return p;
}

// een gebouwde app serveren met vite preview
export async function preview(map, poort) {
  if (!(await poortVrij(poort))) throw new Error(`poort ${poort} is al in gebruik`);
  const p = proces([VITE, 'preview', '--outDir', map, '--port', String(poort), '--strictPort', '--host', '127.0.0.1']);
  await wachtOp(`http://127.0.0.1:${poort}/`);
  return p;
}

// de browser: de headless chromium van playwright. op windows met d3d11, anders tekent hij in software (swiftshader)
// in plaats van op de videokaart. de volledige chromium start niet vanuit de claude-app (spawn UNKNOWN), de headless shell wel
export function browser() {
  const args = process.platform === 'win32' ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : [];
  return chromium.launch({ args });
}

// een pagina van de radar, met de kaarttegels geblokkeerd (alleen het tekenen van de vliegtuigen telt) en fouten opgevangen
export async function radarPagina(context, url, { minVliegtuigen = 1, fouten = [] } = {}) {
  const page = await context.newPage();
  page.on('pageerror', (e) => fouten.push(e.message));
  await page.route(/arcgisonline\.com/, (r) => r.abort());
  await page.goto(url);
  await page.waitForFunction((n) => (window.__teller?.totaal ?? 0) >= n && window.__vliegtuigLaag, minVliegtuigen, { timeout: 30000 });
  await wacht(1500);
  return page;
}
