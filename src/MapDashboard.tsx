import { MapContainer, TileLayer, Popup } from "react-leaflet";
import { LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  isSuspicious,
  getSpeedInKmH,
  getSuspicionReasons,
} from "../utils/planeUtils";
import L from "leaflet";
import planeIconUrl from "./assets/plane.png";
import redPlaneUrl from "./assets/redplane.png";
import PlaneMarker from "./componenten/PlaneMarker";
import bluePlaneUrl from "./assets/blauweplane.png";
import orangePlaneUrl from "./assets/orangeplane.png";
import blackPlaneUrl from "./assets/blackplane.png";
import {redPlane, planeIcon, bluePlane, orangePlane, blackPlane} from "./componenten/planeIcons";

const centerPosition: LatLngExpression = [52, 5];
//! icons

//////!
//! planes worden in props meegegeven
type Props = {
  planes: any[]; //! array van vliegtuig data
};

//!icon toewijzen op basis van aantal redenen voor verdachte activiteit per vliegtuig
const getPlaneIconBySuspicion = (reasonsCount: number): L.Icon => {
  if (reasonsCount === 0) return planeIcon;
  if (reasonsCount === 1) return bluePlane;
  if (reasonsCount === 2) return orangePlane;
  if (reasonsCount >= 4) return blackPlane;
  if (reasonsCount === 3) return redPlane;
  return planeIcon;
};

//! MapDashboard component toont de kaart met vliegtuig markers
const MapDashboard = ({ planes }: Props) => {
  return (
    //? kaart word getoont met react leaflet
    <div className="h-[900px] w-full">
      <MapContainer center={centerPosition} zoom={6} className="h-full w-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        //? kaart word getoont met react leaflet
        {planes.map((p) => {// voor elk vliegtuig in de array en data word gezet in p
          const reasons = getSuspicionReasons(p);
          return p[5] && p[6] ? (
            <PlaneMarker
              key={p[0]}
              id={p[0]}
              position={[p[6], p[5]] as LatLngExpression}
              //? icon op basis van verdachte activiteit
              icon={getPlaneIconBySuspicion(reasons.length)}// wijst icon toe
              popup={
                <Popup>
                  <strong>Callsign:</strong> {p[1] || "Onbekend"}
                  <br />
                  <strong>Land:</strong> {p[2]}
                  <br />
                  <strong>Hoogte:</strong> {p[13]} m<br />
                  <strong>Snelheid:</strong> {getSpeedInKmH(p[9]).toFixed(1)}{" "}
                  km/u
                  <br />
                  <strong>Richting:</strong> {p[10]}°<br />
                  <strong>Verticale snelheid:</strong> {p[11]} m/s
                  <br />
                  <strong>Squawk:</strong> {p[14] || "Geen"}
                  <br />
                  <strong>SPI/Noodsignaal:</strong> {p[15] ? "JA" : "NEE"}
                  <br />
                  <strong>Grondstatus:</strong>{" "}
                  {p[8] ? "Op de grond" : "In de lucht"}
                  <br />
                  {reasons.length > 0 && (
                    <>
                      <strong>Verdacht gedrag:</strong>
                      <ul>
                        {reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </Popup>
              }
            />
          ) : null;
        })}
      </MapContainer>
    </div>
  );
};

export default MapDashboard;


