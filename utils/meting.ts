//! tellers voor de meter (?meten in de url): de rest van de app schrijft erin, alleen de meter leest eruit.
//! een getal ophogen kost niets, dus ze staan altijd aan

export const meting = {
  redenenAanroepen: 0, //! hoe vaak getSuspicionReasons is aangeroepen
  pakketStart: 0, //! de stand van redenenAanroepen op het moment dat het laatste pakket binnenkwam

  //! de canvaslaag met vliegtuigen (vliegtuigCanvas.ts)
  tekenMs: 0, //! duur van de laatste keer dat alle vliegtuigen getekend zijn
  tekenMsMax: 0, //! langste tekenbeurt sinds de meter dit voor het laatst las (de meter zet hem terug op 0)
  tekenMsSom: 0, //! alle tekenbeurten opgeteld, voor een gemiddelde in het meetscript
  tekenbeurten: 0, //! aantal tekenbeurten sinds het starten (wordt nooit teruggezet, voor het meetscript)
  hertekend: 0, //! aantal tekenbeurten (de meter zet hem elke seconde terug op 0)
  pulsMsMax: 0, //! langste tekenbeurt van de pulsringen sinds de meter dit voor het laatst las
  zichtbaar: 0, //! hoeveel vliegtuigen de laatste keer getekend zijn, de rest viel buiten beeld (frustum culling) of door het filter
  totaal: 0, //! hoeveel vliegtuigen de laag kent

  //! gegist bestek: hoe ver de voorspelling ernaast zat toen het laatste pakket binnenkwam, in pixels op de zoom van dat moment
  //! (zonder het uitdoven was dat de sprong geweest). vliegtuigen die rechtdoor vliegen horen hier op ±0 te zitten
  correctieMediaanPx: 0,
  correctieP95Px: 0,
  correctieMaxPx: 0,
  correctieZoom: 0,
  gesnapt: 0, //! zoveel vliegtuigen stonden te ver weg en zijn meteen goed gezet in plaats van uitgedoofd
  verouderd: 0, //! zoveel getekende vliegtuigen staan stil omdat ze langer dan de horizon geen nieuwe positie hadden
  snelstePx: 0, //! pixels per seconde van het snelste zichtbare vliegtuig: bepaalt hoe vaak de laag tekent
};
