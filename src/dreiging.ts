import { getSuspicionReasons } from "../utils/planeUtils";

//! dreigingsniveau = aantal redenen voor verdacht gedrag, 4 of meer telt als 4
export type Niveau = 0 | 1 | 2 | 3 | 4;

export const NIVEAUS: { niveau: Niveau; naam: string; kleur: string }[] = [
  { niveau: 0, naam: "Normaal", kleur: "#94a3b8" },
  { niveau: 1, naam: "1 reden", kleur: "#60a5fa" },
  { niveau: 2, naam: "2 redenen", kleur: "#f59e0b" },
  { niveau: 3, naam: "3 redenen", kleur: "#ef4444" },
  { niveau: 4, naam: "4+ redenen", kleur: "#d946ef" },
];

export const niveauVan = (plane: any): Niveau =>
  Math.min(getSuspicionReasons(plane).length, 4) as Niveau;

export const kleurVan = (niveau: Niveau) => NIVEAUS[niveau].kleur;

//! callsign komt met spaties aan het eind, of ontbreekt
export const callsignVan = (plane: any): string =>
  (plane[1] || "").trim() || "Onbekend";
