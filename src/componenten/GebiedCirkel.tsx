import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Punt } from "../App";

//! de bereikcirkel, die je kunt verslepen naar een ander deel van de wereld.
//! dubbelklik op de rand (of op het kruisje in het midden): de cirkel wordt fel en doorgetrokken (verplaatsmodus). druk dan ergens
//! in de cirkel, sleep hem en laat los: dat wordt het nieuwe gebied. Esc zet hem terug, een klik buiten de cirkel stopt de modus.
//! op een aanraakscherm: dubbel tikken op de rand of het kruisje en meteen doorschuiven.
//! waarom alleen de rand en niet de hele cirkel: die bedekt bijna je hele beeld, en daar wil je gewoon kunnen dubbelklik-zoomen (D4).
//! tijdens het slepen beweegt alleen de Leaflet-cirkel: geen React-state per beweging en geen aanvragen naar de server.
//! de straal (fase 2 van het tweede plan, K4): in de verplaatsmodus is de rand slepen de straal, binnenin slepen is verplaatsen.
//! stappen van 25 km, met een label bij de cursor. op een aanraakscherm: dubbel tikken op de rand en doorschuiven, en dan beslist
//! de richting: van het midden af of ernaartoe is de straal, langs de rand is verplaatsen. dubbel tikken op het kruisje is altijd verplaatsen

type Gebied = { lat: number; lon: number; km: number };

type Props = {
  midden: Punt;
  straal: number; //! km
  onVerplaatst: (punt: Punt) => void; //! losgelaten op een nieuwe plek
  onVoorlopig?: (gebied: Gebied) => void; //! het nieuwe gebied, nog voor er data is (de vliegtuigen erbuiten worden gedimd)
  onStraal?: (km: number) => void; //! de rand losgelaten op een nieuwe straal
  // OUD: maxKm?: number; //! 1000, of 450 bij adsb.lol
  maxKm?: number; //! 3000, of 450 bij adsb.lol
};

const RAND_PX = 12; //! zo dicht bij de rand telt als "op de rand"
const KRUIS_PX = 14; //! zo dicht bij het midden telt als "op het kruisje"
const DUBBEL_TIK_MS = 350; //! twee tikken binnen deze tijd en afstand zijn een dubbele tik
const DUBBEL_TIK_PX = 30;
const STAP_KM = 25; //! de straal gaat in stappen, net als de schuif in het paneel
const MIN_KM = 25;
const BESLIS_PX = 8; //! touch op de rand: na zoveel pixels schuiven weten we de richting (straal of verplaatsen)
const MAAT_KLASSEN = ["radar-gebied-maat-ew", "radar-gebied-maat-ns", "radar-gebied-maat-nesw", "radar-gebied-maat-nwse"];

//! zelfde stijl als de oude cirkel, plus een lichtere (muis op de rand) en een felle doorgetrokken (verplaatsmodus)
const RUST: L.PathOptions = { color: "#34d399", weight: 1, opacity: 0.6, fillColor: "#34d399", fillOpacity: 0.03, dashArray: "6 6", interactive: false };
const HOVER: L.PathOptions = { ...RUST, weight: 2, opacity: 0.9 };
const VERPLAATS: L.PathOptions = { ...RUST, weight: 2, opacity: 1, fillOpacity: 0.08, dashArray: null as unknown as string }; //! null = doorgetrokken

// OUD: type Modus = "rust" | "hover" | "klaar" | "slepen"; //! klaar = verplaatsmodus aan, wacht tot je drukt
//! klaar = verplaatsmodus aan, wacht tot je drukt. straal = de rand wordt gesleept. beslis = touch op de rand, de richting is nog niet bekend
type Modus = "rust" | "hover" | "klaar" | "slepen" | "straal" | "beslis";

// OUD: const GebiedCirkel = ({ midden, straal, onVerplaatst, onVoorlopig }: Props) => {
// OUD: const GebiedCirkel = ({ midden, straal, onVerplaatst, onVoorlopig, onStraal, maxKm = 1000 }: Props) => {
const GebiedCirkel = ({ midden, straal, onVerplaatst, onVoorlopig, onStraal, maxKm = 3000 }: Props) => {
  const map = useMap();
  //! altijd de nieuwste props en callbacks, de listeners hieronder worden maar één keer gemaakt
  // OUD: const props = useRef({ midden, straal, onVerplaatst, onVoorlopig });
  // OUD: props.current = { midden, straal, onVerplaatst, onVoorlopig };
  const props = useRef({ midden, straal, onVerplaatst, onVoorlopig, onStraal, maxKm });
  props.current = { midden, straal, onVerplaatst, onVoorlopig, onStraal, maxKm };
  const delen = useRef<{ cirkel: L.Circle; kruis: L.Marker; modus: () => Modus } | null>(null);

  useEffect(() => {
    const container = map.getContainer();
    const cirkel = L.circle(props.current.midden, { radius: props.current.straal * 1000, ...RUST }).addTo(map);
    const kruis = L.marker(props.current.midden, {
      icon: L.divIcon({ className: "radar-kruis", iconSize: [16, 16] }),
      interactive: false,
      keyboard: false,
    }).addTo(map);
    // OUD: const hint = L.tooltip({ … }).setContent("Dubbelklik om de cirkel te verslepen");
    const hint = L.tooltip({ direction: "top", offset: [0, -12], className: "radar-hint" }).setContent(
      "Dubbelklik om de cirkel te verslepen of groter te maken",
    );
    const maat = L.tooltip({ direction: "right", offset: [16, 0], className: "radar-hint" }); //! "350 km" bij de cursor tijdens het slepen van de straal

    let modus: Modus = "rust";
    let greep = L.point(0, 0); //! van de cursor naar het midden, in pixels: zo springt de cirkel niet naar de cursor
    let pointerId = -1;
    let vanaf = cirkel.getLatLng(); //! midden bij het begin, voor Esc
    let vanafStraal = cirkel.getRadius(); //! straal bij het begin (meter), voor Esc
    let straalGreep = 0; //! verschil in meter tussen de straal en waar je de rand vastpakte: zo springt de rand niet naar de cursor
    let beslisVanaf = L.point(0, 0); //! touch: waar de vinger de rand raakte, om de richting te bepalen
    let negeerKlikTot = 0; //! de klik die de browser na het loslaten stuurt is geen klik op de kaart
    let laatsteTik = { t: -Infinity, x: 0, y: 0 };

    //! waar staat de cursor ten opzichte van de cirkel? in pixels, op de zoom van nu
    // OUD: const meet = (p: L.Point) => {
    // OUD:   const ll = cirkel.getLatLng();
    // OUD:   const c = map.latLngToContainerPoint(ll);
    // OUD:   const noord = map.latLngToContainerPoint([Math.min(89.9, ll.lat + cirkel.getRadius() / 111320), ll.lng]);
    // OUD:   const r = c.distanceTo(noord);
    // OUD:   const d = c.distanceTo(p);
    // OUD:   return { rand: Math.abs(d - r) <= RAND_PX, kruis: d <= KRUIS_PX, binnen: d <= r + RAND_PX };
    // OUD: };
    //! Leaflet tekent een grote cirkel in Web-Mercator als ellips: iets hoger dan breed, met het midden iets zuidelijker dan het
    //! middelpunt. bij 325 km rond nederland lag de oostrand al 17 px naast een ronde schatting, meer dan RAND_PX. daarom meten we
    //! tegen wat Leaflet echt tekent: _point (midden, laagpixels), _radius (breedte) en _radiusY (hoogte), na elke zoom of setRadius
    //! opnieuw uitgerekend. die zijn niet officieel, dus met de ronde schatting als vangnet
    const meet = (p: L.Point) => {
      const ll = cirkel.getLatLng();
      const kruisPunt = map.latLngToContainerPoint(ll);
      const getekend = cirkel as unknown as { _point?: L.Point; _radius?: number; _radiusY?: number };
      let c = kruisPunt;
      let rx: number;
      let ry: number;
      if (getekend._point && getekend._radius) {
        c = map.layerPointToContainerPoint(getekend._point);
        rx = getekend._radius;
        ry = getekend._radiusY || rx;
      } else {
        rx = ry = kruisPunt.distanceTo(map.latLngToContainerPoint([Math.min(89.9, ll.lat + cirkel.getRadius() / 111320), ll.lng]));
      }
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d = Math.hypot(dx, dy);
      //! de straal van de ellips in de richting van de cursor
      const r = d === 0 ? rx : 1 / Math.sqrt((dx / d / rx) ** 2 + (dy / d / ry) ** 2);
      return { rand: Math.abs(d - r) <= RAND_PX, kruis: kruisPunt.distanceTo(p) <= KRUIS_PX, binnen: d <= r + RAND_PX };
    };
    const klasse = (naam: string, aan: boolean) => (aan ? L.DomUtil.addClass(container, naam) : L.DomUtil.removeClass(container, naam));

    //! de cursor op de rand: een pijl van het midden af, recht (oost-west, noord-zuid) of schuin. null = geen maatcursor
    const maatCursor = (p: L.Point | null) => {
      let naam: string | null = null;
      if (p) {
        const c = map.latLngToContainerPoint(cirkel.getLatLng());
        const hoek = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI; //! 0 = oost, 90 = zuid (y loopt naar beneden)
        const a = Math.abs(hoek);
        if (a < 22.5 || a > 157.5) naam = "radar-gebied-maat-ew";
        else if (a > 67.5 && a < 112.5) naam = "radar-gebied-maat-ns";
        else naam = (hoek < 0) === (a < 90) ? "radar-gebied-maat-nesw" : "radar-gebied-maat-nwse";
      }
      for (const k of MAAT_KLASSEN) klasse(k, k === naam);
    };

    //! de straal in km uit de cursor: afstand tot het midden plus waar je de rand vastpakte, in stappen van 25 km
    const straalBij = (p: L.Point) => {
      const meter = map.distance(cirkel.getLatLng(), map.containerPointToLatLng(p)) + straalGreep;
      const km = Math.round(meter / 1000 / STAP_KM) * STAP_KM;
      return Math.max(MIN_KM, Math.min(props.current.maxKm, km));
    };
    const toonMaat = (p: L.Point, km: number) => {
      maat.setContent(`${km} km`).setLatLng(map.containerPointToLatLng(p));
      if (!map.hasLayer(maat)) map.openTooltip(maat);
    };

    const zetModus = (nieuw: Modus) => {
      modus = nieuw;
      // OUD: const verplaatsen = nieuw === "klaar" || nieuw === "slepen";
      const verplaatsen = nieuw === "klaar" || nieuw === "slepen" || nieuw === "straal" || nieuw === "beslis";
      cirkel.setStyle(verplaatsen ? VERPLAATS : nieuw === "hover" ? HOVER : RUST);
      klasse("radar-gebied-greep", nieuw === "hover" || nieuw === "klaar"); //! cursor: verplaatsen (zie index.css)
      klasse("radar-gebied-sleep", nieuw === "slepen");
      if (nieuw !== "straal" && nieuw !== "klaar") maatCursor(null); //! tijdens de straal blijft de pijl staan, in klaar zet de muis hem
      if (nieuw !== "straal") map.closeTooltip(maat);
      klasse("radar-gebied-modus", verplaatsen); //! de vliegtuiglaag geeft dan geen handje (indrukken sleept de cirkel)
      const kruisEl = kruis.getElement();
      if (kruisEl) (verplaatsen ? L.DomUtil.addClass : L.DomUtil.removeClass)(kruisEl, "radar-kruis--aan");
      //! in de verplaatsmodus sleep je de cirkel, niet de kaart
      if (verplaatsen) map.dragging.disable();
      else map.dragging.enable();
      if (nieuw !== "hover") map.closeTooltip(hint);
    };

    //! muis op de rand of het kruisje: lichter, verplaats-cursor en de hint
    const opMuis = (e: L.LeafletMouseEvent) => {
      // OUD: if (modus === "slepen") return;
      if (modus === "slepen" || modus === "straal" || modus === "beslis") return;
      const m = meet(e.containerPoint);
      // OUD: if (modus === "klaar") return klasse("radar-gebied-greep", m.binnen);
      //! verplaatsmodus: op de rand de pijl voor de straal, binnenin de verplaats-cursor
      if (modus === "klaar") {
        maatCursor(m.rand ? e.containerPoint : null);
        return klasse("radar-gebied-greep", m.binnen && !m.rand);
      }
      if ((map.dragging as any).moving?.()) return;
      const op = m.rand || m.kruis;
      if (op && modus === "rust") zetModus("hover");
      else if (!op && modus === "hover") zetModus("rust");
      if (op) {
        hint.setLatLng(e.latlng);
        if (!map.hasLayer(hint)) map.openTooltip(hint);
      }
    };
    const opMuisWeg = () => {
      if (modus === "hover") zetModus("rust");
    };

    //! dubbelklik (muis). in de capture-fase, vóór Leaflet: op de rand of het kruisje houden we hem tegen, dus geen dubbelklik-zoom.
    //! overal anders gaat hij gewoon door naar Leaflet
    const opDubbelklik = (e: MouseEvent) => {
      // OUD: if (modus === "slepen") return;
      if (modus === "slepen" || modus === "straal" || modus === "beslis") return;
      const p = map.mouseEventToContainerPoint(e);
      const m = meet(p);
      if (!(m.rand || m.kruis)) return;
      e.stopPropagation();
      e.preventDefault();
      vanaf = cirkel.getLatLng();
      vanafStraal = cirkel.getRadius();
      zetModus("klaar");
      maatCursor(m.rand ? p : null); //! de muis staat al op de rand: meteen de juiste cursor
    };

    //! de pointer vasthouden: alle bewegingen komen dan hier binnen, ook buiten de kaart
    const vang = (e: PointerEvent) => {
      pointerId = e.pointerId;
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        //! lukt niet bij een al afgelopen aanraking: dan werkt slepen binnen de kaart nog steeds
      }
    };

    //! de straal gaan slepen, vanaf punt p op de rand
    const beginStraal = (p: L.Point) => {
      straalGreep = cirkel.getRadius() - map.distance(cirkel.getLatLng(), map.containerPointToLatLng(p));
      maatCursor(p);
      zetModus("straal");
      toonMaat(p, Math.round(cirkel.getRadius() / 1000));
    };

    const begin = (e: PointerEvent, p: L.Point) => {
      e.stopPropagation();
      e.preventDefault();
      greep = map.latLngToContainerPoint(cirkel.getLatLng()).subtract(p);
      pointerId = e.pointerId;
      try {
        container.setPointerCapture(e.pointerId); //! alle bewegingen komen nu hier binnen, ook buiten de kaart
      } catch {
        //! lukt niet bij een al afgelopen aanraking: dan werkt slepen binnen de kaart nog steeds
      }
      zetModus("slepen");
    };

    const opIndrukken = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const p = map.mouseEventToContainerPoint(e);
      const m = meet(p);
      //! aanraakscherm: de tweede tik van een dubbele tik op de rand of het kruisje zet de modus aan en sleept meteen
      if (e.pointerType !== "mouse" && modus !== "klaar") {
        const tweede = e.timeStamp - laatsteTik.t < DUBBEL_TIK_MS && Math.hypot(p.x - laatsteTik.x, p.y - laatsteTik.y) < DUBBEL_TIK_PX;
        laatsteTik = { t: e.timeStamp, x: p.x, y: p.y };
        if (!tweede || !(m.rand || m.kruis)) return;
        vanaf = cirkel.getLatLng();
        vanafStraal = cirkel.getRadius();
        negeerKlikTot = performance.now() + 1000; //! anders maakt Leaflet van de twee tikken alsnog een dubbelklik-zoom
        // OUD: return begin(e, p);
        if (m.kruis) return begin(e, p); //! het kruisje is altijd verplaatsen
        //! de rand: de richting van het schuiven beslist (opBewegen)
        e.stopPropagation();
        e.preventDefault();
        vang(e);
        beslisVanaf = p;
        return zetModus("beslis");
      }
      if (modus !== "klaar") return;
      //! klik buiten de cirkel: modus uit, en de klik doet verder gewoon wat hij altijd doet
      if (!m.binnen) return zetModus("rust");
      // OUD: begin(e, p);
      //! op de rand: de straal. binnenin: verplaatsen
      if (m.rand) {
        e.stopPropagation();
        e.preventDefault();
        vang(e);
        return beginStraal(p);
      }
      begin(e, p);
    };

    const opBewegen = (e: PointerEvent) => {
      // OUD: if (modus !== "slepen" || e.pointerId !== pointerId) return;
      if (e.pointerId !== pointerId) return;
      const punt = map.mouseEventToContainerPoint(e);
      //! touch op de rand: zodra de vinger een stukje geschoven is weten we de richting. van het midden af of ernaartoe = de straal,
      //! langs de rand = verplaatsen
      if (modus === "beslis") {
        const schuif = punt.subtract(beslisVanaf);
        if (schuif.x * schuif.x + schuif.y * schuif.y < BESLIS_PX * BESLIS_PX) return;
        const c = map.latLngToContainerPoint(cirkel.getLatLng());
        const naarBuiten = beslisVanaf.subtract(c);
        const lengte = Math.hypot(naarBuiten.x, naarBuiten.y) || 1;
        const langs = (schuif.x * naarBuiten.x + schuif.y * naarBuiten.y) / lengte; //! van het midden af (+) of ernaartoe (-)
        const opzij = Math.abs(schuif.x * naarBuiten.y - schuif.y * naarBuiten.x) / lengte; //! langs de rand
        if (Math.abs(langs) >= opzij) beginStraal(beslisVanaf);
        else {
          greep = c.subtract(beslisVanaf);
          zetModus("slepen");
        }
      }
      if (modus === "straal") {
        const km = straalBij(punt);
        cirkel.setRadius(km * 1000);
        toonMaat(punt, km);
        return;
      }
      if (modus !== "slepen") return;
      const p = punt.add(greep);
      const ll = map.containerPointToLatLng(p);
      const nieuw = L.latLng(Math.max(-85, Math.min(85, ll.lat)), ll.lng); //! verder dan 85 graden kan Web-Mercator niet
      cirkel.setLatLng(nieuw);
      kruis.setLatLng(nieuw);
    };

    const opLoslaten = (e: PointerEvent) => {
      // OUD: if (modus !== "slepen" || e.pointerId !== pointerId) return;
      if ((modus !== "slepen" && modus !== "straal" && modus !== "beslis") || e.pointerId !== pointerId) return;
      e.stopPropagation();
      try {
        container.releasePointerCapture(pointerId);
      } catch {
        //! al losgelaten
      }
      pointerId = -1;
      negeerKlikTot = Math.max(negeerKlikTot, performance.now() + 400);
      const was = modus;
      const ll = cirkel.getLatLng();
      const km = Math.round(cirkel.getRadius() / 1000);
      zetModus("rust");
      //! de straal: loslaten = de nieuwe straal. vliegtuigen buiten een kleinere cirkel worden gedimd tot de data er is
      if (was === "straal") {
        if (km === props.current.straal) return; //! niet veranderd: niets op te halen
        props.current.onVoorlopig?.({ lat: ll.lat, lon: ll.lng, km });
        props.current.onStraal?.(km);
        return;
      }
      if (was === "beslis") return; //! aangeraakt maar niet geschoven
      if (ll.equals(vanaf)) return; //! niet verschoven: niets op te halen
      props.current.onVoorlopig?.({ lat: ll.lat, lon: ll.lng, km: props.current.straal });
      props.current.onVerplaatst([ll.lat, ll.lng]);
    };

    //! terug naar waar hij was (Esc, of de browser breekt de aanraking af)
    const annuleer = () => {
      if (pointerId >= 0) {
        try {
          container.releasePointerCapture(pointerId);
        } catch {
          //! al losgelaten
        }
      }
      pointerId = -1;
      cirkel.setLatLng(vanaf);
      kruis.setLatLng(vanaf);
      cirkel.setRadius(vanafStraal); //! ook de straal terug
      zetModus("rust");
    };
    const bezig = () => modus === "slepen" || modus === "straal" || modus === "beslis";
    const opAfbreken = (e: PointerEvent) => {
      // OUD: if (modus === "slepen" && e.pointerId === pointerId) annuleer();
      if (bezig() && e.pointerId === pointerId) annuleer();
    };
    const opToets = (e: KeyboardEvent) => {
      // OUD: if (e.key !== "Escape" || (modus !== "klaar" && modus !== "slepen")) return;
      if (e.key !== "Escape" || (modus !== "klaar" && !bezig())) return;
      e.stopPropagation(); //! deze Esc is voor de cirkel, niet om een popup te sluiten
      annuleer();
    };
    // OUD: const opKlik = (e: MouseEvent) => {
    // OUD:   if (performance.now() < negeerKlikTot) { e.stopPropagation(); e.preventDefault(); }
    // OUD: };
    //! een klik op de rand of het kruisje is voor de cirkel, niet voor een vliegtuig dat daar toevallig vliegt. anders kiest de eerste
    //! klik van een dubbelklik dat vliegtuig, schuift de popup de kaart opzij, en zoomt de tweede klik in in plaats van de modus aan te zetten
    const opKlik = (e: MouseEvent) => {
      const opCirkel = (modus === "rust" || modus === "hover") && (() => {
        const m = meet(map.mouseEventToContainerPoint(e));
        return m.rand || m.kruis;
      })();
      if (performance.now() < negeerKlikTot || opCirkel) {
        e.stopPropagation();
        e.preventDefault();
      }
    };

    map.on("mousemove", opMuis);
    map.on("mouseout", opMuisWeg);
    container.addEventListener("dblclick", opDubbelklik, true);
    container.addEventListener("pointerdown", opIndrukken, true);
    container.addEventListener("pointermove", opBewegen, true);
    container.addEventListener("pointerup", opLoslaten, true);
    container.addEventListener("pointercancel", opAfbreken, true);
    container.addEventListener("click", opKlik, true);
    window.addEventListener("keydown", opToets, true);
    delen.current = { cirkel, kruis, modus: () => modus };

    return () => {
      map.off("mousemove", opMuis);
      map.off("mouseout", opMuisWeg);
      container.removeEventListener("dblclick", opDubbelklik, true);
      container.removeEventListener("pointerdown", opIndrukken, true);
      container.removeEventListener("pointermove", opBewegen, true);
      container.removeEventListener("pointerup", opLoslaten, true);
      container.removeEventListener("pointercancel", opAfbreken, true);
      container.removeEventListener("click", opKlik, true);
      window.removeEventListener("keydown", opToets, true);
      // OUD: for (const naam of ["radar-gebied-greep", "radar-gebied-sleep", "radar-gebied-modus"]) L.DomUtil.removeClass(container, naam);
      for (const naam of ["radar-gebied-greep", "radar-gebied-sleep", "radar-gebied-modus", ...MAAT_KLASSEN]) L.DomUtil.removeClass(container, naam);
      map.dragging.enable();
      map.closeTooltip(hint);
      map.closeTooltip(maat);
      cirkel.remove();
      kruis.remove();
      delen.current = null;
    };
  }, [map]);

  //! nieuw midden of nieuwe straal van buiten (schuif, knoppen, of het eigen loslaten): de cirkel erheen, behalve tijdens het slepen
  useEffect(() => {
    const d = delen.current;
    // OUD: if (!d || d.modus() === "slepen") return;
    if (!d || ["slepen", "straal", "beslis"].includes(d.modus())) return;
    d.cirkel.setLatLng(midden);
    d.cirkel.setRadius(straal * 1000);
    d.kruis.setLatLng(midden);
  }, [midden, straal]);

  return null;
};

export default GebiedCirkel;
