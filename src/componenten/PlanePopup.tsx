// OUD: import { getSpeedInKmH, getSuspicionReasons } from "../../utils/planeUtils";
// OUD: import { callsignVan, kleurVan, niveauVan } from "../dreiging";
import { getSpeedInKmH } from "../../utils/planeUtils";
// OUD: import { callsignVan, kleurVan, type Beoordeling } from "../dreiging";
import { callsignVan, extraVan, kleurVan, type Beoordeling } from "../dreiging";
import type { Vlucht } from "../verversen";

//! waarde netjes tonen, of een streepje als opensky niets weet
const of = (waarde: number | null | undefined, maak: (w: number) => string) =>
  typeof waarde === "number" ? maak(waarde) : "–";

//! de regel over de afgelegde route: laden, wat er misging, of waar de lijn vandaan komt en sinds wanneer
const routeTekst = (vlucht: Vlucht | null) => {
  if (!vlucht || vlucht.status === "laden") return "Afgelegde route laden…";
  if (vlucht.status === "fout") return vlucht.melding ?? "Geen route.";
  const sinds = vlucht.van ? new Date(vlucht.van * 1000).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" }) : null;
  if (vlucht.bron === "opensky") return `Afgelegde route${sinds ? ` sinds ${sinds}` : ""} (hele vlucht, OpenSky)`;
  if (vlucht.bron === "radar") return `Afgelegde route${sinds ? ` sinds ${sinds}` : ""} (sinds de radar hem ziet)`;
  return `Afgelegde route (nep), ${vlucht.punten?.length ?? 0} punten`;
};

//! de beoordeling (redenen en niveau) komt van App, dus de popup rekent de regels niet nog een keer uit
// OUD: const PlanePopup = ({ plane, beoordeling }: { plane: any; beoordeling: Beoordeling }) => {
//! vlucht: de hele vlucht van dit vliegtuig als die gevraagd is (knop onderaan, alleen met een OpenSky-account: kanVlucht)
const PlanePopup = ({
  plane,
  beoordeling,
  vlucht = null,
  kanVlucht = false,
  onVlucht,
}: {
  plane: any;
  beoordeling: Beoordeling;
  vlucht?: Vlucht | null;
  kanVlucht?: boolean;
  onVlucht?: (id: string) => void;
}) => {
  // OUD: const redenen = getSuspicionReasons(plane);
  // OUD: const kleur = kleurVan(niveauVan(plane));
  const { redenen, niveau } = beoordeling;
  const kleur = kleurVan(niveau);
  const hoogte = plane[13] ?? plane[7]; // geo-hoogte, anders barometrisch
  const koers = plane[10];
  const stijging = plane[11];
  //! adsb.lol kent geen land van herkomst, wel het type en de registratie (index 17, gevuld door de server)
  // OUD: const extra = plane[17] && typeof plane[17] === "object" ? plane[17] : null;
  // OUD: const herkomst = plane[2] || [extra?.type, extra?.registratie].filter(Boolean).join(" · ") || "Onbekend";
  //! sinds de militaire lijst kan een opensky-vliegtuig ook een type en registratie hebben: dan staat alles naast elkaar
  const extra = extraVan(plane);
  const herkomst = [plane[2], extra?.type, extra?.registratie].filter(Boolean).join(" · ") || "Onbekend";

  return (
    <div className="w-64 font-sans">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-lg font-bold tracking-wide text-white">{callsignVan(plane)}</p>
          <p className="text-xs text-slate-400">
            {/* OUD: {plane[2]} · ICAO {plane[0]} */}
            {herkomst} · ICAO {plane[0]}
          </p>
        </div>
        <span className="mt-1 flex shrink-0 gap-1">
          {/* militair: uit de database van adsb.lol, los van het dreigingsniveau */}
          {beoordeling.militair && (
            <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-100">
              militair
            </span>
          )}
          <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-950" style={{ background: kleur }}>
            {plane[8] ? "grond" : "lucht"}
          </span>
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

      {/* OUD: de knop "Hele vlucht" (alleen met een OpenSky-account): pas na een klik een lijn. nu komt de route vanzelf bij het kiezen */}
      {/* de afgelegde route: een gestippelde lijn op de kaart, opgevraagd zodra je het vliegtuig kiest. hier staat waar hij vandaan komt */}
      {kanVlucht && onVlucht && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-700 pt-3 text-xs">
          <span className="flex items-center gap-2 text-slate-400">
            <span className="inline-block w-5 border-t border-dashed border-slate-300" aria-hidden="true" />
            {routeTekst(vlucht)}
          </span>
          {vlucht?.status === "fout" && (
            <button
              onClick={() => onVlucht(plane[0])}
              className="shrink-0 rounded border border-slate-600 px-2 py-0.5 text-slate-100 transition hover:bg-slate-800"
            >
              Opnieuw
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default PlanePopup;
