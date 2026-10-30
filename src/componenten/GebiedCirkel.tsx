import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import type { Punt } from "../App";

//! de bereikcirkel, die je kunt verslepen naar een ander deel van de wereld.
//! dubbelklik op de rand (of op het kruisje in het midden): de cirkel wordt fel en doorgetrokken (verplaatsmodus). druk dan ergens
//! in de cirkel, sleep hem en laat los: dat wordt het nieuwe gebied. Esc zet hem terug, een klik buiten de cirkel stopt de modus.
//! op een aanraakscherm: dubbel tikken op de rand of het kruisje en meteen doorschuiven.
//! waarom alleen de rand en niet de hele cirkel: die bedekt bijna je hele beeld, en daar wil je gewoon kunnen dubbelklik-zoomen (D4).
//! tijdens het slepen beweegt alleen de Leaflet-cirkel: geen React-state per beweging en geen aanvragen naar de server

type Gebied = { lat: number; lon: number; km: number };

type Props = {
  midden: Punt;
  straal: number; //! km
  onVerplaatst: (punt: Punt) => void; //! losgelaten op een nieuwe plek
  onVoorlopig?: (gebied: Gebied) => void; //! het nieuwe gebied, nog voor er data is (de vliegtuigen erbuiten worden gedimd)
};

const RAND_PX = 12; //! zo dicht bij de rand telt als "op de rand"
const KRUIS_PX = 14; //! zo dicht bij het midden telt als "op het kruisje"
const DUBBEL_TIK_MS = 350; //! twee tikken binnen deze tijd en afstand zijn een dubbele tik
const DUBBEL_TIK_PX = 30;

//! zelfde stijl als de oude cirkel, plus een lichtere (muis op de rand) en een felle doorgetrokken (verplaatsmodus)
const RUST: L.PathOptions = { color: "#34d399", weight: 1, opacity: 0.6, fillColor: "#34d399", fillOpacity: 0.03, dashArray: "6 6", interactive: false };
const HOVER: L.PathOptions = { ...RUST, weight: 2, opacity: 0.9 };
const VERPLAATS: L.PathOptions = { ...RUST, weight: 2, opacity: 1, fillOpacity: 0.08, dashArray: null as unknown as string }; //! null = doorgetrokken

type Modus = "rust" | "hover" | "klaar" | "slepen"; //! klaar = verplaatsmodus aan, wacht tot je drukt

const GebiedCirkel = ({ midden, straal, onVerplaatst, onVoorlopig }: Props) => {
  const map = useMap();
  //! altijd de nieuwste props en callbacks, de listeners hieronder worden maar één keer gemaakt
  const props = useRef({ midden, straal, onVerplaatst, onVoorlopig });
  props.current = { midden, straal, onVerplaatst, onVoorlopig };
  const delen = useRef<{ cirkel: L.Circle; kruis: L.Marker; modus: () => Modus } | null>(null);

  useEffect(() => {
    const container = map.getContainer();
    const cirkel = L.circle(props.current.midden, { radius: props.current.straal * 1000, ...RUST }).addTo(map);
    const kruis = L.marker(props.current.midden, {
      icon: L.divIcon({ className: "radar-kruis", iconSize: [16, 16] }),
      interactive: false,
      keyboard: false,
    }).addTo(map);
    const hint = L.tooltip({ direction: "top", offset: [0, -12], className: "radar-hint" }).setContent("Dubbelklik om de cirkel te verslepen");

    let modus: Modus = "rust";
    let greep = L.point(0, 0); //! van de cursor naar het midden, in pixels: zo springt de cirkel niet naar de cursor
    let pointerId = -1;
    let vanaf = cirkel.getLatLng(); //! midden bij het begin, voor Esc
    let negeerKlikTot = 0; //! de klik die de browser na het loslaten stuurt is geen klik op de kaart
    let laatsteTik = { t: -Infinity, x: 0, y: 0 };

    //! waar staat de cursor ten opzichte van de cirkel? in pixels, op de zoom van nu
    const meet = (p: L.Point) => {
      const ll = cirkel.getLatLng();
      const c = map.latLngToContainerPoint(ll);
      const noord = map.latLngToContainerPoint([Math.min(89.9, ll.lat + cirkel.getRadius() / 111320), ll.lng]);
      const r = c.distanceTo(noord);
      const d = c.distanceTo(p);
      return { rand: Math.abs(d - r) <= RAND_PX, kruis: d <= KRUIS_PX, binnen: d <= r + RAND_PX };
    };
    const klasse = (naam: string, aan: boolean) => (aan ? L.DomUtil.addClass(container, naam) : L.DomUtil.removeClass(container, naam));

    const zetModus = (nieuw: Modus) => {
      modus = nieuw;
      const verplaatsen = nieuw === "klaar" || nieuw === "slepen";
      cirkel.setStyle(verplaatsen ? VERPLAATS : nieuw === "hover" ? HOVER : RUST);
      klasse("radar-gebied-greep", nieuw === "hover" || nieuw === "klaar"); //! cursor: verplaatsen (zie index.css)
      klasse("radar-gebied-sleep", nieuw === "slepen");
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
      if (modus === "slepen") return;
      const m = meet(e.containerPoint);
      if (modus === "klaar") return klasse("radar-gebied-greep", m.binnen);
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
      if (modus === "slepen") return;
      const m = meet(map.mouseEventToContainerPoint(e));
      if (!(m.rand || m.kruis)) return;
      e.stopPropagation();
      e.preventDefault();
      vanaf = cirkel.getLatLng();
      zetModus("klaar");
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
        negeerKlikTot = performance.now() + 1000; //! anders maakt Leaflet van de twee tikken alsnog een dubbelklik-zoom
        return begin(e, p);
      }
      if (modus !== "klaar") return;
      //! klik buiten de cirkel: modus uit, en de klik doet verder gewoon wat hij altijd doet
      if (!m.binnen) return zetModus("rust");
      begin(e, p);
    };

    const opBewegen = (e: PointerEvent) => {
      if (modus !== "slepen" || e.pointerId !== pointerId) return;
      const p = map.mouseEventToContainerPoint(e).add(greep);
      const ll = map.containerPointToLatLng(p);
      const nieuw = L.latLng(Math.max(-85, Math.min(85, ll.lat)), ll.lng); //! verder dan 85 graden kan Web-Mercator niet
      cirkel.setLatLng(nieuw);
      kruis.setLatLng(nieuw);
    };

    const opLoslaten = (e: PointerEvent) => {
      if (modus !== "slepen" || e.pointerId !== pointerId) return;
      e.stopPropagation();
      try {
        container.releasePointerCapture(pointerId);
      } catch {
        //! al losgelaten
      }
      pointerId = -1;
      negeerKlikTot = Math.max(negeerKlikTot, performance.now() + 400);
      const ll = cirkel.getLatLng();
      zetModus("rust");
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
      zetModus("rust");
    };
    const opAfbreken = (e: PointerEvent) => {
      if (modus === "slepen" && e.pointerId === pointerId) annuleer();
    };
    const opToets = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (modus !== "klaar" && modus !== "slepen")) return;
      e.stopPropagation(); //! deze Esc is voor de cirkel, niet om een popup te sluiten
      annuleer();
    };
    const opKlik = (e: MouseEvent) => {
      if (performance.now() < negeerKlikTot) {
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
      for (const naam of ["radar-gebied-greep", "radar-gebied-sleep", "radar-gebied-modus"]) L.DomUtil.removeClass(container, naam);
      map.dragging.enable();
      map.closeTooltip(hint);
      cirkel.remove();
      kruis.remove();
      delen.current = null;
    };
  }, [map]);

  //! nieuw midden of nieuwe straal van buiten (schuif, knoppen, of het eigen loslaten): de cirkel erheen, behalve tijdens het slepen
  useEffect(() => {
    const d = delen.current;
    if (!d || d.modus() === "slepen") return;
    d.cirkel.setLatLng(midden);
    d.cirkel.setRadius(straal * 1000);
    d.kruis.setLatLng(midden);
  }, [midden, straal]);

  return null;
};

export default GebiedCirkel;
