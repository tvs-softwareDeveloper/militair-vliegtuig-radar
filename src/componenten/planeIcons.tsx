//! OUD: niet meer gebruikt sinds alle vliegtuigen op één canvas staan; vliegtuigCanvas.ts tekent dezelfde vorm en kleuren zelf.
//! blijft bewaard als terugval, samen met PlaneMarker.tsx
import L from "leaflet";
import { kleurVan, Niveau } from "../dreiging";

//! vliegtuig van bovenaf, neus naar boven (noorden), wordt gedraaid naar de koers
const VLIEGTUIG =
  "M12 2c.8 0 1.4.7 1.4 1.6v5.6l7.6 4.4v2l-7.6-2.3v4.4l2.2 1.7v1.6L12 20.1 8.4 21v-1.6l2.2-1.7v-4.4L3 15.6v-2l7.6-4.4V3.6C10.6 2.7 11.2 2 12 2z";

const cache = new Map<string, L.DivIcon>();

//! icon per niveau en koers, de koers afgerond op 5 graden zodat icons hergebruikt worden
export const vliegtuigIcon = (niveau: Niveau, koers: number | null, gekozen = false): L.DivIcon => {
  const graden = Math.round((koers ?? 0) / 5) * 5;
  const sleutel = `${niveau}-${graden}-${gekozen}`;
  const bestaand = cache.get(sleutel);
  if (bestaand) return bestaand;

  const kleur = kleurVan(niveau);
  const icon = L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
    html: `
      <div class="vliegtuig ${niveau >= 3 ? "vliegtuig--alarm" : ""} ${gekozen ? "vliegtuig--gekozen" : ""}" style="--kleur:${kleur}">
        <svg viewBox="0 0 24 24" style="transform:rotate(${graden}deg)">
          <path d="${VLIEGTUIG}" fill="${kleur}" stroke="#0b1220" stroke-width="0.8"/>
        </svg>
      </div>`,
  });
  cache.set(sleutel, icon);
  return icon;
};
