import { useEffect } from "react";
import { MapContainer, TileLayer, Popup, Rectangle, ZoomControl, useMap } from "react-leaflet";
import { LatLngBoundsExpression, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import PlaneMarker from "./componenten/PlaneMarker";
import PlanePopup from "./componenten/PlanePopup";
import { vliegtuigIcon } from "./componenten/planeIcons";
import { niveauVan } from "./dreiging";

//! het gebied waar de server vliegtuigen voor ophaalt (lat 50-54, lon 3-8)
const BEWAAKT: LatLngBoundsExpression = [
  [50, 3],
  [54, 8],
];

type Props = {
  planes: any[]; //! array van vliegtuig data
  gekozenId: string | null; //! vliegtuig dat in de lijst is aangeklikt
};

//! vliegt naar het gekozen vliegtuig
const NaarGekozen = ({ plane }: { plane: any | undefined }) => {
  const map = useMap();
  useEffect(() => {
    if (plane) map.flyTo([plane[6], plane[5]], Math.max(map.getZoom(), 9), { duration: 0.8 });
  }, [plane?.[0]]);
  return null;
};

//! MapDashboard component toont de kaart met vliegtuig markers
const MapDashboard = ({ planes, gekozenId }: Props) => {
  const gekozen = planes.find((p) => p[0] === gekozenId);

  return (
    <MapContainer
      bounds={BEWAAKT}
      boundsOptions={{ padding: [24, 24] }}
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
      <Rectangle
        bounds={BEWAAKT}
        pathOptions={{ color: "#34d399", weight: 1, opacity: 0.5, fill: false, dashArray: "6 6" }}
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
    </MapContainer>
  );
};

export default MapDashboard;
