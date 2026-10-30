import L from "leaflet";
import { GEEN_BEOORDELING, kleurVan, NIVEAUS, type Beoordeling, type Niveau } from "../dreiging";
import { meting } from "../../utils/meting";
import { CORRECTIE_MS, MIN_SNELHEID, SPRONG_M, horizonVan, koersVerschil, uitdoven, wereldPerMeter, wereldSnelheid } from "../beweging";

//! alle vliegtuigen op één canvas in plaats van duizenden losse markers, met frustum culling: wat buiten beeld valt wordt niet getekend.
//! een eigen Leaflet-laag die werkt zoals Leaflets eigen L.Renderer: het canvas ligt in een pane, is aan elke kant 10% groter dan het
//! beeld en schuift met de kaart mee. slepen kost dus geen tekenwerk, en bij zoomen schaalt het canvas met css mee tot de zoom klaar is.
//! de vliegtuigen bewegen echt: met gegist bestek (beweging.ts) rekent de laag elk beeld uit waar ze nu zijn, en hij tekent pas
//! opnieuw als het snelste zichtbare vliegtuig een halve pixel verder is. ingezoomd (weinig vliegtuigen in beeld) is dat vaak,
//! uitgezoomd (veel vliegtuigen, die op het scherm bijna stilstaan) heel weinig: zo werken culling en beweging samen

//! vliegtuig van bovenaf, neus naar boven (noorden), dezelfde vorm als het oude icoon in planeIcons.tsx
const VLIEGTUIG =
  "M12 2c.8 0 1.4.7 1.4 1.6v5.6l7.6 4.4v2l-7.6-2.3v4.4l2.2 1.7v1.6L12 20.1 8.4 21v-1.6l2.2-1.7v-4.4L3 15.6v-2l7.6-4.4V3.6C10.6 2.7 11.2 2 12 2z";

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
  fase: number; //! verschuiving van de pulsring in ms, zodat niet alle ringen tegelijk kloppen
};

export type VliegtuigCanvasOpties = {
  onKlik: (id: string | null) => void; //! klik op een vliegtuig (id) of op een lege plek of Esc (null)
  onGekozenPositie: (positie: L.LatLng) => void; //! het gekozen vliegtuig staat ergens anders getekend: de popup moet mee
};

//! tijdinformatie bij een pakket: wanneer de momentopname is (seconden) en hoeveel de klok van de server voorloopt op die van de browser (ms)
export type PakketTijd = { tijd: number | null; klokVerschil: number };

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
  s.x = s.bx + s.vx * dt + s.dx * f;
  s.y = s.by + s.vy * dt + s.dy * f;
  s.koersNu = s.koers + s.dKoers * f;
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

const maakAtlas = (dpr: number): Atlas => {
  const vorm = new Path2D(VLIEGTUIG);
  const cel = Math.ceil(SPRITE * dpr);
  const rijenPerNiveau = HOEKEN / KOLOMMEN;
  const beeld = document.createElement("canvas");
  beeld.width = KOLOMMEN * cel;
  beeld.height = NIVEAUS.length * rijenPerNiveau * cel;
  const ctx = beeld.getContext("2d")!;
  const k = cel / SPRITE;
  NIVEAUS.forEach(({ kleur }, niveau) => {
    for (let i = 0; i < HOEKEN; i++) {
      const kolom = i % KOLOMMEN;
      const rij = niveau * rijenPerNiveau + Math.floor(i / KOLOMMEN);
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
  return { beeld, cel };
};

//! het plaatje van een vliegtuig (niveau + koers) uit de atlas kopiëren, gecentreerd op cx, cy (css-pixels op het canvas)
const tekenVliegtuig = (ctx: CanvasRenderingContext2D, atlas: Atlas, niveau: number, hoek: number, cx: number, cy: number, d: number) => {
  const { beeld, cel } = atlas;
  const sx = (hoek % KOLOMMEN) * cel;
  const sy = (niveau * (HOEKEN / KOLOMMEN) + Math.floor(hoek / KOLOMMEN)) * cel;
  ctx.drawImage(beeld, sx, sy, cel, cel, Math.round(cx * d - cel / 2), Math.round(cy * d - cel / 2), cel, cel);
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
  private filter: Niveau | null = null;
  private gekozenId: string | null = null;
  private klokVerschil = 0; //! hoeveel ms de klok van de server voorloopt op die van de browser
  private interval = 30; //! hoe vaak de server ververst, in seconden (voor de horizon van D2)
  //! de bereikcirkel is net naar een nieuw gebied gesleept en de data is er nog niet: vliegtuigen buiten dat gebied dimmen (wereldcoördinaten)
  private voorlopig: { x: number; y: number; r2: number } | null = null;

  private houder: HTMLDivElement | null = null; //! div met beide canvassen, schuift en schaalt mee met de kaart
  private vlak: HTMLCanvasElement | null = null; //! de vliegtuigen
  private pulsVlak: HTMLCanvasElement | null = null; //! alleen de pulsringen, apart zodat die kunnen kloppen zonder alle vliegtuigen te hertekenen
  private ctx: CanvasRenderingContext2D | null = null;
  private pulsCtx: CanvasRenderingContext2D | null = null;
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
    let gesnapt = 0;
    const nieuw = new Map<string, Spoor>();

    for (const p of planes) {
      if (typeof p[5] !== "number" || typeof p[6] !== "number") continue;
      const wereld = crs.latLngToPoint(L.latLng(p[6], p[5]), 0);
      const t0 = typeof p[3] === "number" ? p[3] : (tijd.tijd ?? sec); //! time_position, of anders het moment van de momentopname
      const koers = typeof p[10] === "number" ? p[10] : 0;
      //! alleen doorrekenen in de lucht, met snelheid en koers
      const beweegt = !p[8] && typeof p[9] === "number" && p[9] >= MIN_SNELHEID && typeof p[10] === "number";
      const { vx, vy } = beweegt ? wereldSnelheid(p[9], p[10], p[6]) : { vx: 0, vy: 0 };
      const niveau = (beoordelingen.get(p[0]) ?? GEEN_BEOORDELING).niveau;
      const oud = this.sporen.get(p[0]);

      if (oud) {
        positie(oud, nu, sec, horizon); //! waar hij op dit moment getekend staat
        let dt = sec - t0;
        dt = dt < 0 ? 0 : dt > horizon ? horizon : dt;
        let dx = oud.x - (wereld.x + vx * dt);
        let dy = oud.y - (wereld.y + vy * dt);
        let dKoers = koersVerschil(oud.koersNu, koers);
        const meters = Math.hypot(dx, dy) / wereldPerMeter(p[6]);
        //! te groot verschil, of een flink gat in de data: meteen goed zetten in plaats van een lange glijpartij
        const gat = t0 - oud.t0 > Math.max(30, 2.5 * this.interval);
        if (meters > SPRONG_M || gat) {
          dx = dy = dKoers = 0;
          gesnapt++;
        } else if (beweegt && !oud.oud && schaal) {
          correctiesPx.push(Math.hypot(dx, dy) * schaal);
        }
        Object.assign(oud, { bx: wereld.x, by: wereld.y, vx, vy, v: Math.hypot(vx, vy), t0, koers, dx, dy, dKoers, correctieStart: nu, niveau });
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
          fase: faseVan(p[0]),
        };
        positie(s, nu, sec, horizon);
        nieuw.set(p[0], s);
      }
    }
    //! vliegtuigen die niet meer in het pakket zitten verdwijnen, net als eerst
    this.sporen = nieuw;
    this.voorlopig = null; //! nieuwe data: niets meer te dimmen
    this.volgorde = [...nieuw.values()].sort((a, b) => a.niveau - b.niveau);
    this.alarm = this.volgorde.filter((s) => s.niveau >= 3);
    // OUD: this.overgangTot = nu + OVERGANG_MS;

    correctiesPx.sort((a, b) => a - b);
    const plek = (q: number) => (correctiesPx.length ? correctiesPx[Math.min(correctiesPx.length - 1, Math.floor(correctiesPx.length * q))] : 0);
    meting.correctieMediaanPx = plek(0.5);
    meting.correctieP95Px = plek(0.95);
    meting.correctieMaxPx = correctiesPx.length ? correctiesPx[correctiesPx.length - 1] : 0;
    meting.correctieZoom = this.kaart ? this.kaart.getZoom() : 0;
    meting.gesnapt = gesnapt;

    this.vuil = this.pulsVuil = true;
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

  //! hoe vaak de server ververst (seconden): bepaalt hoe lang een vliegtuig zonder nieuwe positie doorvliegt
  zetInterval(seconden: number) {
    this.interval = seconden > 0 ? seconden : 30;
    this.vuil = true;
    this.plan();
  }

  zetFilter(filter: Niveau | null) {
    this.filter = filter;
    this.vuil = this.pulsVuil = true;
    this.plan();
  }

  zetGekozen(id: string | null) {
    this.gekozenId = id;
    this.gemeldX = this.gemeldY = NaN; //! de popup krijgt bij de volgende tekenbeurt meteen een positie
    this.vuil = true;
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
    this.vlak = L.DomUtil.create("canvas", "", this.houder) as HTMLCanvasElement;
    this.pulsVlak = L.DomUtil.create("canvas", "", this.houder) as HTMLCanvasElement;
    for (const c of [this.vlak, this.pulsVlak]) Object.assign(c.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none" });
    this.ctx = this.vlak.getContext("2d");
    this.pulsCtx = this.pulsVlak.getContext("2d");
    this.ankerNodig = this.vuil = this.pulsVuil = true;
    this.plan();
    return this;
  }

  onRemove(map: L.Map) {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.wekker);
    this.raf = this.wekker = 0;
    this.houder?.remove();
    this.houder = this.vlak = this.pulsVlak = null;
    this.ctx = this.pulsCtx = null;
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
      for (const c of [this.vlak!, this.pulsVlak!]) {
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
      this.vuil = this.pulsVuil = true;
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
    // OUD: if (overgang || this.pulsActief) this.plan();
    //! het volgende beeld: voor de pulsringen (30 per seconde) of als het snelste vliegtuig een halve pixel verder is
    let volgende = this.volgendeTekenbeurt;
    if (this.pulsActief) volgende = Math.min(volgende, this.laatstePuls + PULS_BEELD_MS);
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

    for (const s of this.volgorde) {
      if (this.filter !== null && s.niveau !== this.filter) continue;
      positie(s, nu, sec, horizon);
      if (s.id === this.gekozenId) {
        gekozen = s; //! komt als laatste, bovenop alles
        continue;
      }
      const cx = s.x * schaal - ox;
      const cy = s.y * schaal - oy;
      //! frustum culling: buiten het canvas (beeld + marge) tekenen we niets, en telt hij ook niet mee voor het tempo
      if (cx < -m || cy < -m || cx > b + m || cy > h + m) continue;
      // OUD: if (s.oud) {
      // OUD:   ctx.globalAlpha = 0.5; //! al te lang geen nieuwe positie: half doorzichtig
      // OUD:   tekenVliegtuig(ctx, atlas, s.niveau, s.hoek, cx, cy, d);
      // OUD:   ctx.globalAlpha = 1;
      // OUD:   verouderd++;
      // OUD: } else {
      // OUD:   tekenVliegtuig(ctx, atlas, s.niveau, s.hoek, cx, cy, d);
      // OUD: }
      //! half doorzichtig: al te lang geen nieuwe positie. extra gedimd: buiten het gebied waar de cirkel net naartoe is gesleept
      let alpha = s.oud ? 0.5 : 1;
      if (voorlopig && (s.x - voorlopig.x) ** 2 + (s.y - voorlopig.y) ** 2 > voorlopig.r2) alpha *= 0.35;
      if (alpha < 1) {
        ctx.globalAlpha = alpha;
        tekenVliegtuig(ctx, atlas, s.niveau, s.hoek, cx, cy, d);
        ctx.globalAlpha = 1;
      } else {
        tekenVliegtuig(ctx, atlas, s.niveau, s.hoek, cx, cy, d);
      }
      if (s.oud) verouderd++;
      zichtbaar++;
      const px = tempo(s);
      if (px > snelstePx) snelstePx = px;
    }

    //! minder beweging aan (besturingssysteem): een vaste ring in plaats van een kloppende
    if (this.rustigeBeweging) {
      ctx.setTransform(d, 0, 0, d, 0, 0);
      for (const s of this.alarm) {
        if (this.filter !== null && s.niveau !== this.filter) continue;
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
        tekenVliegtuig(ctx, atlas, gekozen.niveau, gekozen.hoek, cx, cy, d);
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
      if (this.filter !== null && s.niveau !== this.filter) continue;
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
      if (this.filter !== null && s.niveau !== this.filter) continue;
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
