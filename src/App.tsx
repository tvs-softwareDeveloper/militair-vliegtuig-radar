import { useState, useEffect, useRef, useMemo } from "react";
import MapDashboard from "./MapDashboard";
import StatusPanel from "./componenten/StatusPanel";
// OUD: import { Niveau, niveauVan } from "./dreiging";
import { Niveau, beoordeel, type Beoordeling } from "./dreiging";
import Meter from "./componenten/Meter";
import { metenAan } from "./meten";
import { meting } from "../utils/meting";
import type { PakketTijd } from "./componenten/vliegtuigCanvas";
// OUD: import { GEEN_VERVERSING, bewaarStand, leesStand, type Stand, type Tegoed, type Verversing } from "./verversen";
import {
  ADSB_MAX_KM,
  GEEN_VERVERSING,
  bewaarBron,
  bewaarSporen,
  bewaarStand,
  leesBron,
  leesSporen,
  leesStand,
  type Bron,
  type Vlucht,
  type Stand,
  type Tegoed,
  type Verversing,
} from "./verversen";

export type Punt = [number, number]; // lat, lon
export const NEDERLAND: Punt = [52.13, 5.29]; //! midden van nederland, het startpunt

//! het gebied waar een pakket bij hoort (de server stuurt het mee) of dat de app het laatst gevraagd heeft
type Gevraagd = { lat: number; lon: number; km: number; bron?: string };

//! is dit pakket voor het gebied dat we nu willen? de server begrenst de breedte op 85 graden, zet de lengte tussen -180 en 180
//! en rondt de straal af, dus we vergelijken met wat speling. een oude server stuurt geen gebied mee: dan geldt elk pakket
const zelfdeGebied = (pakket: Gevraagd | undefined, wens: Gevraagd) => {
  if (!pakket) return true;
  const lonVerschil = ((((pakket.lon - wens.lon) % 360) + 540) % 360) - 180; //! 190 en -170 zijn dezelfde lengtegraad
  return (
    Math.abs(pakket.lat - Math.max(-85, Math.min(85, wens.lat))) < 1e-4 &&
    Math.abs(lonVerschil) < 1e-4 &&
    Math.round(pakket.km) === Math.round(wens.km) &&
    (pakket.bron === undefined || wens.bron === undefined || pakket.bron === wens.bron)
  );
};

export default function App() {
  const [planes, setPlanes] = useState<any[]>([]); // state voor vliegtuig data
  const [filter, setFilter] = useState<Niveau | null>(null); //! null = alle niveaus
  const [alleenMilitair, setAlleenMilitair] = useState(false); //! filter op militair, samen te gebruiken met het filter op niveau
  const [sporen, setSporen] = useState(leesSporen); //! sporen achter de vliegtuigen (onthouden in de browser)
  const [vlucht, setVlucht] = useState<Vlucht | null>(null); //! de hele vlucht van het gekozen vliegtuig (knop in de popup)
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
  //! de bron: opensky of adsb.lol. ook onthouden in de browser. de ref is voor de socket, die de state niet ziet
  const [bron, setBron] = useState<Bron>(() => leesBron() ?? "opensky");
  const bronRef = useRef<Bron>(bron);
  const [bronMelding, setBronMelding] = useState<string | null>(null); //! bv. adsb.lol viel uit en de server ging terug naar opensky
  //! wat we het laatst gevraagd hebben (gebied en bron). zo weet de socket of een pakket nog bij het oude gebied hoort
  const wensRef = useRef<Gevraagd>({ lat: NEDERLAND[0], lon: NEDERLAND[1], km: 250, bron });

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
      //! het antwoord op "Hele vlucht": alleen bewaren als dat vliegtuig nog gevraagd is (je kunt intussen een ander gekozen hebben)
      // OUD: socket.on("vlucht", (info: { icao: string; punten?: [number, number][]; van?: number; fout?: string }) => {
      socket.on("vlucht", (info: { icao: string; punten?: [number, number][]; van?: number; bron?: Vlucht["bron"]; fout?: string }) => {
        setVlucht((nu) =>
          nu && nu.id === info.icao
            ? info.fout
              ? { id: info.icao, status: "fout", melding: info.fout }
              : { id: info.icao, status: "klaar", punten: info.punten ?? [], van: info.van, bron: info.bron }
            : nu,
        );
      });
      //! de eigen keuze doorgeven, ook na een herstart van de server (die begint weer met zijn standaard)
      const stuurKeuze = () => {
        if (keuzeRef.current) socket.emit("verversen", { stand: keuzeRef.current });
        if (bronRef.current !== "opensky") socket.emit("bron", { bron: bronRef.current }); //! opensky is de standaard van de server
      };
      //! de server wisselt zelf van bron als adsb.lol een paar keer niet antwoordt. dat tonen en onthouden
      socket.on("bron", (info: { bron: Bron; melding?: string }) => {
        bronRef.current = info.bron;
        wensRef.current = { ...wensRef.current, bron: info.bron };
        setBron(info.bron);
        bewaarBron(info.bron);
        setBronMelding(info.melding ?? null);
      });
      if (socket.connected) stuurKeuze();
      socket.on("connect", stuurKeuze);
      // OUD: socket.on("flights", (data) => {
      // OUD: socket.on("flights", (data: any[], info?: { tijd?: number | null; nu?: number }) => {
      socket.on("flights", (data: any[], info?: { tijd?: number | null; nu?: number; gebied?: Gevraagd }) => {
        meting.pakketStart = meting.redenenAanroepen; //! voor de meter: vanaf hier tellen we de aanroepen van dit pakket
        //! de server stuurt zijn klok mee (nu, ms). het verschil met onze klok, meteen bij ontvangst gemeten zodat de rendertijd niet meetelt.
        //! een oudere server stuurt niets: dan rekenen we met onze eigen klok
        const klokVerschil = typeof info?.nu === "number" ? info.nu - (performance.timeOrigin + performance.now()) : 0;
        //! nog een pakket van het oude gebied of de oude bron (de nieuwe aanvraag is onderweg): wel tonen, maar "laden" en het dimmen blijven
        const nieuw = zelfdeGebied(info?.gebied, wensRef.current);
        // OUD: setPakketTijd({ tijd: info?.tijd ?? null, klokVerschil });
        setPakketTijd({ tijd: info?.tijd ?? null, klokVerschil, oudGebied: !nieuw });
        setPlanes(data); // update de state met de nieuwe vliegtuig data
        setLaatsteUpdate(new Date());
        // OUD: setBezig(false);
        if (nieuw) setBezig(false);
      });
      return () => {
        socket.off("flights");
      };
    });
  }, []);

  //! nieuw gebied naar de server, even wachten zodat schuiven niet elke stap een aanvraag kost
  const eersteKeer = useRef(true);
  useEffect(() => {
    //! meteen onthouden, niet pas na de 500 ms: een pakket dat in die tijd binnenkomt is al van het oude gebied
    wensRef.current = { ...wensRef.current, lat: midden[0], lon: midden[1], km: straal };
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
    if (alleenMilitair && beoordelingen.get(id)?.militair === false) setAlleenMilitair(false); //! anders staat hij niet op de kaart
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

  //! een bron gekozen: onthouden en naar de server. adsb.lol gaat max tot 450 km, dus een grotere straal gaat daar naartoe
  const kiesBron = (nieuw: Bron) => {
    if (nieuw === bronRef.current) return;
    bronRef.current = nieuw;
    //! de straal gaat bij adsb.lol misschien naar 450: dat zet het effect hierboven in de wens zodra de straal verandert
    wensRef.current = { ...wensRef.current, bron: nieuw };
    setBron(nieuw);
    bewaarBron(nieuw);
    setBronMelding(null);
    setBezig(true); //! "Nieuw gebied laden…" tot de vliegtuigen van de nieuwe bron er zijn
    socketRef.current?.emit("bron", { bron: nieuw });
    if (nieuw === "adsblol" && straal > ADSB_MAX_KM) setStraal(ADSB_MAX_KM);
  };

  //! de schakelaar "Sporen"
  const kiesSporen = (aan: boolean) => {
    setSporen(aan);
    bewaarSporen(aan);
  };

  //! de afgelegde route opvragen (bij het kiezen van een vliegtuig, of met "Opnieuw" in de popup)
  const vraagVlucht = (id: string) => {
    setVlucht({ id, status: "laden" });
    socketRef.current?.emit("vlucht", { icao: id });
  };

  // OUD: //! een ander vliegtuig gekozen (of niets): de vlucht van het vorige hoort er niet meer bij
  // OUD: useEffect(() => {
  // OUD:   setVlucht((nu) => (nu && nu.id !== gekozenId ? null : nu));
  // OUD: }, [gekozenId]);
  //! een vliegtuig gekozen: meteen zijn afgelegde route opvragen (eerst moest je op "Hele vlucht" klikken). niets gekozen: weg
  useEffect(() => {
    if (gekozenId === null) setVlucht(null);
    else if (vlucht?.id !== gekozenId) vraagVlucht(gekozenId);
  }, [gekozenId]);

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
        bron={bron}
        kiesBron={kiesBron}
        bronMelding={bronMelding}
        alleenMilitair={alleenMilitair}
        setAlleenMilitair={setAlleenMilitair}
        sporen={sporen}
        kiesSporen={kiesSporen}
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
          onStraalGesleept={setStraal}
          bron={bron}
          alleenMilitair={alleenMilitair}
          sporen={sporen}
          vlucht={vlucht}
          // OUD: kanVlucht={tegoed?.account === true || tegoed?.bron === "nep"}
          kanVlucht
          onVlucht={vraagVlucht}
        />
      </main>
      {/* meter: alleen met ?meten in de url */}
      {metenAan && <Meter aantal={planes.length} laatsteUpdate={laatsteUpdate} />}
    </div>
  );
}
