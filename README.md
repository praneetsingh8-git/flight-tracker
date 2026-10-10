# Flight Tracker (draft)

Single-page web app that shows live aircraft around your current location.

- Uses the browser's location (GPS/Wi-Fi), or tap **Pick on map** to set a position.
- Live positions from [adsb.lol](https://adsb.lol) (free, no key, ODbL); falls back to [airplanes.live](https://airplanes.live).
- Route lookup (origin → destination) from adsb.im's routeset API (adsb.lol as backup); missing airport coordinates are filled from the airport endpoint. Best-effort: some callsigns have no route or a wrong one.
- Airline logos from pics.avs.io (falls back to the IATA code).
- For a selected flight: route drawn on the map, distance flown / to go / total, progress, flight phase, and an arrival estimate at current speed.
- On-time/delayed status is **not** available: it needs airline schedule data (a paid or keyed API).
- Ground traffic (taxiing aircraft, airport vehicles) is hidden by default.
- Shows callsign, airline, route, altitude, vertical rate, ground speed, heading, distance and direction from you, elevation angle, aircraft type, registration, squawk (flags 7500/7600/7700).
- Refreshes every 15 s, pauses when the tab is hidden, and moves planes smoothly between refreshes.
- `?demo` in the URL shows made-up aircraft around you (clearly labelled).

## Run it

Location only works on HTTPS or `localhost`:

```sh
cd flight-tracker   # repo root
python3 -m http.server 8000
# open http://localhost:8000          (live)
# open http://localhost:8000/?demo    (demo data)
```

### Hosting: use Netlify, not GitHub Pages

The flight-data APIs block direct calls from a browser on another site (CORS), which is what
GitHub Pages does. `netlify.toml` adds same-origin rewrites (`/api/adsblol/*`, `/api/adsbim/*`, `/api/airplaneslive/*`)
so the browser only ever talks to the site itself. On Netlify: import this repo, no build command,
publish directory `.`.

A local `python3 -m http.server` has no rewrites, so live data will fail locally the same way; use `?demo`.

## Known limits

- Coverage depends on volunteer ADS-B receivers. Rural areas can show few or no aircraft.
- Planes without ADS-B (many small aircraft, some military) don't appear.
- Free APIs can rate-limit; there is no backend or caching yet.
- Map tiles come from openstreetmap.org, whose usage policy is fine for personal/light use but not heavy traffic.
