/**
 * Direct-bus planning from Seoul's own bus open API — the companion to the
 * subway graph, so city routing needs no metered third-party service at all.
 *
 * The trick is that we never need the whole network: a visitor asking "how do I
 * get from A to B" only needs the routes that serve BOTH stops. Seoul's TOPIS
 * feed answers exactly that —
 *   stationinfo/getStationByName(name)  → the stops matching a name
 *   stationinfo/getRouteByStation(arsId) → the routes calling at one stop
 *   busRouteInfo/getStaionByRoute(id)    → that route's stops, in order
 * so intersecting two stops' route lists finds the direct buses, and the ordered
 * stop list confirms the direction and the number of stops in between.
 *
 * Source: 서울특별시 버스 정보 (TOPIS, ⓒ서울특별시).
 */

import { ENV } from "../env.js";
import { fetchWithTimeout, ExternalApiError } from "../http.js";
import { TtlCache } from "../cache.js";
import { normalizeName, similarity } from "../fuzzy.js";
import { romanizeText } from "../romanize.js";

const BASE = "http://ws.bus.go.kr/api/rest";

export interface BusStop {
  stId: string;
  arsId: string;
  name: string;
}

export interface BusPlan {
  routeName: string;
  boardAt: string;
  alightAt: string;
  stops: number;
  minutes: number;
}

// Stops and route memberships barely change; a long cache keeps the call count low.
const stopCache = new TtlCache<BusStop[]>(6 * 60 * 60_000);
const routeCache = new TtlCache<{ id: string; name: string }[]>(6 * 60 * 60_000);
const seqCache = new TtlCache<string[]>(6 * 60 * 60_000);

/** Seoul city buses average ~15 km/h in traffic, roughly 1.6 min per stop. */
const MIN_PER_STOP = 1.6;

async function fetchJsonBody<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const qs = new URLSearchParams({
    serviceKey: ENV.BUS_API_KEY,
    resultType: "json",
    ...params,
  }).toString();
  const res = await fetchWithTimeout(`${BASE}${path}?${qs}`, {}, 2500);
  if (!res.ok) throw new ExternalApiError(`Seoul bus HTTP ${res.status}`);
  const json = (await res.json()) as { msgBody?: { itemList?: T[] } };
  return json.msgBody?.itemList ?? [];
}

interface RawStop {
  stId?: string;
  arsId?: string;
  stNm?: string;
}
interface RawRoute {
  busRouteId?: string;
  busRouteNm?: string;
}
interface RawSeqStop {
  stationNm?: string;
  seq?: string;
}

/**
 * Seoul's N-prefixed owl buses run only 23:30-04:00 and the day routes stop around
 * then, so the two sets are mutually exclusive: offering an owl bus at noon or a
 * day route at 3am both send someone to an empty stop.
 */
function isNightRoute(name: string): boolean {
  return /^N\d/i.test(name);
}

function isNightNow(): boolean {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const h = kst.getUTCHours();
  return h >= 23 || h < 4;
}

/** Stops whose name matches; accepts Korean or the romanization we print. */
export async function findStops(name: string): Promise<BusStop[]> {
  const q = (name ?? "").trim().replace(/\s*(?:station|stop|bus stop)\s*$/i, "");
  if (q.length < 2) return [];
  return stopCache.getOrLoad(`stop:${q}`, async () => {
    const rows = await fetchJsonBody<RawStop>("/stationinfo/getStationByName", { stSrch: q });
    return rows
      .filter((r) => r.stId && r.arsId && r.stNm)
      .map((r) => ({ stId: String(r.stId), arsId: String(r.arsId), name: String(r.stNm) }));
  });
}

/** Routes calling at one stop. */
export async function routesAtStop(arsId: string): Promise<{ id: string; name: string }[]> {
  return routeCache.getOrLoad(`routes:${arsId}`, async () => {
    const rows = await fetchJsonBody<RawRoute>("/stationinfo/getRouteByStation", { arsId });
    return rows
      .filter((r) => r.busRouteId && r.busRouteNm)
      .map((r) => ({ id: String(r.busRouteId), name: String(r.busRouteNm) }))
      .filter((r) => isNightRoute(r.name) === isNightNow());
  });
}

/** A route's stops in running order (Korean names). */
export async function routeStopSequence(routeId: string): Promise<string[]> {
  return seqCache.getOrLoad(`seq:${routeId}`, async () => {
    const rows = await fetchJsonBody<RawSeqStop>("/busRouteInfo/getStaionByRoute", { busRouteId: routeId });
    return rows.map((r) => String(r.stationNm ?? "")).filter(Boolean);
  });
}

/** Rank a place's stops by how well their name matches, best first. */
function rankStops(stops: BusStop[], wanted: string): BusStop[] {
  const q = normalizeName(wanted);
  return [...stops]
    .filter((s) => s.arsId && s.arsId !== "0")
    .map((s) => ({
      s,
      score: Math.max(similarity(q, normalizeName(s.name)), similarity(q, normalizeName(romanizeText(s.name)))),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}

/**
 * Find a direct bus between two places, or undefined when none serves both.
 *
 * A place has many stops — both directions, each corner of a junction — so we
 * intersect the routes of several candidate stops on each side rather than
 * guessing one. Deliberately direct-only: someone who has to change buses is
 * better served by the subway plan, and inventing bus-to-bus transfers without a
 * full network graph would produce confident nonsense.
 */
export async function planDirectBus(from: string, to: string): Promise<BusPlan | undefined> {
  if (!ENV.BUS_API_KEY.trim()) return undefined;
  try {
    const [fromStops, toStops] = await Promise.all([findStops(from), findStops(to)]);
    const aList = rankStops(fromStops, from).slice(0, 5);
    const bList = rankStops(toStops, to).slice(0, 5);
    if (!aList.length || !bList.length) return undefined;

    const [aRoutes, bRoutes] = await Promise.all([
      Promise.all(aList.map(async (s) => ({ stop: s, routes: await routesAtStop(s.arsId) }))),
      Promise.all(bList.map(async (s) => ({ stop: s, routes: await routesAtStop(s.arsId) }))),
    ]);

    // route id → the boarding / alighting stop it was seen at
    const boardBy = new Map<string, { name: string; route: string }>();
    for (const { stop, routes } of aRoutes) {
      for (const r of routes) if (!boardBy.has(r.id)) boardBy.set(r.id, { name: stop.name, route: r.name });
    }
    const candidates: { id: string; route: string; board: string; alight: string }[] = [];
    for (const { stop, routes } of bRoutes) {
      for (const r of routes) {
        const board = boardBy.get(r.id);
        if (board && board.name !== stop.name) {
          candidates.push({ id: r.id, route: r.name, board: board.name, alight: stop.name });
        }
      }
    }
    if (!candidates.length) return undefined;

    // Prefer the candidate whose stops actually carry the names the visitor said —
    // "강남역" beats "강남경찰서" — and check the strongest few for direction.
    const qa = normalizeName(from);
    const qb = normalizeName(to);
    const scored = candidates
      .map((c) => ({
        c,
        score: similarity(qa, normalizeName(c.board)) + similarity(qb, normalizeName(c.alight)),
      }))
      .sort((x, y) => y.score - x.score)
      .map((x) => x.c);

    let best: BusPlan | undefined;
    for (const c of scored.slice(0, 6)) {
      const seq = await routeStopSequence(c.id);
      const ia = seq.indexOf(c.board);
      const ib = seq.indexOf(c.alight);
      if (ia < 0 || ib < 0 || ib <= ia) continue; // opposite direction on this route
      const stops = ib - ia;
      if (stops > 30) continue; // a direct bus this long is not the useful answer
      const plan: BusPlan = {
        routeName: c.route,
        boardAt: c.board,
        alightAt: c.alight,
        stops,
        minutes: Math.max(3, Math.round(stops * MIN_PER_STOP)),
      };
      if (!best || plan.stops < best.stops) best = plan;
    }
    return best;
  } catch {
    return undefined;
  }
}
