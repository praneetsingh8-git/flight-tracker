// No npm dependencies on purpose: the repo has no package.json, so nothing to install at build time.
declare const Netlify: { env: { get(name: string): string | undefined } }

// Live GO Transit trains from the Metrolinx Open Data API.
// The key stays on the server: set METROLINX_KEY in Netlify (scope: Functions).
// Docs: https://api.openmetrolinx.com/OpenDataAPI/Help/Index/en
const BASE = "https://api.openmetrolinx.com/OpenDataAPI/api/V1"
const TRAINS_TTL_MS = 15_000          // Metrolinx disables keys that call too often; one upstream call per 15 s at most
const STOPS_TTL_MS = 24 * 3600_000    // station names barely change

const TRIP_TTL_MS = 30_000            // per-trip stop times (live "computed" times move, so keep it short)

let trainsCache: { at: number; body: unknown } | null = null
const tripCache = new Map<string, { at: number; body: unknown }>()
let stopsCache: { at: number; names: Record<string, string> } | null = null

function asArray<T>(v: T | T[] | undefined | null): T[] {
  return Array.isArray(v) ? v : v ? [v] : []
}

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

// Operating day in Toronto as yyyymmdd; trains running after midnight belong to the previous day.
function torontoDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400_000)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d).replace(/-/g, "")
}

// One trip's stops with scheduled and live ("computed") times, for the detail card.
async function trip(num: string, key: string) {
  const hit = tripCache.get(num)
  if (hit && Date.now() - hit.at < TRIP_TTL_MS) return hit.body
  const names = await stationNames(key)
  let found: any = null, day = ""
  for (const off of [0, -1]) {
    day = torontoDay(off)
    const j = await getJSON(`Schedule/Trip/${day}/${encodeURIComponent(num)}`, key)
    found = asArray<any>(j?.Trips?.Trip ?? j?.Trips).find((t) => asArray(t?.Stops?.Stop ?? t?.Stops).length)
    if (found) break
  }
  const t = (o: any) => ({ scheduled: o?.Scheduled || null, computed: o?.Computed || null, status: o?.Status || null })
  const stops = found
    ? asArray<any>(found.Stops?.Stop ?? found.Stops).map((s) => ({
        code: s.Code ?? null,
        name: names[s.Code] ?? s.Code ?? null,
        status: s.Status || null,
        remark: s.Remark || null,
        arr: t(s.ArrivalTime),
        dep: t(s.DepartureTime),
        track: s.Track?.Actual || s.Track?.Scheduled || null,
      }))
    : []
  const body = { trip: num, day, status: found?.Status ?? null, stops }
  tripCache.set(num, { at: Date.now(), body })
  if (tripCache.size > 200) tripCache.delete(tripCache.keys().next().value as string)
  return body
}

export default async (req: Request) => {
  const key = Netlify.env.get("METROLINX_KEY")
  const url = new URL(req.url)
  if (url.pathname.endsWith("/trip")) {
    const num = url.searchParams.get("trip") || ""
    if (!/^[A-Za-z0-9]{1,8}$/.test(num)) return Response.json({ error: "bad trip number" }, { status: 400 })
    if (!key) return Response.json({ configured: false, stops: [] })
    try { return Response.json(await trip(num, key)) }
    catch (e) { return Response.json({ trip: num, stops: [], error: e instanceof Error ? e.message : String(e) }, { status: 502 }) }
  }
  if (!key) return Response.json({ configured: false, trains: [] })

  if (trainsCache && Date.now() - trainsCache.at < TRAINS_TTL_MS) return Response.json(trainsCache.body)

  try {
    const [j, names] = await Promise.all([getJSON("ServiceataGlance/Trains/All", key), stationNames(key)])
    const trips = asArray<any>(j?.Trips?.Trip)
    if (!trips.length && j?.Metadata?.ErrorMessage && !/^(OK|Success)?$/i.test(j.Metadata.ErrorMessage)) {
      throw new Error(`Metrolinx: ${j.Metadata.ErrorMessage}`)
    }
    // Station codes resolve to names; anything else (track timing points like "CANP", "9THL") is dropped.
    const name = (code: unknown) => (typeof code === "string" && code && names[code] ? names[code] : null)
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

export const config = { path: ["/api/go/trains", "/api/go/trip"] }
