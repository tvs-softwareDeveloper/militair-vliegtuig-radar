import { useEffect, useRef, type MutableRefObject } from "react";
import { useMap } from "react-leaflet";
import type L from "leaflet";
import { VliegtuigCanvas, type PakketTijd } from "./vliegtuigCanvas";
import type { Beoordeling, Niveau } from "../dreiging";
import { metenAan } from "../meten";

type Props = {
  planes: any[]; //! alle vliegtuigen, de laag filtert zelf
  beoordelingen: Map<string, Beoordeling>;
  tijd: PakketTijd; //! bij het pakket: wanneer de momentopname is en hoeveel de klok van de server voorloopt
  interval: number; //! hoe vaak de server ververst, in seconden
  filter: Niveau | null;
  gekozenId: string | null;
  onKlik: (id: string | null) => void; //! klik op een vliegtuig, of op een lege plek / Esc (null)
  onGekozenPositie: (positie: L.LatLng) => void; //! voor de popup: waar het gekozen vliegtuig nu getekend staat
  laagRef?: MutableRefObject<VliegtuigCanvas | null>; //! zodat de kaart kan vragen waar een vliegtuig nu is (popup, naartoe vliegen)
};

//! koppelt de canvaslaag (vliegtuigCanvas.ts) aan React. de laag tekent zelf, buiten React om; hier geven we alleen nieuwe data door.
//! zo rendert React bij een nieuw pakket geen duizenden componenten meer, maar roept het één functie aan
// OUD: const VliegtuigLaag = ({ planes, beoordelingen, filter, gekozenId, onKlik, onGekozenPositie }: Props) => {
const VliegtuigLaag = ({ planes, beoordelingen, tijd, interval, filter, gekozenId, onKlik, onGekozenPositie, laagRef }: Props) => {
  const map = useMap();
  const laag = useRef<VliegtuigCanvas | null>(null);
  //! altijd de nieuwste callbacks, zodat de laag nooit een oude versie aanroept
  const terug = useRef({ onKlik, onGekozenPositie });
  terug.current = { onKlik, onGekozenPositie };

  useEffect(() => {
    const nieuw = new VliegtuigCanvas({
      onKlik: (id) => terug.current.onKlik(id),
      onGekozenPositie: (positie) => terug.current.onGekozenPositie(positie),
    });
    nieuw.addTo(map);
    laag.current = nieuw;
    if (laagRef) laagRef.current = nieuw;
    if (metenAan) (window as any).__vliegtuigLaag = nieuw; //! alleen met ?meten: voor het testscript
    return () => {
      nieuw.remove();
      laag.current = null;
      if (laagRef) laagRef.current = null;
    };
  }, [map]);

  //! effecten lopen op volgorde, dus de laag hierboven bestaat al als deze voor het eerst draaien.
  //! het interval eerst, want de horizon telt mee bij het verwerken van een pakket
  useEffect(() => {
    laag.current?.zetInterval(interval);
  }, [interval]);

  // OUD: useEffect(() => {
  // OUD:   laag.current?.zetVliegtuigen(planes, beoordelingen);
  // OUD: }, [planes, beoordelingen]);
  useEffect(() => {
    laag.current?.zetVliegtuigen(planes, beoordelingen, tijd);
  }, [planes, beoordelingen, tijd]);

  useEffect(() => {
    laag.current?.zetFilter(filter);
  }, [filter]);

  useEffect(() => {
    laag.current?.zetGekozen(gekozenId);
  }, [gekozenId]);

  return null;
};

export default VliegtuigLaag;
