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
