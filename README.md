# Vliegtuigradar

Live kaart van het luchtruim rond Nederland. Elk vliegtuig krijgt een dreigingsniveau op basis van verdacht gedrag: hoge snelheid, geen callsign of squawk, lage hoogte, een actief noodsignaal, een koers die het vliegtuig binnen 10 minuten Nederland in brengt, of een snelle stijging of daling. De posities komen live van het [OpenSky Network](https://opensky-network.org) of, als je dat kiest, van [adsb.lol](https://adsb.lol).

Gebouwd met React, TypeScript, Vite, Tailwind CSS, Leaflet en Socket.IO.

## Wat je nodig hebt

- [Node.js](https://nodejs.org) 20.12 of nieuwer (met npm). De server leest `.env` met `process.loadEnvFile`, en dat bestaat pas sinds 20.12.
- Internet, voor de kaart en de vluchtgegevens

## Opstarten

1. Installeer de pakketten (één keer):

   ```bash
   npm install
   ```

2. Start de server in een eerste terminal. Die haalt de vluchten op bij OpenSky (of adsb.lol, als je dat kiest) en stuurt ze door naar de app:

   ```bash
   npm run server
   ```

   De server draait op `http://localhost:3001`. In de terminal zie je bij elke update hoeveel vliegtuigen er binnen het bereik zijn.

3. Start de app in een tweede terminal:

   ```bash
   npm run dev
   ```

   De app opent vanzelf in je browser op `http://localhost:5173`.

Stoppen doe je met `Ctrl+C` in beide terminals.

## Gebruik

- **Bereik:** met de schuif in het paneel kies je de straal, van 25 tot 3000 km (bij adsb.lol tot 450 km). Standaard is dat 250 km rond het midden van Nederland. Met **Midden van de kaart** wordt het midden van de kaart het nieuwe middelpunt, en **Nederland** zet het terug. Groter dan 3000 km kan niet: zo'n cirkel kan over een pool gaan, en die tekent de kaart niet meer als cirkel.
- **Hele wereld:** de knop **Hele wereld** toont alle vliegtuigen op aarde die OpenSky ziet, zonder cirkel (bij een test op 01-11-2026: 11.215). De kaart zoomt uit tot de hele aarde. Zo'n aanvraag kost 4 tegoed, dus OpenSky ververst minder vaak (Normaal: elke 40 s). adsb.lol kan dit niet (alleen tot 250 zeemijl rond een punt): kies je **Hele wereld** bij adsb.lol, dan gaat de radar naar OpenSky en zegt hij dat in het paneel. Schuif je de straal of kies je een midden, dan is het weer een cirkel.
- **Veel vliegtuigen in beeld:** staan er meer dan 5.000 vliegtuigen in beeld, dan tekent de kaart gekleurde puntjes in plaats van vliegtuigjes. Dat is ±10 keer sneller, zodat de kaart vlot blijft (60 fps met 10.000 vliegtuigen). Militaire toestellen en het gekozen vliegtuig blijven een vliegtuigje. Zoom je in, dan komen de vliegtuigjes terug.
- **Cirkel verslepen of groter maken:** dubbelklik op de rand van de cirkel of op het kruisje in het midden. Daarna:
  - sleep binnenin om de cirkel ergens anders heen te zetten;
  - sleep de rand om de straal te veranderen. Er staat dan een pijl op de rand, en een label met de km. De straal gaat in stappen van 25 km, tot 3000 km (450 km bij adsb.lol).

  Laat je los, dan haalt de server de vliegtuigen van het nieuwe gebied op, en de kaart blijft staan. De schuif in het paneel loopt mee. Met `Esc` zet je alles terug. Een dubbelklik ergens anders zoomt gewoon in.

  Op een aanraakscherm: dubbel tikken op de rand en meteen doorschuiven. Van het midden af of ernaartoe verandert de straal, langs de rand verplaatst de cirkel. Dubbel tikken op het kruisje verplaatst altijd.
- **Bron:** kies **OpenSky** (standaard) of **adsb.lol**. Zie [adsb.lol als tweede bron](#adsblol-als-tweede-bron). Ook deze keuze wordt in de browser onthouden.
- **Verversen:** kies **Zuinig**, **Normaal** of **Snel**. Dat bepaalt hoe vaak de server nieuwe posities ophaalt. Onder de knoppen staat hoeveel OpenSky-tegoed dat per uur kost en hoe lang het tegoed nog meegaat (zie [OpenSky-tegoed](#opensky-tegoed-en-verversen)). Je keuze wordt in de browser onthouden. Tussen twee verversingen door vliegen de vliegtuigen op hun snelheid en koers verder, dus ook op Zuinig bewegen ze over de kaart.
- **Dreigingsniveau:** de vijf niveaus zijn ook filters. Klik op een niveau om alleen die vliegtuigen te zien, en klik nog een keer om alles weer te tonen.
- **Militair:** bekende militaire toestellen hebben op de kaart een eigen vorm, een straaljager met deltavleugel. De kleur blijft het dreigingsniveau. Het paneel heeft een teller "Militair" en een lijst met callsign, type en registratie. Met **Alleen militair** zie je alleen die toestellen; dat kan samen met een dreigingsniveau. "Militair" telt niet mee als reden voor verdacht.
  - De herkenning komt uit de database van adsb.lol (`dbFlags`). Bij OpenSky haalt de server daarvoor elke minuut de militaire lijst van adsb.lol op (`/v2/mil`, kost geen OpenSky-tegoed).
  - Een militair toestel dat niet in die database staat, ziet de radar niet als militair.
- **Meest verdacht:** klik op een vliegtuig in de lijst. De kaart vliegt er dan naartoe en opent de gegevens.
- **Vliegtuig op de kaart:** klik erop voor hoogte, snelheid, koers, verticale snelheid, squawk, noodsignaal en de redenen waarom het als verdacht telt. Het vliegtuig krijgt een witte ring en de gegevens vliegen mee. Klik op een lege plek of druk op `Esc` om niets meer te kiezen.
- **Vliegtuigen zonder nieuwe positie** vliegen nog minstens een minuut door. Komt er dan nog steeds niets binnen, dan blijven ze half doorzichtig staan.
- **Bochten:** bij OpenSky op **Normaal** of **Snel** schat de app uit twee pakketten hoe snel een vliegtuig draait, en laat hij het tot 15 s langs een boog verder vliegen. Daarna gaat het rechtdoor. Op **Zuinig** (een minuut tussen de pakketten) en bij adsb.lol vliegt alles rechtdoor door, want daar hielp het niet. Zie `docs/plan-van-aanpak-herkenning-en-sporen.md`, fase 3.
- **Sporen:** achter elk vliegtuig staat een vervagend spoor van de laatste minuut, vanaf zoom 8. Achter het gekozen vliegtuig staat het altijd. Met de schakelaar **Sporen** in het paneel zet je ze uit; je keuze wordt onthouden.
- **Afgelegde route:** klik je op een vliegtuig, dan verschijnt meteen een gestippelde lijn van de route die hij al heeft afgelegd. Onderaan de popup staat waar die lijn vandaan komt:
  - **met een OpenSky-account:** de hele vlucht van OpenSky (`tracks`, door OpenSky zelf "experimenteel" genoemd, ongeveer één punt per 10 minuten), aangevuld met de punten die de server zelf onthoudt;
  - **zonder account, of bij adsb.lol:** de route sinds de radar het vliegtuig ziet. De server onthoudt van elk vliegtuig elke 20 s een punt, tot 2 uur terug.

  Kies je een ander vliegtuig, dan komt zijn route ervoor in de plaats.

| Kleur | Betekenis |
|---|---|
| Grijs | Normaal |
| Blauw | 1 reden |
| Oranje | 2 redenen |
| Rood | 3 redenen (met een pulserende ring) |
| Paars | 4 of meer redenen |
| Deltavorm (in een van de kleuren hierboven) | Militair toestel |

## OpenSky-tegoed en verversen

OpenSky werkt met tegoed. Elke aanvraag kost 1 tot 4 punten: hoe groter het gebied, hoe meer.

| | Tegoed per dag | Nieuwe data elke |
|---|---|---|
| Zonder account | 400 | 10 s |
| Met een gratis account | 4.000 | 5 s |

De stand bij **Verversen** is een budget in tegoed per uur, dus een groter gebied ververst vanzelf minder vaak:

| Stand | Tegoed per uur | tot ±200 km | 250 km | 600 km | 1000 km of meer, en de hele wereld |
|---|---|---|---|---|---|
| Zuinig | 120 | 30 s | 60 s | 90 s | 120 s |
| Normaal | 360 | 10 s | 20 s | 30 s | 40 s |
| Snel | zo veel als nodig | 10 s (5 s met account) | 10 s (5 s) | 10 s (5 s) | 10 s (5 s) |

Een vak van meer dan 400 vierkante graden kost bij OpenSky 4 tegoed, net als de hele wereld. Daarom kosten 1000 km, 3000 km en de hele wereld per aanvraag evenveel. Over de datumgrens of een pool vraagt de server de hele band van breedtegraden op, en houdt hij daarna alleen de cirkel over.

- **Hoe lang je het volhoudt:** zonder account houd je het met Zuinig ruim 3 uur per dag vol, met Normaal ruim een uur.
- **Standaardstand:** zonder account Zuinig, met account Normaal.
- **Tegoed op:** dan blijven de laatste vliegtuigen staan, toont het paneel wanneer er weer nieuwe posities komen, en wacht de server tot OpenSky dat toestaat. In de terminal staat bij elke aanvraag hoeveel tegoed er nog over is.

### Met een OpenSky-account

Alleen de server logt in bij OpenSky. Wie de radar bekijkt, logt nooit in.

1. Maak een gratis account op [opensky-network.org](https://opensky-network.org) en maak onder **Account** een **API Client** aan. Je krijgt een client id en een client secret.
2. Kopieer `.env.example` naar `.env` (in dezelfde map) en vul `OPENSKY_CLIENT_ID` en `OPENSKY_CLIENT_SECRET` in. `.env` staat in `.gitignore` en gaat dus niet mee naar GitHub.
3. Start de server opnieuw. In de terminal staat dan `opensky: with the api client from .env`.

Hiervoor is Node.js 20.12 of nieuwer nodig. Klopt de key niet, dan meldt de server dat en werkt hij gewoon anoniem verder.

## adsb.lol als tweede bron

[adsb.lol](https://adsb.lol) is gratis en heeft geen sleutel of tegoed nodig. De posities zijn vaak minder dan een seconde oud.

| | OpenSky | adsb.lol |
|---|---|---|
| Tegoed | 400 per dag, of 4.000 met een account | geen |
| Bereik | tot 3000 km, of de hele wereld | tot 450 km |
| Zuinig / Normaal / Snel | zie de tabel hierboven | 15 s / 5 s / 2 s |
| In de popup | land van herkomst | type en registratie (bijvoorbeeld "B738 · PH-BXA") |

- **Grenzen:** adsb.lol heeft geen vaste limieten; die hangen af van hoe druk het is. Geeft adsb.lol een fout, dan wacht de server even (5 s, daarna 10 s). Na 3 fouten op rij gaat hij terug naar OpenSky, en dat meldt het paneel.
- **Licentie:** de data van adsb.lol valt onder de [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/). Daarom staat er "data: adsb.lol (ODbL)" in de hoek van de kaart als die bron gekozen is.

## Meten en testen

Om te meten of te testen zonder OpenSky-tegoed te gebruiken:

- **Nep-bron:** `npm run server:nep` start de server met 5.000 nep-vliegtuigen in plaats van OpenSky. Een ander aantal en tempo kies je met `node dev-server.mjs --nep 1000 --elke 5` (elke 5 s een nieuw pakket). Hetzelfde aantal geeft altijd dezelfde vliegtuigen, zodat twee metingen te vergelijken zijn.
- **Meter:** zet `?meten` achter het adres (`http://localhost:5173/?meten`). Rechtsboven staan dan:
  - de fps en het traagste beeld;
  - hoe lang één tekenbeurt duurt;
  - hoeveel vliegtuigen er getekend worden, van het totaal ("zichtbaar X van Y"; buiten beeld wordt niet getekend);
  - hoe ver de voorspelde positie ernaast zat toen het laatste pakket binnenkwam.
- **Testserver naast de echte:** `node dev-server.mjs --poort 3002` start een tweede server. De app praat ermee als je hem bouwt met `VITE_SERVER=http://localhost:3002`.

In de dev-server draait React alles twee keer (StrictMode). Voor echte cijfers bouw je eerst (`npx vite build`) en start je daarna `npx vite preview`.

Hoe snel de nieuwe kaart is tegenover de oude, staat in `docs/plan-van-aanpak-live-kaart.md` (hoofdstuk 8).

### Automatische tests

De tests staan in `tests/` en gebruiken [Playwright](https://playwright.dev) met een headless Chromium. Ze bouwen de app zelf, en starten en stoppen hun eigen servers. Ze gebruiken eigen poorten (31xx en 51xx), dus een radar die je zelf op 3001 en 5173 hebt draaien, merkt er niets van.

| Opdracht | Wat | Duur | Kost tegoed |
|---|---|---|---|
| `npm run check` | Alle tests die niets kosten: de server met nep-adsb.lol en nep-OpenSky, de kaart (testlijst T2-T13), de twee bugs uit fase 5, de militaire herkenning, de straal slepen, de bochten, de sporen, en de grote straal met de hele wereld | ±11 min | nee |
| `npm run check:opensky` | T9 met de echte OpenSky: kloppen het interval en het tegoed in het paneel met de terminal van de server? | ±4 min | ja, ±40 met een account |
| `npm run meten` | De meting: fps in rust, tijdens pannen en tijdens zoomen, met 1.000, 3.000 en 5.000 nep-vliegtuigen. `node tests/meten.mjs --versie a1a9094` meet ook een oudere commit, zodat je oud en nieuw op dezelfde laptop vergelijkt; `--aantallen 1000` meet alleen dat aantal | ±5 min | nee |

Elk testbestand kun je ook los draaien, bijvoorbeeld `node tests/kaart.mjs`.

Voor de bochten is er een eigen meting: `node tests/bochten.mjs`. Die vergelijkt per boogduur (`?meten&bocht=…`) hoe ver de voorspelling ernaast zat, met de nep-bron. Met `--echt` doet hij dat op OpenSky Normaal en Snel en op adsb.lol; dat kost ±25 tegoed.

- **Browser per laptop:** Playwright heeft per laptop één keer zijn browser nodig: `npx playwright install chromium`. Doe dat in een gewone terminal.
- **Wat niet automatisch kan:**
  - T15, een tab 5 minuten op de achtergrond: bevriezen werkt niet in de headless Chromium;
  - touch op een echte telefoon;
  - je eigen oordeel of het soepel oogt.
- **Sluit andere tabbladen met de radar** als je `check:opensky` of `meten` draait. Elke open app is een eigen kijker en vraagt ook data op.

## Mappen en bestanden

| Pad | Wat |
|---|---|
| `dev-server.mjs` | De server: haalt per app het gekozen gebied op bij OpenSky of adsb.lol en stuurt de vliegtuigen via Socket.IO. Ook de nep-bron |
| `.env.example` | Voorbeeld voor `.env` met de OpenSky-key |
| `src/App.tsx` | De pagina: paneel en kaart, filter, bereik, bron, verversen en de verbinding met de server |
| `src/MapDashboard.tsx` | De kaart (Leaflet) met de cirkel van het bereik, de vliegtuigen en de popup |
| `src/componenten/VliegtuigLaag.tsx` | Koppelt de vliegtuiglaag aan React |
| `src/componenten/vliegtuigCanvas.ts` | Alle vliegtuigen op één canvas: alleen wat in beeld is wordt getekend, klikken, de beweging tussen twee pakketten, de sporen (eigen canvas) en de hele vlucht |
| `src/beweging.ts` | De rekenregels voor die beweging (waar een vliegtuig nu is, op snelheid en koers, en langs een boog in een bocht) |
| `src/componenten/GebiedCirkel.tsx` | De cirkel van het bereik: na een dubbelklik te verslepen of groter en kleiner te maken |
| `src/componenten/StatusPanel.tsx` | Het paneel: live status, bereik, bron, verversen, dreigingsniveaus en de lijst met de meest verdachte vliegtuigen |
| `src/componenten/PlanePopup.tsx` | De gegevens van één vliegtuig |
| `src/verversen.ts` | De verversstanden en de bronnen, en wat de kijker gekozen heeft (onthouden in de browser) |
| `src/dreiging.ts` | De dreigingsniveaus met hun namen en kleuren |
| `utils/planeUtils.ts` | De regels voor verdacht gedrag |
| `utils/binnenland.ts` | De grens van Nederland (Natural Earth, vereenvoudigd tot ±1 km) en de regel "vliegt Nederland in" |
| `services/socket.ts` | De verbinding met de server |
| `src/componenten/Meter.tsx`, `src/meten.ts`, `utils/meting.ts` | De meter (`?meten`) en zijn tellers |
| `src/componenten/PlaneMarker.tsx`, `src/componenten/planeIcons.tsx` | De oude vliegtuigen als losse markers. Niet meer in gebruik sinds de canvaslaag, maar bewaard |
| `tests/` | De automatische tests en de meting (zie [Automatische tests](#automatische-tests)). `tests/.uitvoer/` (builds en logs) staat in `.gitignore` |
| `docs/plan-van-aanpak-live-kaart.md` | Het plan en de uitkomst van het werk aan de live kaart, met de metingen |
| `docs/plan-van-aanpak-herkenning-en-sporen.md` | Het tweede plan en de uitkomst: militaire herkenning, straal slepen, bochten voorspellen en sporen, met de metingen |

## Versies

Alles staat op `main`. De eerste upload is commit `fcbba48`. Daarna kwamen:
- de nieuwe interface en de filter op straal;
- de live kaart: canvas, beweging, verversen, cirkel verslepen en adsb.lol;
- militaire herkenning, de straal slepen, bochten voorspellen en sporen.
