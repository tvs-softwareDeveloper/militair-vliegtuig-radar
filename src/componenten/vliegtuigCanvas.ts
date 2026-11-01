import L from "leaflet";
// OUD: import { GEEN_BEOORDELING, kleurVan, NIVEAUS, type Beoordeling, type Niveau } from "../dreiging";
import { extraVan, GEEN_BEOORDELING, kleurVan, NIVEAUS, type Beoordeling, type Niveau } from "../dreiging";
import { meting } from "../../utils/meting";
// OUD: import { CORRECTIE_MS, MIN_SNELHEID, SPRONG_M, horizonVan, koersVerschil, uitdoven, wereldPerMeter, wereldSnelheid } from "../beweging";
import {
  BOCHT_SECONDEN,
  CORRECTIE_MS,
  MIN_SNELHEID,
  SPRONG_M,
  horizonVan,
  koersVerschil,
  netteDraai,
  uitdoven,
  verschuiving,
  wereldPerMeter,
  wereldSnelheid,
} from "../beweging";
import { bochtUitUrl } from "../meten";

//! hoe lang de voorspelling in een bocht meedraait (fase 3 van het tweede plan). met ?meten&bocht=… in te stellen om te vergelijken
const BOCHT = bochtUitUrl ?? BOCHT_SECONDEN;
//! sporen (fase 4 van het tweede plan): elke 2 s een punt, hoogstens 30 en 60 s terug. getekend 2× per seconde op een eigen canvas,
//! voor de vliegtuigen in beeld vanaf zoom 8, en altijd voor het gekozen vliegtuig (K7)
const SPOOR_ELKE_MS = 2000;
const SPOOR_PUNTEN = 30;
const SPOOR_MS = 60_000;
const SPOOR_ZOOM = 8;
const SPOOR_BEELD_MS = 500;
const SPOOR_LAGEN = [0.6, 0.42, 0.26, 0.12]; //! hoe ouder het stuk spoor (per 15 s), hoe vager
const SPOOR_STAP_PX = 4; //! kortere stukjes spoor worden samengevoegd
const SCHAT_MIN_S = 4; //! de draaisnelheid uit twee pakketten schatten we pas vanaf zoveel seconden ertussen: korter geeft vooral ruis
// OUD: const SCHAT_MAX_S = 130; //! en tot zoveel: langer is te oud (en past bij Zuinig met een groot gebied, 120 s)
//! en tot zoveel. gemeten op echte opensky (fase 3): bij Zuinig (60 s ertussen) is een bocht vaak al voorbij voor het volgende
//! pakket, en voorspelde de boog rechtdoor vliegende vliegtuigen slechter (p95 9 -> 14 px) zonder in bochten echt te helpen.
//! 25 = Normaal met een account (20 s) plus speling, want de posities in een pakket zijn verschillend oud
const SCHAT_MAX_S = 25;

//! alle vliegtuigen op één canvas in plaats van duizenden losse markers, met frustum culling: wat buiten beeld valt wordt niet getekend.
//! een eigen Leaflet-laag die werkt zoals Leaflets eigen L.Renderer: het canvas ligt in een pane, is aan elke kant 10% groter dan het
//! beeld en schuift met de kaart mee. slepen kost dus geen tekenwerk, en bij zoomen schaalt het canvas met css mee tot de zoom klaar is.
//! de vliegtuigen bewegen echt: met gegist bestek (beweging.ts) rekent de laag elk beeld uit waar ze nu zijn, en hij tekent pas
//! opnieuw als het snelste zichtbare vliegtuig een halve pixel verder is. ingezoomd (weinig vliegtuigen in beeld) is dat vaak,
//! uitgezoomd (veel vliegtuigen, die op het scherm bijna stilstaan) heel weinig: zo werken culling en beweging samen

//! vliegtuig van bovenaf, neus naar boven (noorden), dezelfde vorm als het oude icoon in planeIcons.tsx
const VLIEGTUIG =
  "M12 2c.8 0 1.4.7 1.4 1.6v5.6l7.6 4.4v2l-7.6-2.3v4.4l2.2 1.7v1.6L12 20.1 8.4 21v-1.6l2.2-1.7v-4.4L3 15.6v-2l7.6-4.4V3.6C10.6 2.7 11.2 2 12 2z";
//! militair toestel: een straaljager met deltavleugel, ook neus naar boven. zo zie je het verschil meteen, en de kleur blijft het niveau (K2)
const MILITAIR = "M12 1.5L13.2 6L21 18.5V19.6H14.5L15.8 21.5V22.5L12 22L8.2 22.5V21.5L9.5 19.6H3V18.5L10.8 6Z";
const VORMEN = [VLIEGTUIG, MILITAIR]; //! 0 = gewoon, 1 = militair

const ICOON = 24; //! grootte van een vliegtuig in css-pixels, zoals de oude marker
const SPRITE = 32; //! icoon plus ruimte voor de schaduw
const MARGE = 0.1; //! het canvas is aan elke kant 10% van het beeld groter, zodat slepen geen lege randen geeft
// OUD: const OVERGANG_MS = 800; //! zo lang schuift een vliegtuig naar zijn nieuwe positie (echte beweging komt later met gegist bestek)
const KLIK_PX = 14; //! zo dichtbij moet je klikken om een vliegtuig te raken
const PULS_MS = 1800; //! één klop van een pulsring, net als de oude css-animatie
const PULS_BEELD_MS = 33; //! pulsringen hooguit 30 keer per seconde tekenen
const HOEKEN = 72; //! het icoon staat klaar in stappen van 5 graden, net als het oude icoon (planeIcons.tsx rondde ook af op 5 graden)
const STAP_PX = 0.5; //! pas opnieuw tekenen als het snelste zichtbare vliegtuig zoveel pixels verder is
const MAX_WACHT_MS = 2000; //! en hoe dan ook minstens zo vaak, zolang er iets beweegt (bijvoorbeeld een vliegtuig dat zijn horizon haalt)
const ICOON_STRAAL = 10; //! afstand van het midden tot de neus, om een draaiing om te rekenen naar verschoven pixels
//! meer vliegtuigen in beeld dan dit (de hele wereld, ver uitgezoomd): een gekleurd puntje in plaats van een plaatje. één drawImage
//! kost ±7 µs, 10.000 plaatjes dus ±60 ms per beeld (30 fps). puntjes gaan per kleur in één pad: 10.000 kosten ±2 ms (gemeten 01-11-2026).
//! militaire toestellen en het gekozen vliegtuig blijven een plaatje, dat zijn er weinig
const PUNTJES_VANAF = 5000;
const PUNTJE = 3; //! css-pixels

//! één vliegtuig zoals de laag het onthoudt. posities zijn wereldcoördinaten (Web-Mercator op zoom 0): die rekenen we één keer per
//! pakket uit, daarna kost een schermpositie per beeld nog maar een vermenigvuldiging en een aftrekking, zonder sin of log
type Spoor = {
  id: string;
  // OUD: vanX: number; //! waar de overgang begon
  // OUD: vanY: number;
  // OUD: naarX: number; //! de positie uit het laatste pakket
  // OUD: naarY: number;
  // OUD: start: number; //! begin van de overgang (performance.now)
  bx: number; //! wereldpositie uit het laatste pakket, op tijdstip t0
  by: number;
  vx: number; //! snelheid in wereldeenheden per seconde (0 = niet doorrekenen: op de grond, te langzaam of geen koers)
  vy: number;
  v: number; //! lengte van die snelheid, om uit te rekenen hoe snel hij over het scherm gaat
  t0: number; //! wanneer hij op bx, by was (time_position), in seconden op de klok van de server
  koers: number; //! koers uit het pakket, in graden
  dx: number; //! verschil tussen waar hij getekend stond en de nieuwe voorspelling bij het laatste pakket: dooft uit in CORRECTIE_MS
  dy: number;
  dKoers: number; //! zelfde voor de koers, in graden
  correctieStart: number; //! wanneer dat pakket binnenkwam (performance.now)
  x: number; //! waar hij nu getekend wordt
  y: number;
  koersNu: number; //! koers zoals hij nu getekend wordt
  hoek: number; //! welk van de vooraf gedraaide plaatjes (0 = noord, stappen van 5 graden)
  oud: boolean; //! langer dan de horizon geen nieuwe positie: staat stil en wordt half doorzichtig getekend (D2)
  niveau: Niveau;
  militair: boolean; //! eigen vorm, en telt mee voor het filter "alleen militair"
  draai: number; //! draaisnelheid in graden per seconde (0 = rechtdoor): van adsb.lol, of geschat uit twee pakketten
  pad: number[]; //! het spoor: x, y (wereld) en tijd (performance.now) achter elkaar, het oudste eerst
  fase: number; //! verschuiving van de pulsring in ms, zodat niet alle ringen tegelijk kloppen
};

export type VliegtuigCanvasOpties = {
  onKlik: (id: string | null) => void; //! klik op een vliegtuig (id) of op een lege plek of Esc (null)
  onGekozenPositie: (positie: L.LatLng) => void; //! het gekozen vliegtuig staat ergens anders getekend: de popup moet mee
};

//! tijdinformatie bij een pakket: wanneer de momentopname is (seconden) en hoeveel de klok van de server voorloopt op die van de browser (ms)
//! lengtegraad naar wereld x (Web-Mercator op zoom 0, de wereld is 256 breed). loopt gewoon door voorbij 180, net als bij Leaflet
const wereldXVan = (lengte: number) => ((lengte + 180) / 360) * 256;

// OUD: export type PakketTijd = { tijd: number | null; klokVerschil: number };
//! oudGebied: dit pakket hoort nog bij het vorige gebied (de cirkel is net verplaatst, het nieuwe gebied is nog onderweg)
export type PakketTijd = { tijd: number | null; klokVerschil: number; oudGebied?: boolean };

// OUD: //! zet x en y van een spoor op de getekende positie op tijdstip nu: in OVERGANG_MS van de oude naar de nieuwe positie
// OUD: const positie = (s: Spoor, nu: number) => {
// OUD:   const t = (nu - s.start) / OVERGANG_MS;
// OUD:   if (t >= 1) {
// OUD:     s.x = s.naarX;
// OUD:     s.y = s.naarY;
// OUD:     return;
// OUD:   }
// OUD:   const e = t <= 0 ? 0 : 1 - (1 - t) ** 3; //! snel vertrekken, rustig aankomen
// OUD:   s.x = s.vanX + (s.naarX - s.vanX) * e;
// OUD:   s.y = s.vanY + (s.naarY - s.vanY) * e;
// OUD: };

//! zet x, y en koers van een spoor op tijdstip nu (performance.now). sec is hetzelfde moment op de klok van de server, in seconden.
//! gegist bestek: de positie uit het pakket plus snelheid × verstreken tijd, plus de correctie die nog aan het uitdoven is
const positie = (s: Spoor, nu: number, sec: number, horizon: number) => {
  let dt = sec - s.t0;
  s.oud = dt > horizon;
  if (dt < 0) dt = 0;
  else if (dt > horizon) dt = horizon; //! na de horizon blijft hij staan waar hij toen was
  const f = uitdoven((nu - s.correctieStart) / CORRECTIE_MS);
  // OUD: s.x = s.bx + s.vx * dt + s.dx * f;
  // OUD: s.y = s.by + s.vy * dt + s.dy * f;
  // OUD: s.koersNu = s.koers + s.dKoers * f;
  if (s.draai === 0 || BOCHT <= 0) {
    s.x = s.bx + s.vx * dt + s.dx * f;
    s.y = s.by + s.vy * dt + s.dy * f;
    s.koersNu = s.koers + s.dKoers * f;
  } else {
    //! in een bocht: langs de boog, en het icoon draait mee
    const b = verschuiving(s.v, s.koers, s.draai, dt, BOCHT);
    s.x = s.bx + b.dx + s.dx * f;
    s.y = s.by + b.dy + s.dy * f;
    s.koersNu = b.koers + s.dKoers * f;
  }
  s.hoek = hoekVan(s.koersNu);
};

//! vaste verschuiving per vliegtuig voor de pulsring, uit de icao-code
const faseVan = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % PULS_MS;
};

//! alle plaatjes van het vliegtuig op één canvas (een atlas): per niveau 72 koersen in stappen van 5 graden, één keer getekend op de
//! pixeldichtheid van het scherm, met de schaduw (de oude css drop-shadow) en de draaiing er al in. tekenen is dan alleen nog een stukje
//! van de atlas kopiëren op een hele pixel: geen transform en geen filteren per pixel. één canvas en niet 360 losse: de browser zet elke
//! bron apart als textuur klaar, en met 360 losse bronnen werd elk beeld ±400 ms trager (gemeten)
const KOLOMMEN = 12; //! 72 koersen = 12 kolommen × 6 rijen per niveau
type Atlas = { beeld: HTMLCanvasElement; cel: number }; //! cel = maat van één plaatje in echte pixels

//! de atlas heeft de vormen onder elkaar: eerst alle niveaus van het gewone vliegtuig, daaronder alle niveaus van het militaire
// OUD: const maakAtlas = (dpr: number): Atlas => {
// OUD:   const vorm = new Path2D(VLIEGTUIG);
// OUD:   …
// OUD:   beeld.height = NIVEAUS.length * rijenPerNiveau * cel;
// OUD:   NIVEAUS.forEach(({ kleur }, niveau) => { … const rij = niveau * rijenPerNiveau + Math.floor(i / KOLOMMEN); …
const maakAtlas = (dpr: number): Atlas => {
  const cel = Math.ceil(SPRITE * dpr);
  const rijenPerNiveau = HOEKEN / KOLOMMEN;
  const beeld = document.createElement("canvas");
  beeld.width = KOLOMMEN * cel;
  beeld.height = VORMEN.length * NIVEAUS.length * rijenPerNiveau * cel;
  const ctx = beeld.getContext("2d")!;
  const k = cel / SPRITE;
  VORMEN.forEach((pad, v) => {
    const vorm = new Path2D(pad);
    NIVEAUS.forEach(({ kleur }, niveau) => {
      for (let i = 0; i < HOEKEN; i++) {
        const kolom = i % KOLOMMEN;
        const rij = (v * NIVEAUS.length + niveau) * rijenPerNiveau + Math.floor(i / KOLOMMEN);
        ctx.setTransform(k, 0, 0, k, kolom * cel, rij * cel);
        ctx.translate(SPRITE / 2, SPRITE / 2);
        ctx.rotate(((i * 360) / HOEKEN) * (Math.PI / 180)); //! met de klok mee, zoals een kompaskoers
        ctx.translate(-ICOON / 2, -ICOON / 2);
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 3 * k; //! shadowBlur rekent in echte pixels, de schaal telt niet mee
        ctx.fillStyle = kleur;
        ctx.fill(vorm);
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = "#0b1220";
        ctx.lineWidth = 0.8;
        ctx.stroke(vorm);
      }
    });
  });
  return { beeld, cel };
};

//! het plaatje van een vliegtuig (vorm + niveau + koers) uit de atlas kopiëren, gecentreerd op cx, cy (css-pixels op het canvas)
// OUD: const tekenVliegtuig = (ctx, atlas, niveau, hoek, cx, cy, d) => { … const sy = (niveau * (HOEKEN / KOLOMMEN) + Math.floor(hoek / KOLOMMEN)) * cel; …
const tekenVliegtuig = (ctx: CanvasRenderingContext2D, atlas: Atlas, s: Spoor, cx: number, cy: number, d: number) => {
  const { beeld, cel } = atlas;
  const sx = (s.hoek % KOLOMMEN) * cel;
  const rij = ((s.militair ? 1 : 0) * NIVEAUS.length + s.niveau) * (HOEKEN / KOLOMMEN) + Math.floor(s.hoek / KOLOMMEN);
  ctx.drawImage(beeld, sx, rij * cel, cel, cel, Math.round(cx * d - cel / 2), Math.round(cy * d - cel / 2), cel, cel);
};

//! koers in graden naar het nummer van het gedraaide plaatje
const hoekVan = (koers: unknown) => (typeof koers === "number" ? ((Math.round(koers / (360 / HOEKEN)) % HOEKEN) + HOEKEN) % HOEKEN : 0);

const ring = (ctx: CanvasRenderingContext2D, x: number, y: number, straal: number, dikte: number, kleur: string, alpha: number) => {
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = kleur;
  ctx.lineWidth = dikte;
  ctx.beginPath();
  ctx.arc(x, y, straal, 0, Math.PI * 2);
  ctx.stroke();
};

export class VliegtuigCanvas extends L.Layer {
  private opties: VliegtuigCanvasOpties;
  private kaart: L.Map | null = null;

  private sporen = new Map<string, Spoor>();
  private volgorde: Spoor[] = []; //! laag niveau eerst, zo liggen de verdachtste vliegtuigen bovenop
  private alarm: Spoor[] = []; //! niveau 3 en hoger: die krijgen een pulsring
  private inBeeld: Spoor[] = []; //! de vliegtuigen van de laatste tekenbeurt die in beeld stonden (steeds dezelfde lijst, geen nieuwe per beeld)
  private filter: Niveau | null = null;
  private alleenMilitair = false; //! filter "alleen militair", samen te gebruiken met het filter op niveau
  private gekozenId: string | null = null;
  private klokVerschil = 0; //! hoeveel ms de klok van de server voorloopt op die van de browser
  private interval = 30; //! hoe vaak de server ververst, in seconden (voor de horizon van D2)
  //! de bereikcirkel is net naar een nieuw gebied gesleept en de data is er nog niet: vliegtuigen buiten dat gebied dimmen (wereldcoördinaten)
  private voorlopig: { x: number; y: number; r2: number } | null = null;
  //! de wereld x van het midden van de cirkel. de kaart herhaalt de wereld naast zich (lengtegraad 190 = -170 op de kopie ernaast).
  //! elk vliegtuig komt op de kopie die het dichtst bij de cirkel ligt, ook als de cirkel over de datumgrens gesleept is
  private middenX = wereldXVan(5.29);

  private houder: HTMLDivElement | null = null; //! div met beide canvassen, schuift en schaalt mee met de kaart
  private vlak: HTMLCanvasElement | null = null; //! de vliegtuigen
  private pulsVlak: HTMLCanvasElement | null = null; //! alleen de pulsringen, apart zodat die kunnen kloppen zonder alle vliegtuigen te hertekenen
  private ctx: CanvasRenderingContext2D | null = null;
  private pulsCtx: CanvasRenderingContext2D | null = null;
  private spoorVlak: HTMLCanvasElement | null = null; //! de sporen, onder de vliegtuigen, en maar 2× per seconde getekend
  private spoorCtx: CanvasRenderingContext2D | null = null;
  private sporenAan = true;
  private spoorVuil = true;
  private laatsteSpoor = 0; //! wanneer de sporen het laatst getekend zijn
  private spoorWacht = SPOOR_BEELD_MS; //! tijd tot de volgende tekenbeurt van de sporen: langer als tekenen veel kost
  private laatsteMonster = 0; //! wanneer er het laatst een punt bij kwam
  //! de hele vlucht van het gekozen vliegtuig (OpenSky tracks, knop in de popup): wereldpunten x, y achter elkaar
  private vluchtPad: { id: string; punten: number[] } | null = null;
  private atlas: Atlas | null = null;
  private dpr = 1;
  private breedte = 0; //! canvasmaat in css-pixels
  private hoogte = 0;

  //! het anker: waar het canvas ligt (layer point van de linkerbovenhoek) en bij welke kaartstand dat hoort
  private oorsprong = L.point(0, 0);
  private ankerPixelOorsprong = L.point(NaN, NaN);
  private ankerMidden = L.latLng(0, 0);
  private ankerZoom = 0;

  private raf = 0;
  private wekker = 0; //! setTimeout voor een tekenbeurt die pas later nodig is (dan geen beeld per beeld aanvragen)
  private wekkerOp = 0;
  private ankerNodig = true;
  private vuil = true; //! de vliegtuigen moeten meteen opnieuw getekend worden
  private volgendeTekenbeurt = Infinity; //! wanneer het snelste zichtbare vliegtuig een halve pixel verder is (performance.now)
  laatsteTekenTijd = 0; //! het moment (performance.now) waarop de vliegtuigen voor het laatst getekend zijn
  private pulsVuil = true; //! de pulsringen moeten meteen opnieuw getekend worden
  private pulsActief = false; //! bij de vorige keer stond er minstens één pulsring in beeld
  private laatstePuls = 0;
  private pulsVakken: number[] = []; //! waar de vorige ringen stonden (x, y, b, h achter elkaar), om alleen dat stuk te wissen
  // OUD: private overgangTot = 0; //! tot dit tijdstip schuiven er vliegtuigen naar hun nieuwe positie
  private zoomAnimatie = false; //! Leaflet zoomt met een css-animatie: dan niet tekenen
  private muisPunt: L.Point | null = null;
  private muisNodig = false;
  private cursorAan = false;
  private gemeldX = NaN; //! laatste positie van het gekozen vliegtuig die aan de popup is doorgegeven
  private gemeldY = NaN;
  private rustigeBeweging = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor(opties: VliegtuigCanvasOpties) {
    super();
    this.opties = opties;
  }

  //! performance.now() omgerekend naar de klok van de server, in seconden (zelfde klok als time_position)
  private serverSec(nu: number) {
    return (performance.timeOrigin + nu + this.klokVerschil) / 1000;
  }

  private get horizon() {
    return horizonVan(this.interval);
  }

  // ---- data van buiten (React) ----

  // OUD: //! nieuw pakket: elk vliegtuig krijgt zijn nieuwe positie, en schuift vanaf waar hij nu getekend staat
  // OUD: zetVliegtuigen(planes: any[], beoordelingen: Map<string, Beoordeling>) {
  // OUD:   (per vliegtuig: vanX/vanY = waar hij nu staat, naarX/naarY = positie uit het pakket, start = nu; overgangTot = nu + OVERGANG_MS)

  //! nieuw pakket. per vliegtuig: de positie uit het pakket wordt de basis voor het gegist bestek, met de snelheid en koers erbij.
  //! het verschil met waar hij nu getekend staat wordt een correctie die in CORRECTIE_MS uitdooft: geen sprong, en hij vliegt
  //! altijd op zijn echte snelheid. tijd: wanneer de momentopname is en hoeveel de klok van de server voorloopt
  zetVliegtuigen(planes: any[], beoordelingen: Map<string, Beoordeling>, tijd: PakketTijd = { tijd: null, klokVerschil: 0 }) {
    const crs = this.kaart?.options.crs ?? L.CRS.EPSG3857;
    const nu = performance.now();
    this.klokVerschil = tijd.klokVerschil;
    const sec = this.serverSec(nu);
    const horizon = this.horizon;
    const schaal = this.kaart ? this.kaart.getZoomScale(this.kaart.getZoom(), 0) : 0;
    const correctiesPx: number[] = []; //! voor de meter: hoe ver de voorspelling ernaast zat, in pixels op de huidige zoom
    const correctiesRecht: number[] = [];
    const correctiesBocht: number[] = [];
    let gesnapt = 0;
    const nieuw = new Map<string, Spoor>();

    for (const p of planes) {
      if (typeof p[5] !== "number" || typeof p[6] !== "number") continue;
      const wereld = crs.latLngToPoint(L.latLng(p[6], p[5]), 0);
      wereld.x += Math.round((this.middenX - wereld.x) / 256) * 256; //! de kopie van de wereld waar de cirkel staat
      const t0 = typeof p[3] === "number" ? p[3] : (tijd.tijd ?? sec); //! time_position, of anders het moment van de momentopname
      const koers = typeof p[10] === "number" ? p[10] : 0;
      //! alleen doorrekenen in de lucht, met snelheid en koers
      const beweegt = !p[8] && typeof p[9] === "number" && p[9] >= MIN_SNELHEID && typeof p[10] === "number";
      const { vx, vy } = beweegt ? wereldSnelheid(p[9], p[10], p[6]) : { vx: 0, vy: 0 };
      // OUD: const niveau = (beoordelingen.get(p[0]) ?? GEEN_BEOORDELING).niveau;
      const { niveau, militair } = beoordelingen.get(p[0]) ?? GEEN_BEOORDELING;
      const oud = this.sporen.get(p[0]);
      const v = Math.hypot(vx, vy);
      //! de draaisnelheid: van adsb.lol (track_rate) als die er is, anders geschat uit de koers in dit en het vorige pakket.
      //! te kort ertussen (adsb.lol, elke 2 s) geeft vooral ruis: dan houden we de vorige schatting. te lang: rechtdoor
      let draai = 0;
      // OUD: const gemeten = extraVan(p)?.draai;
      // OUD: if (beweegt && typeof gemeten === "number") draai = netteDraai(gemeten);
      //! adsb.lol niet: de posities zijn daar al minder dan een seconde oud en komen elke paar seconden, dus er valt weinig te
      //! voorspellen. live gemeten (31-10) met track_rate: bocht-p95 2,9 -> 6,9 px, slechter. de server stuurt draai nog wel mee
      if (extraVan(p)?.bron === "adsb.lol") draai = 0;
      else if (beweegt && oud) {
        const tussen = t0 - oud.t0;
        if (tussen >= SCHAT_MIN_S && tussen <= SCHAT_MAX_S) draai = netteDraai(-koersVerschil(oud.koers, koers) / tussen);
        else if (tussen < SCHAT_MIN_S) draai = oud.draai;
      }

      if (oud) {
        positie(oud, nu, sec, horizon); //! waar hij op dit moment getekend staat
        let dt = sec - t0;
        dt = dt < 0 ? 0 : dt > horizon ? horizon : dt;
        // OUD: let dx = oud.x - (wereld.x + vx * dt);
        // OUD: let dy = oud.y - (wereld.y + vy * dt);
        // OUD: let dKoers = koersVerschil(oud.koersNu, koers);
        //! waar de nieuwe voorspelling hem nu zet (rechtdoor, of langs de boog als hij draait)
        const voorspeld = draai === 0 || BOCHT <= 0 ? { dx: vx * dt, dy: vy * dt, koers } : verschuiving(v, koers, draai, dt, BOCHT);
        let dx = oud.x - (wereld.x + voorspeld.dx);
        let dy = oud.y - (wereld.y + voorspeld.dy);
        let dKoers = koersVerschil(oud.koersNu, voorspeld.koers);
        const meters = Math.hypot(dx, dy) / wereldPerMeter(p[6]);
        //! te groot verschil, of een flink gat in de data: meteen goed zetten in plaats van een lange glijpartij
        const gat = t0 - oud.t0 > Math.max(30, 2.5 * this.interval);
        if (meters > SPRONG_M || gat) {
          dx = dy = dKoers = 0;
          gesnapt++;
          oud.pad = []; //! meteen goed gezet: het oude spoor hoort niet meer bij waar hij nu is
        } else if (beweegt && !oud.oud && schaal) {
          correctiesPx.push(Math.hypot(dx, dy) * schaal);
          //! voor de meter ook apart: vliegtuigen die in het laatste stuk draaiden, en die rechtdoor vlogen
          (draai === 0 ? correctiesRecht : correctiesBocht).push(Math.hypot(dx, dy) * schaal);
        }
        // OUD: Object.assign(oud, { bx: wereld.x, by: wereld.y, vx, vy, v: Math.hypot(vx, vy), t0, koers, dx, dy, dKoers, correctieStart: nu, niveau });
        // OUD: Object.assign(oud, { …, niveau, militair });
        Object.assign(oud, { bx: wereld.x, by: wereld.y, vx, vy, v, t0, koers, dx, dy, dKoers, correctieStart: nu, niveau, militair, draai });
        nieuw.set(p[0], oud);
      } else {
        //! nieuw vliegtuig: verschijnt meteen op zijn (doorgerekende) plek
        const s: Spoor = {
          id: p[0],
          bx: wereld.x,
          by: wereld.y,
          vx,
          vy,
          v: Math.hypot(vx, vy),
          t0,
          koers,
          dx: 0,
          dy: 0,
          dKoers: 0,
          correctieStart: -Infinity,
          x: wereld.x,
          y: wereld.y,
          koersNu: koers,
          hoek: hoekVan(koers),
          oud: false,
          niveau,
          militair,
          draai,
          pad: [],
          fase: faseVan(p[0]),
        };
        positie(s, nu, sec, horizon);
        nieuw.set(p[0], s);
      }
    }
    //! vliegtuigen die niet meer in het pakket zitten verdwijnen, net als eerst
    this.sporen = nieuw;
    // OUD: this.voorlopig = null; //! nieuwe data: niets meer te dimmen
    //! data van het nieuwe gebied: niets meer te dimmen. een pakket dat nog van het oude gebied is (kwam binnen vlak na het loslaten
    //! van de cirkel) laat het dimmen staan, anders lichten de vliegtuigen buiten de nieuwe cirkel op terwijl er nog niets nieuws is
    if (!tijd.oudGebied) this.voorlopig = null;
    // OUD: this.volgorde = [...nieuw.values()].sort((a, b) => a.niveau - b.niveau);
    //! bij hetzelfde niveau liggen de militaire bovenop, zodat je ze in een drukke luchtruimte ziet
    this.volgorde = [...nieuw.values()].sort((a, b) => a.niveau - b.niveau || Number(a.militair) - Number(b.militair));
    this.alarm = this.volgorde.filter((s) => s.niveau >= 3);
    // OUD: this.overgangTot = nu + OVERGANG_MS;

    correctiesPx.sort((a, b) => a - b);
    const plek = (q: number) => (correctiesPx.length ? correctiesPx[Math.min(correctiesPx.length - 1, Math.floor(correctiesPx.length * q))] : 0);
    meting.correctieMediaanPx = plek(0.5);
    meting.correctieP95Px = plek(0.95);
    meting.correctieMaxPx = correctiesPx.length ? correctiesPx[correctiesPx.length - 1] : 0;
    meting.correctieZoom = this.kaart ? this.kaart.getZoom() : 0;
    meting.gesnapt = gesnapt;
    //! rechtdoor en in bochten apart (fase 3): mediaan en p95, en hoeveel van elk
    const p = (lijst: number[], q: number) => {
      lijst.sort((a, b) => a - b);
      return lijst.length ? lijst[Math.min(lijst.length - 1, Math.floor(lijst.length * q))] : 0;
    };
    meting.correctieRecht = { aantal: correctiesRecht.length, mediaan: p(correctiesRecht, 0.5), p95: p(correctiesRecht, 0.95) };
    meting.correctieBocht = { aantal: correctiesBocht.length, mediaan: p(correctiesBocht, 0.5), p95: p(correctiesBocht, 0.95) };
    meting.pakketten++;

    // OUD: this.vuil = this.pulsVuil = true;
    this.vuil = this.pulsVuil = this.spoorVuil = true;
    this.plan();
  }

  //! de bereikcirkel is naar een nieuw gebied gesleept: tot de nieuwe data er is, worden de vliegtuigen buiten dat gebied gedimd
  zetVoorlopigGebied(gebied: { lat: number; lon: number; km: number } | null) {
    if (!gebied) {
      this.voorlopig = null;
    } else {
      const crs = this.kaart?.options.crs ?? L.CRS.EPSG3857;
      const midden = crs.latLngToPoint(L.latLng(gebied.lat, gebied.lon), 0);
      const r = gebied.km * 1000 * wereldPerMeter(gebied.lat); //! in Web-Mercator blijft een cirkel (bijna) een cirkel
      this.voorlopig = { x: midden.x, y: midden.y, r2: r * r };
    }
    this.vuil = true;
    this.plan();
  }

  //! het midden van de cirkel (lengtegraad, mag voorbij 180 liggen). geldt vanaf het volgende pakket: de vliegtuigen die er nu staan
  //! horen bij het vorige gebied en worden toch vervangen
  zetMidden(lengte: number) {
    this.middenX = wereldXVan(lengte);
  }

  //! hoe vaak de server ververst (seconden): bepaalt hoe lang een vliegtuig zonder nieuwe positie doorvliegt
  zetInterval(seconden: number) {
    this.interval = seconden > 0 ? seconden : 30;
    this.vuil = true;
    this.plan();
  }

  // OUD: zetFilter(filter: Niveau | null) {
  // OUD:   this.filter = filter;
  zetFilter(filter: Niveau | null, alleenMilitair = false) {
    this.filter = filter;
    this.alleenMilitair = alleenMilitair;
    // OUD: this.vuil = this.pulsVuil = true;
    this.vuil = this.pulsVuil = this.spoorVuil = true; //! het filter geldt ook voor de sporen
    this.plan();
  }

  //! de sporen aan of uit (schakelaar in het paneel). uit: ook geen punten meer bijhouden
  zetSporen(aan: boolean) {
    if (aan === this.sporenAan) return;
    this.sporenAan = aan;
    if (!aan) for (const s of this.sporen.values()) s.pad = [];
    this.spoorVuil = true;
    this.plan();
  }

  //! de hele vlucht van een vliegtuig (lat, lon per punt), of null. op dezelfde kopie van de wereld als de cirkel
  zetVluchtPad(id: string | null, punten: [number, number][] | null) {
    if (!id || !punten?.length) {
      this.vluchtPad = null;
    } else {
      const crs = this.kaart?.options.crs ?? L.CRS.EPSG3857;
      const xy: number[] = [];
      for (const [lat, lon] of punten) {
        const w = crs.latLngToPoint(L.latLng(lat, lon), 0);
        xy.push(w.x + Math.round((this.middenX - w.x) / 256) * 256, w.y);
      }
      this.vluchtPad = { id, punten: xy };
    }
    this.spoorVuil = true;
    this.plan();
  }

  //! valt dit vliegtuig weg door een filter? op één plek, want tekenen, pulsringen en klikken moeten hetzelfde zien
  private verborgen(s: Spoor) {
    return (this.filter !== null && s.niveau !== this.filter) || (this.alleenMilitair && !s.militair);
  }

  zetGekozen(id: string | null) {
    this.gekozenId = id;
    this.gemeldX = this.gemeldY = NaN; //! de popup krijgt bij de volgende tekenbeurt meteen een positie
    // OUD: this.vuil = true;
    this.vuil = this.spoorVuil = true; //! het gekozen vliegtuig heeft altijd een spoor
    if (this.vluchtPad && this.vluchtPad.id !== id) this.vluchtPad = null; //! de hele vlucht hoort bij één vliegtuig
    this.plan();
  }

  //! waar een vliegtuig nu is volgens het gegist bestek (voor de popup en om naartoe te vliegen), of null als hij er niet is.
  //! op: een ander moment (performance.now), bijvoorbeeld laatsteTekenTijd om te weten waar hij getekend staat
  positieVan(id: string, op = performance.now()): L.LatLng | null {
    const s = this.sporen.get(id);
    if (!s) return null;
    positie(s, op, this.serverSec(op), this.horizon);
    const crs = this.kaart?.options.crs ?? L.CRS.EPSG3857;
    return crs.pointToLatLng(L.point(s.x, s.y), 0);
  }

  // ---- Leaflet ----

  onAdd(map: L.Map) {
    this.kaart = map;
    const pane = map.getPane("vliegtuigen") ?? map.createPane("vliegtuigen");
    pane.style.zIndex = "450"; //! boven de cirkel (overlayPane 400), onder de popups (popupPane 700)
    pane.style.pointerEvents = "none"; //! klikken gaan naar de kaart, de laag zoekt zelf uit welk vliegtuig je raakt
    this.houder = L.DomUtil.create("div", "", pane) as HTMLDivElement;
    //! zelfde klasse als Leaflets eigen canvas: transform-origin 0 0 en de css-overgang tijdens het zoomen
    if ((this as any)._zoomAnimated) L.DomUtil.addClass(this.houder, "leaflet-zoom-animated");
    Object.assign(this.houder.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
    this.spoorVlak = L.DomUtil.create("canvas", "", this.houder) as HTMLCanvasElement; //! eerst, dus onder de vliegtuigen
    this.vlak = L.DomUtil.create("canvas", "", this.houder) as HTMLCanvasElement;
    this.pulsVlak = L.DomUtil.create("canvas", "", this.houder) as HTMLCanvasElement;
    // OUD: for (const c of [this.vlak, this.pulsVlak]) Object.assign(c.style, { … });
    for (const c of [this.spoorVlak, this.vlak, this.pulsVlak]) Object.assign(c.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
    this.ctx = this.vlak.getContext("2d");
    this.pulsCtx = this.pulsVlak.getContext("2d");
    this.spoorCtx = this.spoorVlak.getContext("2d");
    // OUD: this.ankerNodig = this.vuil = this.pulsVuil = true;
    this.ankerNodig = this.vuil = this.pulsVuil = this.spoorVuil = true;
    this.plan();
    return this;
  }

  onRemove(map: L.Map) {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.wekker);
    this.raf = this.wekker = 0;
    this.houder?.remove();
    // OUD: this.houder = this.vlak = this.pulsVlak = null;
    // OUD: this.ctx = this.pulsCtx = null;
    this.houder = this.vlak = this.pulsVlak = this.spoorVlak = null;
    this.ctx = this.pulsCtx = this.spoorCtx = null;
    if (this.cursorAan) map.getContainer().style.cursor = "";
    this.cursorAan = false;
    this.kaart = null;
    return this;
  }

  getEvents() {
    const events: { [naam: string]: L.LeafletEventHandlerFn } = {
      viewreset: this.opnieuwAnkeren,
      resize: this.opnieuwAnkeren,
      zoom: this.opZoom,
      zoomend: this.opZoomKlaar,
      move: this.opBeweeg,
      moveend: this.opZoomKlaar, //! na slepen het canvas weer rond het beeld leggen, zodat er bij het volgende slepen weer marge is
      click: this.opKlik as L.LeafletEventHandlerFn,
      mousemove: this.opMuis as L.LeafletEventHandlerFn,
      mouseout: this.opMuisWeg,
      keydown: this.opToets as L.LeafletEventHandlerFn,
    };
    if ((this as any)._zoomAnimated) events.zoomanim = this.opZoomAnimatie as L.LeafletEventHandlerFn;
    return events;
  }

  private opnieuwAnkeren() {
    this.ankerNodig = true;
    this.plan();
  }

  //! begin van een css-zoomanimatie (scrollwiel, knoppen, dubbelklik). de kaart staat dan al op de nieuwe zoom,
  //! dus nu tekenen geeft verkeerde posities: we schalen alleen het canvas mee, net als L.Renderer
  private opZoomAnimatie(e: L.ZoomAnimEvent) {
    this.zoomAnimatie = true;
    this.zetTransform(e.center, e.zoom);
  }

  //! zoom zonder css-animatie (flyTo, knijpen) of het einde ervan: opnieuw tekenen op de nieuwe stand
  private opZoom() {
    this.zoomAnimatie = false;
    this.opnieuwAnkeren();
  }

  private opZoomKlaar() {
    this.zoomAnimatie = false;
    this.opnieuwAnkeren();
  }

  //! slepen: het canvas schuift vanzelf mee. alleen opnieuw ankeren als het beeld buiten het canvas komt,
  //! of als de pixel-oorsprong van de kaart veranderd is (een flyTo die alleen schuift)
  private opBeweeg() {
    const map = this.kaart;
    if (!map || this.zoomAnimatie) return;
    if (!map.getPixelOrigin().equals(this.ankerPixelOorsprong)) return this.opnieuwAnkeren();
    const linksBoven = map.containerPointToLayerPoint([0, 0]);
    const rechtsOnder = map.containerPointToLayerPoint(map.getSize());
    if (
      linksBoven.x < this.oorsprong.x ||
      linksBoven.y < this.oorsprong.y ||
      rechtsOnder.x > this.oorsprong.x + this.breedte ||
      rechtsOnder.y > this.oorsprong.y + this.hoogte
    ) {
      this.opnieuwAnkeren();
    }
  }

  private opKlik(e: L.LeafletMouseEvent) {
    if (this.zoomAnimatie) return;
    const raak = this.zoek(e.layerPoint, performance.now());
    this.opties.onKlik(raak ? raak.id : null);
  }

  //! muis over een vliegtuig: handje. hooguit één keer per beeld zoeken
  private opMuis(e: L.LeafletMouseEvent) {
    this.muisPunt = e.layerPoint;
    this.muisNodig = true;
    this.plan();
  }

  private opMuisWeg() {
    this.muisPunt = null;
    this.zetCursor(false);
  }

  private opToets(e: L.LeafletKeyboardEvent) {
    if (e.originalEvent.key === "Escape" && this.gekozenId !== null) this.opties.onKlik(null);
  }

  // ---- ankeren en tekenen ----

  //! zelfde berekening als L.Renderer._updateTransform: het canvas zo schalen en schuiven dat het tijdens de zoomanimatie klopt
  private zetTransform(midden: L.LatLng, zoom: number) {
    const map = this.kaart;
    if (!map || !this.houder) return;
    const schaal = map.getZoomScale(zoom, this.ankerZoom);
    const halfBeeld = map.getSize().multiplyBy(0.5 + MARGE);
    const ankerMiddenPunt = map.project(this.ankerMidden, zoom);
    //! _getNewPixelOrigin is intern in Leaflet, L.Renderer gebruikt hem op dezelfde manier
    const linksBoven = halfBeeld.multiplyBy(-schaal).add(ankerMiddenPunt).subtract((map as any)._getNewPixelOrigin(midden, zoom));
    L.DomUtil.setTransform(this.houder, linksBoven, schaal);
  }

  //! het canvas rond het huidige beeld leggen (plus marge), op de juiste maat en pixeldichtheid
  private ankeren() {
    const map = this.kaart!;
    const maat = map.getSize();
    this.oorsprong = map.containerPointToLayerPoint(maat.multiplyBy(-MARGE)).round();
    this.ankerPixelOorsprong = map.getPixelOrigin();
    this.ankerMidden = map.getCenter();
    this.ankerZoom = map.getZoom();
    const breedte = Math.round(maat.x * (1 + 2 * MARGE));
    const hoogte = Math.round(maat.y * (1 + 2 * MARGE));
    const dpr = window.devicePixelRatio || 1;
    if (breedte !== this.breedte || hoogte !== this.hoogte || dpr !== this.dpr || !this.atlas) {
      if (dpr !== this.dpr || !this.atlas) this.atlas = maakAtlas(dpr);
      this.breedte = breedte;
      this.hoogte = hoogte;
      this.dpr = dpr;
      // OUD: for (const c of [this.vlak!, this.pulsVlak!]) {
      for (const c of [this.spoorVlak!, this.vlak!, this.pulsVlak!]) {
        c.width = Math.round(breedte * dpr);
        c.height = Math.round(hoogte * dpr);
        c.style.width = `${breedte}px`;
        c.style.height = `${hoogte}px`;
      }
      this.pulsVakken = []; //! een canvas met een nieuwe maat is leeg
    }
    L.DomUtil.setPosition(this.houder!, this.oorsprong); //! haalt ook de schaal van een zoomanimatie weg
  }

  // OUD: private plan() {
  // OUD:   if (!this.raf && this.kaart) this.raf = requestAnimationFrame(this.beeld);
  // OUD: }

  //! een beeld aanvragen: meteen (wachtMs 0), of later met een wekker. zo vraagt de laag geen 60 beelden per seconde aan
  //! als er pas over een seconde iets te tekenen valt
  private plan(wachtMs = 0) {
    if (!this.kaart) return;
    if (wachtMs <= 20) {
      clearTimeout(this.wekker);
      this.wekker = 0;
      if (!this.raf) this.raf = requestAnimationFrame(this.beeld);
      return;
    }
    if (this.raf) return; //! er komt al een beeld, dat plant zelf opnieuw
    const op = performance.now() + wachtMs;
    if (this.wekker && this.wekkerOp <= op) return; //! er staat al een eerdere wekker
    clearTimeout(this.wekker);
    this.wekkerOp = op;
    this.wekker = window.setTimeout(() => {
      this.wekker = 0;
      if (!this.raf) this.raf = requestAnimationFrame(this.beeld);
    }, wachtMs - 10);
  }

  //! één beeld: alleen tekenen wat nodig is. staat er niets te doen, dan vraagt de laag geen beeld meer aan en kost hij niets
  private beeld = (nu: number) => {
    this.raf = 0;
    if (!this.kaart || !this.ctx) return;
    if (this.zoomAnimatie) return; //! zoomend zet het weer in gang
    if (this.ankerNodig) {
      this.ankeren();
      this.ankerNodig = false;
      // OUD: this.vuil = this.pulsVuil = true;
      this.vuil = this.pulsVuil = this.spoorVuil = true;
    }
    // OUD: const overgang = nu < this.overgangTot;
    // OUD: if (this.vuil || overgang) {
    if (this.vuil || nu >= this.volgendeTekenbeurt) {
      this.tekenVliegtuigen(nu);
      this.vuil = false;
    }
    if (!this.rustigeBeweging && (this.pulsVuil || (this.pulsActief && nu - this.laatstePuls >= PULS_BEELD_MS))) {
      this.tekenPulsen(nu);
      this.pulsVuil = false;
      this.laatstePuls = nu;
    }
    if (this.muisNodig) {
      this.muisNodig = false;
      this.controleerMuis(nu);
    }
    //! sporen: elke 2 s een punt erbij, en 2× per seconde tekenen (of meteen na pannen, zoomen, een filter of een pakket)
    if (this.sporenAan && nu - this.laatsteMonster >= SPOOR_ELKE_MS) {
      this.monster(nu);
      this.laatsteMonster = nu;
    }
    const sporenZichtbaar = this.sporenTeTekenen();
    //! tijdens het slepen van de kaart schuiven de sporen gewoon mee met het canvas: dan niet opnieuw tekenen (gemeten: met 4.800
    //! sporen in beeld zakte pannen anders naar 50 fps). na een nieuw anker (spoorVuil) wel, anders staan ze op de verkeerde plek
    const slepen = (this.kaart.dragging as any)?.moving?.() === true;
    // OUD: if (this.spoorVuil || (sporenZichtbaar && nu - this.laatsteSpoor >= SPOOR_BEELD_MS)) {
    if (this.spoorVuil || (sporenZichtbaar && !slepen && nu - this.laatsteSpoor >= this.spoorWacht)) {
      const begin = performance.now();
      this.tekenSporen(nu);
      //! kost het tekenen veel (heel veel sporen in beeld), dan minder vaak: hooguit ±2% van de tijd
      this.spoorWacht = Math.max(SPOOR_BEELD_MS, (performance.now() - begin) * 50);
      meting.spoorMs = performance.now() - begin;
      this.spoorVuil = false;
      this.laatsteSpoor = nu;
    }
    // OUD: if (overgang || this.pulsActief) this.plan();
    //! het volgende beeld: voor de pulsringen (30 per seconde) of als het snelste vliegtuig een halve pixel verder is
    let volgende = this.volgendeTekenbeurt;
    if (this.pulsActief) volgende = Math.min(volgende, this.laatstePuls + PULS_BEELD_MS);
    if (this.sporenAan && this.sporen.size) volgende = Math.min(volgende, this.laatsteMonster + SPOOR_ELKE_MS);
    // OUD: if (sporenZichtbaar) volgende = Math.min(volgende, this.laatsteSpoor + SPOOR_BEELD_MS);
    if (sporenZichtbaar) volgende = Math.min(volgende, this.laatsteSpoor + this.spoorWacht);
    if (volgende < Infinity) this.plan(volgende - nu);
  };

  private tekenVliegtuigen(nu: number) {
    const begin = performance.now();
    const map = this.kaart!;
    const ctx = this.ctx!;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.vlak!.width, this.vlak!.height);

    //! schermpositie = wereld × 2^zoom − pixel-oorsprong − plek van het canvas
    const schaal = map.getZoomScale(map.getZoom(), 0);
    const po = map.getPixelOrigin();
    const ox = po.x + this.oorsprong.x;
    const oy = po.y + this.oorsprong.y;
    const b = this.breedte;
    const h = this.hoogte;
    const m = SPRITE / 2;
    const atlas = this.atlas!;
    const sec = this.serverSec(nu);
    const horizon = this.horizon;
    this.laatsteTekenTijd = nu;
    const voorlopig = this.voorlopig;
    let zichtbaar = 0;
    let verouderd = 0;
    let snelstePx = 0; //! hoeveel pixels per seconde het snelst veranderende zichtbare vliegtuig verschuift
    let gekozen: Spoor | null = null;

    //! hoe snel een getekend vliegtuig op het scherm verandert: zijn snelheid, plus een correctie die nog uitdooft (positie en draaiing)
    const tempo = (s: Spoor) => {
      let px = s.oud ? 0 : s.v * schaal;
      const t = (nu - s.correctieStart) / CORRECTIE_MS;
      if (t < 1) {
        //! de steilste helling van het uitdoven is 1,5 keer de gemiddelde
        px += (Math.hypot(s.dx, s.dy) * schaal * 1.5) / (CORRECTIE_MS / 1000);
        px += (Math.abs(s.dKoers) * (Math.PI / 180) * ICOON_STRAAL * 1.5) / (CORRECTIE_MS / 1000);
      }
      return px;
    };

    // OUD: for (const s of this.volgorde) {
    // OUD:   if (this.verborgen(s)) continue;
    // OUD:   positie(s, nu, sec, horizon);
    // OUD:   if (s.id === this.gekozenId) { gekozen = s; continue; }
    // OUD:   const cx = s.x * schaal - ox;
    // OUD:   const cy = s.y * schaal - oy;
    // OUD:   if (cx < -m || cy < -m || cx > b + m || cy > h + m) continue;
    // OUD:   let alpha = s.oud ? 0.5 : 1;
    // OUD:   if (voorlopig && …) alpha *= 0.35;
    // OUD:   … tekenVliegtuig(ctx, atlas, s, cx, cy, d) met die alpha …
    // OUD:   if (s.oud) verouderd++;
    // OUD:   zichtbaar++;
    // OUD:   const px = tempo(s);
    // OUD:   if (px > snelstePx) snelstePx = px;
    // OUD: }
    //! eerst kijken wie er in beeld staat, dan pas tekenen: bij meer dan PUNTJES_VANAF worden het puntjes
    const inBeeld = this.inBeeld;
    inBeeld.length = 0;
    for (const s of this.volgorde) {
      if (this.verborgen(s)) continue;
      positie(s, nu, sec, horizon);
      if (s.id === this.gekozenId) {
        gekozen = s; //! komt als laatste, bovenop alles
        continue;
      }
      const cx = s.x * schaal - ox;
      const cy = s.y * schaal - oy;
      //! frustum culling: buiten het canvas (beeld + marge) tekenen we niets, en telt hij ook niet mee voor het tempo
      if (cx < -m || cy < -m || cx > b + m || cy > h + m) continue;
      inBeeld.push(s);
    }
    const puntjes = inBeeld.length > PUNTJES_VANAF;
    //! puntjes: één pad per niveau, per "verouderd" en per "gedimd" (dan één fill per pad in plaats van een drawImage per vliegtuig)
    const paden: (Path2D | undefined)[] = [];
    const maat = Math.max(2, Math.round(PUNTJE * d));

    for (const s of inBeeld) {
      const cx = s.x * schaal - ox;
      const cy = s.y * schaal - oy;
      //! half doorzichtig: al te lang geen nieuwe positie. extra gedimd: buiten het gebied waar de cirkel net naartoe is gesleept
      const dim = voorlopig !== null && (s.x - voorlopig.x) ** 2 + (s.y - voorlopig.y) ** 2 > voorlopig.r2;
      if (puntjes && !s.militair) {
        const k = s.niveau * 4 + (s.oud ? 1 : 0) + (dim ? 2 : 0);
        (paden[k] ??= new Path2D()).rect(Math.round(cx * d - maat / 2), Math.round(cy * d - maat / 2), maat, maat);
      } else {
        const alpha = (s.oud ? 0.5 : 1) * (dim ? 0.35 : 1);
        if (alpha < 1) {
          ctx.globalAlpha = alpha;
          tekenVliegtuig(ctx, atlas, s, cx, cy, d);
          ctx.globalAlpha = 1;
        } else {
          tekenVliegtuig(ctx, atlas, s, cx, cy, d);
        }
      }
      if (s.oud) verouderd++;
      zichtbaar++;
      const px = tempo(s);
      if (px > snelstePx) snelstePx = px;
    }
    if (puntjes) {
      //! onder de militaire plaatjes (die zijn al getekend): daarom met destination-over erachter. laag niveau eerst, verdachtst bovenop
      ctx.globalCompositeOperation = "destination-over";
      for (let k = paden.length - 1; k >= 0; k--) {
        const pad = paden[k];
        if (!pad) continue;
        ctx.globalAlpha = (k & 1 ? 0.5 : 1) * (k & 2 ? 0.35 : 1);
        ctx.fillStyle = kleurVan((k >> 2) as Niveau);
        ctx.fill(pad);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    meting.puntjes = puntjes;

    //! minder beweging aan (besturingssysteem): een vaste ring in plaats van een kloppende
    if (this.rustigeBeweging) {
      ctx.setTransform(d, 0, 0, d, 0, 0);
      for (const s of this.alarm) {
        // OUD: if (this.filter !== null && s.niveau !== this.filter) continue;
        if (this.verborgen(s)) continue;
        const cx = s.x * schaal - ox;
        const cy = s.y * schaal - oy;
        if (cx < -m || cy < -m || cx > b + m || cy > h + m) continue;
        ring(ctx, cx, cy, 15, 2, kleurVan(s.niveau), s.oud ? 0.45 : 0.9);
      }
      ctx.globalAlpha = 1;
    }

    if (gekozen) {
      const cx = gekozen.x * schaal - ox;
      const cy = gekozen.y * schaal - oy;
      if (!(cx < -m || cy < -m || cx > b + m || cy > h + m)) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = gekozen.oud ? 0.5 : 1;
        // OUD: tekenVliegtuig(ctx, atlas, gekozen.niveau, gekozen.hoek, cx, cy, d);
        tekenVliegtuig(ctx, atlas, gekozen, cx, cy, d);
        ctx.setTransform(d, 0, 0, d, 0, 0);
        ring(ctx, cx, cy, 18, 1.5, "#fff", 1); //! de witte ring van het gekozen vliegtuig
        ctx.globalAlpha = 1;
        zichtbaar++;
        const px = tempo(gekozen);
        if (px > snelstePx) snelstePx = px;
      }
      //! de popup schuift mee (ook buiten beeld), maar alleen als het vliegtuig echt verplaatst is
      if (gekozen.x !== this.gemeldX || gekozen.y !== this.gemeldY) {
        this.gemeldX = gekozen.x;
        this.gemeldY = gekozen.y;
        this.opties.onGekozenPositie(map.unproject(L.point(gekozen.x, gekozen.y), 0));
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    //! volgende tekenbeurt: zodra het snelste zichtbare vliegtuig een halve pixel verder is. staat alles stil: pas weer bij een pakket of als de kaart beweegt
    this.volgendeTekenbeurt = snelstePx > 0 ? nu + Math.min(MAX_WACHT_MS, Math.max(0, (STAP_PX / snelstePx) * 1000)) : Infinity;

    const duur = performance.now() - begin;
    meting.tekenMs = duur;
    meting.tekenMsMax = Math.max(meting.tekenMsMax, duur);
    meting.tekenMsSom += duur;
    meting.tekenbeurten++;
    meting.hertekend++;
    meting.zichtbaar = zichtbaar;
    meting.totaal = this.sporen.size;
    meting.verouderd = verouderd;
    meting.snelstePx = snelstePx;
  }

  //! pulsringen om vliegtuigen van niveau 3 en hoger: groeien van 0,8 naar 1,8 keer en vervagen, zoals de oude css-animatie
  // ---- sporen (fase 4 van het tweede plan) ----

  //! elk vliegtuig krijgt een punt op de plek waar hij nu getekend staat. ook buiten beeld, zodat er een spoor is als je inzoomt
  private monster(nu: number) {
    const sec = this.serverSec(nu);
    const horizon = this.horizon;
    const oudste = nu - SPOOR_MS;
    for (const s of this.sporen.values()) {
      positie(s, nu, sec, horizon);
      const pad = s.pad;
      const n = pad.length;
      //! een sprong van meer dan een halve wereld: hij staat nu op een andere kopie (de cirkel is ver weg gesleept). opnieuw beginnen
      if (n && Math.abs(pad[n - 3] - s.x) > 128) pad.length = 0;
      //! staat stil (op de grond, of te lang geen nieuwe positie): geen punten op dezelfde plek stapelen
      if (pad.length && pad[pad.length - 3] === s.x && pad[pad.length - 2] === s.y) continue;
      pad.push(s.x, s.y, nu);
      //! te oud of te veel: vooraan eraf
      let weg = 0;
      while (weg < pad.length && (pad[weg + 2] < oudste || (pad.length - weg) / 3 > SPOOR_PUNTEN)) weg += 3;
      if (weg) pad.splice(0, weg);
    }
  }

  //! valt er nu iets te tekenen? (anders hoeft de laag niet 2× per seconde wakker te worden)
  private sporenTeTekenen() {
    if (this.vluchtPad) return true;
    if (!this.sporenAan || !this.kaart) return false;
    return this.kaart.getZoom() >= SPOOR_ZOOM || this.gekozenId !== null;
  }

  //! alle sporen in één keer: per kleur (niveau) en per leeftijd één pad, zodat het ook met duizenden sporen maar een paar
  //! tekenopdrachten zijn. het spoor loopt tot waar het vliegtuig nu getekend staat
  private tekenSporen(nu: number) {
    const map = this.kaart!;
    const ctx = this.spoorCtx!;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.spoorVlak!.width, this.spoorVlak!.height);
    meting.sporenGetekend = 0;
    if (!this.sporenTeTekenen()) return;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    const schaal = map.getZoomScale(map.getZoom(), 0);
    const po = map.getPixelOrigin();
    const ox = po.x + this.oorsprong.x;
    const oy = po.y + this.oorsprong.y;
    const b = this.breedte;
    const h = this.hoogte;
    const alles = this.sporenAan && map.getZoom() >= SPOOR_ZOOM;
    const paden = NIVEAUS.map(() => SPOOR_LAGEN.map(() => new Path2D()));
    let getekend = 0;
    if (this.sporenAan) {
      for (const s of this.volgorde) {
        const pad = s.pad;
        if (pad.length < 3 || this.verborgen(s)) continue;
        if (!alles && s.id !== this.gekozenId) continue;
        const cx = s.x * schaal - ox;
        const cy = s.y * schaal - oy;
        //! culling: het spoor is hoogstens een minuut vliegen lang
        const marge = s.v * schaal * (SPOOR_MS / 1000) + 20;
        if (cx < -marge || cy < -marge || cx > b + marge || cy > h + marge) continue;
        getekend++;
        //! van nieuw naar oud: elk stukje in de laag van zijn leeftijd
        let vx = cx;
        let vy = cy;
        for (let i = pad.length - 3; i >= 0; i -= 3) {
          if (nu - pad[i + 2] > SPOOR_MS) break; //! ouder dan een minuut: niet tekenen (opruimen gebeurt elke 2 s)
          const x = pad[i] * schaal - ox;
          const y = pad[i + 1] * schaal - oy;
          //! punten dichter dan 4 px bij het vorige getekende punt overslaan (behalve het oudste). uitgezoomd is een spoor maar een paar
          //! tientallen pixels lang: 30 stukjes van 1,5 px kosten dan vooral videokaart (gemeten: 4.800 sporen gaven 100 ms haperingen)
          if (i > 0 && (x - vx) * (x - vx) + (y - vy) * (y - vy) < SPOOR_STAP_PX * SPOOR_STAP_PX) continue;
          const laag = Math.min(SPOOR_LAGEN.length - 1, Math.floor(((nu - pad[i + 2]) / SPOOR_MS) * SPOOR_LAGEN.length));
          const p = paden[s.niveau][laag];
          p.moveTo(vx, vy);
          p.lineTo(x, y);
          vx = x;
          vy = y;
        }
      }
    }
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    NIVEAUS.forEach(({ kleur }, niveau) => {
      SPOOR_LAGEN.forEach((alpha, laag) => {
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = kleur;
        ctx.stroke(paden[niveau][laag]);
      });
    });
    //! de hele vlucht van het gekozen vliegtuig: een dunne gestippelde lijn, tot waar hij nu is
    if (this.vluchtPad) {
      const p = new Path2D();
      const punten = this.vluchtPad.punten;
      for (let i = 0; i < punten.length; i += 2) {
        const x = punten[i] * schaal - ox;
        const y = punten[i + 1] * schaal - oy;
        if (i === 0) p.moveTo(x, y);
        else p.lineTo(x, y);
      }
      const s = this.sporen.get(this.vluchtPad.id);
      if (s) p.lineTo(s.x * schaal - ox, s.y * schaal - oy);
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = "#e2e8f0";
      ctx.setLineDash([5, 4]);
      ctx.stroke(p);
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    meting.sporenGetekend = getekend;
  }

  private tekenPulsen(nu: number) {
    const begin = performance.now();
    const map = this.kaart!;
    const ctx = this.pulsCtx!;
    const d = this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    //! alleen wissen waar de vorige ringen stonden; bij heel veel ringen is alles in één keer wissen sneller
    const vakken = this.pulsVakken;
    if (vakken.length > 4 * 150) ctx.clearRect(0, 0, this.pulsVlak!.width, this.pulsVlak!.height);
    else for (let i = 0; i < vakken.length; i += 4) ctx.clearRect(vakken[i], vakken[i + 1], vakken[i + 2], vakken[i + 3]);
    const nieuweVakken: number[] = [];

    const schaal = map.getZoomScale(map.getZoom(), 0);
    const po = map.getPixelOrigin();
    const ox = po.x + this.oorsprong.x;
    const oy = po.y + this.oorsprong.y;
    const sec = this.serverSec(nu);
    const horizon = this.horizon;
    const m = 36; //! grootste ring (15 × 1,8) plus lijndikte
    ctx.setTransform(d, 0, 0, d, 0, 0);
    for (const s of this.alarm) {
      // OUD: if (this.filter !== null && s.niveau !== this.filter) continue;
      if (this.verborgen(s)) continue;
      // OUD: positie(s, nu);
      positie(s, nu, sec, horizon);
      const cx = s.x * schaal - ox;
      const cy = s.y * schaal - oy;
      if (cx < -m || cy < -m || cx > this.breedte + m || cy > this.hoogte + m) continue;
      const t = ((nu + s.fase) % PULS_MS) / PULS_MS;
      const e = 1 - (1 - t) * (1 - t); //! ease-out, zoals de oude animatie
      const groei = 0.8 + e;
      const straal = 15 * groei;
      const dikte = 2 * groei;
      ring(ctx, cx, cy, straal, dikte, kleurVan(s.niveau), 0.9 * (1 - e) * (s.oud ? 0.5 : 1));
      const r = straal + dikte;
      nieuweVakken.push(Math.floor((cx - r) * d) - 1, Math.floor((cy - r) * d) - 1, Math.ceil(2 * r * d) + 2, Math.ceil(2 * r * d) + 2);
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.pulsVakken = nieuweVakken;
    this.pulsActief = nieuweVakken.length > 0;
    meting.pulsMsMax = Math.max(meting.pulsMsMax, performance.now() - begin);
  }

  //! het dichtstbijzijnde zichtbare vliegtuig binnen KLIK_PX van een punt. rekent met de posities van nu,
  //! dus het klopt ook terwijl ze bewegen of vlak na het slepen. bij gelijke afstand wint wat bovenop ligt
  private zoek(laagPunt: L.Point, nu: number): Spoor | null {
    const map = this.kaart;
    if (!map) return null;
    const schaal = map.getZoomScale(map.getZoom(), 0);
    const po = map.getPixelOrigin();
    const mx = laagPunt.x + po.x;
    const my = laagPunt.y + po.y;
    const sec = this.serverSec(nu);
    const horizon = this.horizon;
    let beste: Spoor | null = null;
    let besteAfstand = KLIK_PX * KLIK_PX;
    for (const s of this.volgorde) {
      // OUD: if (this.filter !== null && s.niveau !== this.filter) continue;
      if (this.verborgen(s)) continue;
      // OUD: positie(s, nu);
      positie(s, nu, sec, horizon);
      const dx = s.x * schaal - mx;
      const dy = s.y * schaal - my;
      const afstand = dx * dx + dy * dy;
      if (afstand <= besteAfstand) {
        beste = s;
        besteAfstand = afstand;
      }
    }
    return beste;
  }

  private controleerMuis(nu: number) {
    const map = this.kaart!;
    //! tijdens het slepen geen handje: dan hoort de grijp-cursor van Leaflet
    // OUD: if (!this.muisPunt || (map.dragging as any)?.moving?.()) return this.zetCursor(false);
    //! ook niet in de verplaatsmodus van de bereikcirkel (GebiedCirkel.tsx zet die klasse): indrukken sleept dan de cirkel, niet een vliegtuig
    const cirkelModus = map.getContainer().classList.contains("radar-gebied-modus");
    if (!this.muisPunt || cirkelModus || (map.dragging as any)?.moving?.()) return this.zetCursor(false);
    this.zetCursor(this.zoek(this.muisPunt, nu) !== null);
  }

  private zetCursor(aan: boolean) {
    if (aan === this.cursorAan || !this.kaart) return;
    this.cursorAan = aan;
    this.kaart.getContainer().style.cursor = aan ? "pointer" : "";
  }
}
