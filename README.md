# Vliegtuigradar

Live kaart van het luchtruim rond Nederland. Elk vliegtuig krijgt een dreigingsniveau op basis van verdacht gedrag: hoge snelheid, geen callsign of squawk, lage hoogte, een actief noodsignaal, een koers richting het binnenland of een snelle stijging of daling. De posities komen live van het [OpenSky Network](https://opensky-network.org).

Gebouwd met React, TypeScript, Vite, Tailwind CSS, Leaflet en Socket.IO.

## Wat je nodig hebt

- [Node.js](https://nodejs.org) 18 of nieuwer (met npm)
- Internet, voor de kaart en de vluchtgegevens

## Opstarten

1. Installeer de pakketten (één keer):

   ```bash
   npm install
   ```

2. Start de server in een eerste terminal. Die haalt de vluchten op bij OpenSky en stuurt ze door naar de app:

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

- **Bereik:** met de schuif in het paneel kies je de straal, van 25 tot 1000 km. Standaard is dat 250 km rond het midden van Nederland. Met **Midden van de kaart** wordt het midden van de kaart het nieuwe middelpunt, en **Nederland** zet het terug.
- **Verversen:** kies **Zuinig**, **Normaal** of **Snel**. Dat bepaalt hoe vaak de server nieuwe posities ophaalt. Onder de knoppen staat hoeveel OpenSky-tegoed dat per uur kost en hoe lang het tegoed nog meegaat (zie [OpenSky-tegoed](#opensky-tegoed-en-verversen)). Je keuze wordt in de browser onthouden. Tussen twee verversingen door vliegen de vliegtuigen op hun snelheid en koers verder, dus ook op Zuinig bewegen ze over de kaart.
- **Dreigingsniveau:** de vijf niveaus zijn ook filters. Klik op een niveau om alleen die vliegtuigen te zien, en klik nog een keer om alles weer te tonen.
- **Meest verdacht:** klik op een vliegtuig in de lijst. De kaart vliegt er dan naartoe en opent de gegevens.
- **Vliegtuig op de kaart:** klik erop voor hoogte, snelheid, koers, verticale snelheid, squawk, noodsignaal en de redenen waarom het als verdacht telt.

| Kleur | Betekenis |
|---|---|
| Grijs | Normaal |
| Blauw | 1 reden |
| Oranje | 2 redenen |
| Rood | 3 redenen (met een pulserende ring) |
| Paars | 4 of meer redenen |

## OpenSky-tegoed en verversen

OpenSky werkt met tegoed. Elke aanvraag kost 1 tot 4 punten: hoe groter het gebied, hoe meer.

| | Tegoed per dag | Nieuwe data elke |
|---|---|---|
| Zonder account | 400 | 10 s |
| Met een gratis account | 4.000 | 5 s |

De stand bij **Verversen** is een budget in tegoed per uur, dus een groter gebied ververst vanzelf minder vaak:

| Stand | Tegoed per uur | tot ±200 km | 250 km | 600 km | 1000 km |
|---|---|---|---|---|---|
| Zuinig | 120 | 30 s | 60 s | 90 s | 120 s |
| Normaal | 360 | 10 s | 20 s | 30 s | 40 s |
| Snel | zo veel als nodig | 10 s (5 s met account) | 10 s (5 s) | 10 s (5 s) | 10 s (5 s) |

- **Hoe lang je het volhoudt:** zonder account houd je het met Zuinig ruim 3 uur per dag vol, met Normaal ruim een uur.
- **Standaardstand:** zonder account Zuinig, met account Normaal.
- **Tegoed op:** dan blijven de laatste vliegtuigen staan, toont het paneel wanneer er weer nieuwe posities komen, en wacht de server tot OpenSky dat toestaat. In de terminal staat bij elke aanvraag hoeveel tegoed er nog over is.

### Met een OpenSky-account

Alleen de server logt in bij OpenSky. Wie de radar bekijkt, logt nooit in.

1. Maak een gratis account op [opensky-network.org](https://opensky-network.org) en maak onder **Account** een **API Client** aan. Je krijgt een client id en een client secret.
2. Kopieer `.env.example` naar `.env` (in dezelfde map) en vul `OPENSKY_CLIENT_ID` en `OPENSKY_CLIENT_SECRET` in. `.env` staat in `.gitignore` en gaat dus niet mee naar GitHub.
3. Start de server opnieuw. In de terminal staat dan `opensky: with the api client from .env`.

Hiervoor is Node.js 20.12 of nieuwer nodig. Klopt de key niet, dan meldt de server dat en werkt hij gewoon anoniem verder.

## Mappen en bestanden

| Pad | Wat |
|---|---|
| `dev-server.mjs` | De server: haalt per app het gekozen gebied op bij OpenSky en stuurt de vliegtuigen via Socket.IO |
| `src/App.tsx` | De pagina: paneel en kaart, filter, bereik en de verbinding met de server |
| `src/MapDashboard.tsx` | De kaart (Leaflet) met de cirkel van het bereik en de vliegtuigen |
| `src/componenten/StatusPanel.tsx` | Het paneel: live status, bereik, dreigingsniveaus en de lijst met de meest verdachte vliegtuigen |
| `src/componenten/PlanePopup.tsx` | De gegevens van één vliegtuig |
| `src/componenten/PlaneMarker.tsx` | Een vliegtuig op de kaart dat soepel naar zijn nieuwe positie schuift |
| `src/componenten/planeIcons.tsx` | Het vliegtuigicoon, gedraaid naar de koers en gekleurd per niveau |
| `src/dreiging.ts` | De dreigingsniveaus met hun namen en kleuren |
| `utils/planeUtils.ts` | De regels voor verdacht gedrag |
| `services/socket.ts` | De verbinding met de server |

## Versies

- `main`: de oorspronkelijke versie.
- `interface-vernieuwd`: de nieuwe interface. Dat is een donkere kaart, het zijpaneel en de filter op straal.
