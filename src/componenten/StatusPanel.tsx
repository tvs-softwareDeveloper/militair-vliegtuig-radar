import { getSuspicionReasons } from "../../utils/planeUtils";
import { callsignVan, kleurVan, Niveau, NIVEAUS, niveauVan } from "../dreiging";

type Props = {
  planes: any[]; //! alle vliegtuigen, ook die door het filter niet op de kaart staan
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
  seconden: number; //! hoe vaak de server ververst
  bezig: boolean;
};

const StatusPanel = ({
  planes,
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
  seconden,
  bezig,
}: Props) => {
  const inDeLucht = planes.filter((p) => !p[8]);
  const perNiveau = NIVEAUS.map(({ niveau }) => planes.filter((p) => niveauVan(p) === niveau).length);

  //! de meest verdachte vliegtuigen bovenaan, bij gelijk aantal redenen de laagste eerst
  const verdachtst = planes
    .filter((p) => niveauVan(p) >= 2)
    .sort((a, b) => niveauVan(b) - niveauVan(a) || (a[13] ?? 1e9) - (b[13] ?? 1e9))
    .slice(0, 8);

  return (
    <aside className="flex flex-col gap-5 border-slate-800 bg-slate-950 p-5 text-slate-200 md:h-full md:w-80 md:shrink-0 md:overflow-y-auto md:border-r">
      {/* titel met een radarstraal die rustig rondgaat */}
      <header className="flex items-center gap-3">
        <div className="radar relative h-11 w-11 shrink-0 rounded-full border border-emerald-500/50" aria-hidden="true">
          <span className="absolute inset-[30%] rounded-full border border-emerald-500/30" />
          <span className="radar-straal absolute inset-0 rounded-full" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Vliegtuigradar</h1>
          <p className="text-xs text-slate-400">
            Live luchtruim · {straal} km {rondNederland ? "rond Nederland" : "rond eigen punt"}
          </p>
        </div>
      </header>

      {/* live status */}
      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">In de lucht</p>
          <p className="font-mono text-2xl font-bold text-white">{inDeLucht.length}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className="text-[11px] uppercase tracking-wider text-slate-400">Verdacht</p>
          <p className="font-mono text-2xl font-bold text-amber-400">{planes.length - perNiveau[0]}</p>
        </div>
        <p className="col-span-2 flex items-center gap-2 text-xs text-slate-400">
          <span className={`h-2 w-2 rounded-full ${verbonden ? "bg-emerald-400 live" : "bg-red-500"}`} />
          {bezig ? "Nieuw gebied laden…" : verbonden ? "Live" : "Geen verbinding"}
          {laatsteUpdate && !bezig && <span className="font-mono">· {laatsteUpdate.toLocaleTimeString("nl-NL")}</span>}
        </p>
      </section>

      {/* bereik: een straal rond nederland, of rond het midden van de kaart */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Bereik</h2>
          <span className="font-mono text-sm text-white">{straal} km</span>
        </div>
        <input
          type="range"
          min={25}
          max={1000}
          step={25}
          value={straal}
          onChange={(e) => setStraal(Number(e.target.value))}
          aria-label="Straal in kilometer"
          className="w-full accent-emerald-400"
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
          <span>25</span>
          <span>500</span>
          <span>1000 km</span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Rond {rondNederland ? "het midden van Nederland" : "een eigen punt"} · elke {seconden} s ververst
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

      {/* de meest verdachte vliegtuigen, klik om erheen te gaan. de lijst scrollt zelf */}
      <section className="min-h-[12rem] flex-1 overflow-y-auto pr-1">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Meest verdacht</h2>
        {verdachtst.length === 0 ? (
          <p className="text-sm text-slate-500">Nu niets opvallends.</p>
        ) : (
          <ul className="space-y-1">
            {verdachtst.map((p) => {
              const niveau = niveauVan(p);
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
                        {getSuspicionReasons(p).length} redenen
                      </span>
                    </span>
                    <span className="block truncate text-xs text-slate-400">{getSuspicionReasons(p).join(" · ")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="shrink-0 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-500">
        Live posities van het OpenSky Network. Hoe groter het bereik, hoe minder vaak er ververst wordt: zonder account
        is er per dag een beperkt tegoed. "Verdacht" is een eigen inschatting op basis van snelheid, hoogte, koers,
        transponder en noodsignaal.
      </p>
    </aside>
  );
};

export default StatusPanel;
