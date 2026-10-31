//! gegist bestek (dead reckoning): waar een vliegtuig nu is, uitgerekend uit zijn laatste positie, snelheid en koers.
//! pure functies zonder Leaflet of React, zodat ze los te controleren zijn. posities zijn wereldcoördinaten:
//! Web-Mercator op zoom 0, de hele wereld is 256 eenheden breed (zoals Leaflets map.project(latlng, 0))

const AARDE_STRAAL = 6378137; //! de straal die Web-Mercator (EPSG:3857) gebruikt, in meters

export const CORRECTIE_MS = 1500; //! zo lang dooft het verschil uit als een nieuw pakket het vliegtuig ergens anders zet
export const MIN_SNELHEID = 5; //! langzamer dan dit (m/s) rekenen we niet door: taxiënde of stilstaande toestellen
export const SPRONG_M = 25000; //! groter verschil dan dit: niet uitdoven maar meteen goed zetten (gat in de data of een ander toestel)

//! hoeveel wereldeenheden één meter is op deze breedtegraad. Mercator rekt alles uit met 1/cos(breedte)
export const wereldPerMeter = (breedte: number) => 256 / (2 * Math.PI * AARDE_STRAAL * Math.cos((breedte * Math.PI) / 180));

//! snelheid (m/s) en koers (graden, met de klok mee vanaf noord) naar wereldeenheden per seconde.
//! y loopt in de wereld naar het zuiden, dus noord is min. een rechte lijn op de kaart, over een minuut is dat ruim goed genoeg
export const wereldSnelheid = (snelheid: number, koers: number, breedte: number) => {
  const k = wereldPerMeter(breedte) * snelheid;
  const r = (koers * Math.PI) / 180;
  return { vx: Math.sin(r) * k, vy: -Math.cos(r) * k };
};

//! zacht van 1 naar 0: begint en eindigt rustig, de steilste helling is 1,5 (halverwege)
export const uitdoven = (t: number) => (t <= 0 ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t));

//! kortste verschil tussen twee koersen, tussen -180 en 180 graden (350 naar 10 is +20, niet -340)
export const koersVerschil = (van: number, naar: number) => ((((van - naar) % 360) + 540) % 360) - 180;

//! hoe lang een vliegtuig zonder nieuwe positie nog doorvliegt (D2): minstens een minuut, en anderhalf keer het verversinterval
export const horizonVan = (intervalSeconden: number) => Math.max(60, 1.5 * intervalSeconden);

// ---- bochten (fase 3 van het tweede plan) ----

export const MAX_DRAAI = 3; //! graden per seconde: de gewone bocht van een verkeersvliegtuig ("standard rate turn"). meer is meetruis
export const MIN_DRAAI = 0.1; //! langzamer dan dit rekenen we gewoon rechtdoor
//! zo lang (seconden na de positie uit het pakket) draait de voorspelling mee, daarna rechtdoor. een echte bocht houdt op: zonder
//! grens draait een vliegtuig dat net uit de bocht kwam in de voorspelling eindeloos door. gekozen met metingen op echte data (fase 3)
// OUD: export const BOCHT_SECONDEN = 30;
export const BOCHT_SECONDEN = 15;

//! een geschatte of gemeten draaisnelheid netjes maken: begrensd, en heel langzaam = rechtdoor (0)
export const netteDraai = (draai: number | null | undefined) => {
  if (typeof draai !== "number" || !Number.isFinite(draai) || Math.abs(draai) < MIN_DRAAI) return 0;
  return Math.max(-MAX_DRAAI, Math.min(MAX_DRAAI, draai));
};

//! hoeveel een vliegtuig verschoven en gedraaid is na t seconden, in wereldeenheden. snelheid = de lengte van de wereldsnelheid,
//! koers in graden, draai in graden per seconde. eerst een boog met vaste draaisnelheid, na bochtSeconden rechtdoor verder.
//! de boog: de koers loopt op met draai × t, en de positie volgt de cirkel die daarbij hoort (y loopt in de wereld naar het zuiden)
export const verschuiving = (snelheid: number, koers: number, draai: number, t: number, bochtSeconden = BOCHT_SECONDEN) => {
  const r = Math.PI / 180;
  if (draai === 0 || bochtSeconden <= 0) {
    return { dx: Math.sin(koers * r) * snelheid * t, dy: -Math.cos(koers * r) * snelheid * t, koers };
  }
  const tb = Math.min(t, bochtSeconden); //! zo lang in de bocht
  const w = draai * r; //! radialen per seconde
  const a = koers * r;
  const b = a + w * tb; //! de koers aan het eind van de bocht
  let dx = (snelheid / w) * (Math.cos(a) - Math.cos(b));
  let dy = (snelheid / w) * (Math.sin(a) - Math.sin(b)); //! de integraal van -cos: noord is min
  if (t > tb) {
    //! daarna rechtdoor op de nieuwe koers
    dx += Math.sin(b) * snelheid * (t - tb);
    dy -= Math.cos(b) * snelheid * (t - tb);
  }
  return { dx, dy, koers: koers + draai * tb };
};
