import { useEffect, useState } from "react";
import { meting } from "../../utils/meting";

type Props = {
  aantal: number; //! hoeveel vliegtuigen er in het laatste pakket zaten
  laatsteUpdate: Date | null; //! verandert bij elk nieuw pakket
};

//! meter rechtsboven (alleen met ?meten): fps, het traagste beeld en hoe vaak de dreigingsregels per pakket draaien.
//! de meter heeft eigen state, dus hij laat de rest van de app niet opnieuw renderen en verstoort de meting niet
const Meter = ({ aantal, laatsteUpdate }: Props) => {
  const [fps, setFps] = useState(0);
  const [laagste, setLaagste] = useState(0); //! laagste fps van de laatste 10 seconden
  const [traagst, setTraagst] = useState(0); //! traagste beeld van de laatste 10 seconden, in ms
  //! aanroepen van de dreigingsregels sinds het laatste pakket, plus het nummer van dat pakket (zodat je ziet dat het een nieuwe meting is)
  const [pakket, setPakket] = useState<{ aanroepen: number; nr: number } | null>(null);
  const perPakket = pakket ? pakket.aanroepen : null;
  //! de canvaslaag: langste tekenbeurt van de laatste 10 s, tekenbeurten per seconde en hoeveel vliegtuigen er getekend zijn
  // OUD: const [tekenen, setTekenen] = useState({ maxMs: 0, pulsMs: 0, perSeconde: 0, zichtbaar: 0, totaal: 0 });
  //! plus het gegist bestek: hoe ver de voorspelling ernaast zat bij het laatste pakket, en hoe snel het snelste zichtbare vliegtuig gaat
  const [tekenen, setTekenen] = useState({
    maxMs: 0,
    pulsMs: 0,
    perSeconde: 0,
    zichtbaar: 0,
    totaal: 0,
    verouderd: 0,
    snelstePx: 0,
    correctieMediaan: 0,
    correctieP95: 0,
    correctieMax: 0,
    correctieZoom: 0,
    gesnapt: 0,
  });

  //! tel de beeldjes: elke seconde een fps, en onthoud per seconde ook het traagste beeld
  useEffect(() => {
    let raf = 0;
    let vorige = performance.now();
    let begin = vorige;
    let beelden = 0;
    let traagsteBeeld = 0;
    const fpsLijst: number[] = [];
    const traagLijst: number[] = [];
    const tekenLijst: number[] = []; //! langste tekenbeurt per seconde
    const pulsLijst: number[] = [];
    const lus = (nu: number) => {
      beelden++;
      traagsteBeeld = Math.max(traagsteBeeld, nu - vorige);
      vorige = nu;
      if (nu - begin >= 1000) {
        fpsLijst.push((beelden * 1000) / (nu - begin));
        traagLijst.push(traagsteBeeld);
        if (fpsLijst.length > 10) {
          fpsLijst.shift();
          traagLijst.shift();
        }
        setFps(Math.round(fpsLijst[fpsLijst.length - 1]));
        setLaagste(Math.round(Math.min(...fpsLijst)));
        setTraagst(Math.round(Math.max(...traagLijst)));
        //! tellers van de canvaslaag uitlezen en terugzetten, zodat elke seconde een eigen meting is
        tekenLijst.push(meting.tekenMsMax);
        pulsLijst.push(meting.pulsMsMax);
        if (tekenLijst.length > 10) {
          tekenLijst.shift();
          pulsLijst.shift();
        }
        setTekenen({
          maxMs: Math.max(...tekenLijst),
          pulsMs: Math.max(...pulsLijst),
          perSeconde: meting.hertekend,
          zichtbaar: meting.zichtbaar,
          totaal: meting.totaal,
          verouderd: meting.verouderd,
          snelstePx: meting.snelstePx,
          correctieMediaan: meting.correctieMediaanPx,
          correctieP95: meting.correctieP95Px,
          correctieMax: meting.correctieMaxPx,
          correctieZoom: meting.correctieZoom,
          gesnapt: meting.gesnapt,
        });
        meting.tekenMsMax = 0;
        meting.pulsMsMax = 0;
        meting.hertekend = 0;
        beelden = 0;
        traagsteBeeld = 0;
        begin = nu;
      }
      raf = requestAnimationFrame(lus);
    };
    raf = requestAnimationFrame(lus);
    return () => cancelAnimationFrame(raf);
  }, []);

  //! 2 seconden na een pakket (dan is alles opnieuw getekend) lezen we hoe vaak de dreigingsregels sinds dat pakket draaiden
  useEffect(() => {
    if (!laatsteUpdate) return;
    const wacht = setTimeout(
      () => setPakket((vorig) => ({ aanroepen: meting.redenenAanroepen - meting.pakketStart, nr: (vorig?.nr ?? 0) + 1 })),
      2000,
    );
    return () => clearTimeout(wacht);
  }, [laatsteUpdate]);

  //! voor geautomatiseerd meten: dezelfde cijfers ook als window.__meting
  useEffect(() => {
    (window as any).__meting = { fps, laagste, traagst, aantal, perPakket, pakketNr: pakket?.nr ?? 0, tekenen };
    (window as any).__teller = meting; //! de ruwe tellers, voor het meetscript
  }, [fps, laagste, traagst, aantal, perPakket, pakket, tekenen]);

  const perVliegtuig = perPakket !== null && aantal > 0 ? (perPakket / aantal).toFixed(1) : "–";
  //! vite-env.d.ts heeft de vite-types niet, daarom de cast. true in de dev-server, false in een build
  const isDev = Boolean((import.meta as any).env?.DEV);

  return (
    <div className="pointer-events-none fixed right-2 top-2 z-[2000] rounded border border-emerald-500/40 bg-slate-950/85 px-2 py-1 font-mono text-[11px] leading-snug text-emerald-300">
      <p>
        fps {fps} · laagste {laagste} · traagste beeld {traagst} ms
      </p>
      <p>vliegtuigen {aantal}</p>
      {/* in de dev-server draait React alles twee keer (StrictMode), in een build niet */}
      <p>
        regels per pakket {perPakket ?? "–"} ({perVliegtuig} per vliegtuig{isDev ? ", dev: x2 door StrictMode" : ""})
      </p>
      {/* canvaslaag: zichtbaar = getekend, de rest viel buiten beeld (frustum culling) of door het filter */}
      <p>
        tekenen max {tekenen.maxMs.toFixed(1)} ms · {tekenen.perSeconde}×/s · pulsen max {tekenen.pulsMs.toFixed(1)} ms
      </p>
      <p>
        zichtbaar {tekenen.zichtbaar} van {tekenen.totaal}
        {tekenen.verouderd > 0 ? ` · ${tekenen.verouderd} zonder nieuwe positie` : ""} · snelste {tekenen.snelstePx.toFixed(1)} px/s
      </p>
      {/* gegist bestek: zonder het uitdoven was dit de sprong bij het laatste pakket. rechtdoor vliegen hoort ±0 te geven */}
      <p>
        correctie mediaan {tekenen.correctieMediaan.toFixed(1)} · p95 {tekenen.correctieP95.toFixed(1)} · max {tekenen.correctieMax.toFixed(1)} px (zoom{" "}
        {tekenen.correctieZoom}){tekenen.gesnapt > 0 ? ` · ${tekenen.gesnapt} meteen goed gezet` : ""}
      </p>
    </div>
  );
};

export default Meter;
