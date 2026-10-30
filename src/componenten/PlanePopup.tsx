// OUD: import { getSpeedInKmH, getSuspicionReasons } from "../../utils/planeUtils";
// OUD: import { callsignVan, kleurVan, niveauVan } from "../dreiging";
import { getSpeedInKmH } from "../../utils/planeUtils";
import { callsignVan, kleurVan, type Beoordeling } from "../dreiging";

//! waarde netjes tonen, of een streepje als opensky niets weet
const of = (waarde: number | null | undefined, maak: (w: number) => string) =>
  typeof waarde === "number" ? maak(waarde) : "–";

//! de beoordeling (redenen en niveau) komt van App, dus de popup rekent de regels niet nog een keer uit
const PlanePopup = ({ plane, beoordeling }: { plane: any; beoordeling: Beoordeling }) => {
  // OUD: const redenen = getSuspicionReasons(plane);
  // OUD: const kleur = kleurVan(niveauVan(plane));
  const { redenen, niveau } = beoordeling;
  const kleur = kleurVan(niveau);
  const hoogte = plane[13] ?? plane[7]; // geo-hoogte, anders barometrisch
  const koers = plane[10];
  const stijging = plane[11];

  return (
    <div className="w-64 font-sans">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-lg font-bold tracking-wide text-white">{callsignVan(plane)}</p>
          <p className="text-xs text-slate-400">
            {plane[2]} · ICAO {plane[0]}
          </p>
        </div>
        <span
          className="mt-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-950"
          style={{ background: kleur }}
        >
          {plane[8] ? "grond" : "lucht"}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-700 pt-3 text-xs">
        <div>
          <dt className="text-slate-400">Hoogte</dt>
          <dd className="font-mono text-sm text-white">{of(hoogte, (m) => `${Math.round(m).toLocaleString("nl-NL")} m`)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Snelheid</dt>
          <dd className="font-mono text-sm text-white">{of(plane[9], (v) => `${Math.round(getSpeedInKmH(v))} km/u`)}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Koers</dt>
          <dd className="flex items-center gap-1 font-mono text-sm text-white">
            {typeof koers === "number" && (
              <span className="inline-block" style={{ transform: `rotate(${koers}deg)` }}>↑</span>
            )}
            {of(koers, (k) => `${Math.round(k)}°`)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Verticaal</dt>
          <dd className="font-mono text-sm text-white">
            {of(stijging, (s) => `${s > 0 ? "↑" : s < 0 ? "↓" : ""} ${Math.abs(s).toFixed(1)} m/s`)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Squawk</dt>
          <dd className="font-mono text-sm text-white">{plane[14] || "–"}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Noodsignaal</dt>
          <dd className={`font-mono text-sm ${plane[15] ? "text-red-400" : "text-white"}`}>{plane[15] ? "JA" : "nee"}</dd>
        </div>
      </dl>

      {redenen.length > 0 && (
        <div className="mt-3 border-t border-slate-700 pt-3">
          <p className="mb-1.5 text-xs text-slate-400">Verdacht gedrag</p>
          <ul className="flex flex-wrap gap-1.5">
            {redenen.map((reden) => (
              <li
                key={reden}
                className="rounded border px-1.5 py-0.5 text-[11px]"
                style={{ borderColor: kleur, color: kleur }}
              >
                {reden}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PlanePopup;
