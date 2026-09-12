/**
 * Direct-bus planning anywhere in Korea, from the national bus open data.
 *
 * Seoul has its own feed and its own planner (busRoute.ts). Everywhere else —
 * Jeju, Gyeongju, Suwon, Gangneung, the coast road to Haedong Yonggungsa — the
 * only live source we had was a metered routing service, whose daily allowance
 * ran out one evening and stayed out for a day, taking every bus answer outside
 * Seoul with it.
 *
 * The national feed answers the same three questions Seoul's does, which is all
 * a direct bus needs:
 *   getCrdntPrxmtSttnList(lat,lng)          → the stops around a point
 *   getSttnThrghRouteList(city,stop)        → the routes calling at one stop
 *   getRouteAcctoThrghSttnList(city,route)  → that route's stops, in order
 * Intersecting the routes at both ends finds the buses that serve the whole
 * trip; the ordered stop list confirms the direction and counts the stops.
 *
 * Source: 국토교통부 TAGO 버스 정보 (ⓒ국토교통부), on the same key as live arrivals.
 */

import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";
import { haversineKm } from "../courses.js";

const STOP_BASE = "http://apis.data.go.kr/1613000/BusSttnInfoInqireService";
const ROUTE_BASE = "http://apis.data.go.kr/1613000/BusRouteInfoInqireService";

/** City buses average about this between stops. */
const MIN_PER_STOP = 2.2;
/**
 * Minutes per kilometre of the ride, as the crow flies — about 30 km/h once the
 * detours are folded in. Counting stops alone said the express bus across Jeju
 * took 29 minutes: thirteen stops, forty-four kilometres, and an hour and a half
 * in reality. Whichever measure says the trip is longer is the one to trust.
 */
const MIN_PER_KM_RIDE = 2;
/**
 * How far a visitor will walk to a bus stop. Generous on purpose: the stop for
 * Seongsan Ilchulbong is a kilometre from the peak, and the alternative to that
 * walk is no bus answer at all.
 */
const TO_STOP_KM = 1.5;
/** Beyond this many stops a "direct bus" is an endurance test, not an answer. */
const MAX_STOPS = 40;

/** A suitcase-and-heat walking pace, in minutes per kilometre. */
const MIN_PER_KM_WALK = 14;

/** The whole trip as the traveller feels it: both walks plus the ride. */
export function doorToDoor(p: NationalBusPlan): number {
  return p.minutes + ((p.walkToStopM + p.walkFromStopM) / 1000) * MIN_PER_KM_WALK;
}

export interface NationalBusPlan {
  routeName: string;
  boardAt: string;
  alightAt: string;
  stops: number;
  minutes: number;
  /** Metres from each end point to its stop — the walk is part of the trip. */
  walkToStopM: number;
  walkFromStopM: number;
}

interface RawNearStop {
  citycode?: number | string;
  nodeid?: string;
  nodenm?: string;
  gpslati?: number;
  gpslong?: number;
}

interface RawRoute {
  routeid?: string;
  routeno?: string | number;
}

interface RawRouteStop {
  nodeid?: string;
  nodenm?: string;
  nodeord?: number | string;
  updowncd?: number | string;
}

function url(base: string, op: string, params: Record<string, string>): string {
  const sp = new URLSearchParams({
    serviceKey: ENV.BUS_API_KEY,
    _type: "json",
    numOfRows: "200",
    pageNo: "1",
    ...params,
  });
  return `${base}/${op}?${sp.toString()}`;
}

/** data.go.kr items → array ("" when empty, a bare object when there is one). */
export function itemsOf<T>(json: unknown): T[] {
  const items = (json as { response?: { body?: { items?: { item?: T | T[] } | "" } } })?.response?.body?.items;
  if (!items || !items.item) return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}

// The stop directory and route paths are stable; only arrivals are live.
const nearCache = new TtlCache<RawNearStop[]>(6 * 60 * 60_000);
const routesCache = new TtlCache<RawRoute[]>(6 * 60 * 60_000);
const pathCache = new TtlCache<RawRouteStop[]>(6 * 60 * 60_000);

/**
 * The stops around a point, nearest first.
 *
 * The feed answers within a few hundred metres of the coordinate it is given,
 * which is nothing at all when the coordinate is a mountain peak or the middle
 * of a beach — Seongsan Ilchulbong returned no stops while its entrance stop sat
 * 700 m away. So the ring around the point is asked too, and the answers merged.
 */
export async function stopsNear(at: { lat: number; lng: number }): Promise<RawNearStop[]> {
  const key = `near:${at.lat.toFixed(4)},${at.lng.toFixed(4)}`;
  return nearCache.getOrLoad(key, async () => {
    const ask = async (lat: number, lng: number): Promise<RawNearStop[]> => {
      const json = await fetchJson(
        url(STOP_BASE, 'getCrdntPrxmtSttnList', { gpsLati: String(lat), gpsLong: String(lng), numOfRows: '30' }),
        {},
        6000,
      ).catch(() => undefined);
      return json ? itemsOf<RawNearStop>(json) : [];
    };
    const here = await ask(at.lat, at.lng);
    if (here.length) return here;
    // Nothing at the point itself, so ask around it: a ring about 650 m out, and
    // only if that is empty a wider one. Seongsan Ilchulbong's entrance stop is a
    // kilometre from the peak, which no single query would ever have reached.
    const compass = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
      [0.7, 0.7],
      [-0.7, 0.7],
      [0.7, -0.7],
      [-0.7, -0.7],
    ];
    for (const d of [0.006, 0.011]) {
      const dLng = d / Math.cos((at.lat * Math.PI) / 180);
      const ring = await Promise.all(compass.map(([dy, dx]) => ask(at.lat + dy * d, at.lng + dx * dLng)));
      const seen = new Set<string>();
      const found = ring.flat().filter((s) => s.nodeid && !seen.has(s.nodeid) && (seen.add(s.nodeid), true));
      if (found.length) return found;
    }
    return [];
  });
}

async function routesAt(cityCode: string, nodeId: string): Promise<RawRoute[]> {
  return routesCache.getOrLoad(`routes:${cityCode}:${nodeId}`, async () => {
    const json = await fetchJson(url(STOP_BASE, "getSttnThrghRouteList", { cityCode, nodeid: nodeId }), {}, 6000);
    return itemsOf<RawRoute>(json);
  });
}

async function routePath(cityCode: string, routeId: string): Promise<RawRouteStop[]> {
  return pathCache.getOrLoad(`path:${cityCode}:${routeId}`, async () => {
    const json = await fetchJson(url(ROUTE_BASE, "getRouteAcctoThrghSttnList", { cityCode, routeId }), {}, 6000);
    return itemsOf<RawRouteStop>(json);
  });
}

/**
 * Does this route run from the boarding stop to the alighting one, and how many
 * stops apart are they? Some feeds mark the two directions and some give one
 * numbered list out and back, where a stop appears twice — so every occurrence
 * of each end is paired up and the shortest ride forward is the answer.
 */
export function ridesBetween(path: RawRouteStop[], boardId: string, alightId: string): number | undefined {
  const directions = new Set(path.map((s) => String(s.updowncd ?? "0")));
  let best: number | undefined;
  for (const dir of directions) {
    const leg = path
      .filter((s) => String(s.updowncd ?? "0") === dir)
      .sort((a, b) => Number(a.nodeord ?? 0) - Number(b.nodeord ?? 0));
    const boards = leg.flatMap((s, i) => (s.nodeid === boardId ? [i] : []));
    const alights = leg.flatMap((s, i) => (s.nodeid === alightId ? [i] : []));
    for (const ia of boards) {
      for (const ib of alights) {
        if (ib > ia && (best === undefined || ib - ia < best)) best = ib - ia;
      }
    }
  }
  return best;
}

/**
 * One bus, no transfer, between two points — or nothing, which lets the caller
 * fall through to what it knows about the destination.
 */
/** Seoul is not in the national feed — it has its own, and its own planner. */
function inSeoul(p: { lat: number; lng: number }): boolean {
  return p.lat > 37.42 && p.lat < 37.71 && p.lng > 126.76 && p.lng < 127.19;
}

/**
 * A trip has to come back while someone is still looking at the screen. Cold, the
 * lookups take one and a half to four and a half seconds; warm they take none, so
 * the budget is set above the cold case rather than under it. Past it the lookups
 * are left running on purpose: they fill the cache, so the same question a minute
 * later is instant rather than late twice.
 */
const BUDGET_MS = 5000;

/** The plan, or the fact that we ran out of time — which is not the same as "no bus". */
export interface NationalBusAttempt {
  plan?: NationalBusPlan;
  timedOut: boolean;
}

export async function planDirectBusNear(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<NationalBusAttempt> {
  if (!ENV.BUS_API_KEY.trim()) return { timedOut: false };
  if (inSeoul(from) && inSeoul(to)) return { timedOut: false };
  const late = Symbol("late");
  const result = await Promise.race([
    planDirectBusNow(from, to),
    new Promise<typeof late>((r) => setTimeout(() => r(late), BUDGET_MS).unref?.()),
  ]);
  return result === late ? { timedOut: true } : { plan: result as NationalBusPlan | undefined, timedOut: false };
}

async function planDirectBusNow(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): Promise<NationalBusPlan | undefined> {
  try {
    const [fromStops, toStops] = await Promise.all([stopsNear(from), stopsNear(to)]);
    const walkable = (stops: RawNearStop[], at: { lat: number; lng: number }) => {
      const sorted = stops
        .filter((s) => s.nodeid && s.citycode != null && s.gpslati != null && s.gpslong != null)
        .map((s) => ({ s, km: haversineKm(at, { lat: Number(s.gpslati), lng: Number(s.gpslong) }) }))
        .filter((x) => x.km <= TO_STOP_KM)
        .sort((a, b) => a.km - b.km);
      // A station forecourt is a dozen numbered bays of one stop, and taking the
      // nearest few by distance alone fills every slot with them — at Suwon the
      // twelve bays crowded out the kerbside stop the bus to Hwaseong Haenggung
      // actually leaves from. So each name keeps a few bays, and no more.
      const perName = new Map<string, number>();
      const kept: typeof sorted = [];
      for (const x of sorted) {
        const name = String(x.s.nodenm ?? "").replace(/\s*\(.*$/, "");
        const n = perName.get(name) ?? 0;
        if (n >= 3) continue;
        perName.set(name, n + 1);
        kept.push(x);
        if (kept.length >= 16) break;
      }
      return kept;
    };
    const aList = walkable(fromStops, from);
    const bList = walkable(toStops, to);
    if (!aList.length || !bList.length) return undefined;

    const [aRoutes, bRoutes] = await Promise.all([
      Promise.all(aList.map(async (x) => ({ ...x, routes: await routesAt(String(x.s.citycode), x.s.nodeid!) }))),
      Promise.all(bList.map(async (x) => ({ ...x, routes: await routesAt(String(x.s.citycode), x.s.nodeid!) }))),
    ]);

    /**
     * Every stop each route could be boarded and left at — not just the nearest
     * one. A route out and back is one numbered list, so a station appears twice
     * on it: Suwon 35 calls at the station forecourt 20th on the way out and
     * 113th on the way back, and only the second one is on the way to Hwaseong
     * Haenggung.
     */
    type Side = (typeof aRoutes)[number];
    const routes = new Map<string, { routeNo: string; city: string; boards: Side[]; alights: Side[] }>();
    const note = (side: "boards" | "alights", x: Side) => {
      for (const r of x.routes) {
        if (!r.routeid) continue;
        const e =
          routes.get(r.routeid) ??
          routes.set(r.routeid, { routeNo: String(r.routeno ?? ""), city: String(x.s.citycode), boards: [], alights: [] }).get(r.routeid)!;
        if (!e[side].some((y) => y.s.nodeid === x.s.nodeid)) e[side].push(x);
      }
    };
    for (const a of aRoutes) note("boards", a);
    for (const b of bRoutes) note("alights", b);

    const serving = [...routes.entries()]
      .filter(([, e]) => e.boards.length && e.alights.length)
      .map(([routeId, e]) => ({
        routeId,
        ...e,
        walkKm: Math.min(...e.boards.map((x) => x.km)) + Math.min(...e.alights.map((x) => x.km)),
      }))
      // The least walking first; the ride itself is then counted on the route.
      .sort((x, y) => x.walkKm - y.walkKm)
      .slice(0, 10);
    if (!serving.length) return undefined;

    const paths = await Promise.all(serving.map((r) => routePath(r.city, r.routeId).catch(() => [])));
    let best: NationalBusPlan | undefined;
    for (const [i, r] of serving.entries()) {
      const path = paths[i];
      if (!path.length) continue;
      for (const board of r.boards) {
        for (const alight of r.alights) {
          if (board.s.nodeid === alight.s.nodeid) continue;
          const stops = ridesBetween(path, board.s.nodeid!, alight.s.nodeid!);
          if (stops === undefined || stops > MAX_STOPS) continue;
          const rideKm = haversineKm(
            { lat: Number(board.s.gpslati), lng: Number(board.s.gpslong) },
            { lat: Number(alight.s.gpslati), lng: Number(alight.s.gpslong) },
          );
          const plan: NationalBusPlan = {
            routeName: r.routeNo,
            boardAt: board.s.nodenm ?? "",
            alightAt: alight.s.nodenm ?? "",
            stops,
            minutes: Math.max(3, Math.round(Math.max(stops * MIN_PER_STOP, rideKm * MIN_PER_KM_RIDE))),
            walkToStopM: Math.round(board.km * 1000),
            walkFromStopM: Math.round(alight.km * 1000),
          };
          // Door to door, walking included — two stops nearer the sea is not a
          // better trip if it lands you 300 m further from where you are going.
          if (!best || doorToDoor(plan) < doorToDoor(best)) best = plan;
        }
      }
    }
    return best;
  } catch {
    return undefined;
  }
}
