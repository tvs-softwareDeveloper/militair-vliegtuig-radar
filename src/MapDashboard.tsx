// OUD: import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode, type RefObject } from "react";
// OUD: import { MapContainer, TileLayer, Popup, Circle, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import { MapContainer, TileLayer, Popup, ZoomControl, useMap, useMapEvents } from "react-leaflet";
// OUD: import L, { LatLngExpression } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// OUD: import PlaneMarker from "./componenten/PlaneMarker";
import PlanePopup from "./componenten/PlanePopup";
// OUD: import { vliegtuigIcon } from "./componenten/planeIcons";
import VliegtuigLaag from "./componenten/VliegtuigLaag";
import GebiedCirkel from "./componenten/GebiedCirkel";
import type { PakketTijd, VliegtuigCanvas } from "./componenten/vliegtuigCanvas";
// OUD: import { niveauVan } from "./dreiging";
import { GEEN_BEOORDELING, type Beoordeling, type Niveau } from "./dreiging";
import type { Punt } from "./App";

type Props = {
  // OUD: planes: any[]; //! array van vliegtuig data
  planes: any[]; //! alle vliegtuigen: de canvaslaag filtert zelf, zo houden verborgen vliegtuigen hun plek
  beoordelingen: Map<string, Beoordeling>; //! redenen en niveau per vliegtuig, één keer per pakket uitgerekend door App
  tijd: PakketTijd; //! bij het pakket: wanneer de momentopname is en hoeveel de klok van de server voorloopt (voor het gegist bestek)
  interval: number; //! hoe vaak de server ververst, in seconden
  filter: Niveau | null; //! null = alle niveaus
  // OUD: gekozenId: string | null; //! vliegtuig dat in de lijst is aangeklikt
  gekozenId: string | null; //! vliegtuig dat in de lijst of op de kaart is aangeklikt
  vliegNaar: string | null; //! in de lijst gekozen: de kaart vliegt erheen (bij een klik op de kaart niet)
  onKies: (id: string | null) => void; //! klik op de kaart: een vliegtuig, of een lege plek / Esc (null)
  midden: Punt; //! middelpunt van het bekeken gebied
  straal: number; //! straal in km
  onKaartMidden: (punt: Punt) => void; //! het midden van de kaart, voor de knop in het paneel
  onMiddenGesleept: (punt: Punt) => void; //! de bereikcirkel is naar een nieuw midden gesleept
};

//! het vak om de cirkel, om de kaart op in te zoomen
const vakVan = (midden: Punt, straal: number) => L.latLng(midden[0], midden[1]).toBounds(straal * 2000);

//! de ruimte in pixels die om het gebied heen blijft, tegelijk het minimum dat de kaart nodig heeft om erop in te zoomen
const MARGE = 24;

//! een kaart die start zonder ruimte (achtergrondtab, venster dat nog groeit) blijft kapot: Leaflet zoomt dan naar Infinity,
//! daarna geven flyToBounds en invalidateSize NaN en wordt de hele pagina leeg. daarom bouwen we de kaart pas als het vak ruimte heeft
const WachtOpRuimte = ({ children }: { children: ReactNode }) => {
  const vak = useRef<HTMLDivElement>(null);
  const [heeftRuimte, setHeeftRuimte] = useState(false);

  useLayoutEffect(() => {
    const el = vak.current;
    if (heeftRuimte || !el) return;
    const meet = () => {
      if (el.clientWidth > 2 * MARGE && el.clientHeight > 2 * MARGE) setHeeftRuimte(true);
    };
    const waker = new ResizeObserver(meet);
    waker.observe(el);
    meet();
    return () => waker.disconnect();
  }, [heeftRuimte]);

  return (
    <div ref={vak} className="h-full w-full">
      {heeftRuimte && children}
    </div>
  );
};

//! vliegt naar het gekozen vliegtuig. krijgt alleen een vliegtuig als het in de lijst gekozen is (zie vliegNaar).
//! naar waar hij nu is (gegist bestek), niet naar de positie uit het pakket: die is al tot 15 seconden oud
// OUD: const NaarGekozen = ({ plane }: { plane: any | undefined }) => {
const NaarGekozen = ({ plane, positieVan }: { plane: any | undefined; positieVan: (id: string) => L.LatLng | null }) => {
  const map = useMap();
  useEffect(() => {
    // OUD: if (plane) map.flyTo([plane[6], plane[5]], Math.max(map.getZoom(), 9), { duration: 0.8 });
    if (plane) map.flyTo(positieVan(plane[0]) ?? [plane[6], plane[5]], Math.max(map.getZoom(), 9), { duration: 0.8 });
  }, [plane?.[0]]);
  return null;
};

//! staat in de popup en draait zodra de inhoud er echt staat: dan laat Leaflet de popup opmeten en (autoPan) in beeld schuiven.
//! daarna zetten we autoPan uit, anders schuift Leaflet de kaart mee bij elke setLatLng zodra het vliegtuig naar de rand vliegt
//! schuiven alleen de eerste keer dat dit vliegtuig gekozen is. gaat zijn popup later opnieuw open (vliegtuig even uit het pakket,
//! filter aan en uit, de cirkel naar een gebied gesleept waar hij ook in zit), dan blijft de kaart staan: anders springt hij weg
//! terwijl je niets deed
// OUD: const PopupKlaar = ({ popupRef }: { popupRef: RefObject<L.Popup | null> }) => {
// OUD:   useLayoutEffect(() => {
// OUD:     const popup = popupRef.current;
// OUD:     if (!popup) return;
// OUD:     popup.update();
// OUD:     popup.options.autoPan = false;
// OUD:   }, []);
// OUD:   return null;
// OUD: };
//! de popup begint zelf met autoPan uit (zie <Popup autoPan={false}>): Leaflet zou anders al schuiven bij het openen, met de maat van een
//! lege popup en ook bij opnieuw openen. hier beslissen we het één keer, met de echte maat van de inhoud
//! useEffect en geen useLayoutEffect: react-leaflet koppelt de ref van de popup bij elke render opnieuw, en pas ná de layout-effecten
//! van zijn kinderen. in een layout-effect was popupRef hier dus altijd leeg (gemeten in fase 5) en gebeurde er niets
const PopupKlaar = ({ popupRef, id, gepand }: { popupRef: RefObject<L.Popup | null>; id: string; gepand: MutableRefObject<string | null> }) => {
  // OUD: useLayoutEffect(() => {
  useEffect(() => {
    const popup = popupRef.current;
    if (!popup) return;
    popup.options.autoPan = gepand.current !== id; //! alleen als dit vliegtuig net gekozen is, niet bij opnieuw openen
    gepand.current = id;
    popup.update();
    popup.options.autoPan = false; //! daarna nooit meer: het vliegtuig vliegt en de popup schuift mee met setLatLng
  }, []);
  return null;
};

//! zoomt mee als de straal of het middelpunt verandert (niet bij het starten, dan staat hij al goed).
//! we onthouden het gebied waarop de kaart staat in plaats van "de eerste keer": StrictMode draait een effect bij het starten twee keer.
//! een midden dat je zelf met de cirkel hebt gesleept slaan we over: die cirkel heb je zelf neergezet, dan springt de kaart niet weg (D5)
// OUD: const VolgGebied = ({ midden, straal }: { midden: Punt; straal: number }) => {
const VolgGebied = ({ midden, straal, gesleept }: { midden: Punt; straal: number; gesleept: RefObject<Punt | null> }) => {
  const map = useMap();
  const staatOp = useRef({ midden, straal });
  useEffect(() => {
    if (staatOp.current.midden === midden && staatOp.current.straal === straal) return;
    const zelfGesleept = midden === gesleept.current && staatOp.current.straal === straal;
    staatOp.current = { midden, straal };
    if (zelfGesleept) return;
    map.flyToBounds(vakVan(midden, straal), { padding: [MARGE, MARGE], duration: 0.6 });
  }, [midden, straal]);
  return null;
};

//! geeft het midden van de kaart door na slepen of zoomen
const MeldMidden = ({ onKaartMidden }: { onKaartMidden: Props["onKaartMidden"] }) => {
  useMapEvents({
    moveend: (event) => {
      const c = event.target.getCenter();
      onKaartMidden([c.lat, c.lng]);
    },
  });
  return null;
};

//! Kaart toont de kaart met de vliegtuigen (op één canvas, zie VliegtuigLaag)
// OUD: const Kaart = ({ planes, beoordelingen, gekozenId, midden, straal, onKaartMidden }: Props) => {
// OUD:   const gekozen = planes.find((p) => p[0] === gekozenId);
// OUD: const Kaart = ({ planes, beoordelingen, filter, gekozenId, vliegNaar, onKies, midden, straal, onKaartMidden }: Props) => {
// OUD: const Kaart = ({ planes, beoordelingen, tijd, interval, filter, gekozenId, vliegNaar, onKies, midden, straal, onKaartMidden }: Props) => {
const Kaart = ({
  planes,
  beoordelingen,
  tijd,
  interval,
  filter,
  gekozenId,
  vliegNaar,
  onKies,
  midden,
  straal,
  onKaartMidden,
  onMiddenGesleept,
}: Props) => {
  //! de canvaslaag zelf, om te vragen waar een vliegtuig nu is (gegist bestek)
  const laagRef = useRef<VliegtuigCanvas | null>(null);
  const positieVan = (id: string) => laagRef.current?.positieVan(id) ?? null;
  //! het laatste midden dat met de cirkel is gesleept: daar hoeft de kaart niet heen te vliegen (zie VolgGebied)
  const gesleeptRef = useRef<Punt | null>(null);
  const opGesleept = (punt: Punt) => {
    gesleeptRef.current = punt;
    onMiddenGesleept(punt);
  };
  const gekozen = gekozenId === null ? undefined : planes.find((p) => p[0] === gekozenId);
  const gekozenBeoordeling = (gekozen && beoordelingen.get(gekozen[0])) || GEEN_BEOORDELING;
  const vliegPlane = vliegNaar === null ? undefined : planes.find((p) => p[0] === vliegNaar);

  //! de popup hoort bij een vliegtuig dat op de kaart staat: niet als het filter hem verbergt (net als bij de oude markers)
  const popupOpen =
    !!gekozen && typeof gekozen[5] === "number" && typeof gekozen[6] === "number" && (filter === null || gekozenBeoordeling.niveau === filter);
  //! startplek van de popup. mag alleen veranderen bij een ander vliegtuig: react-leaflet sluit en opent een popup bij elke nieuwe position.
  //! daarna schuift de canvaslaag hem mee met het vliegtuig (verplaatsPopup)
  // OUD: const popupStart = useMemo<[number, number] | null>(() => (gekozen ? [gekozen[6], gekozen[5]] : null), [gekozenId, popupOpen]);
  const popupStart = useMemo<L.LatLngExpression | null>(
    () => (gekozen ? (positieVan(gekozen[0]) ?? [gekozen[6], gekozen[5]]) : null),
    [gekozenId, popupOpen],
  );
  const popupRef = useRef<L.Popup | null>(null);
  const verplaatsPopup = (positie: L.LatLng) => {
    popupRef.current?.setLatLng(positie);
  };
  //! autoPan gaat uit in PopupKlaar, pas als de inhoud er staat (anders meet Leaflet een lege popup en valt hij bovenaan half buiten beeld)
  //! het vliegtuig waarvoor de kaart al eens is geschoven om de popup te tonen. weer leeg als er niets meer gekozen is
  const gepandRef = useRef<string | null>(null);
  useEffect(() => {
    if (gekozenId === null) gepandRef.current = null;
  }, [gekozenId]);

  return (
    <MapContainer
      bounds={vakVan(midden, straal)}
      boundsOptions={{ padding: [MARGE, MARGE] }}
      zoomControl={false}
      className="h-full w-full"
      preferCanvas
    >
      {/* donkere kaart (esri, geen sleutel nodig), past bij een radar en laat de gekleurde vliegtuigen opvallen */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
        attribution="Kaart &copy; Esri, HERE, Garmin, &copy; OpenStreetMap · data: OpenSky Network"
      />
      {/* plaatsnamen als losse laag erboven */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxZoom={16}
      />
      {/* het bekeken gebied */}
      {/* OUD: <Circle center={midden} radius={straal * 1000}
          pathOptions={{ color: "#34d399", weight: 1, opacity: 0.6, fillColor: "#34d399", fillOpacity: 0.03, dashArray: "6 6", interactive: false }} />
          (nu GebiedCirkel: zelfde stijl, plus verslepen met een dubbelklik op de rand) */}
      <GebiedCirkel
        midden={midden}
        straal={straal}
        onVerplaatst={opGesleept}
        onVoorlopig={(gebied) => laagRef.current?.zetVoorlopigGebied(gebied)}
      />

      {/* OUD: één marker (DOM-element + React-component + popup) per vliegtuig. vervangen door de canvaslaag hieronder
      {planes.map((p) => {
        if (typeof p[5] !== "number" || typeof p[6] !== "number") return null;
        const beoordeling = beoordelingen.get(p[0]) ?? GEEN_BEOORDELING; //! al uitgerekend door App, hier niet nog een keer
        return (
          <PlaneMarker
            key={p[0]}
            id={p[0]}
            position={[p[6], p[5]] as LatLngExpression}
            //? kleur op basis van verdachte activiteit, gedraaid naar de koers
            // OUD: icon={vliegtuigIcon(niveauVan(p), p[10], p[0] === gekozenId)}
            icon={vliegtuigIcon(beoordeling.niveau, p[10], p[0] === gekozenId)}
            open={p[0] === gekozenId}
            popup={
              <Popup className="radar-popup" closeButton={false}>
                (OUD: <PlanePopup plane={p} />)
                <PlanePopup plane={p} beoordeling={beoordeling} />
              </Popup>
            }
          />
        );
      })}
      */}

      {/* alle vliegtuigen op één canvas, met frustum culling */}
      <VliegtuigLaag
        planes={planes}
        beoordelingen={beoordelingen}
        tijd={tijd}
        interval={interval}
        filter={filter}
        gekozenId={gekozenId}
        onKlik={onKies}
        onGekozenPositie={verplaatsPopup}
        laagRef={laagRef}
      />

      {/* één popup voor het gekozen vliegtuig, in plaats van één per marker. sluiten gaat via React (klik op een lege plek of Esc),
          zodat Leaflet hem niet buiten React om dichtdoet. offset 0,-5 = waar hij bij de oude marker stond */}
      {popupOpen && popupStart && (
        <Popup
          key={gekozenId}
          ref={popupRef}
          position={popupStart}
          offset={[0, -5]}
          className="radar-popup"
          closeButton={false}
          closeOnClick={false}
          closeOnEscapeKey={false}
          autoPan={false}
        >
          <PlanePopup plane={gekozen} beoordeling={gekozenBeoordeling} />
          {/* OUD: <PopupKlaar popupRef={popupRef} /> */}
          <PopupKlaar popupRef={popupRef} id={gekozenId!} gepand={gepandRef} />
        </Popup>
      )}

      <ZoomControl position="bottomright" />
      {/* OUD: <NaarGekozen plane={gekozen} /> */}
      <NaarGekozen plane={vliegPlane} positieVan={positieVan} />
      {/* OUD: <VolgGebied midden={midden} straal={straal} /> */}
      <VolgGebied midden={midden} straal={straal} gesleept={gesleeptRef} />
      <MeldMidden onKaartMidden={onKaartMidden} />
    </MapContainer>
  );
};

//! MapDashboard bouwt de kaart pas als er ruimte voor is, zie WachtOpRuimte
const MapDashboard = (props: Props) => (
  <WachtOpRuimte>
    <Kaart {...props} />
  </WachtOpRuimte>
);

export default MapDashboard;
