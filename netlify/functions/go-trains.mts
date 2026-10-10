import type { Config } from "@netlify/functions"

// Live GO Transit trains from the Metrolinx Open Data API.
// The key stays on the server: set METROLINX_KEY in Netlify (scope: Functions).
// Docs: https://api.openmetrolinx.com/OpenDataAPI/Help/Index/en
const BASE = "https://api.openmetrolinx.com/OpenDataAPI/api/V1"
const TRAINS_TTL_MS = 15_000          // Metrolinx disables keys that call too often; one upstream call per 15 s at most
const STOPS_TTL_MS = 24 * 3600_000    // station names barely change

let trainsCache: { at: number; body: unknown } | null = null
let stopsCache: { at: number; names: Record<string, string> } | null = null

const asArray = <T>(v: T | T[] | undefined | null): T[] => (Array.isArray(v) ? v : v ? [v] : [])

async function getJSON(path: string, key: string) {
  const res = await fetch(`${BASE}/${path}?key=${encodeURIComponent(key)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Metrolinx answered HTTP ${res.status}`)
  return res.json()
}

async function stationNames(key: string): Promise<Record<string, string>> {
  if (stopsCache && Date.now() - stopsCache.at < STOPS_TTL_MS) return stopsCache.names
  try {
    const j = await getJSON("Stop/All", key)
    const names: Record<string, string> = {}
    for (const s of asArray<any>(j?.Stations?.Station)) {
      if (s?.LocationCode) names[s.LocationCode] = s.LocationName || s.LocationCode
    }
    stopsCache = { at: Date.now(), names }
    return names
  } catch {
    return stopsCache?.names ?? {} // names are a nicety; codes still work without them
  }
}

export default async () => {
  const key = Netlify.env.get("METROLINX_KEY")
  if (!key) return Response.json({ configured: false, trains: [] })

  if (trainsCache && Date.now() - trainsCache.at < TRAINS_TTL_MS) return Response.json(trainsCache.body)

  try {
    const [j, names] = await Promise.all([getJSON("ServiceataGlance/Trains/All", key), stationNames(key)])
    const trips = asArray<any>(j?.Trips?.Trip)
    if (!trips.length && j?.Metadata?.ErrorMessage && !/^(OK|Success)?$/i.test(j.Metadata.ErrorMessage)) {
      throw new Error(`Metrolinx: ${j.Metadata.ErrorMessage}`)
    }
    const name = (code: unknown) => (typeof code === "string" && code ? names[code] || code : null)
    const trains = trips
      .filter((t) => typeof t.Latitude === "number" && typeof t.Longitude === "number" && (t.Latitude || t.Longitude))
      .map((t) => ({
        trip: String(t.TripNumber ?? ""),
        line: t.LineCode ?? null,
        display: t.Display ?? null,
        lat: t.Latitude,
        lon: t.Longitude,
        course: typeof t.Course === "number" ? t.Course : null,
        moving: Boolean(t.IsInMotion),
        delaySec: typeof t.DelaySeconds === "number" ? t.DelaySeconds : null,
        cars: t.Cars ?? null,
        occupancy: typeof t.OccupancyPercentage === "number" ? t.OccupancyPercentage : null,
        first: name(t.FirstStopCode),
        last: name(t.LastStopCode),
        prev: name(t.PrevStopCode),
        next: name(t.NextStopCode),
        at: name(t.AtStationCode),
        start: t.StartTime ?? null,
        end: t.EndTime ?? null,
        modified: t.ModifiedDate ?? null,
      }))
    const body = { configured: true, trains, timestamp: j?.Metadata?.TimeStamp ?? null }
    trainsCache = { at: Date.now(), body }
    return Response.json(body)
  } catch (e) {
    return Response.json({ configured: true, trains: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}

export const config: Config = { path: "/api/go/trains" }
