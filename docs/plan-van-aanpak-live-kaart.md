# Plan van aanpak: live kaart

**Frustum culling, vliegtuigen die echt bewegen en een bereikcirkel die je kunt verslepen**

- Datum: 30-10-2026
- Stand van de code: commit `a1a9094` (main)
- Status: **alleen plan, er is nog niets gebouwd**
- Tristan commit en pusht zelf. Claude doet dat nooit.

---

## 1. Wat je vroeg

1. **Frustum culling**: alleen tekenen wat in beeld is.
2. **Vaker verversen** (als optie), zodat vliegtuigen echt over de kaart vliegen en niet om de zoveel seconden verspringen.
3. **Geen lag**: alles geoptimaliseerd.
4. **Bereikcirkel verslepen**: dubbelklik op de cirkel, sleep hem naar een ander deel van de wereld en de app haalt daar de vliegtuigen op.

---

## 2. Wat ik vond

### 2.1 Waarom de vliegtuigen verspringen

- De server ververst maar elke **30 tot 120 seconden** (`everySeconds` in `dev-server.mjs`).
- `PlaneMarker` schuift per beeldje 10 % van de resterende afstand op (`lerp(…, 0.1)`). Na ongeveer een halve seconde staat het vliegtuig op zijn nieuwe plek, en daarna staat het **30 tot 120 seconden stil**. Dat is het verspringen dat je ziet.
- Die schuif hangt ook af van het scherm: op een 144 Hz-scherm gaat hij twee keer zo snel als op 60 Hz.
- Posities van OpenSky zijn bij binnenkomst al tot 15 seconden oud (`time_position`), en ze worden ouder tot de volgende update.

**Conclusie:** alleen vaker ophalen lost het niet op. Ook bij een update elke 5 seconden zie je dan sprongetjes van 5 seconden. De echte oplossing heet **gegist bestek** (dead reckoning). We weten de snelheid (index 9, in m/s) en de koers (index 10), dus kunnen we elk beeldje uitrekenen waar het vliegtuig *nu* is. Komt er nieuwe data, dan volgt een kleine, vloeiende correctie. Zo doen Flightradar24 en vergelijkbare apps het ook.

### 2.2 Waarom het gaat haperen bij veel vliegtuigen

- Elk vliegtuig is een los DOM-element: een DivIcon met een SVG en een CSS-`drop-shadow`. Daarbovenop komen per vliegtuig een React-component, een react-leaflet-`Marker` en een eigen `L.Popup`. `preferCanvas` geldt alleen voor vectorlagen (de cirkel), niet voor markers.
- **Er is geen culling.** Alle markers zitten in de DOM, ook als ze buiten beeld zijn, en bij elke zoom verplaatst Leaflet ze allemaal.
- Elke `PlaneMarker` heeft een eigen `requestAnimationFrame`-lus. Die stopt pas als de marker minder dan 0,1 mm van zijn doel staat (`distanceTo` rekent in meters). Na elke update draaien er dus duizenden lussen tegelijk, zo'n 2 à 3 seconden lang, en elke lus schrijft elk beeldje naar de DOM. Dat geeft een hapering bij elke update.
- Verandert het icoon (de koers in stappen van 5°, het niveau of de selectie), dan vervangt Leaflet het hele DOM-element.
- `getSuspicionReasons` draait per render vele keren per vliegtuig: in `StatusPanel` 5× voor de tellers, ±2× log n keer in de sortering en 2× in de lijst, plus 1× in de kaart en 1× in het filter. Bij een update elke 30 tot 120 seconden merk je dat niet, maar bij elke 2 tot 10 seconden met duizenden vliegtuigen wel.

### 2.3 Hoeveel vaker kan het? (de data)

**OpenSky** (officiële REST-documentatie, nagelezen op 30-10-2026):

| | Anoniem (nu) | Gratis account | Feeder |
|---|---|---|---|
| Tegoed per dag | 400 | 4.000 | 8.000 |
| Nieuwe data elke | 10 s | 5 s | 5 s |

Wat één aanvraag kost hangt af van de grootte van het vak. Rond Nederland is dat:

| Straal | Vak | Kost |
|---|---|---|
| tot ±218 km | ≤ 25 vierkante graden | 1 |
| tot ±436 km | ≤ 100 | 2 |
| tot ±872 km | ≤ 400 | 3 |
| groter | > 400 | 4 |

- De huidige tabel kost bij elke straal precies **120 tegoed per uur**. Anoniem kun je dus **3 uur en 20 minuten per dag** kijken. Daarna geeft OpenSky een 429 en blijven de laatste vliegtuigen staan.
- Elk antwoord bevat de header `X-Rate-Limit-Remaining` met het resterende tegoed. Bij een 429 staat in `X-Rate-Limit-Retry-After-Seconds` hoe lang je moet wachten.
- Inloggen gaat alleen nog met OAuth2 client credentials (een token is 30 minuten geldig). `services/openskyClient.ts` doet dat al met `OPENSKY_CLIENT_ID` en `OPENSKY_CLIENT_SECRET`, maar de server gebruikt het nog niet.
- **Een gratis account is voor OpenSky de grootste stap:** 10× zoveel tegoed en elke 5 seconden nieuwe data.

**adsb.lol** (vandaag live getest, 30-10-2026 om 13:32):

- `https://api.adsb.lol/v2/point/52.13/5.29/50` gaf 200 OK met 84 vliegtuigen, zonder sleutel. De posities waren gemiddeld **0,4 seconde oud** (`seen_pos`).
- Velden: `hex`, `flight`, `lat`, `lon`, `track`, `gs` (knopen), `alt_baro` (voet, of `"ground"`), `alt_geom`, `baro_rate` (voet/min), `squawk`, `emergency`, `spi`, `seen_pos`, `seen`, `now` (ms), `t` (type), `r` (registratie), `track_rate` en `dbFlags` (bit 1 = militair).
- `https://api.adsb.lol/v2/mil` gaf 199 militaire toestellen wereldwijd, waarvan 30 boven Noordwest-Europa (Hawks, Texan II's, een C-17, …).
- Beperkingen:
  - De straal is maximaal 250 NM (±463 km).
  - Er zijn geen vaste limieten, alleen "dynamic based on the environment load".
  - "In the future" komt er een sleutel, die je krijgt door zelf data te feeden.
  - Er is geen land van herkomst.

**airplanes.live** gaf ons een 403: je moet eerst mailen met een beschrijving van je project. Die valt dus af.

### 2.4 Kleine bugs die ik onderweg zag (worden meegenomen)

| # | Waar | Wat | Fix |
|---|---|---|---|
| B1 | `send()` in `dev-server.mjs` | Verander je het gebied terwijl er nog een aanvraag loopt, dan kan het oude antwoord ná het nieuwe binnenkomen. De app toont dan tot 120 s lang het oude gebied. Met slepen gebeurt dat veel vaker. | een versienummer per socket |
| B2 | `socket.on('gebied')` | `Number(wish?.lat) \|\| START.lat`: een breedte- of lengtegraad van precies 0 wordt Nederland. | `Number.isFinite` |
| B3 | `answers` (Map) | wordt nooit opgeschoond; elk nieuw gebied (en dus elke keer slepen) komt erbij | antwoorden ouder dan 10 min weggooien |
| B4 | `PlaneMarker` | de lerp per beeldje hangt af van de Hz van het scherm | verdwijnt met fase 3 |

---

## 3. De oplossing in het kort

```
OpenSky / adsb.lol ──► dev-server.mjs ──(socket: vliegtuigen + tijd + tegoed)──► App
                                                             │  1× per pakket: niveau en redenen
                                                             ▼
                                              VliegtuigLaag: 1 canvas, 1 lus
                                              per beeldje:  positie nu = basis + snelheid × Δt
                                                            + een correctie die uitdooft
                                              frustum culling: buiten beeld = niet tekenen
```

**Frustum culling op een 2D-kaart.** Het "frustum" is hier de zichtbare rechthoek, plus een marge voor het icoon en de pulsring. Elk beeldje rekenen we per vliegtuig de schermpositie uit. Dat is goedkoop, omdat we per pakket de Web-Mercator-wereldcoördinaten al hebben uitgerekend: per vliegtuig kost het daarna nog 2 vermenigvuldigingen, zonder sin of cos. Valt het vliegtuig buiten de rechthoek, dan tekenen we het niet en telt het ook niet mee als je ergens klikt.

**Waarom één canvas.** Duizenden DOM-elementen worden één tekenvlak. Er is dan geen layout of compositing per vliegtuig, geen React per vliegtuig en maar één lus. Canvas 2D tekent een paar duizend kleine sprites ruim binnen één beeldje. In fase 2 meten we dat met de nep-bron.

---

## 4. Besluiten

> **Geen reactie = akkoord met het advies.** Antwoord alleen op de besluiten waar je iets anders wilt.

| # | Vraag | Opties | Advies |
|---|---|---|---|
| D1 | Hoe tekenen we de vliegtuigen? | **a)** één canvas als eigen Leaflet-laag · **b)** DOM-markers houden + culling · **c)** WebGL (deck.gl) | **a.** Optie b is de kleinste wijziging, maar met continu bewegende vliegtuigen schrijf je dan honderden DOM-elementen per beeldje: dat blijft haperen. Optie c is overkill en voegt een groot pakket toe. |
| D2 | Wat doet een vliegtuig waarvan geen nieuwe positie meer komt? | **a)** doorvliegen tot max(60 s, 1,5 × verversinterval), daarna stil en half doorzichtig · **b)** meteen stil · **c)** blijven doorvliegen | **a.** Optie c laat een vliegtuig bij een lege tegoedpot eindeloos rechtdoor vliegen. Het verdwijnt pas bij het volgende pakket waar het niet meer in zit, zoals nu. |
| D3 | Welke verversstanden? | **a)** Zuinig / Normaal / Snel, gerekend in tegoed per uur, met een tegoedmeter · **b)** een vrije schuif in seconden | **a.** Zuinig = 120/uur (zoals nu), Normaal = 360/uur, Snel = zo vaak als de bron levert. Een groter gebied ververst dan vanzelf minder vaak, net als nu. Standaard: Zuinig zonder account, Normaal met account. |
| D4 | Hoe start je het slepen? | **a)** dubbelklik op de **rand** of op een **middelpuntkruisje** → verplaatsmodus → slepen → loslaten = ophalen, Esc = annuleren · **b)** dubbelklik overal binnen de cirkel · **c)** dubbelklik-vasthouden-slepen in één beweging | **a.** De cirkel bedekt bijna je hele beeld. Bij optie b ben je de dubbelklik-zoom kwijt precies waar je hem het meest gebruikt, en botst het met klikken op vliegtuigen. Optie c is lastig te ontdekken en lijkt te veel op dubbelklik-zoom. |
| D5 | Wat doet de kaart na het loslaten? | **a)** blijft staan · **b)** zoomt naar het nieuwe gebied, zoals de knoppen doen | **a.** Je hebt de cirkel zelf neergezet, dan moet de kaart niet wegspringen. De knoppen "Midden van de kaart" en "Nederland" blijven vliegen zoals nu. |
| D6 | adsb.lol als tweede bron? | **a)** ja, als keuze in het paneel; OpenSky blijft standaard en vangnet; bij adsb.lol is de straal max 450 km · **b)** ja, en adsb.lol wordt standaard · **c)** niet bouwen | **a.** Met adsb.lol krijg je elke 2 tot 5 seconden verse data zonder tegoed, maar de limieten zijn niet vastgelegd en er komt ooit een sleutel. Daarom blijft OpenSky het vangnet. Bij c vervalt fase 6. |

| D7 | Minder detail (LOD) als er heel veel vliegtuigen in beeld zijn? (toegevoegd na fase 2) | **a)** nu niet bouwen, na fase 3 opnieuw meten · **b)** bij zoom ≤ 6 en meer dan 1.500 in beeld gekleurde puntjes in plaats van iconen (gemeten ±7× goedkoper, ziet er anders uit) · **c)** WebGL: alle vliegtuigen in één tekenopdracht (niet gemeten, verwacht veel sneller, flink meer code) | **a.** De fps-doelen zijn gehaald. In fase 3 tekent de laag bij een lage zoom nog minder vaak, want daar bewegen vliegtuigen minder dan 0,1 px/s. Valt de meting na fase 3 tegen, dan b. *Pas te kiezen na de meting van fase 3.* **Gemeten na fase 3:** 5.000 bewegende vliegtuigen geven 60 / 59 / 60 fps, en op zoom 7 zijn er ±2 tekenbeurten per seconde. Dus niet nodig: D7 = a. |

**Afspraak, geen besluit:** `PlaneMarker.tsx` en `planeIcons.tsx` worden niet verwijderd. Het gebruik ervan wordt uitgecommentarieerd en bovenaan komt een regel dat ze sinds de canvaslaag niet meer gebruikt worden (jouw regel: nooit code verwijderen).

---

## 5. Fasen

### Fase 0: meetpunt en nep-bron

- **Model: Sonnet 5.5**: afgebakend, geen kernlogica; een los stuk naast de bestaande server.

| Stap | Wat |
|---|---|
| 0.1 | `npm install` en de huidige versie draaien (`npm run server` + `npm run dev`) op deze laptop (Node 22). |
| 0.2 | **Nep-bron** in `dev-server.mjs` met een nieuw script `npm run server:nep` (`node dev-server.mjs --nep 5000`). Die maakt N vliegtuigen binnen de cirkel met een realistische snelheid (60–280 m/s), koers en hoogte, waarvan een deel langzaam bochten maakt. De nep-bron geeft precies het formaat van een OpenSky-statevector terug, met een `time_position` van 0–10 s oud (net als echt). Hij kost geen tegoed en geeft elke keer dezelfde invoer, dus de metingen zijn vergelijkbaar. |
| 0.3 | **Meter** met `?meten` in de url: een klein vak rechtsboven met fps (een rAF-teller). In fase 2 komen er de teken-ms en het aantal zichtbaar/totaal bij. |
| 0.4 | **Nulmeting** van de oude versie met 1.000, 3.000 en 5.000 nep-vliegtuigen: fps in rust, tijdens slepen en tijdens zoomen. De cijfers komen in hoofdstuk 8. |

**Klaar als:** de nep-bron draait, de meter fps toont en de nulmeting in hoofdstuk 8 staat.

### Fase 1: data één keer verwerken

- **Model: Sonnet 5.5**: klein en puur React; de regels in `planeUtils.ts` blijven zoals ze zijn.

| Stap | Wat |
|---|---|
| 1.1 | In `App.tsx` per pakket één keer per vliegtuig `redenen` en `niveau` uitrekenen (`useMemo`, een Map van icao naar `{ redenen, niveau }`). De regels zelf blijven in `utils/planeUtils.ts`. |
| 1.2 | `StatusPanel`: de tellers per niveau in één ronde, de lijst "Meest verdacht" sorteren op het vooraf berekende niveau, en de redenen niet meer twee keer opvragen. |
| 1.3 | De kaart en het filter gebruiken het vooraf berekende niveau. |

**Klaar als:** het scherm er precies zo uitziet als nu, en `getSuspicionReasons` per pakket maar één keer per vliegtuig draait (te controleren met een teller in `?meten`).

### Fase 2: canvaslaag met frustum culling

- **Model: Opus 5.5**: Leaflet-binnenwerk (panes, `pixelOrigin`, zoomanimatie). Een fout hier kost dagen zoeken.

Nieuwe bestanden:

- `src/componenten/vliegtuigCanvas.ts`: de Leaflet-laag (een klasse op `L.Layer`) met het canvas, de lus, de culling en de klikdetectie.
- `src/componenten/VliegtuigLaag.tsx`: de koppeling met React (`useMap` + `useEffect`, net als `NaarGekozen` en `VolgGebied`).

| Stap | Wat |
|---|---|
| 2.1 | Een eigen pane `vliegtuigen` met z-index 450: boven de cirkel (400) en onder de popups (700). Het canvas krijgt `pointer-events: none`, dus klikken gaan naar de kaart en we zoeken zelf uit welk vliegtuig je raakt. |
| 2.2 | **Sprites:** per niveau (5 stuks) plus de witte selectiering één keer vooraf tekenen op een offscreen-canvas, op `devicePixelRatio`, met de donkere rand en de schaduw erin gebakken. Dat vervangt de CSS-`drop-shadow` per element. |
| 2.3 | Per pakket per vliegtuig de wereldcoördinaten opslaan (`map.project(latlng, 0)`). Dat is de enige plek met sin en log. |
| 2.4 | **Per beeldje:** scherm = wereld × 2^zoom − `pixelOrigin`. Dan de **culling** tegen de zichtbare rechthoek + 40 px marge. Alleen de zichtbare vliegtuigen krijgen `setTransform` (draaiing = koers) + `drawImage`. Hogere niveaus tekenen we als laatste, zodat ze bovenop liggen. Niveau ≥ 3 krijgt een pulsring op tijd, het gekozen vliegtuig een witte ring. |
| 2.5 | De lijst met getekende schermposities is meteen de **kliklijst**. Klik op de kaart: het dichtstbijzijnde vliegtuig binnen 14 px wordt gekozen (`kies(id)`). Bij `mousemove` (max 1× per beeldje) wordt de cursor een handje. |
| 2.6 | **Zoomanimatie** zoals Leaflets eigen `L.Renderer`: bij `zoomanim` het canvas met CSS schalen en even niet tekenen, en bij `zoomend` opnieuw tekenen. Tijdens `flyTo` en pannen gewoon elk beeldje tekenen. |
| 2.7 | **Formaat en DPR:** bij `resize` van de kaart het canvas meeschalen. |
| 2.8 | **Alleen tekenen als het nodig is:** beweegt het snelste zichtbare vliegtuig minder dan 0,5 px sinds het vorige beeldje, dan slaan we het beeldje over (uitgezoomd op 1000 km bewegen vliegtuigen ±0,1 px/s). Zijn er pulsringen zichtbaar, dan max 30 fps. Bij pannen of zoomen tekenen we meteen. Staat de tab op de achtergrond, dan stopt rAF vanzelf. |
| 2.9 | **Popup:** één react-leaflet-`<Popup position>` voor het gekozen vliegtuig, in plaats van één per marker. De laag schuift hem mee met `popup.setLatLng` (één element). Klik je op een lege plek of sluit je de popup, dan is er niets meer gekozen. `NaarGekozen` vliegt alleen als je in de lijst kiest. |
| 2.10 | **Filter:** de laag krijgt alle vliegtuigen plus het filter. Verborgen vliegtuigen houden zo hun beweging en komen op de juiste plek terug. |
| 2.11 | Het oude gebruik van `PlaneMarker` en `vliegtuigIcon` in `MapDashboard.tsx` uitcommentariëren (niet verwijderen), met een kopregel in beide bestanden. |
| 2.12 | De meter krijgt de teken-ms per beeldje en het aantal zichtbaar/totaal erbij. |
| 2.13 | *Alleen als de meting erom vraagt:* bij zoom ≤ 6 en meer dan 1.500 zichtbare vliegtuigen een kleiner icoon (16 px), en de pulsringen op een tweede canvas, zodat het hoofdcanvas weinig opnieuw getekend hoeft te worden. |

In deze fase springen de posities nog op dezelfde manier als nu (een korte overgang). De echte beweging komt in fase 3. Zo kun je de culling los testen.

**Klaar als:** pannen en zoomen met 5.000 nep-vliegtuigen soepel gaan (doel: ≥ 55 fps in de meter en ≤ 4 teken-ms helemaal uitgezoomd), en klikken, popup, lijst en filter werken zoals nu.

**Uitkomst fase 2 (30-10-2026): gebouwd en getest.**

**Getest:**
- 43 automatische controles slagen, zowel in de build als in de dev-server (met StrictMode).
- De tekening is op pixelniveau vergeleken met Leaflets eigen projectie, na: laden, filter, nieuw pakket, flyTo, scrollwiel-zoom, klein en groot slepen, en inzoomen.
- Verder gecontroleerd: de culling-telling, klikken, het hover-handje, Esc, klik op een lege plek, de popup die meeschuift, en geen fouten in de console.
- Oud en nieuw zijn naast elkaar gefotografeerd (zelfde data, pixeldichtheid 2) en niet van elkaar te onderscheiden.

**Fps-doel: gehaald.** 5.000 vliegtuigen geeft 58 / 57 / 60 fps (rust / slepen / zoomen); de oude versie gaf 0,2 / 0,2 / 0,1.

**Tekentijd-doel (≤ 4 ms helemaal uitgezoomd): niet gehaald.**
- Met 5.000 vliegtuigen in beeld kost één tekenbeurt ±22 ms op deze laptop. Gecontroleerd: headless Edge gebruikt de echte videokaart, een Intel HD P530.
- De kosten zitten per tekenopdracht, niet per pixel: een icoon van 16 px scheelt minder dan 10 %.
- Je merkt het weinig, omdat de laag niet per beeld tekent:
  - slepen schuift het canvas via de videokaart;
  - zoomen schaalt het canvas met css;
  - volledig hertekenen gebeurt alleen bij een nieuw pakket (0,8 s), na het zoomen, en als het beeld buiten de marge komt.
- Zie besluit D7.

**Afwijkingen van het plan, met reden:**
- **Pulsringen meteen op een eigen canvas** (een deel van stap 2.13). Anders tekent één verdacht vliegtuig in beeld alle vliegtuigen 30× per seconde opnieuw.
- **Iconen vooraf gedraaid in één atlas**, in stappen van 5° zoals het oude icoon. Tekenen is dan een kale kopie op een hele pixel. Een eerste versie met 360 losse canvassen maakte elk beeld ±400 ms trager; met één atlas gebeurt dat niet.
- **Klikken en hover zoeken direct in de vliegtuigen**, met hun huidige positie (binnen 14 px), in plaats van in een lijst van de vorige tekenbeurt. De uitkomst is hetzelfde, en het klopt ook tijdens slepen of een overgang.

**Gedrag dat bewust anders is dan eerst:**
- Een klik op een vliegtuig op de kaart kiest het ook: witte ring, en de lijst licht op als hij erin staat. De kaart vliegt dan niet. Kiezen in de lijst vliegt zoals eerst.
- Klik op een lege plek of druk op Esc: dan is er niets meer gekozen. Eerst ging alleen de popup dicht en bleef de witte ring staan.
- De popup komt helemaal in beeld, omdat Leaflet hem pas opmeet als de inhoud er staat. Eerst viel een popup bovenaan de kaart half buiten beeld.

**Zelf kijken:**
1. Start `npm run server:nep` en `npm run dev`.
2. Open `http://localhost:5173/?meten`.
3. Kijk in de meter naar "tekenen max … ms" en "zichtbaar X van Y". Zoom in: Y blijft gelijk en X daalt, dat is de frustum culling.

### Fase 3: echt bewegen (gegist bestek)

- **Model: Opus 5.5**: werken met drie klokken (server, OpenSky en browser) plus de interpolatie. Fouten zie je vaak pas na minuten.

Nieuw bestand: `src/beweging.ts` met pure functies, zonder Leaflet of React, zodat het makkelijk te controleren is.

| Stap | Wat |
|---|---|
| 3.1 | De server stuurt bij elk pakket `{ tijd, nu }` mee: `tijd` is de OpenSky-tijd van de momentopname, `nu` de serverklok in ms. De app onthoudt `klokVerschil = nu − Date.now()`, zodat we nooit afhangen van de klok van de pc waarop de browser draait. Socket.IO kan meerdere argumenten sturen: `emit('flights', vliegtuigen, { tijd, nu })` blijft dus achterwaarts werken. |
| 3.2 | Per vliegtuig een **basis**: de positie op `time_position` (index 3, of `tijd` als die leeg is), de snelheid (9) en de koers (10). Daaruit komt per pakket één snelheidsvector in wereldeenheden per seconde. |
| 3.3 | **Per beeldje:** positie = basis + vector × (nu − `time_position`). Op de grond (index 8) of onder 5 m/s rekenen we niet door. |
| 3.4 | **Nieuw pakket:** het verschil tussen waar het vliegtuig nu getekend staat en de nieuwe berekende positie wordt een afwijking, die in ±1,5 s uitdooft (smoothstep). Er is dus nooit een sprong en het vliegtuig vliegt altijd op zijn echte snelheid. De draaiing van het icoon dooft ook uit, langs de kortste kant (350° → 10° gaat via 0°). |
| 3.5 | Bij een groot verschil (> 5 km, of meer dan 30 s geen data) dooven we niet uit maar zetten we het vliegtuig meteen goed. Dan was er een gat in de data of is het een ander toestel met dezelfde code. |
| 3.6 | Komt er geen nieuwe data (D2), dan vliegt het vliegtuig nog max(60 s, 1,5 × interval) door en staat daarna stil, half doorzichtig. |
| 3.7 | De popup en `NaarGekozen` gebruiken de berekende positie. |

**Klaar als:** vliegtuigen met de nep-bron én met OpenSky doorlopend op hun echte snelheid vliegen, er bij een update geen sprong te zien is tot zoom 10, en de kleine correctie in bochten alleen ingezoomd opvalt.

**Uitkomst fase 3 (30-10-2026): gebouwd en getest.**

**Getest:** 41 automatische controles slagen, zowel in de build als in de dev-server. Dat zijn alle controles van fase 2, aangepast aan bewegende vliegtuigen, plus de nieuwe controles hieronder. De tests draaien op poort 3002 (`--poort` in de server, `VITE_SERVER` in de app), zodat de echte radar op 3001 kan blijven draaien.

**Gegist bestek klopt:**
- Vliegtuigen die rechtdoor vliegen landen bij het volgende pakket precies op hun nieuwe positie: de correctie is mediaan 0,01 px op zoom 11. De nep-bron geeft daarvoor nu exacte posities op `time_position`.
- De snelheid op de kaart is de snelheid uit het pakket: grootste afwijking 0,16 %, gemeten bij 20 vliegtuigen.

**Geen sprong:** rond een pakket wijkt de stap per beeld maximaal 0,008 px af bij rechtdoor vliegen, en 0,01 px bij een draaiend vliegtuig (een correctie van 1 px die uitdooft).

**Popup en naartoe vliegen:**
- De popup volgt het bewegende vliegtuig: 0,000 px ernaast.
- Kiezen in de lijst vliegt naar waar het vliegtuig nú is: het komt op 0 px van het midden uit.

**Verouderd (D2):** een vliegtuig met een positie van 100 s oud staat stil en is half doorzichtig (alpha 128 van 255).

**Tekenen gaat mee met de zoom:**
- Zoom 7 met 1.000 vliegtuigen in beeld: 2 tekenbeurten per seconde (snelste vliegtuig 0,37 px/s).
- Zoom 12 met 5 vliegtuigen in beeld: 17 tekenbeurten per seconde.
- 5.000 bewegende vliegtuigen: 60 / 59 / 60 fps (rust / slepen / zoomen), met minder tekenbeurten dan in fase 2.

**Bij weinig pakketten zie je de bochten:**
- Met een pakket per 30 s (zoals anoniem nu) glijden draaiende vliegtuigen op zoom 10 tot 36 px (p95, max 61 px) naar hun plek, zacht in 1,5 s. Rechtdoor blijft ±0.
- Met een pakket per 10 s is dat p95 4 px.
- Fase 4 (vaker verversen) en fase 6 (adsb.lol) maken het in bochten dus veel rustiger. Zie ook "bocht voorspellen" in hoofdstuk 9.

**Afwijkingen van het plan, met reden:**
- **Meteen goed zetten** gebeurt bij meer dan 25 km verschil (plan: 5 km), of bij een gat in de data van meer dan max(30 s, 2,5 × interval) (plan: 30 s). Met de huidige verversing van 30–120 s zou de regel uit het plan bijna elk vliegtuig hard neerzetten in plaats van laten uitdoven.
- **De koers dooft ook uit**, maar het icoon draait in stappen van 5° (de atlas uit fase 2).
- **Tekentempo:** een uitdovende correctie en een draaiing tellen ook mee, omgerekend naar pixels per seconde. Zolang er iets beweegt is er minstens elke 2 s een tekenbeurt.
- **Erbij gekomen:**
  - De server heeft `--poort` (een testserver naast de echte), de app heeft `VITE_SERVER` (standaard localhost:3001).
  - De server stuurt bij elk pakket `{ tijd, nu }` mee als tweede argument. Een oude app negeert dat; een nieuwe app met een oude server rekent met zijn eigen klok.

**Zelf kijken:** met `?meten` staat in de meter "correctie mediaan … px". Rechtdoor vliegen hoort daar ±0 te geven; het p95 en het maximum zijn de bochten.

### Fase 4: verversen instelbaar, OpenSky-account en tegoed

- **4a, server: Model: Opus 5.5**: het token, de limieten en de race-bug. Een fout hier kost een dag tegoed.
- **4b, paneel: Model: Sonnet 5.5**: UI in de stijl van het bestaande paneel.

| Stap | Wat |
|---|---|
| 4a.1 | `.env` laden met `process.loadEnvFile()` (Node ≥ 20.12, geen extra pakket). `.env` staat al in `.gitignore`. Erbij komt een `.env.example` met lege `OPENSKY_CLIENT_ID=` en `OPENSKY_CLIENT_SECRET=`. |
| 4a.2 | OAuth client credentials in `dev-server.mjs` (met `fetch`, zonder axios). Het token wordt bewaard en ±1 min vóór het na 30 min verloopt vernieuwd, of zodra er een 401 komt. Zonder `.env` werkt alles anoniem, zoals nu. **Zonder echte key te testen:** de token-url is te overschrijven met `OPENSKY_TOKEN_URL`, en een klein testscript in de scratchpad speelt een nep-tokenserver (token, verlopen token, 401, 429). Zo is de logica gecontroleerd; alleen de echte inlog volgt thuis. |
| 4a.3 | Socket-event `verversen` met `{ stand }`. Interval = kosten per aanvraag × 3600 / budget per uur (Zuinig 120, Normaal 360). Nooit korter dan OpenSky levert (10 s anoniem, 5 s met account). Snel = precies dat minimum. |
| 4a.4 | `X-Rate-Limit-Remaining` uitlezen en als event `tegoed` doorsturen. Bij een 429 wachten volgens `X-Rate-Limit-Retry-After-Seconds`, en in het paneel melden: "tegoed op, weer om hh:mm". |
| 4a.5 | Is de momentopname hetzelfde gebleven (`time` onveranderd), dan niet opnieuw versturen. |
| 4a.6 | Bugs B1 (versienummer per socket), B2 (`Number.isFinite`) en B3 (oude antwoorden opruimen). |
| 4a.7 | **Gelijktijdige aanvragen voor hetzelfde gebied delen één fetch** (een lopende aanvraag onthouden). Gezien op 30-10: bij het starten verbonden twee apps tegelijk en gingen er twee OpenSky-aanvragen uit (274 en 273 vliegtuigen), dus dubbel tegoed. De cache helpt pas als het eerste antwoord binnen is. Hetzelfde gebeurt na elke herlaadbeurt van de pagina. |
| 4b.1 | Paneelblok **Verversen**: drie knoppen (Zuinig / Normaal / Snel) en daaronder "elke X s · Y tegoed per uur · nog Z (± N uur)". Zonder account komt er een kleine regel bij: "Met een gratis OpenSky-account 10× zoveel tegoed en elke 5 s nieuwe data." |
| 4b.2 | De gekozen stand onthouden in `localStorage` (met try/catch). |
| 4b.3 | De voettekst van het paneel en het README-blok "OpenSky-tegoed" bijwerken. |

Wat de standen kosten rond Nederland:

| Stand | 200 km | 250 km | 1000 km | Anoniem houdt het vol | Met account |
|---|---|---|---|---|---|
| Zuinig (120/uur) | 30 s | 60 s | 120 s | 3 u 20 | 33 u |
| Normaal (360/uur) | 10 s | 20 s | 40 s | 1 u 07 | 11 u |
| Snel, anoniem | 10 s | 10 s | 10 s | 1 u 07 (200 km) | – |
| Snel, met account | 5 s | 5 s | 5 s | – | 5 u 33 (200 km) · 2 u 47 (250 km) |

**Klaar als:** wisselen van stand meteen werkt, het paneel het juiste interval en tegoed toont, een 429 de server niet laat crashen, en twee tabs met hetzelfde gebied samen één aanvraag kosten.

**Uitkomst fase 4a, de server (30-10-2026): gebouwd en getest.**

**Het inloggen** gebeurt alleen tussen de server en OpenSky. Wie de radar bekijkt, logt nooit in. Zonder `.env` blijft alles anoniem, zoals eerst.

**Getest:** 21 automatische controles tegen een nep-OpenSky (`scratchpad/meten/nepopensky.mjs`: token en states, met tegoed, 429 en ingetrokken tokens). De server praat ermee via `OPENSKY_API_URL` en `OPENSKY_TOKEN_URL`.
- **Anoniem:**
  - De standen per gebiedsgrootte kloppen, gecontroleerd voor 8 combinaties. Zuinig is precies de oude tabel.
  - Het tegoed wordt doorgegeven aan de app.
  - B2: lat 0 en lon 0 blijven 0.
  - 4a.7: twee apps die tegelijk hetzelfde gebied vragen, kosten één aanvraag.
  - B1: een trage oude aanvraag komt niet meer binnen na de nieuwe.
  - 4a.5: dezelfde momentopname wordt niet opnieuw gestuurd.
  - 429: het tegoed gaat naar 0, alle apps pauzeren, en daarna gaat het weer verder.
- **Met account:**
  - Er wordt één keer ingelogd en de aanvraag gaat met token.
  - De standaardstand is normaal (D3), en snel is 5 s.
  - Het token wordt op tijd vernieuwd.
  - Na een 401 komt er binnen 7 ms een nieuw token en een nieuwe poging.
  - Met een verkeerde key gaat de server verder anoniem.
- **App en nieuwe server samen:** de 41 controles van fase 3 slagen nog.
- **Niet automatisch getest:** B3 (oude antwoorden na 10 min weggooien), omdat dat 10 minuten duurt. De code is een simpele lus bij elke aanvraag.

**De echte radar** is herstart en de log toont nu het tegoed: om 16:14 nog 314 van de 400. Zuinig kost 120 per uur, dus nog ±2,5 uur voor die dag.

**Uitkomst fase 4b, het paneel (30-10-2026): gebouwd en getest.** Gebouwd met Opus 5.5 in plaats van Sonnet: Tristan begon zonder te wisselen.

**Wat er gebouwd is:**
- **Blok Verversen** onder Bereik: drie knoppen met de seconden per stand voor het huidige gebied. De server stuurt die mee (`standen` in `gebied`), zodat de app zijn rekenregels niet hoeft na te doen.
- **Onder de knoppen:** "X tegoed per uur · nog Y (± Z uur)". Is het tegoed op, dan in rood: "Tegoed op. Weer nieuwe posities om hh:mm".
- **Uitleg:** zonder account een regel over wat een gratis account oplevert, met account de regel "Met OpenSky-account".
- **"elke X s ververst"** is van Bereik naar Verversen verhuisd.
- **Onthouden:** de keuze blijft in de browser (`localStorage`, met try/catch). De app stuurt hem ook opnieuw na een herstart van de server. Niets gekozen? Dan geldt de standaard van de server (D3).
- **Nieuw bestand:** `src/verversen.ts` (de standen, onthouden, en "hoe lang nog" in gewone taal).
- **Teksten:** de voettekst van het paneel en de README zijn bijgewerkt (blok "OpenSky-tegoed en verversen" plus "Met een OpenSky-account").

**Getest:**
- 12 UI-controles met de echte server tegen de nep-OpenSky (`check4b.mjs`):
  - de standaardstand anoniem (Zuinig) en met account (Normaal);
  - de knoppen "60 / 20 / 10 s" (met account snel 5 s) en de tegoedregel ("nog 398 (± 3,5 uur)");
  - kiezen en onthouden, ook na herladen;
  - de melding "Tegoed op" bij een 429, en dat die na de pauze weer weggaat;
  - geen fouten in de console.
- De 21 servercontroles (4a) en de 41 kaartcontroles (fase 3) slagen nog.
- Foto van het paneel bekeken: het blok past bij de stijl van de rest.

**Wat de server nu stuurt, voor 4b:**

| Bericht | Inhoud |
|---|---|
| `gebied` | `{ lat, lon, km, seconden, stand, standen (seconden per stand, sinds 4b), credits (per aanvraag), perUur }` |
| `tegoed` | `{ bron, account, over, pauzeTot, minSeconden }` |
| `verversen` (luistert) | `{ stand: 'zuinig' \| 'normaal' \| 'snel' }` |

**Aanvullingen op het plan:**
- Ook het API-adres is in te stellen (`OPENSKY_API_URL`), niet alleen het token-adres. Zo raakt de test OpenSky helemaal niet.
- Weigert OpenSky de login (verkeerde key), dan gaat de server verder anoniem en meldt dat één keer in de terminal, in plaats van te blijven proberen.
- Een 429 zonder Retry-After-header betekent 10 minuten wachten.
- De nep-bron (`--nep`) houdt zijn eigen tempo (`--elke`). De standen gelden alleen voor OpenSky.

### Fase 5: bereikcirkel verslepen (dubbelklik)

- **Model: Opus 5.5**: de volgorde van events in Leaflet. Dubbelklik-zoom, kaart slepen en klikken op vliegtuigen lopen door elkaar.

Nieuw bestand: `src/componenten/GebiedCirkel.tsx`. Het vervangt de `<Circle>` in `MapDashboard.tsx`; de oude wordt uitgecommentarieerd.

| Stap | Wat |
|---|---|
| 5.1 | Ga je met de muis over de **rand** (±12 px) of over het **middelpuntkruisje**, dan wordt de cursor `move`, licht de cirkel zacht op en verschijnt de tooltip "Dubbelklik om te verslepen". Zo is het te ontdekken. |
| 5.2 | Een **dubbelklik** op de rand of het kruisje vangen we af in de capture-fase op de kaartcontainer, zodat Leaflets dubbelklik-zoom daar niet afgaat. Overal anders blijft dubbelklik-zoom gewoon werken. |
| 5.3 | **Verplaatsmodus:** de lijn wordt doorgetrokken en feller en `map.dragging` gaat uit. Indrukken en slepen gaat met pointer events en `setPointerCapture` (muis én touch). De cirkel beweegt mee met het punt waar je hem vastpakte, zonder naar de cursor te springen. Tijdens het slepen beweegt alleen de Leaflet-cirkel (`setLatLng`): geen React-state per beweging en geen aanvragen. |
| 5.4 | **Loslaten:** `setMidden(nieuw punt)`, dan de bestaande 500 ms wachttijd, dan naar de server. Het paneel toont "Nieuw gebied laden…" en vliegtuigen buiten de nieuwe cirkel worden gedimd tot de nieuwe data er is. Esc tijdens het slepen zet de cirkel terug. Een klik buiten de cirkel sluit de modus af. |
| 5.5 | D5: na het loslaten blijft de kaart staan (`VolgGebied` slaat deze wijziging over). De knoppen "Midden van de kaart" en "Nederland" vliegen zoals nu. |
| 5.6 | De breedtegraad wordt begrensd op ±85 (Mercator). De lengtegraad normaliseert de server al. |
| 5.7 | **Touch:** Leaflet maakt de dubbele tik zelf na. Vangt de capture-truc die niet af, dan werkt het kruisje met indrukken-en-vasthouden (500 ms) als alternatief. Dit wordt getest in fase 7. |
| 5.8 | In het paneel bij Bereik de regel: "Dubbelklik op de rand van de cirkel om hem te verslepen." |

**Klaar als:** dubbelklik op de rand → slepen → loslaten binnen ongeveer één interval nieuwe vliegtuigen geeft en de kaart niet wegspringt, dubbelklik elders gewoon zoomt, en klikken op een vliegtuig binnen de cirkel blijft werken.

**Uitkomst fase 5 (30-10-2026): gebouwd en getest.**

**Wat er gebouwd is** (`src/componenten/GebiedCirkel.tsx`, vervangt de `<Circle>`):
- **Muis op de rand (±12 px) of op het kruisje:** verplaats-cursor, een lichtere lijn en de hint "Dubbelklik om de cirkel te verslepen".
- **Dubbelklik op de rand of het kruisje:** wordt in de capture-fase afgevangen, dus geen zoom. De cirkel wordt doorgetrokken en fel, en de kaart is even niet te slepen. Dubbelklik ergens anders zoomt gewoon.
- **Slepen** gebeurt met pointer events. Alleen de Leaflet-cirkel beweegt: geen React-state en geen aanvragen per beweging.
- **Loslaten** zet het nieuwe midden. De kaart blijft staan (D5), en vliegtuigen buiten het nieuwe gebied worden gedimd tot de nieuwe data er is.
- **Afbreken:** Esc zet de cirkel terug, een klik buiten de cirkel stopt de modus.
- **De breedtegraad** stopt op 85°.
- **Aanraakscherm:** dubbel tikken op de rand en meteen doorschuiven.
- **In het paneel** staat bij Bereik: "Dubbelklik op de rand van de cirkel om hem te verslepen."

**Getest:**
- 22 automatische controles slagen, zowel in de build als in de dev-server (`check5.mjs`): hover, beide soorten dubbelklik, slepen tot op de pixel (180 en 90 px), de kaart die blijft staan, dimmen (alpha 89 = 0,35 × 255), het nieuwe gebied, Esc, klik buiten de cirkel, 85°, de knop "Nederland", de lijst, popups en touch.
- De regressietests slagen ook: fase 3 (41) en het paneel (12).
- Foto's van de hint en de verplaatsmodus bekeken.

**Bug gevonden en opgelost (zat er sinds fase 2):**
- `PopupKlaar` draaide in een `useLayoutEffect`. Op dat moment is de ref van de popup in react-leaflet nog leeg, dus er gebeurde niets.
- Gevolg: `autoPan` bleef aan. Een gekozen vliegtuig dat naar de rand vloog kon de kaart laten meeschuiven, en een popup die opnieuw opengaat (filter aan en uit, of het vliegtuig zit ook in het nieuw gesleepte gebied) liet de kaart wegspringen. Dat botst met D5.
- Nu: de popup begint met `autoPan` uit, en `PopupKlaar` draait in een gewoon `useEffect`. Alleen als je een vliegtuig net kiest, schuift hij één keer in beeld, met de echte maat van de inhoud.
- Twee nieuwe controles bewaken dit: een popup bovenaan komt op 5 px van de rand, en opnieuw openen verschuift de kaart 0,0000°.

**Afwijkingen van het plan:**
- **5.7 touch:** dubbel tikken en meteen slepen werkt (getest met nagebootste touch in Edge). Het alternatief "kruisje 500 ms vasthouden" was daardoor niet nodig. Een test op een echte telefoon blijft voor T13 in fase 7.
- **Stand en dimmen:** komt er tijdens de wachttijd van 500 ms (vóór de aanvraag voor het nieuwe gebied) nog een gewoon pakket voor het oude gebied binnen, dan verdwijnen het dimmen en "Nieuw gebied laden…" iets te vroeg. Dat het paneel "bezig" bij elk pakket wist, deed het al. Klein, en niet opgelost.
- **Datumgrens:** sleep je de cirkel over de datumgrens (±180°), dan staat hij soms op een andere kopie van de wereld dan de vliegtuigen. Niet opgelost.

### Fase 6: adsb.lol als tweede bron (alleen bij D6 = a of b)

- **Model: Opus 5.5**: eenheden omrekenen (voet → m, knopen → m/s, voet/min → m/s), en daar leunen de dreigingsregels op. Eén fout en alles wordt "verdacht".

| Stap | Wat |
|---|---|
| 6.1 | **Adapter** in de server: de JSON van adsb.lol wordt precies de OpenSky-statevector (dezelfde indexen), zodat `planeUtils`, het paneel en de popup niet hoeven te veranderen: `[hex, flight, land, now−seen_pos, now−seen, lon, lat, alt_baro×0,3048 (of "ground" → op de grond), op de grond, gs×0,514444, track, baro_rate×0,00508, null, alt_geom×0,3048, squawk, spi, 0]`. Het land ontbreekt, dus toont de popup dan het type en de registratie (`t`, `r`). |
| 6.2 | Keuze **Bron: OpenSky / adsb.lol** in het paneel. Bij adsb.lol gaat de schuif tot max 450 km (±243 NM; de API kan max 250 NM). |
| 6.3 | Intervallen bij adsb.lol: Zuinig 15 s, Normaal 5 s, Snel 2 s. Bij een 429 of 5xx verdubbelt de wachttijd (tot max 60 s). Na 3 fouten op rij gaat de server automatisch terug naar OpenSky, met een melding. |
| 6.4 | Bronvermelding "data: adsb.lol" in de kaarthoek als die bron gekozen is. De licentie (volgens adsb.lol ODbL) controleren tijdens het bouwen. |
| 6.5 | `dbFlags` (militair) apart bewaren in een eigen veld. Het wordt nog niet gebruikt, zie hoofdstuk 9. |

**Klaar als:** wisselen van bron werkt zonder herladen, en de waarden in de popup in dezelfde orde liggen als bij OpenSky (vergelijk 3 vliegtuigen naast elkaar).

### Fase 7: meten, testen en README

- **Model: Sonnet 5.5**: meten en documenteren volgens de lijst.

| Stap | Wat |
|---|---|
| 7.1 | Dezelfde meting als in fase 0, nu met de nieuwe versie. De cijfers komen in hoofdstuk 8. |
| 7.2 | De testlijst T1–T15 (hoofdstuk 7). Die test je zelf in de browser. |
| 7.3 | README bijwerken: Gebruik (verversen, slepen, bron), het OpenSky-account met `.env`, Node ≥ 20.12, en de tabel met bestanden (inclusief de nieuwe). |

---

## 6. Afvinklijst

> De Model-regel blijft staan, ook na het afvinken.

- [x] **Fase 0**: meetpunt en nep-bron · **Model: Sonnet 5.5** · af 30-10-2026
- [x] **Fase 1**: data één keer verwerken · **Model: Sonnet 5.5** · af 30-10-2026, 11 schermcontroles slagen, 8,1 → 1,0 aanroepen per vliegtuig
- [x] **Fase 2**: canvaslaag met frustum culling · **Model: Opus 5.5** · af 30-10-2026, 43 controles slagen (build + dev), fps-doel gehaald, tekentijd-doel niet (22 ms bij 5.000 in beeld, zie D7)
- [x] **Fase 3**: echt bewegen (gegist bestek) · **Model: Opus 5.5** · af 30-10-2026, 41 controles slagen (build + dev), rechtdoor ±0 px correctie, 5.000 bewegende vliegtuigen 60/59/60 fps
- [x] **Fase 4a**: server (account, verversstanden, tegoed, B1–B3) · **Model: Opus 5.5** · *zonder key te bouwen en te testen; de echte-key-controle (T9, stand Snel) volgt thuis* · af 30-10-2026, 21 controles tegen een nep-OpenSky + 41 van fase 3 slagen
- [x] **Fase 4b**: paneelblok Verversen · **Model: Sonnet 5.5** · af 30-10-2026 (gebouwd met Opus 5.5), 12 UI-controles + 21 server + 41 kaart slagen
- [x] **Fase 5**: bereikcirkel verslepen · **Model: Opus 5.5** · af 30-10-2026, 22 controles (build + dev) + regressie 41 + 12, popup-bug uit fase 2 opgelost
- [ ] **Fase 6**: adsb.lol als tweede bron (D6) · **Model: Opus 5.5**
- [ ] **Fase 7**: meten, testen en README · **Model: Sonnet 5.5**

**Volgorde:** 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Fase 2, 3 en 5 raken alle drie `MapDashboard.tsx`, dus ze kunnen niet tegelijk. Fase 4a (alleen de server) kan wel parallel aan fase 2 of 3.

---

## 7. Testlijst

| # | Test |
|---|---|
| T1 | 5.000 nep-vliegtuigen, helemaal uitgezoomd: pannen en zoomen gaan soepel (meter ≥ 55 fps). |
| T2 | Ingezoomd op Schiphol: de meter toont maar een klein deel van het totaal als getekend (de culling werkt). |
| T3 | Een vliegtuig vliegt uit beeld en weer terug: het komt op de juiste plek terug. |
| T4 | Klik op een vliegtuig: popup en witte ring verschijnen, en de popup vliegt mee. |
| T5 | Klik in de lijst: de kaart vliegt erheen en de popup opent. Staat er een filter op een ander niveau, dan gaat dat eraf (zoals nu). |
| T6 | Filter op een niveau: alleen die vliegtuigen. Filter eraf: de verborgen vliegtuigen staan op de juiste plek. |
| T7 | Er komt een update binnen: geen zichtbare sprong (tot zoom 10). |
| T8 | OpenSky geeft een 429 of de server staat uit: geen crash, vliegtuigen stoppen na de tijd van D2, het paneel toont een melding. |
| T9 | Verversen op Zuinig, Normaal en Snel: interval en tegoed in het paneel kloppen met de terminal van de server. |
| T10 | Dubbelklik op de rand → slepen → loslaten: het nieuwe gebied laadt en de kaart blijft staan. |
| T11 | Dubbelklik elders zoomt zoals altijd. Esc tijdens het slepen zet de cirkel terug. |
| T12 | Twee tabs met hetzelfde gebied: één aanvraag in de terminal van de server. |
| T13 | Touch (telefoon, of touch-emulatie in Edge DevTools): dubbele tik op de rand, of het kruisje vasthouden. |
| T14 | adsb.lol: wisselen werkt, de schuif gaat tot max 450 km, de waarden in de popup zijn logisch. |
| T15 | Tab 5 min op de achtergrond en dan terug: er stapelt niets op en de vliegtuigen staan meteen goed. |

---

## 8. Meetresultaten (invullen in fase 0 en 7)

| Nep-vliegtuigen | Versie | fps in rust | fps pannen | fps zoomen | teken-ms | zichtbaar/totaal |
|---|---|---|---|---|---|---|
| 1.000 | oud | 30 (traagste beeld 250 ms) | 19 (450 ms) | 12 (434 ms) | – | alles |
| 3.000 | oud | 2,5 (1.084 ms) | 1,3 (2.719 ms) | 0,8 (2.586 ms) | – | alles |
| 5.000 | oud | 0,2 (11.009 ms) | 0,2 (8.591 ms) | 0,1 (8.374 ms) | – | alles |

**Zo is gemeten (30-10-2026, werklaptop):** productiebuild (`vite build` + `vite preview`), headless Edge via Playwright op 1440×900, de kaarttegels geblokkeerd zodat alleen het tekenen van de vliegtuigen telt, nep-bron met `--elke 10`. Rust = 12 s waarin 1 nep-antwoord binnenkomt; pannen = 8 s een rondje slepen; zoomen = 3 stappen in en 3 uit met het scrollwiel. Headless Edge tekent zonder videokaart, dus de getallen liggen lager dan op een echt scherm. De **verhouding oud/nieuw** is wat telt, niet de absolute fps. Twee runs op 1.000 vliegtuigen gaven 41/29/22 en 30/19/12 fps (rust/pannen/zoomen): reken op ±30 % ruis, bij 3.000 en 5.000 doet dat er niet toe.

**Wat de dreigingsregels kosten:** `getSuspicionReasons` draaide **8,1 tot 8,5 keer per vliegtuig per pakket** (1.000 vliegtuigen: 8.080 aanroepen per pakket). Na fase 1 is dat **1,0** (gemeten bij 1.000, 3.000 en 5.000 vliegtuigen).

**Wat fase 1 voor de fps doet: niets merkbaars, en dat klopt.** Oud en nieuw om en om gemeten op 1.000 vliegtuigen (2 rondes, zelfde build-methode): oud 33/22/17 en 37/31/22 fps, nieuw 35/31/21 en 37/24/12 (rust/pannen/zoomen). Dat valt binnen de ruis. Bij 3.000 en 5.000 vliegtuigen ligt het in dezelfde orde als eerder. De 8.000 aanroepen kostten maar milliseconden; de tijd zit in de duizenden DOM-markers. Fase 1 is dus schoonmaak en voorbereiding (de Map met beoordelingen gebruikt de canvaslaag van fase 2), de fps-winst komt in fase 2. Eén eerdere run na fase 1 gaf 17/12/8 fps op 1.000 vliegtuigen; die kwam in de herhaling niet terug (oorzaak niet uitgezocht, waarschijnlijk andere belasting op de laptop). Reken op ruis van ±25 %.

**Na fase 2:**
- Tussen haakjes staat het traagste beeld in het meetvenster. Teken-ms is de tijd van één volledige tekenbeurt van de laag.
- In de beginstand staan alle vliegtuigen in beeld (zichtbaar = totaal). De culling zie je pas als je inzoomt: op zoom 13 werd 1 van de 1.000 vliegtuigen getekend.
- Rust en slepen tekenen nauwelijks: in 12 s rust zijn er ±48 tekenbeurten, allemaal tijdens de overgang van 0,8 s na het ene nep-pakket.
- Met 5.000 vliegtuigen hertekent slepen alleen als het beeld buiten de marge van 10 % komt.

**Na fase 3:** alles beweegt nu doorlopend. Toch tekent de laag in 12 s rust maar 20 keer, tegen 30–48 keer in fase 2: alleen als er iets een halve pixel verschuift. Uitgezoomd is dat zelden.

**Zelf meten (Tristan):** start `npm run server:nep` (5.000 nep-vliegtuigen, of `node dev-server.mjs --nep 1000 --elke 5` voor een ander aantal en tempo) en `npm run dev`, en open `http://localhost:5173/?meten`. Rechtsboven staan fps, de laagste fps en het traagste beeld van de laatste 10 s, het aantal vliegtuigen en hoe vaak de dreigingsregels per pakket draaien. In de dev-server draait React alles twee keer (StrictMode), dus daar staat 2,0 per vliegtuig in plaats van 1,0; een `npx vite build` + `npx vite preview` geeft de echte cijfers. Fps in de dev-server is lager dan in een build.
| 1.000 | na fase 1 | 35–37 (traagste 217–267 ms) | 24–31 | 12–21 | – | alles |
| 3.000 | na fase 1 | 1,3 | 0,6 | 0,5 | – | alles |
| 5.000 | na fase 1 | 0,2 | 0,1 | 0,1 | – | alles |
| 1.000 | na fase 2 | 60 (17 ms) | 60 (17 ms) | 60 (17 ms) | gem 2,4 · max 4,4 | 1.000/1.000 |
| 3.000 | na fase 2 | 60 (17 ms) | 60 (17 ms) | 60 (33 ms) | gem 5,7 · max 10,8 | 3.000/3.000 |
| 5.000 | na fase 2 | 58 (50 ms) | 57 (50 ms) | 60 (33 ms) | gem 22 · max 45 | 5.000/5.000 |
| 1.000 | na fase 3 | 60 (17 ms) | 60 (17 ms) | 60 (19 ms) | gem 3,6 · max 5,1 | 1.000/1.000 |
| 3.000 | na fase 3 | 60 (17 ms) | 60 (33 ms) | 60 (17 ms) | gem 5,8 · max 14 | 3.000/3.000 |
| 5.000 | na fase 3 | 60 (33 ms) | 59 (33 ms) | 60 (34 ms) | gem 21 · max 33 | 5.000/5.000 |
| 1.000 | nieuw | | | | | |
| 3.000 | nieuw | | | | | |
| 5.000 | nieuw | | | | | |

---

## 9. Niet in dit plan, wel interessant

- **Echte militaire herkenning:** adsb.lol heeft `/v2/mil` en `dbFlags` (bit 1 = militair). Daarmee weet je zeker dat een toestel militair is, in plaats van het te raden met de dreigingsregels. Dat past bij de naam van het project. Het is een eigen plan waard.
- **Bochten voorspellen** met `track_rate` van adsb.lol, zodat de correctie in bochten nog kleiner wordt.
- **Bochten voorspellen uit twee pakketten** (gemeten na fase 3). OpenSky geeft geen draaisnelheid, maar die is te schatten uit de koersverandering tussen twee pakketten, waarna je langs een boog doorrekent in plaats van rechtdoor. Dat scheelt veel zolang er maar elke 30–60 s een pakket komt: nu glijden draaiende vliegtuigen op zoom 10 tot 36 px (p95). Risico: een vliegtuig dat net uit de bocht komt, gaat in de voorspelling verder draaien.
- **Straal aanpassen** door aan de rand van de cirkel te slepen.
- **Een spoor** achter elk vliegtuig.

---

## 10. Taken voor Tristan

1. **OpenSky-key (niet blokkerend).** Je hebt een account met key op je eigen laptop. Die hoef je niet mee te nemen: fase 0 tot en met 7 kunnen zonder (zie hieronder). Thuis zet je de client id en het secret in `.env` (zie `.env.example`, komt in fase 4a) en doe je **één controle**: de stand "Snel" met het echte account (T9). Dat kost 10 minuten.
2. Antwoorden op de besluiten D1–D6, maar alleen waar je iets anders wilt dan het advies.
3. Testen met T1–T15.
4. Committen en pushen.

---

## 11. Werkafspraken

- Claude commit en pusht nooit.
- De stijl van comments volgt het bestand: in `src/` Nederlandse kleine letters met `//!` en `//?`, in `dev-server.mjs` Engelse kleine letters. Code die erbij komt of verandert krijgt een comment.
- Code die niet meer gebruikt wordt, wordt uitgecommentarieerd en nooit verwijderd.
- Ontwikkelen op de nep-bron, om OpenSky-tegoed te sparen.

---

## Bronnen

- [OpenSky REST API-documentatie](https://openskynetwork.github.io/opensky-api/rest.html): tegoed, kosten per vak, tijdresolutie, headers en OAuth2
- [adsb.lol API (openapi.json)](https://api.adsb.lol/api/openapi.json) en de [README van adsblol/api](https://github.com/adsblol/api): endpoints, limieten en de sleutel "in the future"
- [airplanes.live API-gids](https://airplanes.live/api-guide): 1 aanvraag per seconde en max 250 NM (via de zoekresultaten; de site zelf gaf ons een 403)
