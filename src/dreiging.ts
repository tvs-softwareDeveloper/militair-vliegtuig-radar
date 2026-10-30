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

//! de beoordeling van één vliegtuig: de redenen en het niveau dat daaruit volgt.
//! App rekent dit één keer per pakket uit (een Map van icao naar beoordeling), kaart, filter, tellers en lijst lezen het daarna alleen nog
export type Beoordeling = { redenen: string[]; niveau: Niveau };

export const beoordeel = (plane: any): Beoordeling => {
  const redenen = getSuspicionReasons(plane);
  return { redenen, niveau: Math.min(redenen.length, 4) as Niveau };
};

//! voor een vliegtuig dat (nog) niet in de Map staat: niets verdachts
export const GEEN_BEOORDELING: Beoordeling = { redenen: [], niveau: 0 };

//! rekent bij elke aanroep de regels opnieuw uit, dus niet meer in de render gebruiken: gebruik de Map met beoordelingen uit App
export const niveauVan = (plane: any): Niveau =>
  Math.min(getSuspicionReasons(plane).length, 4) as Niveau;

export const kleurVan = (niveau: Niveau) => NIVEAUS[niveau].kleur;

//! callsign komt met spaties aan het eind, of ontbreekt
export const callsignVan = (plane: any): string =>
  (plane[1] || "").trim() || "Onbekend";
