//! hoe vaak de server nieuwe posities ophaalt (de verversstanden van dev-server.mjs) en wat dat aan OpenSky-tegoed kost.
//! de server rekent alles uit; de app toont het alleen en geeft de keuze van de kijker door

export type Stand = "zuinig" | "normaal" | "snel";

export const STANDEN: { stand: Stand; naam: string; uitleg: string }[] = [
  { stand: "zuinig", naam: "Zuinig", uitleg: "120 tegoed per uur. Zonder account ruim 3 uur per dag." },
  { stand: "normaal", naam: "Normaal", uitleg: "360 tegoed per uur. Zonder account ruim een uur per dag." },
  { stand: "snel", naam: "Snel", uitleg: "Zo vaak als OpenSky nieuwe data heeft. Kost het meeste tegoed." },
];

//! uit het 'gebied'-bericht van de server
export type Verversing = {
  stand: Stand | null; //! null = nog niets van de server gehoord
  seconden: number;
  standen: Partial<Record<Stand, number>>; //! de seconden van elke stand voor dit gebied
  credits: number; //! tegoed per aanvraag (groter gebied = meer)
  perUur: number;
};

//! waar de posities vandaan komen. opensky is de standaard (met tegoed), adsb.lol de tweede bron (gratis, nieuwer, max 450 km)
export type Bron = "opensky" | "adsblol";

export const BRONNEN: { bron: Bron; naam: string; uitleg: string }[] = [
  // OUD: { bron: "opensky", naam: "OpenSky", uitleg: "OpenSky Network: met tegoed, tot 1000 km. Met land van herkomst." },
  { bron: "opensky", naam: "OpenSky", uitleg: "OpenSky Network: met tegoed, tot 3000 km of de hele wereld. Met land van herkomst." },
  { bron: "adsblol", naam: "adsb.lol", uitleg: "adsb.lol: geen tegoed, posities vaak minder dan een seconde oud, tot 450 km. Zonder land, wel type en registratie." },
];

export const ADSB_MAX_KM = 450; //! adsb.lol kan max 250 zeemijl (463 km), de schuif stopt op 450
//! opensky: tot 3000 km (heel europa vanuit nederland). een grotere cirkel kan over een pool gaan, en die tekent Leaflet niet meer als cirkel
export const MAX_KM = 3000;
//! "Hele wereld": de halve omtrek van de aarde, elk punt ligt dichterbij. de server kent hetzelfde getal (dev-server.mjs)
export const WERELD_KM = 20050;

//! de seconden per stand bij adsb.lol staan bij de knoppen (van de server), dit is de tooltip
export const ADSB_UITLEG: Record<Stand, string> = {
  zuinig: "Elke 15 s. Geen tegoed nodig.",
  normaal: "Elke 5 s. Geen tegoed nodig.",
  snel: "Elke 2 s. Geen tegoed nodig, maar vraagt het meest van adsb.lol.",
};

//! uit het 'tegoed'-bericht van de server
export type Tegoed = {
  // OUD: bron: "opensky" | "nep";
  bron: Bron | "nep";
  account: boolean; //! de server gebruikt een OpenSky-account (.env)
  over: number | null; //! null = nog niet bekend
  pauzeTot: number | null; //! tegoed op: tot dit moment (ms) geen nieuwe data
  minSeconden: number;
};

export const GEEN_VERVERSING: Verversing = { stand: null, seconden: 30, standen: {}, credits: 0, perUur: 0 };

const isStand = (s: unknown): s is Stand => s === "zuinig" || s === "normaal" || s === "snel";

//! de keuze van deze kijker onthouden in de browser. lukt dat niet (privévenster, geblokkeerde opslag), dan geldt gewoon
//! de standaard van de server: zonder account zuinig, met account normaal
const SLEUTEL = "radar.verversen";

export const leesStand = (): Stand | null => {
  try {
    const s = localStorage.getItem(SLEUTEL);
    return isStand(s) ? s : null;
  } catch {
    return null;
  }
};

export const bewaarStand = (stand: Stand) => {
  try {
    localStorage.setItem(SLEUTEL, stand);
  } catch {
    //! niet erg: dan staat hij de volgende keer weer op de standaard
  }
};

//! de gekozen bron ook onthouden, op dezelfde manier. niets gekozen = opensky (de standaard van de server)
const BRON_SLEUTEL = "radar.bron";

export const leesBron = (): Bron | null => {
  try {
    const b = localStorage.getItem(BRON_SLEUTEL);
    return b === "opensky" || b === "adsblol" ? b : null;
  } catch {
    return null;
  }
};

export const bewaarBron = (bron: Bron) => {
  try {
    localStorage.setItem(BRON_SLEUTEL, bron);
  } catch {
    //! niet erg: dan begint hij de volgende keer weer op opensky
  }
};

//! de schakelaar "Sporen" (fase 4 van het tweede plan) ook onthouden. niets gekozen = aan
const SPOREN_SLEUTEL = "radar.sporen";

export const leesSporen = (): boolean => {
  try {
    return localStorage.getItem(SPOREN_SLEUTEL) !== "uit";
  } catch {
    return true;
  }
};

export const bewaarSporen = (aan: boolean) => {
  try {
    localStorage.setItem(SPOREN_SLEUTEL, aan ? "aan" : "uit");
  } catch {
    //! niet erg: dan staan ze de volgende keer weer aan
  }
};

//! de afgelegde route van een vliegtuig, gevraagd zodra je hem kiest. van OpenSky (de hele vlucht, met een account) aangevuld met
//! de eigen punten van de server, of alleen die eigen punten: sinds de radar hem ziet
export type Vlucht = {
  id: string;
  status: "laden" | "klaar" | "fout";
  punten?: [number, number][]; //! lat, lon
  van?: number; //! begin van de route (unix, seconden)
  bron?: "opensky" | "radar" | "nep"; //! waar de route vandaan komt
  melding?: string;
};

//! hoe lang het tegoed nog meegaat bij dit tempo, in gewone taal: "± 3,5 uur" of "± 25 min"
export const duurTekst = (over: number, perUur: number): string | null => {
  if (perUur <= 0) return null;
  const uren = over / perUur;
  if (uren < 1) return `± ${Math.max(1, Math.round(uren * 60))} min`;
  const afgerond = uren >= 10 ? Math.round(uren) : Math.round(uren * 2) / 2;
  return `± ${afgerond.toLocaleString("nl-NL")} uur`;
};
