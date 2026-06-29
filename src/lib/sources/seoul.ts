/**
 * Seoul real-time city bus — the Seoul branch of trackBusArrival. Seoul isn't in
 * the nationwide TAGO source; it has its own TOPIS feed (ws.bus.go.kr) keyed by
 * BUS_API_KEY (the data.go.kr key, once propagated to the Seoul gateway). XML.
 *
 * Chain (live-verified 2026-06-29):
 *   busRouteInfo/getBusRouteList(strSrch)  → busRouteId for the route number
 *   busRouteInfo/getStaionByRoute(routeId) → ordered stops (seq, stationNm, station=stId, arsId)
 *   arrive/getLowArrInfoByStId(stId)       → per-route arrmsg1 "15분11초후[8번째 전]"
 * The route's `station` field IS the stId getLowArrInfoByStId expects (verified).
 *
 * Resilience: the gateway rate-limits rapid calls — route/stop lists are cached
 * (static), and every parse tolerates a missing body / error header. Time-bounded
 * (fetchWithTimeout) to protect p99.
 */
import { ENV } from "../env.js";
import { fetchWithTimeout, ExternalApiError } from "../http.js";
import { TtlCache } from "../cache.js";
import { similarity, normalizeName } from "../fuzzy.js";

const BASE = "http://ws.bus.go.kr/api/rest";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function fetchXmlText(path: string, params: Record<string, string>): Promise<string> {
  const qs = new URLSearchParams({ ServiceKey: ENV.BUS_API_KEY, ...params }).toString();
  const res = await fetchWithTimeout(`${BASE}${path}?${qs}`, {}, 2200);
  if (!res.ok) throw new ExternalApiError(`Seoul bus HTTP ${res.status}`);
  return res.text();
}

/** Per-record XML blocks (Seoul API wraps each item in <itemList>). */
function records(xml: string): string[] {
  return xml.match(/<itemList>[\s\S]*?<\/itemList>/g) ?? [];
}
/** Does this record carry at least one populated field? (The gateway intermittently
 *  throttles to empty <itemList></itemList> blocks under rapid calls.) */
function usable(rec: string): boolean {
  return /<\w+>[^<\s]/.test(rec);
}
/** Fetch + parse records, retrying once on an error header or an empty/blank body
 *  (transient gateway throttling). `mustHave=false` for arrival (empty = legit). */
async function fetchRecords(path: string, params: Record<string, string>, mustHave = true): Promise<string[]> {
  let last = "";
  // The gateway intermittently returns empty <itemList> blocks under load (seen
  // even on a first call), so retry a few times; empty bodies return fast, so the
  // retries add little latency, and route/stop lists are cached after the cold load.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const xml = await fetchXmlText(path, params);
      last = xml;
      const recs = records(xml);
      if (!mustHave || (headerOk(xml) && recs.some(usable))) return recs;
    } catch {
      /* retry */
    }
    await sleep(300);
  }
  return records(last);
}
function field(rec: string, tag: string): string {
  const m = rec.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}
/** headerCd 0 = success; absent header → assume ok. */
function headerOk(xml: string): boolean {
  const m = xml.match(/<headerCd>([^<]*)<\/headerCd>/);
  return !m || m[1].trim() === "0";
}

export interface SeoulStop {
  seq: number;
  name: string;
  arsId: string;
  stId: string;
}

const routeCache = new TtlCache<string | undefined>(60 * 60_000); // route ids are static
const stopsCache = new TtlCache<SeoulStop[]>(60 * 60_000);

/** Route number ("143") → Seoul busRouteId; prefers an exact name match. */
export async function resolveSeoulRouteId(busNumber: string): Promise<string | undefined> {
  const n = busNumber.trim();
  if (!n) return undefined;
  return routeCache.getOrLoad(`r:${n}`, async () => {
    const recs = (await fetchRecords("/busRouteInfo/getBusRouteList", { strSrch: n })).map((r) => ({ id: field(r, "busRouteId"), nm: field(r, "busRouteNm") }));
    const exact = recs.find((r) => r.nm === n);
    return (exact ?? recs[0])?.id || undefined;
  });
}

/** Ordered stops on a route (with stId for arrival lookup). */
export async function getSeoulRouteStops(routeId: string): Promise<SeoulStop[]> {
  return stopsCache.getOrLoad(`s:${routeId}`, async () => {
    return (await fetchRecords("/busRouteInfo/getStaionByRoute", { busRouteId: routeId }))
      .map((r) => ({ seq: Number(field(r, "seq")) || 0, name: field(r, "stationNm"), arsId: field(r, "arsId"), stId: field(r, "station") }))
      .filter((s) => s.stId && s.name);
  });
}

/** Match the user's drop-off stop to a stop on the route (exact → substring → fuzzy). */
export function matchSeoulStop(stops: SeoulStop[], name: string): SeoulStop | undefined {
  const q = normalizeName(name);
  if (!q) return undefined;
  let best: { s: SeoulStop; sc: number } | undefined;
  for (const s of stops) {
    const t = normalizeName(s.name);
    let sc: number;
    if (t === q) sc = 3;
    else if (t.includes(q) || q.includes(t)) sc = 2;
    else sc = similarity(name, s.name);
    if (!best || sc > best.sc) best = { s, sc };
  }
  return best && best.sc >= 1.2 ? best.s : undefined;
}

/** Parse "15분11초후[8번째 전]" → stops/minutes; null for non-live states. */
export function parseArrmsg(msg: string): { stops: number; minutes: number; soon: boolean } | null {
  const m = (msg ?? "").trim();
  if (!m || /운행종료|출발대기|회차대기|정보없음|점검/.test(m)) return null;
  if (/곧 ?도착|도착|진입/.test(m) && !/분/.test(m)) return { stops: 0, minutes: 0, soon: true };
  const min = m.match(/(\d+)\s*분/);
  const sec = m.match(/(\d+)\s*초/);
  const stops = m.match(/\[(\d+)\s*번째/);
  const minutes = min ? Number(min[1]) : sec ? 1 : 0;
  return { stops: stops ? Number(stops[1]) : 0, minutes, soon: minutes <= 1 && (stops ? Number(stops[1]) : 0) <= 1 };
}

export interface SeoulArrival {
  routeNo: string;
  stopName: string;
  stopsRemaining: number;
  etaMinutes: number;
  soon: boolean;
  raw: string;
}
export type SeoulBusResult =
  | { status: "route_not_found" }
  | { status: "stop_not_found" }
  | { status: "no_arrival"; stopName: string; available: string[] }
  | { status: "ok"; arrival: SeoulArrival };

/** Track a Seoul bus toward a drop-off stop: stops-remaining + ETA, or a graceful
 *  status the tool layer renders. */
export async function trackSeoulBus(busNumber: string, dropOffStop: string): Promise<SeoulBusResult> {
  const n = busNumber.trim();
  const routeId = await resolveSeoulRouteId(n);
  if (!routeId) return { status: "route_not_found" };

  const stops = await getSeoulRouteStops(routeId);
  const stop = matchSeoulStop(stops, dropOffStop);
  if (!stop) return { status: "stop_not_found" };

  const here = (await fetchRecords("/arrive/getLowArrInfoByStId", { stId: stop.stId }, false)).map((r) => ({
    rt: field(r, "busRouteNm") || field(r, "rtNm") || field(r, "busRouteAbrv"),
    msg: field(r, "arrmsg1"),
  }));
  const mine = here.find((h) => h.rt === n);
  const parsed = mine ? parseArrmsg(mine.msg) : null;
  if (!mine || !parsed) {
    return { status: "no_arrival", stopName: stop.name, available: [...new Set(here.map((h) => h.rt).filter(Boolean))] };
  }
  return {
    status: "ok",
    arrival: { routeNo: n, stopName: stop.name, stopsRemaining: parsed.stops, etaMinutes: parsed.minutes, soon: parsed.soon, raw: mine.msg },
  };
}

// ── Route-position mode (parallels the subway line-position mode) ────────────
export interface SeoulBusPos {
  plainNo: string; // vehicle plate, e.g. "서울70사1234"
  sectOrd: number; // section order along the route (lower = nearer the start)
  lastStopName: string; // most recently passed stop (lastStnId → stop name)
}
export type SeoulBusPosResult =
  | { status: "route_not_found" }
  | { status: "no_buses" }
  | { status: "ok"; routeNo: string; total: number; positions: SeoulBusPos[] };

/** Live position of every bus currently running a Seoul route. `buspos/getBusPosByRtid`
 *  returns each vehicle's sectOrd + lastStnId (stId of the last passed stop), which we
 *  map to a stop name via the route's ordered stop list. Empty = none running now. */
export async function getSeoulBusPositions(busNumber: string): Promise<SeoulBusPosResult> {
  const n = busNumber.trim();
  const routeId = await resolveSeoulRouteId(n);
  if (!routeId) return { status: "route_not_found" };

  const stops = await getSeoulRouteStops(routeId);
  const byId = new Map(stops.map((s) => [s.stId, s.name]));
  const positions = (await fetchRecords("/buspos/getBusPosByRtid", { busRouteId: routeId }, false))
    .map((r) => ({ plainNo: field(r, "plainNo"), sectOrd: Number(field(r, "sectOrd")) || 0, lastStnId: field(r, "lastStnId") }))
    .filter((p) => p.plainNo || p.lastStnId)
    .map((p) => ({ plainNo: p.plainNo, sectOrd: p.sectOrd, lastStopName: byId.get(p.lastStnId) ?? "" }))
    .sort((a, b) => a.sectOrd - b.sectOrd);
  if (!positions.length) return { status: "no_buses" };
  return { status: "ok", routeNo: n, total: positions.length, positions };
}
