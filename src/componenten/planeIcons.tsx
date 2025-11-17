import planeIconUrl from "../assets/plane.png";
import redPlaneUrl from "../assets/redplane.png";
// import PlaneMarker from "./componenten/PlaneMarker";
import bluePlaneUrl from "../assets/blauweplane.png";
import orangePlaneUrl from "../assets/orangeplane.png";
import blackPlaneUrl from "../assets/blackplane.png";
import L from "leaflet";

export const planeIcon = new L.Icon({//hir plaats ik icon in leatflet object zodat het overal gebruikt kan worden
  iconUrl: planeIconUrl,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});
export const redPlane = new L.Icon({
  iconUrl: redPlaneUrl,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

export const bluePlane = new L.Icon({
  iconUrl: bluePlaneUrl,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

export const orangePlane = new L.Icon({
  iconUrl: orangePlaneUrl,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});
export const blackPlane = new L.Icon({
  iconUrl: blackPlaneUrl,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});