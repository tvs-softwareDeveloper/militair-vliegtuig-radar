//! de meter staat alleen aan met ?meten in de url (bijvoorbeeld http://localhost:5173/?meten), anders kost hij niets
export const metenAan = typeof location !== "undefined" && new URLSearchParams(location.search).has("meten");

//! alleen om te meten: hoe lang de voorspelling in een bocht meedraait (seconden), bv. ?meten&bocht=0 voor altijd rechtdoor.
//! zo kun je in een paar tabbladen naast elkaar op dezelfde data vergelijken. null = de standaard uit beweging.ts
const bocht = typeof location !== "undefined" ? new URLSearchParams(location.search).get("bocht") : null;
export const bochtUitUrl = bocht !== null && bocht !== "" && Number.isFinite(Number(bocht)) ? Number(bocht) : null;
