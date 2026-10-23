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

## OpenSky-tegoed

De server gebruikt OpenSky zonder account. Dan krijg je ongeveer 400 punten per dag, en een groter gebied kost meer punten per aanvraag. Daarom ververst de server een groter gebied minder vaak:

| Bereik | Ververst elke |
|---|---|
| tot ongeveer 150 km | 30 seconden |
| ongeveer 250 km | 60 seconden |
| ongeveer 600 km | 90 seconden |
| ongeveer 1000 km | 120 seconden |

Is het tegoed op, dan blijven de laatste vliegtuigen staan en meldt de server dat in de terminal. Met een gratis OpenSky-account is het tegoed groter. `services/openskyClient.ts` kan al inloggen met `OPENSKY_CLIENT_ID` en `OPENSKY_CLIENT_SECRET`, maar de server gebruikt dat nog niet.

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
