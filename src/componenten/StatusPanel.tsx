import { useMemo } from "react";
// OUD: import { getSuspicionReasons } from "../../utils/planeUtils";
// OUD: import { callsignVan, kleurVan, Niveau, NIVEAUS, niveauVan } from "../dreiging";
// OUD: import { callsignVan, GEEN_BEOORDELING, kleurVan, Niveau, NIVEAUS, type Beoordeling } from "../dreiging";
import { callsignVan, extraVan, GEEN_BEOORDELING, kleurVan, Niveau, NIVEAUS, type Beoordeling } from "../dreiging";
// OUD: import { STANDEN, duurTekst, type Stand, type Tegoed, type Verversing } from "../verversen";
import {
  ADSB_MAX_KM,
  ADSB_UITLEG,
  BRONNEN,
  MAX_KM,
  STANDEN,
  duurTekst,
  type Bron,
  type Stand,
  type Tegoed,
  type Verversing,
} from "../verversen";

type Props = {
  planes: any[]; //! alle vliegtuigen, ook die door het filter niet op de kaart staan
  beoordelingen: Map<string, Beoordeling>; //! redenen en niveau per vliegtuig, één keer per pakket uitgerekend door App
  filter: Niveau | null; //! null = alles tonen
  setFilter: (niveau: Niveau | null) => void;
  gekozenId: string | null;
  kies: (id: string) => void;
  verbonden: boolean;
  laatsteUpdate: Date | null;
  straal: number; //! km rond het middelpunt
  setStraal: (km: number) => void;
  rondNederland: boolean;
  gebruikKaartMidden: () => void;
  terugNaarNederland: () => void;
  wereld: boolean; //! "Hele wereld" staat aan: alle vliegtuigen op aarde, geen cirkel
  kiesWereld: (aan: boolean) => void;
  seconden: number; //! hoe vaak de server ververst
  bezig: boolean;
  verversing: Verversing; //! de stand en wat hij kost, van de server
  tegoed: Tegoed | null; //! het OpenSky-tegoed, null = nog niets van de server gehoord
  kiesStand: (stand: Stand) => void;
  bron: Bron; //! opensky of adsb.lol
  kiesBron: (bron: Bron) => void;
  bronMelding: string | null; //! van de server, als hij zelf terug ging naar opensky
  alleenMilitair: boolean; //! filter op militair
  setAlleenMilitair: (aan: boolean) => void;
  sporen: boolean; //! sporen achter de vliegtuigen
  kiesSporen: (aan: boolean) => void;
};

const MAX_MILITAIR = 20; //! zoveel militaire toestellen in de lijst, meer zijn het er rond nederland zelden

const StatusPanel = ({
  planes,
  beoordelingen,
  filter,
  setFilter,
  gekozenId,
  kies,
  verbonden,
  laatsteUpdate,
  straal,
  setStraal,
  rondNederland,
  gebruikKaartMidden,
  terugNaarNederland,
  wereld,
  kiesWereld,
  seconden,
  bezig,
  verversing,
  tegoed,
  kiesStand,
  bron,
  kiesBron,
  bronMelding,
  alleenMilitair,
  setAlleenMilitair,
  sporen,
  kiesSporen,
}: Props) => {
  const beoordeling = (p: any) => beoordelingen.get(p[0]) ?? GEEN_BEOORDELING;
  const adsb = bron === "adsblol";
  // OUD: const maxKm = adsb ? ADSB_MAX_KM : 1000; //! adsb.lol kan niet verder dan 450 km
  const maxKm = adsb ? ADSB_MAX_KM : MAX_KM; //! adsb.lol kan niet verder dan 450 km

  //! alle tellers in één ronde langs de vliegtuigen, en alleen opnieuw bij een nieuw pakket (niet bij het schuiven van de straal)
  // OUD: const inDeLucht = planes.filter((p) => !p[8]);
  // OUD: const perNiveau = NIVEAUS.map(({ niveau }) => planes.filter((p) => niveauVan(p) === niveau).length);
  // OUD: const verdachtst = planes.filter((p) => niveauVan(p) >= 2).sort((a, b) => niveauVan(b) - niveauVan(a) || (a[13] ?? 1e9) - (b[13] ?? 1e9)).slice(0, 8);
  // OUD: const { inDeLucht, perNiveau, verdachtst } = useMemo(() => {
  const { inDeLucht, perNiveau, verdachtst, militair } = useMemo(() => {
    let inDeLucht = 0;
    const perNiveau = NIVEAUS.map(() => 0);
    const verdacht: any[] = [];
    const militair: any[] = []; //! los van het niveau (K3): een militair toestel is niet vanzelf verdacht
    for (const p of planes) {
      if (!p[8]) inDeLucht++;
      // OUD: const niveau = (beoordelingen.get(p[0]) ?? GEEN_BEOORDELING).niveau;
      const { niveau, militair: isMilitair } = beoordelingen.get(p[0]) ?? GEEN_BEOORDELING;
      perNiveau[niveau]++;
      if (niveau >= 2) verdacht.push(p);
      if (isMilitair) militair.push(p);
    }
    //! militair: eerst die in de lucht, dan het hoogste niveau
    militair.sort(
      (a, b) =>
        Number(a[8]) - Number(b[8]) ||
        (beoordelingen.get(b[0]) ?? GEEN_BEOORDELING).niveau - (beoordelingen.get(a[0]) ?? GEEN_BEOORDELING).niveau,
    );
    //! de meest verdachte vliegtuigen bovenaan, bij gelijk aantal redenen de laagste eerst
    verdacht.sort(
      (a, b) =>
        (beoordelingen.get(b[0]) ?? GEEN_BEOORDELING).niveau - (beoordelingen.get(a[0]) ?? GEEN_BEOORDELING).niveau ||
        (a[13] ?? 1e9) - (b[13] ?? 1e9),
    );
    // OUD: return { inDeLucht, perNiveau, verdachtst: verdacht.slice(0, 8) };
    return { inDeLucht, perNiveau, verdachtst: verdacht.slice(0, 8), militair };
  }, [planes, beoordelingen]);

  return (
    // OUD: <aside className="flex flex-col gap-5 border-slate-800 bg-slate-950 p-5 text-slate-200 md:h-full md:w-80 md:shrink-0 md:overflow-y-auto md:border-r">
    //! radar-scroll: de scrollbalk in de stijl van de radar (index.css)
    <aside className="radar-scroll flex flex-col gap-5 border-slate-800 bg-slate-950 p-5 text-slate-200 md:h-full md:w-80 md:shrink-0 md:overflow-y-auto md:border-r">
      {/* titel met een radarstraal die rustig rondgaat */}
      <header className="flex items-center gap-3">
        <div className="radar relative h-11 w-11 shrink-0 rounded-full border border-emerald-500/50" aria-hidden="true">
          <span className="absolute inset-[30%] rounded-full border border-emerald-500/30" />
          <span className="radar-straal absolute inset-0 rounded-full" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Vliegtuigradar</h1>
          <p className="text-xs text-slate-400">
            {/* OUD: Live luchtruim · {straal} km {rondNederland ? "rond Nederland" : "rond eigen punt"} */}
            Live luchtruim · {wereld ? "hele wereld" : `${straal} km ${rondNederland ? "rond Nederland" : "rond eigen punt"}`}
          </p>
        </div>
      </header>

      {/* live status */}
      {/* OUD: twee tellers (grid-cols-2, p-3), sinds militair drie */}
      <section className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">In de lucht</p>
          {/* OUD: {inDeLucht.length} (inDeLucht was een lijst, nu een aantal) */}
          <p className="font-mono text-2xl font-bold text-white">{inDeLucht}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Verdacht</p>
          <p className="font-mono text-2xl font-bold text-amber-400">{planes.length - perNiveau[0]}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2">
          <p className="text-[10px] uppercase tracking-wider text-slate-400">Militair</p>
          <p className="font-mono text-2xl font-bold text-slate-100">{militair.length}</p>
        </div>
        {/* OUD: col-span-2 */}
        <p className="col-span-3 flex items-center gap-2 text-xs text-slate-400">
          <span className={`h-2 w-2 rounded-full ${verbonden ? "bg-emerald-400 live" : "bg-red-500"}`} />
          {bezig ? "Nieuw gebied laden…" : verbonden ? "Live" : "Geen verbinding"}
          {laatsteUpdate && !bezig && <span className="font-mono">· {laatsteUpdate.toLocaleTimeString("nl-NL")}</span>}
        </p>
      </section>

      {/* bereik: een straal rond nederland, of rond het midden van de kaart */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bereik</h2>
          {/* OUD: <span className="font-mono text-sm text-white">{straal} km</span> */}
          <span className="font-mono text-sm text-white">{wereld ? "hele wereld" : `${straal} km`}</span>
        </div>
        {/* OUD: max={1000} */}
        <input
          type="range"
          min={25}
          max={maxKm}
          step={25}
          value={straal}
          onChange={(e) => setStraal(Number(e.target.value))}
          aria-label="Straal in kilometer"
          // OUD: className="w-full accent-emerald-400"
          //! bij de hele wereld wat lichter: de straal geldt dan niet, schuiven maakt er weer een cirkel van
          className={`w-full accent-emerald-400 ${wereld ? "opacity-40" : ""}`}
        />
        {/* OUD: <span>25</span> <span>500</span> <span>1000 km</span> */}
        <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
          <span>25</span>
          <span>{maxKm / 2}</span>
          <span>{maxKm} km</span>
        </div>
        {/* OUD: Rond … · elke {seconden} s ververst (hoe vaak staat nu bij Verversen) */}
        {/* OUD: <p className="mt-2 text-xs text-slate-400">Rond {rondNederland ? "het midden van Nederland" : "een eigen punt"}</p> */}
        <p className="mt-2 text-xs text-slate-400">
          {wereld ? "Alle vliegtuigen op aarde die OpenSky nu ziet" : `Rond ${rondNederland ? "het midden van Nederland" : "een eigen punt"}`}
        </p>
        {/* hoe je de cirkel verplaatst (GebiedCirkel.tsx) */}
        {/* OUD: Dubbelklik op de rand van de cirkel om hem te verslepen. */}
        <p className="mt-1 text-[11px] text-slate-500">
          Dubbelklik op de rand van de cirkel. Sleep daarna de rand voor de straal, of binnenin om hem te verplaatsen.
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={gebruikKaartMidden}
            className="flex-1 rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-200 transition hover:bg-slate-900"
          >
            Midden van de kaart
          </button>
          {!rondNederland && (
            <button
              onClick={terugNaarNederland}
              className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-200 transition hover:bg-slate-900"
            >
              Nederland
            </button>
          )}
        </div>
        {/* alle vliegtuigen op aarde. alleen OpenSky kan dat (zonder vak: 4 tegoed per keer), adsb.lol gaat tot 450 km */}
        <button
          onClick={() => kiesWereld(!wereld)}
          aria-pressed={wereld}
          title="Alle vliegtuigen op aarde die OpenSky nu ziet. Kost 4 tegoed per verversing."
          className={`mt-2 w-full rounded-md border px-2 py-1.5 text-xs transition ${
            wereld ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-300" : "border-slate-700 text-slate-200 hover:bg-slate-900"
          }`}
        >
          Hele wereld
        </button>
        {wereld && (
          <p className="mt-1 text-[11px] text-slate-500">
            Duizenden vliegtuigen tegelijk. Kost 4 tegoed per verversing, dus OpenSky ververst minder vaak. Schuif de straal voor weer een cirkel.
          </p>
        )}
      </section>

      {/* bron: waar de posities vandaan komen. opensky is de standaard, adsb.lol is gratis en sneller maar gaat maar tot 450 km */}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Bron</h2>
        <div role="group" aria-label="Bron van de posities" className="grid grid-cols-2 gap-1 rounded-md border border-slate-800 bg-slate-900 p-1">
          {BRONNEN.map(({ bron: b, naam, uitleg }) => {
            const aan = bron === b;
            return (
              <button
                key={b}
                onClick={() => kiesBron(b)}
                aria-pressed={aan}
                title={uitleg}
                className={`rounded px-2 py-1.5 text-xs font-medium transition ${aan ? "bg-slate-700 text-white ring-1 ring-slate-500" : "text-slate-300 hover:bg-slate-800"}`}
              >
                {naam}
              </button>
            );
          })}
        </div>
        {bronMelding && <p className="mt-2 text-xs text-amber-400">{bronMelding}</p>}
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          {adsb
            ? "Geen tegoed nodig en posities van vaak minder dan een seconde oud. Tot 450 km, zonder land van herkomst."
            // OUD: : "Met tegoed, tot 1000 km. adsb.lol is gratis en sneller, maar gaat tot 450 km."}
            : "Met tegoed, tot 3000 km of de hele wereld. adsb.lol is gratis en sneller, maar gaat tot 450 km."}
        </p>
      </section>

      {/* verversen: hoe vaak de server nieuwe posities ophaalt. tussendoor vliegen de vliegtuigen door op hun snelheid en koers */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Verversen</h2>
          <span className="font-mono text-sm text-white">elke {seconden} s</span>
        </div>
        <div role="group" aria-label="Hoe vaak verversen" className="grid grid-cols-3 gap-1 rounded-md border border-slate-800 bg-slate-900 p-1">
          {STANDEN.map(({ stand, naam, uitleg }) => {
            const aan = verversing.stand === stand;
            const s = verversing.standen[stand];
            return (
              <button
                key={stand}
                onClick={() => kiesStand(stand)}
                aria-pressed={aan}
                // OUD: title={uitleg}
                title={adsb ? ADSB_UITLEG[stand] : uitleg}
                className={`rounded px-2 py-1.5 text-xs transition ${aan ? "bg-slate-700 text-white ring-1 ring-slate-500" : "text-slate-300 hover:bg-slate-800"}`}
              >
                <span className="block font-medium">{naam}</span>
                {/* de seconden van deze stand voor dit gebied, uitgerekend door de server */}
                {s !== undefined && <span className="block font-mono text-[10px] text-slate-400">{s} s</span>}
              </button>
            );
          })}
        </div>
        {tegoed?.bron === "nep" ? (
          <p className="mt-2 text-xs text-slate-400">Nep-bron: geen OpenSky-tegoed.</p>
        ) : tegoed?.bron === "adsblol" ? (
          <p className="mt-2 text-xs text-slate-400">adsb.lol: geen tegoed nodig.</p>
        ) : tegoed?.pauzeTot ? (
          //! tegoed op: de server wacht tot OpenSky weer mag, de laatste vliegtuigen blijven staan
          <p className="mt-2 text-xs text-red-400">
            Tegoed op. Weer nieuwe posities om{" "}
            {new Date(tegoed.pauzeTot).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}, tot dan blijven de laatste staan.
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-400">
            {verversing.perUur} tegoed per uur · nog {tegoed?.over ?? "onbekend"}
            {typeof tegoed?.over === "number" && duurTekst(tegoed.over, verversing.perUur) ? ` (${duurTekst(tegoed.over, verversing.perUur)})` : ""}
          </p>
        )}
        {/* OUD: {tegoed && tegoed.bron !== "nep" && ( */}
        {tegoed && tegoed.bron === "opensky" && (
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            {tegoed.account
              ? "Met OpenSky-account: 4.000 tegoed per dag, elke 5 s nieuwe data."
              : "Zonder account: 400 tegoed per dag. Met een gratis OpenSky-account 10× zoveel en elke 5 s nieuwe data (zie .env.example)."}
          </p>
        )}
      </section>

      {/* sporen: de laatste minuut achter elk vliegtuig (fase 4 van het tweede plan) */}
      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sporen</h2>
          <button
            onClick={() => kiesSporen(!sporen)}
            aria-pressed={sporen}
            className={`rounded px-2 py-0.5 text-xs transition ${sporen ? "bg-slate-700 text-white ring-1 ring-slate-500" : "text-slate-300 hover:bg-slate-800"}`}
          >
            {sporen ? "Aan" : "Uit"}
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          De laatste minuut achter elk vliegtuig, vanaf zoom 8. Achter het gekozen vliegtuig altijd.
        </p>
      </section>

      {/* tellers per niveau, meteen ook het filter */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Dreigingsniveau</h2>
          {filter !== null && (
            <button onClick={() => setFilter(null)} className="text-xs text-emerald-400 hover:underline">
              Toon alles
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {NIVEAUS.map(({ niveau, naam, kleur }) => (
            <li key={niveau}>
              <button
                onClick={() => setFilter(filter === niveau ? null : niveau)}
                aria-pressed={filter === niveau}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition
                  ${filter === niveau ? "bg-slate-800 ring-1 ring-slate-600" : "hover:bg-slate-900"}
                  ${filter !== null && filter !== niveau ? "opacity-50" : ""}`}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: kleur }} />
                <span className="flex-1">{naam}</span>
                <span className="font-mono text-slate-300">{perNiveau[niveau]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* militair: los van het dreigingsniveau. de knop is een filter (samen met een niveau te gebruiken), de lijst om erheen te gaan.
          de herkenning komt uit de database van adsb.lol: een militair toestel dat daar niet in staat, ziet de radar niet als militair */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Militair</h2>
          <button
            onClick={() => setAlleenMilitair(!alleenMilitair)}
            aria-pressed={alleenMilitair}
            className={`rounded px-2 py-0.5 text-xs transition ${alleenMilitair ? "bg-slate-700 text-white ring-1 ring-slate-500" : "text-emerald-400 hover:underline"}`}
          >
            Alleen militair
          </button>
        </div>
        {militair.length === 0 ? (
          <p className="text-sm text-slate-500">Geen bekend militair toestel in dit gebied.</p>
        ) : (
          <ul className="space-y-1">
            {militair.slice(0, MAX_MILITAIR).map((p) => {
              const { niveau } = beoordeling(p);
              const extra = extraVan(p);
              return (
                <li key={p[0]}>
                  <button
                    onClick={() => kies(p[0])}
                    className={`w-full rounded-md border px-3 py-1.5 text-left transition hover:bg-slate-900
                      ${gekozenId === p[0] ? "border-slate-600 bg-slate-900" : "border-transparent"}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: kleurVan(niveau) }} />
                        <span className="font-mono text-sm font-semibold text-white">{callsignVan(p)}</span>
                      </span>
                      <span className="truncate font-mono text-xs text-slate-400">
                        {[extra?.type, extra?.registratie].filter(Boolean).join(" · ")}
                        {p[8] ? " · grond" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {militair.length > MAX_MILITAIR && <p className="mt-1 text-[11px] text-slate-500">en nog {militair.length - MAX_MILITAIR}</p>}
      </section>

      {/* de meest verdachte vliegtuigen, klik om erheen te gaan. de lijst scrollt zelf */}
      {/* OUD: <section className="min-h-[12rem] flex-1 overflow-y-auto pr-1"> */}
      <section className="radar-scroll min-h-[12rem] flex-1 overflow-y-auto pr-1">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Meest verdacht</h2>
        {verdachtst.length === 0 ? (
          <p className="text-sm text-slate-500">Nu niets opvallends.</p>
        ) : (
          <ul className="space-y-1">
            {verdachtst.map((p) => {
              // OUD: const niveau = niveauVan(p);
              const { niveau, redenen } = beoordeling(p);
              return (
                <li key={p[0]}>
                  <button
                    onClick={() => kies(p[0])}
                    className={`w-full rounded-md border px-3 py-2 text-left transition hover:bg-slate-900
                      ${gekozenId === p[0] ? "border-slate-600 bg-slate-900" : "border-transparent"}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="font-mono text-sm font-semibold text-white">{callsignVan(p)}</span>
                      <span className="font-mono text-xs" style={{ color: kleurVan(niveau) }}>
                        {/* OUD: {getSuspicionReasons(p).length} redenen */}
                        {redenen.length} redenen
                      </span>
                    </span>
                    {/* OUD: {getSuspicionReasons(p).join(" · ")} */}
                    <span className="block truncate text-xs text-slate-400">{redenen.join(" · ")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* OUD: Live posities van het OpenSky Network. Hoe groter het bereik, hoe minder vaak er ververst wordt: zonder account
          is er per dag een beperkt tegoed. "Verdacht" is een eigen inschatting op basis van snelheid, hoogte, koers,
          transponder en noodsignaal. */}
      {/* OUD: Live posities van het OpenSky Network. Tussen twee verversingen door … (zonder adsb.lol) */}
      <p className="shrink-0 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
        {adsb
          ? "Live posities van adsb.lol (open data, ODbL). "
          : "Live posities van het OpenSky Network. Een groter bereik kost per keer meer tegoed en ververst daarom minder vaak. "}
        Tussen twee verversingen door vliegen de vliegtuigen op hun snelheid en koers verder. "Verdacht" is een eigen
        inschatting op basis van snelheid, hoogte, koers, transponder en noodsignaal. "Militair" (de deltavorm op de kaart) komt
        uit de database van adsb.lol en staat daar los van.
      </p>
    </aside>
  );
};

export default StatusPanel;
