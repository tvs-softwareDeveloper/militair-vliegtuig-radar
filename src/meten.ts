//! de meter staat alleen aan met ?meten in de url (bijvoorbeeld http://localhost:5173/?meten), anders kost hij niets
export const metenAan = typeof location !== "undefined" && new URLSearchParams(location.search).has("meten");
