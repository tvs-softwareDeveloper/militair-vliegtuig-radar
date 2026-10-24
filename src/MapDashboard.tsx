import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MapContainer, TileLayer, Popup, Circle, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import L, { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import PlaneMarker from "./componenten/PlaneMarker";
import PlanePopup from "./componenten/PlanePopup";
import { vliegtuigIcon } from "./componenten/planeIcons";
import { niveauVan } from "./dreiging";
import type { Punt } from "./App";

type Props = {
  planes: any[]; //! array van vliegtuig data
  gekozenId: string | null; //! vliegtuig dat in de lijst is aangeklikt
  midden: Punt; //! middelpunt van het bekeken gebied
  straal: number; //! straal in km
  onKaartMidden: (punt: Punt) => void; //! het midden van de kaart, voor de knop in het paneel
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

//! vliegt naar het gekozen vliegtuig
const NaarGekozen = ({ plane }: { plane: any | undefined }) => {
  const map = useMap();
  useEffect(() => {
    if (plane) map.flyTo([plane[6], plane[5]], Math.max(map.getZoom(), 9), { duration: 0.8 });
  }, [plane?.[0]]);
  return null;
};

//! zoomt mee als de straal of het middelpunt verandert (niet bij het starten, dan staat hij al goed).
//! we onthouden het gebied waarop de kaart staat in plaats van "de eerste keer": StrictMode draait een effect bij het starten twee keer
const VolgGebied = ({ midden, straal }: { midden: Punt; straal: number }) => {
  const map = useMap();
  const staatOp = useRef({ midden, straal });
  useEffect(() => {
    if (staatOp.current.midden === midden && staatOp.current.straal === straal) return;
    staatOp.current = { midden, straal };
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

//! Kaart toont de kaart met vliegtuig markers
const Kaart = ({ planes, gekozenId, midden, straal, onKaartMidden }: Props) => {
  const gekozen = planes.find((p) => p[0] === gekozenId);

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
      <Circle
        center={midden}
        radius={straal * 1000}
        pathOptions={{ color: "#34d399", weight: 1, opacity: 0.6, fillColor: "#34d399", fillOpacity: 0.03, dashArray: "6 6", interactive: false }}
      />

      {planes.map((p) => {
        if (typeof p[5] !== "number" || typeof p[6] !== "number") return null;
        return (
          <PlaneMarker
            key={p[0]}
            id={p[0]}
            position={[p[6], p[5]] as LatLngExpression}
            //? kleur op basis van verdachte activiteit, gedraaid naar de koers
            icon={vliegtuigIcon(niveauVan(p), p[10], p[0] === gekozenId)}
            open={p[0] === gekozenId}
            popup={
              <Popup className="radar-popup" closeButton={false}>
                <PlanePopup plane={p} />
              </Popup>
            }
          />
        );
      })}

      <ZoomControl position="bottomright" />
      <NaarGekozen plane={gekozen} />
      <VolgGebied midden={midden} straal={straal} />
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
