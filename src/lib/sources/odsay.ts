/**
 * ODsay public-transit routing — powers getTransitRoute.
 *
 * ODsay needs coordinates, not names, so we resolve from/to via TourAPI
 * (mapx=lng, mapy=lat) and then call searchPubTransPathT. Requires both
 * TRANSIT_API_KEY (ODsay) and TOUR_API_KEY (geocoding via place search).
 *
 * NOTE(verify-live): response shape follows ODsay docs; confirm once the key is
 * issued. Parser locked by tests.
 */
import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";

const BASE = "https://api.odsay.com/v1/api/searchPubTransPathT";

export interface RouteLeg {
  mode: "subway" | "bus" | "walk";
  line?: string; // line name or bus number
  from?: string;
  to?: string;
  minutes?: number;
}

export interface TransitRoute {
  totalMinutes: number;
  fare?: number;
  legs: RouteLeg[];
}

const MODE: Record<number, RouteLeg["mode"]> = { 1: "subway", 2: "bus", 3: "walk" };

interface RawSubPath {
  trafficType?: number;
  sectionTime?: number;
  startName?: string;
  endName?: string;
  lane?: { name?: string; busNo?: string }[];
}
interface RawPath {
  info?: { totalTime?: number; payment?: number };
  subPath?: RawSubPath[];
}
interface OdsayResponse {
  result?: { path?: RawPath[] };
  error?: unknown;
}

export function parseRoutes(json: OdsayResponse): TransitRoute[] {
  const paths = json.result?.path;
  if (!Array.isArray(paths)) return [];
  return paths.map((p) => ({
    totalMinutes: Number(p.info?.totalTime ?? 0),
    fare: p.info?.payment != null ? Number(p.info.payment) : undefined,
    legs: (p.subPath ?? [])
      .filter((sp) => sp.sectionTime == null || sp.sectionTime > 0 || sp.trafficType !== 3)
      .map((sp) => {
        const lane = sp.lane?.[0];
        return {
          mode: MODE[sp.trafficType ?? 3] ?? "walk",
          line: lane?.busNo ?? lane?.name,
          from: sp.startName,
          to: sp.endName,
          minutes: sp.sectionTime,
        };
      }),
  }));
}

const cache = new TtlCache<TransitRoute[]>(2 * 60_000);

export interface Coord {
  lng: number;
  lat: number;
}

/** Call ODsay for transit routes between two coordinates. */
export async function routesBetween(from: Coord, to: Coord): Promise<TransitRoute[]> {
  const key = `r:${from.lng},${from.lat}-${to.lng},${to.lat}`;
  return cache.getOrLoad(key, async () => {
    const sp = new URLSearchParams({
      apiKey: ENV.TRANSIT_API_KEY,
      SX: String(from.lng),
      SY: String(from.lat),
      EX: String(to.lng),
      EY: String(to.lat),
      lang: "0",
    });
    const json = await fetchJson<OdsayResponse>(`${BASE}?${sp.toString()}`);
    if (json.error) throw new Error("ODsay routing error");
    return parseRoutes(json);
  });
}
