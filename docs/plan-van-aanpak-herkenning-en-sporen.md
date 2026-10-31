# Plan van aanpak: militaire herkenning, bochten, straal en sporen

**Vier uitbreidingen op de live kaart**

- Datum: 31-10-2026 (persoonlijke laptop)
- Stand van de code: `main` (`2d32933`) plus de niet-gecommitte fase 6 en 7 en de twee bugfixes van 31-10 (zie `plan-van-aanpak-live-kaart.md`)
- Status: alle fasen af (31-10-2026). Nog bij Tristan: M14 (telefoon) en committen
- Tristan commit en pusht zelf. Claude doet dat nooit.

---

## 1. Wat je vroeg

1. **Echte militaire herkenning.** adsb.lol weet uit zijn database of een toestel militair is. De server bewaart dat sinds fase 6 al per vliegtuig, maar de app doet er nog niets mee.
2. **Bochten voorspellen**, met `track_rate` van adsb.lol, of geschat uit twee OpenSky-pakketten. Dan worden de correcties in bochten kleiner.
3. **De straal aanpassen** door aan de rand van de cirkel te slepen.
4. **Een spoor achter elk vliegtuig.**

---

## 2. Wat ik vond

### 2.1 Militaire herkenning

- **Wat de vlag betekent:** adsb.lol draait op readsb. Volgens de README van readsb (`README-json.md`) is `dbFlags` een bitveld. `& 1` is militair, `& 2` "interesting", `& 4` PIA en `& 8` LADD (twee privacyprogramma's in de VS). De vlag komt uit hun **database** van bekende toestellen. Een militair toestel dat daar niet in staat, wordt dus niet herkend.
- **Live gemeten (31-10-2026, ±17:45):**
  - Rond Nederland (450 km) ziet adsb.lol 506 vliegtuigen, waarvan 3 militair: GAF933 (A350, Luftwaffe), GAF721 (A321neo, Luftwaffe) en RCH647 (C-17, USAF). Er hadden er ook 7 de LADD-vlag.
  - `/v2/mil` geeft alle militaire toestellen wereldwijd in één antwoord (43 KB). Nu waren dat er 118, waarvan 53 met een positie en 9 boven Noordwest-Europa. Eerder op de dag (30-10) waren het er 199.
- **Wat er al is:** sinds fase 6 zet de server bij adsb.lol-vliegtuigen op index 17 een object `{ bron, type, registratie, militair, nood }`. Bij OpenSky ontbreekt dat. OpenSky kent geen militaire vlag.
- **Hoe OpenSky het toch kan weten:** de server haalt bijvoorbeeld elke minuut `/v2/mil` op en markeert OpenSky-vliegtuigen met hetzelfde ICAO-adres (hex). Dat is één aanvraag per minuut, zonder OpenSky-tegoed, en hij werkt voor alle kijkers tegelijk.
- **Tekenen:** de canvaslaag tekent uit een atlas met 5 niveaus × 72 hoeken (fase 2). Een eigen vorm voor militair maakt die atlas twee keer zo groot. Tekenen blijft dan één kopie per vliegtuig, dus het kost bijna niets extra.
- **Het paneel** telt nu "In de lucht" en "Verdacht". Militair is iets anders dan verdacht: een tankvliegtuig van de luchtmacht met transponder en callsign is niet verdacht, maar wel waar de radar om draait.

### 2.2 Bochten voorspellen

- **Nu:** het gegist bestek (fase 3) rekent rechtdoor. In een bocht staat het vliegtuig bij het volgende pakket naast zijn voorspelling, en dat verschil dooft uit in 1,5 s.
  - Gemeten in fase 3, met een pakket per 30 s op zoom 10: p95 36 px, max 61 px. Bij een pakket per 10 s was dat p95 4 px.
  - Bij Snel met een account (5 s) en bij adsb.lol (2-15 s) is het al klein. Bij Zuinig en grote gebieden (60-120 s) valt het op.
- **adsb.lol:** `track_rate` (graden per seconde, readsb-documentatie) stond nu bij 357 van de 506 vliegtuigen (70 %). Bij militaire toestellen bij 15 van de 118.
- **OpenSky:** heeft geen draaisnelheid. Die is te schatten uit de koers in twee opeenvolgende pakketten: (koers₂ − koers₁) / (tijd₂ − tijd₁). Dat kan alleen als dezelfde vliegtuigen in beide pakketten zitten en de tijd ertussen niet te lang is.
- **Risico:** een vliegtuig dat net uit de bocht komt, blijft in de voorspelling doordraaien. Twee dingen beperken dat:
  - de draaisnelheid laten uitdoven (bijvoorbeeld halveren per 20 s);
  - een grens van ±3 °/s, de gewone bochtsnelheid ("standard rate turn") van verkeersvliegtuigen.
- **Hoe te meten:** met de nep-bron. Een vijfde van de nep-vliegtuigen draait (±1,5 °/s), en de meter toont al de correctie (mediaan, p95, max).

### 2.3 Straal aanpassen aan de rand

- **Nu (fase 5, besluit D4):** een dubbelklik op de rand of het kruisje zet de verplaatsmodus aan. Daarna sleep je de cirkel vanaf elke plek erbinnen. De straal kies je met de schuif in het paneel (25-1000 km, bij adsb.lol tot 450).
- **Het knelpunt:** de rand is al het handvat om te verplaatsen. Straal slepen moet daar dus naast passen, zonder de dubbelklik-zoom of het klikken op vliegtuigen te breken.
- **De kaart vliegt bij een nieuwe straal** naar het nieuwe gebied (`VolgGebied`). Bij een straal die je zelf sleept moet dat net als bij verplaatsen niet gebeuren, anders verspringt alles onder je muis.
- **Tegoed:** een grotere straal kost bij OpenSky per aanvraag meer (1 tot 4) en ververst daarom minder vaak. Tijdens het slepen mag er dus geen aanvraag per beweging uitgaan. Dat is dezelfde regel als bij verplaatsen: pas bij loslaten, na 500 ms.

### 2.4 Een spoor achter elk vliegtuig

- **Bronnen voor eerdere posities:**
  - *adsb.lol:* hun sporen (`trace_recent` en `trace_full` op `globe.adsb.lol`) sturen door naar `adsb.lol/data/traces/…`, en daar staat een botcontrole ("Verification", 403). Die omzeilen we niet, dus deze bron valt af.
  - *OpenSky `tracks`:* volgens hun eigen documentatie "purely experimental". Getest met je key: voor CSN345 (van Peking naar Schiphol) kwam de hele vlucht in 60 punten, ongeveer één per 10 minuten. Het tegoed van `states` bleef gelijk (3.931). De route `tracks` lijkt een eigen teller te hebben (3.996 over). Goed voor "de hele vlucht" van één gekozen vliegtuig, te grof voor een spoor van de laatste minuut.
  - *Zelf bijhouden:* de laag weet elk beeld waar elk vliegtuig getekend staat (gegist bestek plus de pakketten). Elke paar seconden een punt bewaren geeft een vloeiend spoor van de laatste minuut(en), zonder extra aanvragen.
- **Kosten van het tekenen:** met 5.000 vliegtuigen kost één tekenbeurt nu 10,5 ms (fase 7). Een spoor van 30 punten per vliegtuig zijn 150.000 lijnstukjes, dat is te veel voor elk beeld. Dat kan op een eigen canvas dat 2 keer per seconde tekent, en alleen voor wat in beeld is en vanaf een bepaalde zoom.
- **De datumgrens:** sinds de fix van 31-10 staan alle vliegtuigen op dezelfde kopie van de wereld als de cirkel. Een spoor in wereldcoördinaten gaat dus goed over de grens heen.

---

## 3. De oplossing in het kort

```
server: adsb.lol /v2/mil elke 60 s ──► lijst militaire hex ──► OpenSky-vliegtuigen krijgen index 17 { militair } ook
        adsb.lol track_rate ──────────────────────────────► index 17 { draai }

app:    beoordeling per pakket: niveau (zoals nu) + militair (nieuw, los van het niveau)
laag:   atlas met een tweede vorm (militair) · bocht: positie langs een boog, draaisnelheid dooft uit
        spoor: per vliegtuig elke 2 s een punt, eigen canvas, 2× per seconde getekend
cirkel: verplaatsmodus → rand slepen = straal, binnenin slepen = verplaatsen
```

---

## 4. Besluiten

> **Geen reactie = akkoord met het advies.** Antwoord alleen op de besluiten waar je iets anders wilt.

| # | Vraag | Opties | Advies |
|---|---|---|---|
| K1 | Militair herkennen bij OpenSky? | **a)** de server haalt elke 60 s `/v2/mil` op bij adsb.lol en markeert OpenSky-vliegtuigen op hex · **b)** alleen bij adsb.lol als bron | **a.** Eén kleine aanvraag per minuut, zonder tegoed, voor alle kijkers samen. Valt adsb.lol uit, dan blijft de laatste lijst 10 minuten geldig en verdwijnt de markering daarna. |
| K2 | Hoe zie je dat een toestel militair is? | **a)** een eigen vorm (silhouet met deltavleugel), de kleur blijft het dreigingsniveau · **b)** een eigen kleur · **c)** alleen in de popup en de lijst | **a.** De kleuren zijn al van de dreigingsniveaus. Met een eigen vorm zie je beide tegelijk. |
| K3 | Telt militair mee voor "verdacht"? | **a)** nee, het is iets apart: een eigen teller "Militair", een filter en een lijst "Militair in beeld" · **b)** ja, als extra reden | **a.** Een militair toestel met callsign en transponder is niet verdacht. Tellen als reden zou het dreigingsniveau vertekenen. |
| K4 | Hoe sleep je de straal? | **a)** in de verplaatsmodus (na de dubbelklik): de rand slepen is de straal, binnenin slepen is verplaatsen. De cursor laat zien welke van de twee · **b)** een vaste greep op de rand, altijd te slepen · **c)** de dubbelklik op de rand is de straal, die op het kruisje is verplaatsen | **a.** Past bij wat er is (D4) en vraagt geen nieuw element op de kaart. Optie b staat altijd in de weg van vliegtuigen eronder. Optie c verandert wat je al gewend bent. |
| K5 | Wat doet de kaart na het slepen van de straal? | **a)** blijft staan · **b)** zoomt naar het nieuwe gebied | **a.** Zoals bij verplaatsen (D5). De schuif in het paneel blijft wel zoomen, zoals nu. |
| K6 | Bochten voorspellen voor welke bronnen? | **a)** adsb.lol met `track_rate`, en OpenSky met een schatting uit twee pakketten · **b)** alleen adsb.lol | **a.** Juist bij OpenSky op Zuinig (30-120 s) zijn de bochten nu zichtbaar. Daar helpt het het meest. |
| K7 | Wie krijgt een spoor, en hoe lang? | **a)** de vliegtuigen in beeld vanaf zoom 8, en het gekozen vliegtuig altijd, met de laatste 60 s · **b)** alle vliegtuigen · **c)** alleen het gekozen vliegtuig | **a.** Uitgezoomd zijn sporen met duizenden vliegtuigen een grijze waas, en dan kosten ze het meest. Ingezoomd zie je juist hoe een vliegtuig vloog. |
| K8 | "De hele vlucht" van het gekozen vliegtuig via OpenSky `tracks`? | **a)** ja, als knop in de popup, alleen met een account · **b)** nee | **a**, maar als laatste en los te schrappen: de route is experimenteel. Het is maar één aanvraag per klik. |
| K9 | Testscripts in de repo? | **a)** ja, in `tests/` met `playwright` als devDependency en `npm run check` · **b)** ze blijven in de scratchpad van de sessie | **a.** De scripts van fase 0-5 stonden in de scratchpad van de werklaptop en waren hier weg. In fase 7 moest alles opnieuw gemaakt worden. |

---

## 5. Fasen

### Fase 0: testscripts in de repo (alleen bij K9 = a)

- **Model: Sonnet 5.5**: overzetten van bestaande scripts, geen nieuwe logica.

| Stap | Wat |
|---|---|
| 0.1 | `tests/` met de scripts van 31-10 (nu in de scratchpad): de testlijst (`check7`), `t7`, de bugs, de servercontroles met nep-bronnen (`check6` en `nepbronnen`) en de meting (`meten`). De paden zijn relatief en de poorten in te stellen. |
| 0.2 | `npm run check` start zelf de nep-server en `vite preview`, draait alles en ruimt de processen op. De metingen staan los daarvan: `npm run meten`. |
| 0.3 | README: hoe je de tests draait, en dat Playwright per laptop één keer zijn browser moet installeren. |

**Klaar als:** `npm run check` op deze laptop dezelfde uitslag geeft als op 31-10.

**Uitkomst fase 0 (31-10-2026, persoonlijke laptop): gebouwd en getest.** K9 = a (geen reactie = akkoord). Gedaan met Opus 5.5 in plaats van Sonnet 5.5, want Tristan begon zonder te wisselen.

**Wat er gebouwd is:**
- **`playwright` 1.64.1 als devDependency**, precies dezelfde versie als in het Portfolio-project. Hij gebruikt dan de browser die al op de laptop staat (`chromium_headless_shell-1248`).
- **`tests/hulp.mjs`:** de gedeelde onderdelen:
  - de app bouwen met een eigen `VITE_SERVER`;
  - de radarserver, de nep-bronnen en `vite preview` starten en stoppen (direct met node, zonder `npx`, zodat er geen losse processen achterblijven);
  - wachten tot een poort antwoordt, en stoppen als een poort al bezet is;
  - de uitslag bijhouden;
  - de browser starten (op Windows met `--use-angle=d3d11` voor de echte videokaart).
- **`tests/nepbronnen.mjs`:** nep-adsb.lol en nep-OpenSky, met de poort als argument.
- **`tests/server.mjs`:** de servercontroles van fase 6 (35), plus één nieuwe: het pakket zegt voor welk gebied en welke bron het is.
- **`tests/kaart.mjs`:** de testlijst T2-T8 en T10-T13 van fase 7.
  - T7 met onafgeronde schermposities, en met "meteen goed gezet" per pakket opgeteld.
  - T8 stopt en start de nep-server zelf.
  - T15 zit er niet in: bevriezen werkt niet in de headless Chromium.
- **`tests/bugs.mjs`:** de twee bugs uit fase 5, met een pakket per seconde.
- **`tests/meten.mjs`:** de meting van fase 0 en 7. Met `--versie <commit>` pakt hij een oudere commit uit, linkt `node_modules` en bouwt die. Versies van vóór `VITE_SERVER` praten vast met 3001; die meet hij alleen als 3001 vrij is.
- **`tests/opensky-echt.mjs`:** T9 met de echte OpenSky. Nu met harde controles: interval, tegoed per uur en tegoed over, paneel tegenover de log.
- **`tests/alles.mjs`:** bouwt één keer en draait server, kaart en bugs na elkaar.
- **npm-scripts:** `check`, `check:opensky` en `meten`. `tests/.uitvoer/` staat in `.gitignore`.
- **Eigen poorten:** 3101-3104, 3112, 3193 en 5191-5194. Een radar die je zelf op 3001 en 5173 hebt draaien, merkt er niets van. Alleen `meten --versie` met een oude versie heeft 3001 nodig.

**Getest:**
- **`npm run check`:** 67 goed, 0 fout in 218 s (server 36, kaart 25, bugs 6). Dat is dezelfde uitslag als de losse scripts op 31-10.
- **`npm run check:opensky`:** 9 goed, 0 fout, met je account. Zuinig 60 s, Normaal 20 s en Snel 5 s, telkens 2 tegoed per aanvraag. Het tegoed in het paneel is gelijk aan de log. Het kostte 24 tegoed.
- **`npm run meten --versie=a1a9094 --aantallen=1000`:**

  | Versie | rust | pannen | zoomen |
  |---|---|---|---|
  | nu | 60 fps | 60 fps | 59,6 fps |
  | `a1a9094` | 54 fps | 47 fps | 26 fps |

  De oude commit wordt uitgepakt, gebouwd en gemeten.

**Valkuil:** `npm run meten -- --versie …` werkt niet in PowerShell 5.1. Die slikt de `--` in, en npm ziet de opties dan als zijn eigen instellingen. Daarom leest het script ook `npm_config_versie` en `npm_config_aantallen`. In de README staat `node tests/meten.mjs --versie …` als vaste manier.

### Fase 1: militaire herkenning

- **1a, server: Model: Sonnet 5.5**: één extra aanvraag met een cache, op de manier van fase 6.
- **1b, laag en paneel: Model: Opus 5.5**: de atlas in de canvaslaag, en een filter dat naast het filter op niveau moet werken.

| Stap | Wat |
|---|---|
| 1a.1 | De server haalt elke 60 s `/v2/mil` op (met een time-out van 10 s). Wat hij bewaart: een `Set` van de hex-adressen, en per hex het type en de registratie. Gaat dat 10 minuten lang mis, dan wordt de lijst leeg. |
| 1a.2 | OpenSky-vliegtuigen met een hex uit die lijst krijgen index 17 `{ bron: 'opensky', militair: true, type, registratie }`. Bij adsb.lol staat het er al. |
| 1a.3 | Alleen als er een app met OpenSky verbonden is: geen kijker, dan geen aanvraag. |
| 1b.1 | `dreiging.ts`: `beoordeel` geeft ook `militair` terug (uit index 17). Dat telt niet mee voor het niveau (K3). |
| 1b.2 | De atlas krijgt een tweede vorm: een silhouet met deltavleugel, in de kleuren van het niveau. De laag kiest de vorm per vliegtuig. |
| 1b.3 | **Paneel:** een derde teller "Militair", een filter "Alleen militair" (te combineren met het filter op niveau), en een lijst "Militair in beeld" boven "Meest verdacht". |
| 1b.4 | **Popup:** het label "Militair", met type en registratie (ook bij OpenSky, uit de lijst). |
| 1b.5 | De nep-bron krijgt ook een paar militaire toestellen, zodat het zonder echte data te testen is. |

**Klaar als:** de militaire toestellen rond Nederland op de kaart een eigen vorm hebben, bij OpenSky en bij adsb.lol, en de teller, het filter en de lijst kloppen met `/v2/mil`.

**Uitkomst fase 1 (31-10-2026, persoonlijke laptop): gebouwd en getest.** K1, K2 en K3 = a (geen reactie = akkoord). 1a en 1b zijn allebei met Opus 5.5 gedaan.

**1a, de server** (`dev-server.mjs`):
- **`ververstMilitair`** haalt `/v2/mil` op: hoogstens één aanvraag per minuut, met een time-out van 10 s en een eigen User-Agent. Adressen die met `~` beginnen slaat hij over, want dat zijn geen echte ICAO-adressen.
- Hij wordt aangeroepen vanuit `askOpensky`, dus alleen als er een app naar OpenSky kijkt (1a.3). De lijst komt tegelijk met de vliegtuigen binnen.
- **`markeerMilitair`** geeft OpenSky-vliegtuigen van de lijst index 17: `{ bron: 'opensky', type, registratie, militair: true }`.
- **Zonder verse lijst** wordt hij na 10 minuten vergeten. De tijden zijn voor tests in te stellen met `MIL_ELKE_S` en `MIL_HOUD_S`.
- **Nep-bron (1b.5):** elk 97e nep-vliegtuig is militair, met een type en een registratie `NEP-xxxx`. Dat wordt gekozen op volgnummer en niet met de toevalsgenerator, zodat de rest van de nep-vloot en de oude tests precies hetzelfde blijven.

**1b, laag en paneel:**
- **`dreiging.ts`:** de beoordeling heeft nu ook `militair`, en dat telt niet mee voor het niveau (K3). Er is een nieuwe hulpfunctie `extraVan` voor index 17.
- **De laag** (`vliegtuigCanvas.ts`):
  - een tweede vorm in de atlas: een straaljager met deltavleugel, in de kleuren van de niveaus (K2);
  - `tekenVliegtuig` kiest de vorm per vliegtuig;
  - het filter staat op één plek (`verborgen`), voor tekenen, pulsringen, de vaste ringen bij "minder beweging" en klikken. `zetFilter(niveau, alleenMilitair)`;
  - bij hetzelfde niveau liggen de militaire toestellen bovenop.
- **Paneel:**
  - een derde teller "Militair";
  - een blok "Militair" boven "Meest verdacht", met de knop "Alleen militair" (samen te gebruiken met een niveau) en een lijst met callsign, type en registratie (eerst die in de lucht);
  - de voettekst legt uit waar "militair" vandaan komt.
- **Popup:** het label "militair", en het land, het type en de registratie naast elkaar ("United States · C17 · 93-0603").
- **Kiezen:** kies je met "alleen militair" aan een gewoon toestel (bijvoorbeeld in "Meest verdacht"), dan gaat dat filter uit. Zo werkt het filter op niveau ook.

**Getest:**
- **`npm run check`:** 85 goed, 0 fout.
  - server 40, met 4 nieuwe controles: de markering bij OpenSky, de lijst komt van `/v2/mil`, de markering verdwijnt na `MIL_HOUD`, en komt terug als de lijst er weer is;
  - kaart 25 en bugs 6, ongewijzigd;
  - militair 14, nieuw in `tests/militair.mjs`: de teller, de laag, de lijst, het filter (alleen, samen met een niveau, en weer uit), de popup, en het filter dat uitgaat bij een gewoon toestel.
- **De vorm op de kaart:** de pixels van een militair toestel op het canvas zijn gelijk aan de militaire vorm in de atlas (214 tegen 214; de gewone vorm heeft er 153). Bij een gewoon toestel is het andersom.
- **Live (±18:25):** 450 km rond Nederland.

  | Bron | Militair in de app | Volgens adsb.lol |
  |---|---|---|
  | OpenSky | 1 (RCH417, een C-17 van de USAF, 93-0603) | dezelfde op `/v2/mil` |
  | adsb.lol | 2 | dezelfde 2 met `dbFlags & 1` |

  Schermafbeeldingen bekeken: de deltavorm met de witte ring, het label in de popup, en het paneel met drie tellers.

**Bug gevonden en opgelost tijdens het testen:** werd de lijst vergeten en kwam hij daarna terug, dan bleef de markering één pakket langer weg. De server wachtte alleen de allereerste keer op de lijst. Nu wacht hij hoogstens 3 s zolang de lijst leeg is en er een aanvraag loopt. Dat gebeurt hoogstens eens per minuut.

**Gezien:** adsb.lol was rond 18:20 een paar minuten wisselend bereikbaar (soms geen verbinding binnen 20 s, dan weer een antwoord in 0,4 s). De time-out van 10 s en het vergeten na 10 minuten vangen dat op.

### Fase 2: straal slepen aan de rand

- **Model: Opus 5.5**: de volgorde van events in `GebiedCirkel` (dubbelklik, rand, binnenin, touch), en `VolgGebied`.

| Stap | Wat |
|---|---|
| 2.1 | **In de verplaatsmodus:** druk je op de rand (±12 px), dan wordt dat straal slepen. Druk je binnenin, dan is het verplaatsen, zoals nu. De cursor is `ew-resize` op de rand en `move` binnenin. |
| 2.2 | **Tijdens het slepen** verandert alleen de Leaflet-cirkel (`setRadius`), met een label "350 km" bij de cursor. De straal gaat in stappen van 25 km, en blijft tussen 25 en 1000 km (450 bij adsb.lol). |
| 2.3 | **Loslaten:** `setStraal`, en daarna de gewone 500 ms en de aanvraag. De schuif in het paneel loopt mee. Vliegtuigen buiten een kleinere cirkel worden gedimd tot de data er is, zoals bij verplaatsen. Esc zet de straal terug. |
| 2.4 | `VolgGebied` slaat een straal over die je zelf gesleept hebt (K5). |
| 2.5 | De hint wordt: "Dubbelklik om de cirkel te verslepen of groter te maken". In het paneel komt een regel erbij. |
| 2.6 | **Touch:** dubbel tikken op de rand en meteen doorschuiven. De richting beslist: naar buiten of naar binnen is de straal. Dit test je op een telefoon. |

**Klaar als:** rand slepen de straal verandert (de schuif loopt mee en de kaart blijft staan), binnenin slepen nog verplaatst, Esc beide terugzet, en de dubbelklik-zoom en het klikken op vliegtuigen blijven werken.

**Uitkomst fase 2 (31-10-2026, persoonlijke laptop): gebouwd en getest.** K4 en K5 = a (geen reactie = akkoord).

**Wat er gebouwd is** (`GebiedCirkel.tsx`):
- **De verplaatsmodus** (na een dubbelklik op de rand of het kruisje):
  - op de rand staat een pijl die van het midden af wijst (`ew-`, `ns-`, `nesw-` of `nwse-resize`, naar de plek op de rand);
  - binnenin staat de verplaats-cursor;
  - indrukken op de rand sleept de straal, indrukken binnenin verplaatst, zoals eerst.
- **Tijdens het slepen van de straal:**
  - alleen de Leaflet-cirkel verandert, met een label "325 km" bij de cursor;
  - stappen van 25 km, tussen 25 en 1000 km (450 bij adsb.lol, `maxKm` uit `MapDashboard`);
  - de rand springt niet naar de cursor: het verschil met waar je hem vastpakte telt mee.
- **Loslaten:** `onStraal`, dan de gewone 500 ms en de aanvraag. De schuif loopt mee. Bij een kleinere cirkel worden de vliegtuigen erbuiten gedimd tot de data er is. Esc zet straal en midden terug.
- **De kaart blijft staan (K5):** `VolgGebied` slaat een zelf gesleepte straal over. Die ref wordt na gebruik leeg gemaakt, anders zou de schuif later op dezelfde waarde niet meer zoomen. De schuif zelf zoomt nog wel, zoals altijd.
- **Touch:** dubbel tikken op de rand en doorschuiven. Na 8 px schuiven beslist de richting: van het midden af of ernaartoe is de straal, langs de rand is verplaatsen. Dubbel tikken op het kruisje is altijd verplaatsen.
- **Hint en paneel:** "Dubbelklik om de cirkel te verslepen of groter te maken". In het paneel staat "Sleep daarna de rand voor de straal, of binnenin om hem te verplaatsen".

**Twee bugs gevonden en opgelost** (allebei al van fase 5, maar met de straal vaker te merken):
1. **De rand werd op de verkeerde plek gezocht.**
   - `meet()` nam als straal de afstand naar het punt recht boven op de rand. Leaflet tekent een grote cirkel in Web-Mercator echter als ellips: iets hoger dan breed, met het midden iets zuidelijker.
   - Bij 325 km rond Nederland lag de oostrand 17 px naast de schatting, meer dan de marge van 12 px. Een dubbelklik daar zoomde dus in in plaats van de modus aan te zetten.
   - Nu meet `meet()` tegen wat Leaflet echt tekent (`_point`, `_radius`, `_radiusY`), met de oude schatting als vangnet.
2. **Een klik op de rand kon een vliegtuig kiezen.** Vloog daar net een vliegtuig, dan koos de eerste klik van een dubbelklik dat vliegtuig. De popup schoof de kaart dan opzij, en de tweede klik zoomde in. Nu is een klik op de rand of het kruisje (buiten de verplaatsmodus) voor de cirkel. Een vliegtuig precies op de rand kies je na wat inzoomen.

**Tests aangepast:** T10 en T11 (`kaart.mjs`) en het slepen in `bugs.mjs` drukken nu binnenin om te verplaatsen. T13 (touch) schuift langs de rand.

**Getest:** `tests/straal.mjs`, 22 goed en 0 fout:
- de cursors (pijl op de rand, verplaatsen binnenin);
- 250 naar 325 km met het label "325 km", in stappen van 25;
- geen aanvraag tijdens het slepen, en daarna één aanvraag van 325 km;
- de schuif loopt mee, en de kaart en het midden blijven staan;
- een dubbelklik op de rand geeft geen zoom en geen popup;
- 325 naar 150 km, met dimmen tot de data er is;
- Esc: straal en schuif terug, geen aanvraag;
- de schuif zoomt nog wel;
- de grenzen: 1000 km, en 450 km bij adsb.lol;
- touch naar buiten: de straal wordt groter, en de kaart en het midden blijven staan.

**`npm run check`:** 107 goed, 0 fout (server 40, kaart 25, bugs 6, militair 14, straal 22). Eén eerdere run had T13 fout: de test schuift nu langs de rand (vooral naar het zuiden), maar keek alleen naar de lengtegraad. Nu kijkt hij naar beide.

Een schermafbeelding tijdens het slepen is bekeken: de doorgetrokken cirkel, het label "325 km", en de schuif die pas bij loslaten meeloopt.

### Fase 3: bochten voorspellen

- **Model: Opus 5.5**: de wiskunde van een boog, de draaisnelheid laten uitdoven, en twee bronnen. Fouten zie je pas na minuten.

| Stap | Wat |
|---|---|
| 3.1 | De server zet bij adsb.lol `track_rate` op index 17 (`draai`, in graden per seconde). |
| 3.2 | **De laag schat de draaisnelheid bij OpenSky** uit het vorige en het nieuwe pakket: verschil in koers gedeeld door het verschil in `time_position`. Dat alleen als het tijdsverschil tussen 4 en 130 s ligt. Het verschil gaat langs de kortste kant (350° naar 10° is +20°). |
| 3.3 | **`beweging.ts`:** positie langs een boog. Bij draaisnelheid ω en snelheid v draait de koers mee met ω·t, en de positie volgt de cirkelboog. De draaisnelheid wordt begrensd op ±3 °/s, dooft uit met een halveringstijd van 20 s, en onder 0,1 °/s rekenen we gewoon rechtdoor. |
| 3.4 | Het icoon draait mee met de voorspelde koers. |
| 3.5 | De meter toont de correctie apart voor rechtdoor en voor draaiende vliegtuigen. |
| 3.6 | **Meten met de nep-bron** bij een pakket per 30 s en per 10 s. De halveringstijd stellen we in op de uitkomst. |

**Klaar als:** met de nep-bron bij een pakket per 30 s de correctie van draaiende vliegtuigen op zoom 10 van p95 36 px naar ≤ 10 px gaat, rechtdoor ±0 blijft, en vliegtuigen die uit een bocht komen niet zichtbaar doordraaien. Het laatste controleer je zelf met OpenSky op Zuinig.

**Uitkomst fase 3 (31-10-2026, persoonlijke laptop): gebouwd, gemeten, en op Tristans besluit beperkt.**

**Wat er gebouwd is:**
- **`beweging.ts`:** `verschuiving` rekent een boog met een vaste draaisnelheid uit, en daarna gaat het rechtdoor. `netteDraai` begrenst op ±3 °/s, en onder 0,1 °/s is het rechtdoor.
  - Dit is een afwijking van het plan, dat een draaisnelheid noemde die uitdooft met een halveringstijd. Een uitdovende draaisnelheid geeft geen nette formule (dan moet je per beeld stap voor stap rekenen, voor duizenden vliegtuigen). Een vaste boog die na `BOCHT_SECONDEN` (15 s) overgaat in rechtdoor kost twee `sin`/`cos` per draaiend vliegtuig, en beperkt het doordraaien net zo goed.
  - Nagerekend: rechtdoor, een kwartcirkel naar links en naar rechts, en rechtdoor na de bocht.
- **De laag:**
  - de draaisnelheid wordt geschat uit de koers in het vorige en het nieuwe pakket, langs de kortste kant;
  - de positie volgt de boog, en het icoon draait mee;
  - de correctie bij een nieuw pakket rekent ook met de boog;
  - de meter toont de correctie apart voor rechtdoor en voor draaiende vliegtuigen (`correctieRecht`, `correctieBocht`).
  - Met `?meten&bocht=…` stel je de boogduur in, om tabbladen naast elkaar op dezelfde data te vergelijken.
- **De server** stuurt bij adsb.lol `track_rate` mee als `draai` (index 17).
- **De nep-bron is eerlijker gemaakt:**
  - een draaiend nep-vliegtuig vloog tussen twee pakketten in rechte stukken op de nieuwste koers, en kreeg de koers van "nu" bij een positie die tot 10 s ouder was. Dat maakte elke schatting scheef.
  - Nu vliegt hij langs een boog, en horen koers en positie bij hetzelfde moment, zoals bij echte data.
  - Rechtdoor vliegende nep-vliegtuigen veranderen niet.

**Gemeten** met `node tests/bochten.mjs` (en `--echt`): correctie op zoom 10, in px, de mediaan per pakket vanaf het 3e. "Rechtdoor" is het oude gedrag (`bocht=0`), "boog" is 15 s.

| Bron en tempo | Bocht p95 rechtdoor → boog | Bocht mediaan | Rechtdoor p95 |
|---|---|---|---|
| Nep, elke 30 s (eerste versie, schatting tot 130 s) | 37,6 → 2,3 (boog 30 s) | 17,6 → 0,5 | 0,1 → 0,1 |
| Nep, elke 10 s | 7,8 → 0,6 | 2,7 → 0,0 | 0,0 → 0,0 |
| **OpenSky Zuinig (60 s)**, eerste versie | 73,7 → 70,0 | 27,7 → 24,3 | **9,3 → 13,9** (slechter) |
| OpenSky Normaal (20 s) | 22,4 → 16,4 | 4,7 → 4,9 | 2,0 → 2,6 |
| OpenSky Snel (5 s) | 3,2 → 2,6 | 1,2 → 0,9 | 2,0 → 2,1 |
| adsb.lol (5 s, met `track_rate`) | **2,9 → 6,9** (slechter) | 0,5 → 0,4 | 0,3 → 0,3 |

**Besluit (Tristan, 31-10):**
- **Zuinig:** een echte bocht duurt korter dan de minuut tussen twee pakketten. De schatting voorspelde vaak een bocht die al voorbij was. Daarom schat de laag alleen uit pakketten die hoogstens 25 s uit elkaar liggen (`SCHAT_MAX_S`: Normaal is 20 s, plus speling). Bij Zuinig rekent hij dus rechtdoor, zoals vroeger.
- **adsb.lol:** daar staat de boog uit. De posities zijn er minder dan een seconde oud en komen elke paar seconden, dus er valt weinig te voorspellen, en met `track_rate` werd de p95 slechter. Dit wijkt af van K6.
- **Netto:** op OpenSky Normaal en Snel zit de voorspelling er in bochten 19-27 % minder naast, ten koste van een paar tiende pixel bij rechtdoor.
- **De klaar-eis** (nep bij elke 30 s p95 ≤ 10 px) haalde de eerste versie (2,3 px). Met de grens van 25 s geldt hij niet meer voor 30 s tussen de pakketten, en dat is bewust: op echte data was het daar slechter.
- **Het doordraaien** (M9) is op Zuinig daarmee weg, want daar wordt niet meer gedraaid.

**`npm run check`:** er is een korte controle bij gekomen (`bochten`): nep-bron elke 5 s, rechtdoor tegen boog, op dezelfde data. De boog moet in bochten minstens 3× beter zijn, en rechtdoor < 0,5 px.

### Fase 4: sporen

- **Model: Opus 5.5**: een tweede canvas in de laag, het tempo van tekenen en het geheugen bij 5.000 vliegtuigen.

| Stap | Wat |
|---|---|
| 4.1 | Per vliegtuig een ringbuffer met hoogstens 30 punten (wereld-x en -y, en de tijd). Elke 2 s komt er een punt bij, uit de getekende positie. Komt een vliegtuig in een nieuw pakket terug, dan blijft zijn spoor. Wordt hij meteen goed gezet ("gesnapt"), dan begint het spoor opnieuw. |
| 4.2 | Een eigen canvas onder de vliegtuigen, 2 keer per seconde getekend, bij pannen en zoomen meteen. Het spoor wordt vager naarmate het ouder is, in de kleur van het niveau. |
| 4.3 | Alleen voor de vliegtuigen in beeld en vanaf zoom 8, en altijd voor het gekozen vliegtuig (K7). Het filter geldt ook voor de sporen. |
| 4.4 | Een schakelaar "Sporen" in het paneel, onthouden in de browser. |
| 4.5 | **Alleen bij K8 = a:** een knop "Hele vlucht" in de popup, die één keer `tracks` vraagt. Het antwoord tekent als een dunne lijn, en verdwijnt als je een ander vliegtuig kiest. |
| 4.6 | **Meten:** 5.000 nep-vliegtuigen, ingezoomd en uitgezoomd, met sporen aan. |

**Klaar als:** sporen ingezoomd vloeiend achter de vliegtuigen lopen (ook over de datumgrens), de fps in de meting van fase 7 ≥ 55 blijft met sporen aan, en het geheugen na 10 minuten niet blijft groeien.

**Uitkomst fase 4 (31-10-2026, persoonlijke laptop): gebouwd en getest.** K7 en K8 = a.

**Wat er gebouwd is** (`vliegtuigCanvas.ts`, tenzij anders vermeld):
- **Het spoor per vliegtuig:**
  - een lijst (`pad`) met x, y en tijd;
  - elke 2 s komt er een punt bij (`monster`), voor alle vliegtuigen, ook buiten beeld;
  - hoogstens 30 punten en 60 s, en geen punten op dezelfde plek als hij stilstaat;
  - het spoor begint opnieuw bij "meteen goed gezet", en bij een sprong naar een andere kopie van de wereld (meer dan een halve wereld). Een spoor over de datumgrens loopt dus door, en er komt geen streep over de hele kaart.
- **Tekenen** op een eigen canvas onder de vliegtuigen (`tekenSporen`):
  - per niveau en per leeftijd (4 lagen van 15 s, vager naarmate ouder) één `Path2D`, dus hoogstens 20 tekenopdrachten;
  - alleen in beeld en vanaf zoom 8, en altijd voor het gekozen vliegtuig (K7). Het filter geldt ook;
  - ouder dan 60 s wordt niet getekend.
- **Snelheid:**
  - tekenen 2× per seconde, of minder vaak als het veel kost (hooguit ±2 % van de tijd);
  - tijdens het slepen van de kaart schuiven de sporen mee met het canvas, zonder opnieuw te tekenen;
  - punten dichter dan 4 px bij elkaar worden samengevoegd.
- **Schakelaar "Sporen"** in het paneel, onthouden in de browser (`radar.sporen`). Uit betekent ook geen punten meer bijhouden.
- **Hele vlucht (K8):**
  - socket-bericht `vlucht`: de server vraagt OpenSky `tracks/all` met het token, hoogstens één keer per 3 s per app, en alleen met een account;
  - met de nep-bron geeft hij een nep-vlucht van een uur (31 punten);
  - de popup krijgt een knop en een regel ("Hele vlucht: 137 punten, sinds 18:38");
  - de laag tekent een gestippelde lijn tot waar het vliegtuig nu is. Kies je een ander vliegtuig, dan verdwijnt hij.

**Snelheid, en twee aanpassingen na het meten.** 5.000 nep-vliegtuigen op zoom 8 (4.650 in beeld, met elk een spoor):

| | fps in rust | traagste beeld | sporen per tekenbeurt |
|---|---|---|---|
| sporen uit | 60,1 | 17 ms | – |
| sporen aan, eerste versie | 53,8 (pannen 50) | 100 ms | 2,6 ms JavaScript, maar ±140.000 lijnstukjes voor de videokaart |
| sporen aan, met samenvoegen en niet hertekenen tijdens slepen | **60,1** | **17 ms** | 1,3 ms |

**Getest:** `tests/sporen.mjs`, 14 goed en 0 fout:
- zoom 10: 96 sporen getekend, en 954 vliegtuigen houden een spoor bij;
- zoom 7: geen sporen, alleen het gekozen vliegtuig;
- de hele vlucht (nep): 31 punten, en weg bij een ander vliegtuig;
- het filter "alleen militair" geldt ook voor de sporen;
- de schakelaar uit, ook na herladen;
- na ruim een minuut hoogstens 30 punten en ±60 s;
- 5.000 vliegtuigen op zoom 8 met sporen: pannen en rust ≥ 55 fps.

**Live:** "Hele vlucht" voor KLC1094 (van Cardiff naar Schiphol) gaf 137 punten. De schermafbeeldingen van de vlucht en van de sporen op zoom 10 zijn bekeken.

**Niet automatisch getest:**
- het geheugen na 10 minuten. Het aantal punten zit aan een plafond (30 per vliegtuig), en het spoor van een vliegtuig dat uit het pakket verdwijnt, verdwijnt met hem;
- een spoor dat over de datumgrens loopt. De code begint dan alleen opnieuw bij een sprong van meer dan een halve wereld, en de bug-2-test van de datumgrens slaagt.

### Fase 5: meten, testen en README

- **Model: Sonnet 5.5**: meten en documenteren volgens de lijst.

| Stap | Wat |
|---|---|
| 5.1 | De meting van fase 7, nu met militair, bochten en sporen aan. |
| 5.2 | De testlijst hieronder (automatisch waar het kan). |
| 5.3 | README: militair, straal slepen, sporen, en de nieuwe bestanden. |

**Uitkomst fase 5 (31-10-2026, persoonlijke laptop).** Gedaan met Opus 5.5, op Tristans opdracht om alle fasen in één keer af te maken.

**5.1, meten** (`npm run meten`, alle onderdelen aan; sporen tekenen helemaal uitgezoomd niet):

| Nep-vliegtuigen | fps in rust | fps pannen | fps zoomen | teken-ms |
|---|---|---|---|---|
| 1.000 | 60 (17 ms) | 60 (17 ms) | 59,5 (50 ms) | gem 1,3 · max 2,6 |
| 3.000 | 60 (17 ms) | 60 (17 ms) | 59,2 (50 ms) | gem 3,5 · max 6,4 |
| 5.000 | 60 (17 ms) | 60,1 (17 ms) | 58,9 (50 ms) | gem 11,2 · max 17,2 |

Dat is gelijk aan fase 7 van het vorige plan. Ingezoomd met sporen (zoom 8, 4.650 vliegtuigen in beeld): 60 fps, zie fase 4.

**5.2, de testlijst:**

| # | Uitkomst |
|---|---|
| M1 | ✓ adsb.lol live: 2 militaire toestellen, gelijk aan `dbFlags & 1`. Vorm, label en lijst zijn getest met de nep-bron (`militair.mjs`) |
| M2 | ✓ OpenSky live: RCH417 (een C-17 van de USAF) via `/v2/mil` |
| M3 | ✓ Filter alleen, samen met een niveau, en weer uit. Teller en lijst kloppen (`militair.mjs`) |
| M4 | ✓ De lijst valt uit: de markering verdwijnt na `MIL_HOUD`, en komt terug als de lijst er weer is. Geen fouten (`server.mjs`) |
| M5 | ✓ Straal slepen: cirkel, label en schuif lopen mee, de kaart blijft staan, en er gaat pas bij loslaten één aanvraag uit (`straal.mjs`) |
| M6 | ✓ Binnenin slepen verplaatst, Esc zet terug, en de dubbelklik ernaast zoomt (`straal.mjs`, `kaart.mjs`) |
| M7 | ✓ Bij adsb.lol stopt de straal op 450 km |
| M8 | ✓ Eerste versie: p95 2,3 px bij elke 30 s. Daarna bewust beperkt tot hoogstens 25 s tussen de pakketten (Tristans besluit, zie fase 3). Bij elke 5-10 s: 7,8 → 0,6 px |
| M9 | ✓ Op Zuinig draait de voorspelling niet meer door, want daar wordt rechtdoor gerekend. Live gemeten waarom (fase 3) |
| M10 | ✓ Sporen ingezoomd, en uitgezoomd alleen het gekozen vliegtuig (`sporen.mjs`, en een live schermafbeelding) |
| M11 | ✓ 5.000 vliegtuigen met sporen: 60 fps |
| M12 | Niet automatisch. Een spoor begint opnieuw bij een sprong van meer dan een halve wereld; de test van bug 2 (datumgrens) slaagt |
| M13 | ✓ Hele vlucht: nep 31 punten, live 137 punten (KLC1094), en weg bij een ander vliegtuig |
| M14 | **Open:** touch op een echte telefoon (nagebootste touch slaagt) |

**`npm run check`:** 124 goed, 0 fout, in ±7 minuten:

| Onderdeel | Uitslag |
|---|---|
| server | 40 |
| kaart | 25 |
| bugs | 6 |
| militair | 14 |
| straal | 22 |
| bochten | 3 |
| sporen | 14 |

In één run faalde de servertest "terug naar OpenSky", omdat twee berichten in dezelfde milliseconde binnenkwamen. De test kijkt nu naar de volgorde van binnenkomst.

**5.3, README:** het gebruik van bochten, sporen en "Hele vlucht", de tests (`npm run check` duurt nu ±10 minuten) en de bochtmeting, de tabel met bestanden en het blok "Versies" zijn bijgewerkt.

**Nog voor Tristan:**
- M14 en T13 op een echte telefoon;
- T15 (5 minuten een ander tabblad);
- zelf kijken naar de bochten op Normaal;
- committen.

### Na het plan: de afgelegde route bij een klik (31-10-2026)

Tristans vraag: zie je bij een klik op een vliegtuig een lijn van de route die hij al heeft afgelegd? "Hele vlucht" (fase 4) deed dat al half: alleen na een klik op een knop, en alleen met een OpenSky-account.

**Wat er gebouwd is:**
- **De server onthoudt zelf de route** van elk vliegtuig dat binnenkomt, uit elke bron: elke 20 s een punt, tot 2 uur terug (`onthoudRoutes`). Eens per minuut ruimt hij oude punten en vliegtuigen op.
- **`vlucht`** geeft nu altijd een route als die er is (`routeVan`):
  - met een account: de hele vlucht van OpenSky (5 minuten bewaard per vliegtuig, hoogstens één aanvraag per 3 s per app), plus de eigen punten na het laatste punt van OpenSky;
  - zonder account, bij adsb.lol, of als OpenSky de vlucht niet kent: alleen de eigen punten;
  - nog niets bekend: "Nog geen route: de radar ziet dit toestel net."
- **De app** vraagt de route op zodra je een vliegtuig kiest, dus de knop is weg. De popup zegt waar de lijn vandaan komt: "Afgelegde route sinds 19:51 (hele vlucht, OpenSky)" of "(sinds de radar hem ziet)". Bij een fout staat er een knop "Opnieuw".

**Getest:**
- `npm run check`: 127 goed, 0 fout, met 3 nieuwe servercontroles (zonder tracks, met tracks plus eigen punten, en een onbekend toestel) en een aangepaste M13 (de route komt bij het kiezen, en hoort bij het nieuw gekozen vliegtuig).
- Live op Tristans radar: een helikopter boven Drenthe had zijn route sinds 19:51 van OpenSky.

---

## 6. Afvinklijst

> De Model-regel blijft staan, ook na het afvinken.

- [x] **Fase 0**: testscripts in de repo (K9) · **Model: Sonnet 5.5** · af 31-10-2026 (gedaan met Opus 5.5), `npm run check` 67 goed / 0 fout
- [x] **Fase 1a**: militair, server · **Model: Sonnet 5.5** · af 31-10-2026 (gedaan met Opus 5.5), server 40/0
- [x] **Fase 1b**: militair, laag en paneel · **Model: Opus 5.5** · af 31-10-2026, militair 14/0, live gelijk aan adsb.lol
- [x] **Fase 2**: straal slepen aan de rand · **Model: Opus 5.5** · af 31-10-2026, straal 22/0, `npm run check` 107/0, twee oude bugs in `GebiedCirkel` opgelost
- [x] **Fase 3**: bochten voorspellen · **Model: Opus 5.5** · af 31-10-2026, live gemeten. Alleen OpenSky met hoogstens 25 s tussen de pakketten (Normaal en Snel), op Tristans besluit. Bochten 19-27 % beter
- [x] **Fase 4**: sporen · **Model: Opus 5.5** · af 31-10-2026, sporen 14/0, 5.000 vliegtuigen met sporen 60 fps, Hele vlucht live getest
- [x] **Fase 5**: meten, testen en README · **Model: Sonnet 5.5** · af 31-10-2026 (gedaan met Opus 5.5), `npm run check` 124/0, 5.000 vliegtuigen 60 fps, M14 (telefoon) open

**Volgorde:** 0 → 1 → 2 → 3 → 4 → 5.
- Fase 1 eerst, want daar gaat het project om, en het risico is het kleinst.
- Fase 2 raakt alleen `GebiedCirkel` en `VolgGebied`, dus die kan naast fase 3.
- Fase 3 en 4 raken allebei `vliegtuigCanvas.ts` en `beweging.ts`, dus die gaan na elkaar.

---

## 7. Testlijst (van dit plan)

| # | Test |
|---|---|
| M1 | adsb.lol als bron: de 3 militaire toestellen uit `/v2/mil` rond Nederland hebben de militaire vorm, en de popup zegt "Militair" met type en registratie. |
| M2 | OpenSky als bron: dezelfde toestellen zijn ook militair (via de lijst van de server). |
| M3 | Filter "Alleen militair", ook samen met een niveau. Teller en lijst kloppen met wat er getekend is. |
| M4 | adsb.lol 10 minuten onbereikbaar (nep-bron): de markering verdwijnt, en er komen geen fouten. |
| M5 | Straal slepen aan de rand: de cirkel, het label en de schuif lopen mee, de kaart blijft staan, en er gaat pas bij loslaten een aanvraag uit. |
| M6 | Binnenin slepen verplaatst nog, Esc zet de straal terug, en de dubbelklik ernaast zoomt. |
| M7 | Straal slepen bij adsb.lol stopt op 450 km. |
| M8 | Bochten met de nep-bron, een pakket per 30 s, zoom 10: p95 van de draaiende vliegtuigen ≤ 10 px, rechtdoor ±0. |
| M9 | Een vliegtuig dat uit een bocht komt, draait in de voorspelling niet zichtbaar door (OpenSky op Zuinig, zelf kijken). |
| M10 | Sporen ingezoomd: vloeiend en vager naarmate ze ouder zijn. Uitgezoomd (onder zoom 8) alleen het gekozen vliegtuig. |
| M11 | 5.000 nep-vliegtuigen met sporen aan: ≥ 55 fps bij pannen en zoomen. |
| M12 | Een spoor over de datumgrens loopt door zonder een streep over de hele kaart. |
| M13 | "Hele vlucht" (bij K8 = a): één aanvraag, de lijn verschijnt, en hij verdwijnt bij een ander vliegtuig. |
| M14 | Touch: straal slepen op een echte telefoon. |

---

## 8. Niet in dit plan

- **De vlaggen PIA, LADD en "interesting"** van adsb.lol. Die gaan over privacyprogramma's in de VS en over "opvallende" toestellen. Tonen kan, maar "verdacht" betekenen ze niet.
- **Militair herkennen zonder database**, bijvoorbeeld op blokken ICAO-adressen per land of op callsigns (RCH, GAF, NATO). Dat geeft meer treffers, maar ook meer missers. Het is een eigen plan waard als de database te weinig vangt.
- **Een spoor uit de geschiedenis van adsb.lol:** hun sporen zitten achter een botcontrole.

---

## 9. Taken voor Tristan

1. Antwoorden op K1-K9, maar alleen waar je iets anders wilt dan het advies.
2. Eerst de wijzigingen van 31-10 committen (fase 6 en 7 en de twee bugs), voordat fase 0 begint. Dan staat dit plan op een schone stand.
3. Testen op een telefoon: M14, en T13 en T15 van het vorige plan.
4. Na elke fase kijken en committen.

---

## 10. Werkafspraken

- Claude commit en pusht nooit.
- De stijl van comments volgt het bestand: in `src/` Nederlandse kleine letters met `//!` en `//?`, in `dev-server.mjs` Engelse kleine letters.
- Code die niet meer gebruikt wordt, wordt uitgecommentarieerd en nooit verwijderd.
- Ontwikkelen op de nep-bron, om OpenSky-tegoed te sparen.
- Elk open tabblad met de radar is een eigen kijker. Sluit testtabbladen, anders kosten ze tegoed of verstoren ze metingen (fase 7, T9).

---

## Bronnen

- [readsb README-json](https://github.com/wiedehopf/readsb/blob/dev/README-json.md): `dbFlags` (militair = bit 1), `track_rate` in graden per seconde
- adsb.lol: `https://api.adsb.lol/v2/mil` en `/v2/point/…`, live opgevraagd op 31-10-2026. De sporen op `globe.adsb.lol/data/traces/…` sturen door naar een botcontrole (403)
- [OpenSky REST API](https://openskynetwork.github.io/opensky-api/rest.html): "Track by Aircraft" is "purely experimental". Getest met de key van Tristan op 31-10-2026: 200, 60 punten voor een vlucht van ±10 uur
- `plan-van-aanpak-live-kaart.md`: de metingen van fase 3 (bochten: p95 36 px bij een pakket per 30 s) en fase 7 (10,5 ms per tekenbeurt bij 5.000 vliegtuigen)
