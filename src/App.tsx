import { useState, useEffect, useRef, useMemo } from "react";
import MapDashboard from "./MapDashboard";
import StatusPanel from "./componenten/StatusPanel";
// OUD: import { Niveau, niveauVan } from "./dreiging";
import { Niveau, beoordeel, type Beoordeling } from "./dreiging";
import Meter from "./componenten/Meter";
import { metenAan } from "./meten";
import { meting } from "../utils/meting";
import type { PakketTijd } from "./componenten/vliegtuigCanvas";
import { GEEN_VERVERSING, bewaarStand, leesStand, type Stand, type Tegoed, type Verversing } from "./verversen";

export type Punt = [number, number]; // lat, lon
export const NEDERLAND: Punt = [52.13, 5.29]; //! midden van nederland, het startpunt

export default function App() {
  const [planes, setPlanes] = useState<any[]>([]); // state voor vliegtuig data
  const [filter, setFilter] = useState<Niveau | null>(null); //! null = alle niveaus
  const [gekozenId, setGekozenId] = useState<string | null>(null);
  const [vliegNaar, setVliegNaar] = useState<string | null>(null); //! in de lijst gekozen: de kaart vliegt erheen (bij een klik op de kaart niet)
  const [verbonden, setVerbonden] = useState(false);
  const [laatsteUpdate, setLaatsteUpdate] = useState<Date | null>(null);
  //! bij elk pakket: wanneer de momentopname is en hoeveel de klok van de server voorloopt op die van de browser (voor het gegist bestek)
  const [pakketTijd, setPakketTijd] = useState<PakketTijd>({ tijd: null, klokVerschil: 0 });

  //! het bekeken gebied: een middelpunt en een straal in km
  const [midden, setMidden] = useState<Punt>(NEDERLAND);
  const [straal, setStraal] = useState(250);
  const [kaartMidden, setKaartMidden] = useState<Punt>(NEDERLAND);
  const [seconden, setSeconden] = useState(30); //! hoe vaak de server ververst
  const [bezig, setBezig] = useState(false); //! nieuw gebied gevraagd, nog geen antwoord
  const socketRef = useRef<any>(null);
  //! verversen: de stand en wat hij kost (van de server), en het OpenSky-tegoed
  const [verversing, setVerversing] = useState<Verversing>(GEEN_VERVERSING);
  const [tegoed, setTegoed] = useState<Tegoed | null>(null);
  //! wat deze kijker zelf gekozen heeft (onthouden in de browser). null = nog nooit gekozen, dan geldt de standaard van de server
  const keuzeRef = useRef<Stand | null>(leesStand());

  //! elk vliegtuig één keer per pakket beoordelen (redenen + niveau). eerst deed elk onderdeel dat zelf, ruim 8 keer per vliegtuig
  const beoordelingen = useMemo(() => {
    const kaart = new Map<string, Beoordeling>();
    for (const plane of planes) kaart.set(plane[0], beoordeel(plane));
    return kaart;
  }, [planes]);

  //! filtert vliegtuigen op het gekozen dreigingsniveau
  //! OUD: niet meer nodig, de canvaslaag krijgt alle vliegtuigen plus het filter (zo houden verborgen vliegtuigen hun plek)
  // OUD: const filteredPlanes = filter === null ? planes : planes.filter((plane) => niveauVan(plane) === filter);
  // OUD: const filteredPlanes = useMemo(
  // OUD:   () => (filter === null ? planes : planes.filter((plane) => beoordelingen.get(plane[0])?.niveau === filter)),
  // OUD:   [planes, beoordelingen, filter],
  // OUD: );

  useEffect(() => {
    import(//connectie met de socket server back end
      "/voorbereiding defensie/vliegtuig-radar/backend/services/socket"
    ).then(({ default: socket }) => {
      socketRef.current = socket;
      setVerbonden(socket.connected);
      socket.on("connect", () => setVerbonden(true));
      socket.on("disconnect", () => setVerbonden(false));
      // OUD: socket.on("gebied", (info: { seconden: number }) => setSeconden(info.seconden));
      socket.on("gebied", (info: { seconden: number; stand?: Stand; standen?: Verversing["standen"]; credits?: number; perUur?: number }) => {
        setSeconden(info.seconden);
        setVerversing({
          stand: info.stand ?? null,
          seconden: info.seconden,
          standen: info.standen ?? {},
          credits: info.credits ?? 0,
          perUur: info.perUur ?? 0,
        });
      });
      socket.on("tegoed", (info: Tegoed) => setTegoed(info));
      //! de eigen keuze doorgeven, ook na een herstart van de server (die begint weer met zijn standaard)
      const stuurKeuze = () => {
        if (keuzeRef.current) socket.emit("verversen", { stand: keuzeRef.current });
      };
      if (socket.connected) stuurKeuze();
      socket.on("connect", stuurKeuze);
      // OUD: socket.on("flights", (data) => {
      socket.on("flights", (data: any[], info?: { tijd?: number | null; nu?: number }) => {
        meting.pakketStart = meting.redenenAanroepen; //! voor de meter: vanaf hier tellen we de aanroepen van dit pakket
        //! de server stuurt zijn klok mee (nu, ms). het verschil met onze klok, meteen bij ontvangst gemeten zodat de rendertijd niet meetelt.
        //! een oudere server stuurt niets: dan rekenen we met onze eigen klok
        const klokVerschil = typeof info?.nu === "number" ? info.nu - (performance.timeOrigin + performance.now()) : 0;
        setPakketTijd({ tijd: info?.tijd ?? null, klokVerschil });
        setPlanes(data); // update de state met de nieuwe vliegtuig data
        setLaatsteUpdate(new Date());
        setBezig(false);
      });
      return () => {
        socket.off("flights");
      };
    });
  }, []);

  //! nieuw gebied naar de server, even wachten zodat schuiven niet elke stap een aanvraag kost
  const eersteKeer = useRef(true);
  useEffect(() => {
    if (eersteKeer.current) {
      eersteKeer.current = false;
      return;
    }
    setBezig(true);
    const wacht = setTimeout(() => {
      socketRef.current?.emit("gebied", { lat: midden[0], lon: midden[1], km: straal });
    }, 500);
    return () => clearTimeout(wacht);
  }, [midden, straal]);

  //! kiezen in de lijst: filter eraf als het vliegtuig anders niet op de kaart staat
  const kies = (id: string) => {
    // OUD: const plane = planes.find((p) => p[0] === id);
    // OUD: if (plane && filter !== null && niveauVan(plane) !== filter) setFilter(null);
    const niveau = beoordelingen.get(id)?.niveau; //! undefined = vliegtuig staat niet (meer) in het pakket
    if (niveau !== undefined && filter !== null && niveau !== filter) setFilter(null);
    setGekozenId(id);
    setVliegNaar(id); //! vanuit de lijst: de kaart vliegt erheen
  };

  //! een verversstand gekozen: onthouden, meteen tonen en naar de server. die stuurt de nieuwe seconden en kosten terug
  const kiesStand = (stand: Stand) => {
    keuzeRef.current = stand;
    bewaarStand(stand);
    setVerversing((v) => ({ ...v, stand }));
    socketRef.current?.emit("verversen", { stand });
  };

  //! klik op de kaart: dat vliegtuig staat al in beeld, dus niet vliegen. null = lege plek of Esc, dan is er niets meer gekozen
  const kiesOpKaart = (id: string | null) => {
    setGekozenId(id);
    setVliegNaar(null);
  };

  return (
    <div className="flex min-h-screen flex-col-reverse bg-slate-950 md:h-screen md:flex-row">
      <StatusPanel
        planes={planes}
        beoordelingen={beoordelingen}
        filter={filter}
        setFilter={setFilter}
        gekozenId={gekozenId}
        kies={kies}
        verbonden={verbonden}
        laatsteUpdate={laatsteUpdate}
        straal={straal}
        setStraal={setStraal}
        rondNederland={midden === NEDERLAND}
        gebruikKaartMidden={() => setMidden(kaartMidden)}
        terugNaarNederland={() => setMidden(NEDERLAND)}
        seconden={seconden}
        bezig={bezig}
        verversing={verversing}
        tegoed={tegoed}
        kiesStand={kiesStand}
      />
      <main className="h-[60vh] shrink-0 md:h-full md:flex-1">
        {/* OUD: planes={filteredPlanes} */}
        <MapDashboard
          planes={planes}
          beoordelingen={beoordelingen}
          tijd={pakketTijd}
          interval={seconden}
          filter={filter}
          gekozenId={gekozenId}
          vliegNaar={vliegNaar}
          onKies={kiesOpKaart}
          midden={midden}
          straal={straal}
          onKaartMidden={setKaartMidden}
          onMiddenGesleept={setMidden}
        />
      </main>
      {/* meter: alleen met ?meten in de url */}
      {metenAan && <Meter aantal={planes.length} laatsteUpdate={laatsteUpdate} />}
    </div>
  );
}
