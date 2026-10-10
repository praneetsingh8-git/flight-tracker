# Flight Tracker (draft)

Single-page web app that shows live aircraft around your current location.

- Uses the browser's location (GPS/Wi-Fi), or tap **Pick on map** to set a position.
- Live positions from [adsb.lol](https://adsb.lol) (free, no key, ODbL); falls back to [airplanes.live](https://airplanes.live).
- Route lookup (origin → destination) from adsb.lol's routeset API. Best-effort: some callsigns have no route or a wrong one.
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

Or drop `index.html` on any static host (GitHub Pages, Netlify).

## Known limits

- Coverage depends on volunteer ADS-B receivers. Rural areas can show few or no aircraft.
- Planes without ADS-B (many small aircraft, some military) don't appear.
- Free APIs can rate-limit; there is no backend or caching yet.
- Not tested against the live APIs from the build environment (network blocked there); verify on first real run.
