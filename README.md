# Flight Tracker (draft)

Single-page web app that shows live aircraft, and VIA Rail trains, around your current location.
A **Flights | Trains** toggle switches between them (remembered per browser).

- Uses the browser's location (GPS/Wi-Fi), or tap **Pick on map** to set a position.
- Live positions from [adsb.lol](https://adsb.lol) (free, no key, ODbL); falls back to [airplanes.live](https://airplanes.live).
- Route lookup (origin → destination) from adsb.im's routeset API (adsb.lol as backup); missing airport coordinates are filled from the airport endpoint. Best-effort: some callsigns have no route or a wrong one.
- Airline logos from pics.avs.io (falls back to the IATA code).
- For a selected flight: route drawn on the map, distance flown / to go / total, progress, flight phase, and an arrival estimate at current speed.
- On-time/delayed status is **not** available: it needs airline schedule data (a paid or keyed API).
- Ground traffic (taxiing aircraft, airport vehicles) is hidden by default.
- Shows callsign, airline, route, altitude, vertical rate, ground speed, heading, distance and direction from you, elevation angle, aircraft type, registration, squawk (flags 7500/7600/7700).
- Refreshes every 15 s, pauses when the tab is hidden, and moves planes smoothly between refreshes.
- **Map | Radar** switch (flights): a green-phosphor radar scope centred on you, north up, range = the radius control. The 12-second sweep is cosmetic; targets glow as the beam passes and fade like a CRT. Tap a target for details. Emergency squawks show red.
- `?demo` in the URL shows made-up aircraft around you (clearly labelled).

## Trains

- **VIA Rail:** positions, speed, next stop, and VIA's own scheduled vs estimated times (on time / late / early)
  from the public tracker feed behind tsimobile.viarail.ca, proxied at `/api/via/*`. It's unofficial and can
  change or disappear without notice.
- **GO Transit:** live trains from the Metrolinx Open Data API through a Netlify Function
  (`netlify/functions/go-trains.mts`, served at `/api/go/trains`) so the key never reaches the browser.
  It is **off until `METROLINX_KEY` is set** in Netlify (Project configuration → Environment variables,
  scope must include Functions), then redeploy. Upstream calls are cached 15 s; Metrolinx disables keys
  that call too often. Built from the documented response format; verify on first real run.
- TTC subway: no live positions are published.

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
GitHub Pages does. `netlify.toml` adds same-origin rewrites (`/api/adsblol/*`, `/api/adsbim/*`, `/api/airplaneslive/*`, `/api/via/*`)
so the browser only ever talks to the site itself. On Netlify: import this repo, no build command,
publish directory `.`.

A local `python3 -m http.server` has no rewrites, so live data will fail locally the same way; use `?demo`.

## Known limits

- Coverage depends on volunteer ADS-B receivers. Rural areas can show few or no aircraft.
- Planes without ADS-B (many small aircraft, some military) don't appear.
- Free APIs can rate-limit; there is no backend or caching yet.
- Map tiles come from openstreetmap.org, whose usage policy is fine for personal/light use but not heavy traffic.
