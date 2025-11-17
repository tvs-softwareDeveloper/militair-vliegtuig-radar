import { useState, useEffect } from "react";
import MapDashboard from "./MapDashboard";
import planeIconUrl from "./assets/plane.png";
import redPlaneUrl from "./assets/redplane.png";
import bluePlaneUrl from "./assets/blauweplane.png";
import blackPlaneUrl from "./assets/blackplane.png";
import orangePlaneUrl from "./assets/orangeplane.png";
import { getSuspicionReasons } from "../utils/planeUtils"; 

export default function App() {
  const [planes, setPlanes] = useState<any[]>([]);// state voor vliegtuig data

  //! filter voor vliegtuig icons
  const [selectedThreatLevel, setSelectedThreatLevel] = useState("all");
  const filteredPlanes = planes.filter((plane) => {

    //haalt het aantal redenen voor verdachte activiteit op en telt ze
    const reasonsCount = getSuspicionReasons(plane).length;
    
    // filtert data op basis van aantal redenen 
    if (selectedThreatLevel === "all") return true;
    if (selectedThreatLevel === "standaard") return reasonsCount === 0;
    if (selectedThreatLevel === "blauwen") return reasonsCount === 1;
    if (selectedThreatLevel === "oranje") return reasonsCount === 2;
    if (selectedThreatLevel === "rood") return reasonsCount === 3;
    if (selectedThreatLevel === "zwarten") return reasonsCount >= 4;

    return true;
  });

  useEffect(() => {
    import(//connectie met de socket server back end
      "/voorbereiding defensie/vliegtuig-radar/backend/services/socket"
    ).then(({ default: socket }) => {
      socket.on("flights", (data) => {
        setPlanes(data); // update de state met de nieuwe vliegtuig data
      });
      return () => {
        socket.off("flights");
      };
    });
  }, []);

  return (
    <div className="p-6 text-center">
      <div className="flex space-x-8 absolute left-8">
        <div className="flex flex-col items-center">
          <img
            src={planeIconUrl}
            alt="Standaard vliegtuig"
            className="w-8 h-8"
          />
          <span className="text-xs mt-1">0 redenen</span>
        </div>
        <div className="flex flex-col items-center">
          <img src={bluePlaneUrl} alt="Blauwe vliegtuig" className="w-8 h-8" />
          <span className="text-xs mt-1">1 reden</span>
        </div>
        <div className="flex flex-col items-center">
          <img
            src={orangePlaneUrl}
            alt="Oranje vliegtuig"
            className="w-8 h-8"
          />
          <span className="text-xs mt-1">2 redenen</span>
        </div>
        <div className="flex flex-col items-center">
          <img src={redPlaneUrl} alt="Rode vliegtuig" className="w-8 h-8" />
          <span className="text-xs mt-1">3 redenen</span>
        </div>
        <div className="flex flex-col items-center">
          <img src={blackPlaneUrl} alt="Zwarte vliegtuig" className="w-8 h-8" />
          <span className="text-xs mt-1">5 redenen</span>
        </div>
      </div>

      <div className="title relative inline-flex items-center justify-center gap-20">
        <div>
          <h1 className="text-4xl font-bold">Vliegtuig radar</h1>
        </div>
      </div>
      <select
        value={selectedThreatLevel}
        onChange={(e) => setSelectedThreatLevel(e.target.value)}
        title="Filter op verdacht niveau"
        className="ml-4 p-2 border rounded"
      >
        <option value="all">Toon alle vliegtuigen</option>
        <option value="standaard">0 redenen (standaard)</option>
        <option value="blauwen">1 reden (blauw)</option>
        <option value="oranje">2 redenen (oranje)</option>
        <option value="rood">3 redenen (rood)</option>
        <option value="zwarten">4+ redenen (zwart)</option>
      </select>

      <div className="mt-6">
        <MapDashboard planes={filteredPlanes} />
      </div>
    </div>
  );
}
