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

//! uit het 'tegoed'-bericht van de server
export type Tegoed = {
  bron: "opensky" | "nep";
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

//! hoe lang het tegoed nog meegaat bij dit tempo, in gewone taal: "± 3,5 uur" of "± 25 min"
export const duurTekst = (over: number, perUur: number): string | null => {
  if (perUur <= 0) return null;
  const uren = over / perUur;
  if (uren < 1) return `± ${Math.max(1, Math.round(uren * 60))} min`;
  const afgerond = uren >= 10 ? Math.round(uren) : Math.round(uren * 2) / 2;
  return `± ${afgerond.toLocaleString("nl-NL")} uur`;
};
