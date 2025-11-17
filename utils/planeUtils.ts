export const isSuspicious = (plane: any) => {
  const [
    icao,
    callsign,
    originCountry,
    timePosition,
    lastContact,
    lon,
    lat,
    baroAltitude,
    onGround,
    velocity,
    trueTrack,
    verticalRate,
    sensors,
    geoAltitude,
    squawk,
    spi,
    positionSource,
  ] = plane;

  return (
    !onGround && //checkt of vliegtuig in de lucht is
    (velocity > 950 || // controle op hoge snelheid
      (!callsign && !squawk) || // controlle op anoniem vliegtuig
      (geoAltitude !== null && geoAltitude < 1000) || // controle of vliegtuig vliegt lage hoogte
      spi === true || // SPI-flag actief
      (trueTrack !== null && (trueTrack <= 20 || trueTrack >= 160)) || // conrtole of vliegtuig richting binnenland vliegt
      (verticalRate !== null && Math.abs(verticalRate) > 15)) // controle op snelle stijging of daling
  );
};

//rekent snelheid in km/u en in knots
export const getSpeedInKmH = (velocity: number) => velocity * 3.6;
export const getSpeedInKnots = (velocity: number) => velocity * 1.94384;

//!toont redenen waarom een vliegtuig verdacht is
export const getSuspicionReasons = (plane: any): string[] => {
  const [
    icao,
    callsign,
    originCountry,
    timePosition,
    lastContact,
    lon,
    lat,
    baroAltitude,
    onGround,
    velocity,
    trueTrack,
    verticalRate,
    sensors,
    geoAltitude,
    squawk,
    spi,
    positionSource,
  ] = plane;

  const reasons: string[] = [];
  //reasons voor verdachte activiteit
  if (onGround) return reasons; // alleen vliegtuigen in de lucht returnen reasons

  if (velocity > 250) reasons.push("zeer hoge snelheid");
  if (!callsign && !squawk) reasons.push("anoniem (geen callsign/squawk)");
  if (geoAltitude !== null && geoAltitude < 1000)
    reasons.push("lage hoogte (< 1000m)");
  if (spi === true) reasons.push("SPI/Noodsignaal actief");
  if (trueTrack !== null && (trueTrack <= 20 || trueTrack >= 160))
    reasons.push("vliegt richting binnenland");
  if (verticalRate !== null && Math.abs(verticalRate) > 15)
    reasons.push("snelle stijging/daling");

  return reasons;
};
