import { useState, useEffect, useRef } from "react";
import MapDashboard from "./MapDashboard";
import StatusPanel from "./componenten/StatusPanel";
import { Niveau, niveauVan } from "./dreiging";

export type Punt = [number, number]; // lat, lon
export const NEDERLAND: Punt = [52.13, 5.29]; //! midden van nederland, het startpunt

export default function App() {
  const [planes, setPlanes] = useState<any[]>([]); // state voor vliegtuig data
  const [filter, setFilter] = useState<Niveau | null>(null); //! null = alle niveaus
  const [gekozenId, setGekozenId] = useState<string | null>(null);
  const [verbonden, setVerbonden] = useState(false);
  const [laatsteUpdate, setLaatsteUpdate] = useState<Date | null>(null);

  //! het bekeken gebied: een middelpunt en een straal in km
  const [midden, setMidden] = useState<Punt>(NEDERLAND);
  const [straal, setStraal] = useState(250);
  const [kaartMidden, setKaartMidden] = useState<Punt>(NEDERLAND);
  const [seconden, setSeconden] = useState(30); //! hoe vaak de server ververst
  const [bezig, setBezig] = useState(false); //! nieuw gebied gevraagd, nog geen antwoord
  const socketRef = useRef<any>(null);

  //! filtert vliegtuigen op het gekozen dreigingsniveau
  const filteredPlanes = filter === null ? planes : planes.filter((plane) => niveauVan(plane) === filter);

  useEffect(() => {
    import(//connectie met de socket server back end
      "/voorbereiding defensie/vliegtuig-radar/backend/services/socket"
    ).then(({ default: socket }) => {
      socketRef.current = socket;
      setVerbonden(socket.connected);
      socket.on("connect", () => setVerbonden(true));
      socket.on("disconnect", () => setVerbonden(false));
      socket.on("gebied", (info: { seconden: number }) => setSeconden(info.seconden));
      socket.on("flights", (data) => {
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
    const plane = planes.find((p) => p[0] === id);
    if (plane && filter !== null && niveauVan(plane) !== filter) setFilter(null);
    setGekozenId(id);
  };

  return (
    <div className="flex min-h-screen flex-col-reverse bg-slate-950 md:h-screen md:flex-row">
      <StatusPanel
        planes={planes}
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
      />
      <main className="h-[60vh] shrink-0 md:h-full md:flex-1">
        <MapDashboard
          planes={filteredPlanes}
          gekozenId={gekozenId}
          midden={midden}
          straal={straal}
          onKaartMidden={setKaartMidden}
        />
      </main>
    </div>
  );
}
