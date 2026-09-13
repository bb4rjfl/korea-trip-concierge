/**
 * Bus planning anywhere in Korea outside Seoul, from the national bus open data.
 *
 * Seoul has its own feed and its own planner (busRoute.ts). Everywhere else —
 * Jeju, Gyeongju, Suwon, the coast road to Haedong Yonggungsa — the only live
 * source we had was a metered routing service whose daily allowance kept running
 * out. The national feed answers the three questions a bus trip needs:
 *   getCrdntPrxmtSttnList(lat,lng)          → the stops around a point
 *   getSttnThrghRouteList(city,stop)        → the routes calling at one stop
 *   getRouteAcctoThrghSttnList(city,route)  → that route's stops, in order
 * Routes at both ends that are the same route are a direct bus; a route from
 * one end and a route to the other that pass the same stop (or two stops across
 * a road from each other) are a bus with one change.
 *
 * All calls go through dataGoKr.ts, which keeps us inside the portal's thirty
 * sessions and throws instead of returning an empty list when it refuses —
 * so a refusal is never cached as "no bus stops here".
 *
 * Source: 국토교통부 TAGO 버스 정보 (ⓒ국토교통부), on the same key as live arrivals.
 */

import { ENV } from "../env.js";
import { TtlCache } from "../cache.js";
import { haversineKm } from "../courses.js";
import { portalJson } from "./dataGoKr.js";

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
/** Waiting for the second bus, which is on no timetable we hold. */
const CHANGE_WAIT_MIN = 8;
/** A change is across the road, not across town. */
const CHANGE_WALK_M = 200;
/** A stop that carries the destination's own name is worth a few minutes' preference. */
const NAMED_STOP_BONUS_MIN = 5;
const SIX_HOURS = 6 * 60 * 60_000;

/** The whole trip as the traveller feels it: both walks plus the ride. */
export function doorToDoor(p: { minutes: number; walkToStopM: number; walkFromStopM: number }): number {
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

export interface BusLeg {
  routeName: string;
  boardAt: string;
  alightAt: string;
  stops: number;
  minutes: number;
}

export interface TransferBusPlan {
  first: BusLeg;
  second: BusLeg;
  /** 0 when both buses call at the same stop. */
  changeWalkM: number;
  /** Both rides, the wait and the walk across. */
  minutes: number;
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

export interface RawRouteStop {
  nodeid?: string;
  nodenm?: string;
  nodeord?: number | string;
  updowncd?: number | string;
  gpslati?: number | string;
  gpslong?: number | string;
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

// The stop directory and route paths are stable; only arrivals are live. A
// lookup that throws is never stored, so a refusal is retried next time.
const nearCache = new TtlCache<RawNearStop[]>(SIX_HOURS);
const routesCache = new TtlCache<RawRoute[]>(SIX_HOURS);
const pathCache = new TtlCache<RawRouteStop[]>(SIX_HOURS);

/**
 * The stops around a point, nearest first.
 *
 * The feed answers within about 500 m of the coordinate it is given, which is
 * nothing at all when the coordinate is a mountain peak or the middle of a
 * beach — Seongsan Ilchulbong's entrance stop is a kilometre from the peak. So
 * when the point itself is empty, a ring around it is asked, and a wider one if
 * that is empty too.
 */
export async function stopsNear(at: { lat: number; lng: number }): Promise<RawNearStop[]> {
  const key = `near:${at.lat.toFixed(4)},${at.lng.toFixed(4)}`;
  const hit = nearCache.get(key);
  if (hit !== undefined) return hit;
  const ask = async (lat: number, lng: number): Promise<RawNearStop[]> =>
    itemsOf<RawNearStop>(
      await portalJson(url(STOP_BASE, "getCrdntPrxmtSttnList", { gpsLati: String(lat), gpsLong: String(lng), numOfRows: "30" })),
    );
  const here = await ask(at.lat, at.lng);
  if (here.length) {
    nearCache.set(key, here);
    return here;
  }
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
    const ring = await Promise.allSettled(compass.map(([dy, dx]) => ask(at.lat + dy * d, at.lng + dx * dLng)));
    const complete = ring.every((r) => r.status === "fulfilled");
    const seen = new Set<string>();
    const found = ring
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .filter((s) => s.nodeid && !seen.has(s.nodeid) && (seen.add(s.nodeid), true));
    if (found.length) {
      // Half a ring is an answer for now, not for six hours.
      nearCache.set(key, found, complete ? SIX_HOURS : 60_000);
      return found;
    }
    if (!complete) throw new Error("the stop directory did not answer around this point");
  }
  nearCache.set(key, []);
  return [];
}

/**
 * Whether the national feed knows any stop within reach of a point. Some cities
 * are simply not in it — Gangneung, Sokcho, Boseong — and there "no bus found"
 * means "no bus data", which is a different thing to tell a traveller.
 * Undefined when we cannot tell (no key, Seoul, or the portal did not answer).
 */
export async function busDataNear(at: { lat: number; lng: number }): Promise<boolean | undefined> {
  if (!ENV.BUS_API_KEY.trim() || inSeoul(at)) return undefined;
  try {
    return (await stopsNear(at)).length > 0;
  } catch {
    return undefined;
  }
}

async function routesAt(cityCode: string, nodeId: string): Promise<RawRoute[]> {
  return routesCache.getOrLoad(`routes:${cityCode}:${nodeId}`, async () =>
    itemsOf<RawRoute>(await portalJson(url(STOP_BASE, "getSttnThrghRouteList", { cityCode, nodeid: nodeId }))),
  );
}

async function routePath(cityCode: string, routeId: string): Promise<RawRouteStop[]> {
  return pathCache.getOrLoad(`path:${cityCode}:${routeId}`, async () =>
    itemsOf<RawRouteStop>(await portalJson(url(ROUTE_BASE, "getRouteAcctoThrghSttnList", { cityCode, routeId, numOfRows: "400" }))),
  );
}

/** A route's stop list split into its directions, each in calling order. */
function directionsOf(path: RawRouteStop[]): RawRouteStop[][] {
  const dirs = new Map<string, RawRouteStop[]>();
  for (const s of path) {
    const d = String(s.updowncd ?? "0");
    const list = dirs.get(d) ?? [];
    list.push(s);
    dirs.set(d, list);
  }
  return [...dirs.values()].map((l) => [...l].sort((a, b) => Number(a.nodeord ?? 0) - Number(b.nodeord ?? 0)));
}

/**
 * Does this route run from the boarding stop to the alighting one, and how many
 * stops apart are they? Some feeds mark the two directions and some give one
 * numbered list out and back, where a stop appears twice — so every occurrence
 * of each end is paired up and the shortest ride forward is the answer.
 */
export function ridesBetween(path: RawRouteStop[], boardId: string, alightId: string): number | undefined {
  let best: number | undefined;
  for (const leg of directionsOf(path)) {
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

function coordOf(s: { gpslati?: number | string; gpslong?: number | string }): { lat: number; lng: number } | undefined {
  const lat = Number(s.gpslati);
  const lng = Number(s.gpslong);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0 ? { lat, lng } : undefined;
}

/** Metres between two stops, or Infinity when either has no position. */
function stopMetres(a: RawRouteStop, b: RawRouteStop): number {
  const pa = coordOf(a);
  const pb = coordOf(b);
  return pa && pb ? haversineKm(pa, pb) * 1000 : Infinity;
}

function rideMinutes(stops: number, a: RawRouteStop | RawNearStop, b: RawRouteStop | RawNearStop): number {
  const pa = coordOf(a);
  const pb = coordOf(b);
  const km = pa && pb ? haversineKm(pa, pb) : 0;
  return Math.max(3, Math.round(Math.max(stops * MIN_PER_STOP, km * MIN_PER_KM_RIDE)));
}

export interface ChangePoint {
  board: RawRouteStop;
  changeFrom: RawRouteStop;
  changeTo: RawRouteStop;
  alight: RawRouteStop;
  firstStops: number;
  secondStops: number;
  changeWalkM: number;
}

/**
 * Where to change from the first route to the second: a stop after boarding on
 * the first that is the same stop — or across the road, within a short walk —
 * as a stop before alighting on the second. Stop ids differ between the two
 * sides of a road and between the bays of a terminal, so position counts as
 * much as identity. The fewest stops in total wins.
 */
export function changeBetween(
  first: RawRouteStop[],
  boardIds: Set<string>,
  second: RawRouteStop[],
  alightIds: Set<string>,
  maxWalkM = CHANGE_WALK_M,
): ChangePoint | undefined {
  let best: ChangePoint | undefined;
  let bestScore = Infinity;
  const secondLegs = directionsOf(second)
    .map((lb) => ({ lb, alightAt: lb.flatMap((s, i) => (s.nodeid && alightIds.has(s.nodeid) ? [i] : [])) }))
    .filter((x) => x.alightAt.length);
  if (!secondLegs.length) return undefined;
  for (const la of directionsOf(first)) {
    const boardAt = la.flatMap((s, i) => (s.nodeid && boardIds.has(s.nodeid) ? [i] : []));
    for (const ia of boardAt) {
      for (let ix = ia + 1; ix < la.length; ix++) {
        const x = la[ix];
        for (const { lb, alightAt } of secondLegs) {
          const lastAlight = Math.max(...alightAt);
          for (let iy = 0; iy < lastAlight; iy++) {
            const y = lb[iy];
            const walk = x.nodeid && x.nodeid === y.nodeid ? 0 : stopMetres(x, y);
            if (walk > maxWalkM) continue;
            const ib = alightAt.find((p) => p > iy);
            if (ib === undefined) continue;
            const score = ix - ia + (ib - iy) + walk / 100;
            if (score < bestScore) {
              bestScore = score;
              best = {
                board: la[ia],
                changeFrom: x,
                changeTo: y,
                alight: lb[ib],
                firstStops: ix - ia,
                secondStops: ib - iy,
                changeWalkM: Math.round(walk),
              };
            }
          }
        }
      }
    }
  }
  return best;
}

/**
 * Does a stop carry the destination's own name — 전동성당.한옥마을 for the hanok
 * village, 오동도입구 for Odongdo? Asked for Jeonju Hanok Village, the planner had
 * picked a stop called "Military Manpower Office" because it was a stop sooner.
 */
export function sharesName(stop: string, place?: string): boolean {
  if (!place) return false;
  const a = stop.replace(/[^가-힣]/g, "");
  const b = place.replace(/[^가-힣]/g, "");
  if (a.length < 2 || b.length < 2) return false;
  const n = Math.min(3, b.length);
  for (let i = 0; i + n <= b.length; i++) if (a.includes(b.slice(i, i + n))) return true;
  return false;
}

/** Seoul is not in the national feed — it has its own, and its own planner. */
function inSeoul(p: { lat: number; lng: number }): boolean {
  return p.lat > 37.42 && p.lat < 37.71 && p.lng > 126.76 && p.lng < 127.19;
}

interface Side {
  s: RawNearStop;
  km: number;
  routes: RawRoute[];
}

/** The stops within a walk, a few bays per stop name so a terminal's twelve bays don't crowd out the kerbside stop. */
function walkable(stops: RawNearStop[], at: { lat: number; lng: number }): { s: RawNearStop; km: number }[] {
  const sorted = stops
    .filter((s) => s.nodeid && s.citycode != null && coordOf(s))
    .map((s) => ({ s, km: haversineKm(at, coordOf(s)!) }))
    .filter((x) => x.km <= TO_STOP_KM)
    .sort((a, b) => a.km - b.km);
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
}

async function withRoutes(list: { s: RawNearStop; km: number }[]): Promise<Side[]> {
  return Promise.all(list.map(async (x) => ({ ...x, routes: await routesAt(String(x.s.citycode), x.s.nodeid!).catch(() => [] as RawRoute[]) })));
}

async function endsOf(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<[Side[], Side[]]> {
  const [fromStops, toStops] = await Promise.all([stopsNear(from), stopsNear(to)]);
  return Promise.all([withRoutes(walkable(fromStops, from)), withRoutes(walkable(toStops, to))]);
}

interface Serving {
  routeId: string;
  routeNo: string;
  city: string;
  stops: Side[];
  nearestKm: number;
}

function byRoute(sides: Side[]): Map<string, Serving> {
  const m = new Map<string, Serving>();
  for (const x of sides) {
    for (const r of x.routes) {
      if (!r.routeid) continue;
      const e = m.get(r.routeid) ?? { routeId: r.routeid, routeNo: String(r.routeno ?? ""), city: String(x.s.citycode), stops: [], nearestKm: x.km };
      if (!e.stops.some((y) => y.s.nodeid === x.s.nodeid)) e.stops.push(x);
      e.nearestKm = Math.min(e.nearestKm, x.km);
      m.set(r.routeid, e);
    }
  }
  return m;
}

async function planDirectBusNow(from: { lat: number; lng: number }, to: { lat: number; lng: number }, toName?: string): Promise<NationalBusPlan | undefined> {
  const [a, b] = await endsOf(from, to);
  if (!a.length || !b.length) return undefined;
  const boards = byRoute(a);
  const alights = byRoute(b);
  const serving = [...boards.values()]
    .filter((r) => alights.has(r.routeId))
    .map((r) => ({ ...r, alightStops: alights.get(r.routeId)!.stops, walkKm: r.nearestKm + alights.get(r.routeId)!.nearestKm }))
    .sort((x, y) => x.walkKm - y.walkKm)
    .slice(0, 10);
  if (!serving.length) return undefined;

  const paths = await Promise.all(serving.map((r) => routePath(r.city, r.routeId).catch(() => [] as RawRouteStop[])));
  let best: NationalBusPlan | undefined;
  let bestScore = Infinity;
  for (const [i, r] of serving.entries()) {
    const path = paths[i];
    if (!path.length) continue;
    for (const board of r.stops) {
      for (const alight of r.alightStops) {
        if (board.s.nodeid === alight.s.nodeid) continue;
        const stops = ridesBetween(path, board.s.nodeid!, alight.s.nodeid!);
        if (stops === undefined || stops > MAX_STOPS) continue;
        const plan: NationalBusPlan = {
          routeName: r.routeNo,
          boardAt: board.s.nodenm ?? "",
          alightAt: alight.s.nodenm ?? "",
          stops,
          minutes: rideMinutes(stops, board.s, alight.s),
          walkToStopM: Math.round(board.km * 1000),
          walkFromStopM: Math.round(alight.km * 1000),
        };
        // Door to door, walking included — two stops nearer the sea is not a
        // better trip if it lands you 300 m further from where you are going.
        const score = doorToDoor(plan) - (sharesName(plan.alightAt, toName) ? NAMED_STOP_BONUS_MIN : 0);
        if (score < bestScore) {
          bestScore = score;
          best = plan;
        }
      }
    }
  }
  return best ?? planDirectByNumber(from, to, a, b, toName);
}

const numberCache = new TtlCache<{ routeid: string }[]>(SIX_HOURS);

/** Every id a route number goes by in one city — one per direction, sometimes one per variant. */
async function routeIdsByNumber(city: string, routeNo: string): Promise<{ routeid: string }[]> {
  return numberCache.getOrLoad(`no:${city}:${routeNo}`, async () =>
    itemsOf<{ routeid?: string; routeno?: string | number }>(await portalJson(url(ROUTE_BASE, "getRouteNoList", { cityCode: city, routeNo })))
      // The search is by prefix: asking for 62 also returns 620 and 621.
      .filter((r) => r.routeid && String(r.routeno) === routeNo)
      .map((r) => ({ routeid: r.routeid! })),
  );
}

/**
 * The same bus, found by its number instead of by the ids of two stops.
 *
 * A route's two directions are separate ids, and a stop lists only the ids that
 * call at that very pole. Tongyeong's 620 runs from the bus terminal past the
 * foot of Dongpirang — on the other side of the road from the stop the
 * directory offered, under the other direction's id — so no id was shared by
 * both ends and there was "no bus". When that happens, the route numbers shared
 * by both ends are looked up in full, and every direction's own stops are
 * measured against the two places themselves.
 */
async function planDirectByNumber(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  a: Side[],
  b: Side[],
  toName?: string,
): Promise<NationalBusPlan | undefined> {
  const atOrigin = new Map<string, { city: string; routeNo: string; km: number }>();
  for (const x of a) {
    for (const r of x.routes) {
      if (r.routeno == null) continue;
      const key = `${x.s.citycode}:${r.routeno}`;
      const e = atOrigin.get(key);
      if (!e || x.km < e.km) atOrigin.set(key, { city: String(x.s.citycode), routeNo: String(r.routeno), km: x.km });
    }
  }
  const shared = new Map<string, { city: string; routeNo: string; km: number }>();
  for (const x of b) {
    for (const r of x.routes) {
      const key = `${x.s.citycode}:${r.routeno}`;
      const o = atOrigin.get(key);
      if (!o) continue;
      const km = o.km + x.km;
      const e = shared.get(key);
      if (!e || km < e.km) shared.set(key, { ...o, km });
    }
  }
  const numbers = [...shared.values()].sort((x, y) => x.km - y.km).slice(0, 6);
  if (!numbers.length) return undefined;

  const ids = (
    await Promise.all(
      numbers.map((n) =>
        routeIdsByNumber(n.city, n.routeNo)
          .then((list) => list.map((r) => ({ ...n, routeId: r.routeid })))
          .catch(() => []),
      ),
    )
  )
    .flat()
    .slice(0, 12);
  const paths = await Promise.all(ids.map((r) => routePath(r.city, r.routeId).catch(() => [] as RawRouteStop[])));

  let best: NationalBusPlan | undefined;
  let bestScore = Infinity;
  for (const [i, r] of ids.entries()) {
    for (const leg of directionsOf(paths[i])) {
      const fromKm = leg.map((s) => (coordOf(s) ? haversineKm(from, coordOf(s)!) : Infinity));
      const nearest = Math.min(...fromKm);
      if (nearest > TO_STOP_KM) continue;
      // A loop passes the same corner twice; either pass may be the one that goes on.
      const boards = fromKm.flatMap((km, idx) => (km <= Math.min(nearest + 0.15, TO_STOP_KM) ? [idx] : []));
      for (const ia of boards) {
        let ib = -1;
        let toKm = Infinity;
        for (let j = ia + 1; j < leg.length && j - ia <= MAX_STOPS; j++) {
          const p = coordOf(leg[j]);
          if (!p) continue;
          const km = haversineKm(to, p);
          if (km < toKm) {
            toKm = km;
            ib = j;
          }
        }
        if (ib < 0 || toKm > TO_STOP_KM) continue;
        const plan: NationalBusPlan = {
          routeName: r.routeNo,
          boardAt: leg[ia].nodenm ?? "",
          alightAt: leg[ib].nodenm ?? "",
          stops: ib - ia,
          minutes: rideMinutes(ib - ia, leg[ia], leg[ib]),
          walkToStopM: Math.round(fromKm[ia] * 1000),
          walkFromStopM: Math.round(toKm * 1000),
        };
        const score = doorToDoor(plan) - (sharesName(plan.alightAt, toName) ? NAMED_STOP_BONUS_MIN : 0);
        if (score < bestScore) {
          bestScore = score;
          best = plan;
        }
      }
    }
  }
  return best;
}

async function planTransferBusNow(from: { lat: number; lng: number }, to: { lat: number; lng: number }, toName?: string): Promise<TransferBusPlan | undefined> {
  const [a, b] = await endsOf(from, to);
  if (!a.length || !b.length) return undefined;
  const boards = byRoute(a);
  const alights = byRoute(b);
  // Both directions of a route are separate ids, and either may be the one
  // that goes the right way — so nothing is merged by route number here.
  const pick = (m: Map<string, Serving>, other: Map<string, Serving>) =>
    [...m.values()]
      .filter((r) => !other.has(r.routeId))
      .sort((x, y) => x.nearestKm - y.nearestKm)
      .slice(0, 8);
  const firsts = pick(boards, alights);
  const lasts = pick(alights, boards);
  if (!firsts.length || !lasts.length) return undefined;
  const [pf, pl] = await Promise.all([
    Promise.all(firsts.map((r) => routePath(r.city, r.routeId).catch(() => [] as RawRouteStop[]))),
    Promise.all(lasts.map((r) => routePath(r.city, r.routeId).catch(() => [] as RawRouteStop[]))),
  ]);

  let best: TransferBusPlan | undefined;
  let bestScore = Infinity;
  for (const [i, f] of firsts.entries()) {
    if (!pf[i].length) continue;
    const boardKm = new Map(f.stops.map((x) => [x.s.nodeid!, x.km]));
    for (const [j, l] of lasts.entries()) {
      if (!pl[j].length) continue;
      const alightKm = new Map(l.stops.map((x) => [x.s.nodeid!, x.km]));
      const c = changeBetween(pf[i], new Set(boardKm.keys()), pl[j], new Set(alightKm.keys()));
      if (!c || c.firstStops + c.secondStops > MAX_STOPS * 1.5) continue;
      // A one-stop ride is a walk, and changing buses for it is eight minutes'
      // wait for nothing — "bus 504 for one stop, then 816" was the suggestion.
      if (c.firstStops < 2 || c.secondStops < 2) continue;
      const first: BusLeg = {
        routeName: f.routeNo,
        boardAt: c.board.nodenm ?? "",
        alightAt: c.changeFrom.nodenm ?? "",
        stops: c.firstStops,
        minutes: rideMinutes(c.firstStops, c.board, c.changeFrom),
      };
      const second: BusLeg = {
        routeName: l.routeNo,
        boardAt: c.changeTo.nodenm ?? "",
        alightAt: c.alight.nodenm ?? "",
        stops: c.secondStops,
        minutes: rideMinutes(c.secondStops, c.changeTo, c.alight),
      };
      const plan: TransferBusPlan = {
        first,
        second,
        changeWalkM: c.changeWalkM,
        minutes: first.minutes + second.minutes + CHANGE_WAIT_MIN + Math.round((c.changeWalkM / 1000) * MIN_PER_KM_WALK),
        walkToStopM: Math.round((boardKm.get(c.board.nodeid!) ?? 0) * 1000),
        walkFromStopM: Math.round((alightKm.get(c.alight.nodeid!) ?? 0) * 1000),
      };
      const score = doorToDoor(plan) - (sharesName(second.alightAt, toName) ? NAMED_STOP_BONUS_MIN : 0);
      if (score < bestScore) {
        bestScore = score;
        best = plan;
      }
    }
  }
  return best;
}

/**
 * A trip has to come back while someone is still looking at the screen. Cold, the
 * lookups take one and a half to four and a half seconds; warm they take none, so
 * the budget is set above the cold case rather than under it. Past it the lookups
 * are left running on purpose: they fill the cache, so the same question a minute
 * later is instant rather than late twice.
 */
const BUDGET_MS = 5000;

async function withinBudget<T>(work: Promise<T | undefined>): Promise<{ value?: T; timedOut: boolean }> {
  const late = Symbol("late");
  const r = await Promise.race([
    work.catch(() => undefined),
    new Promise<typeof late>((resolve) => setTimeout(() => resolve(late), BUDGET_MS).unref?.()),
  ]);
  return r === late ? { timedOut: true } : { value: r as T | undefined, timedOut: false };
}

/** The plan, or the fact that we ran out of time — which is not the same as "no bus". */
export interface NationalBusAttempt {
  plan?: NationalBusPlan;
  timedOut: boolean;
}

export interface TransferBusAttempt {
  plan?: TransferBusPlan;
  timedOut: boolean;
}

/** One bus, no transfer. `toName` is the destination's Korean name, when we know it. */
export async function planDirectBusNear(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: { toName?: string } = {},
): Promise<NationalBusAttempt> {
  if (!ENV.BUS_API_KEY.trim() || (inSeoul(from) && inSeoul(to))) return { timedOut: false };
  const r = await withinBudget(planDirectBusNow(from, to, opts.toName));
  return { plan: r.value, timedOut: r.timedOut };
}

/** Two buses with one change — asked only once no single bus does the trip. */
export async function planTransferBusNear(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: { toName?: string } = {},
): Promise<TransferBusAttempt> {
  if (!ENV.BUS_API_KEY.trim() || (inSeoul(from) && inSeoul(to))) return { timedOut: false };
  const r = await withinBudget(planTransferBusNow(from, to, opts.toName));
  return { plan: r.value, timedOut: r.timedOut };
}
