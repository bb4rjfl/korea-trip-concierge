/**
 * Subway trips between two places by where they are, not by what they are called.
 *
 * The server used to reach the rails only through a hand-kept table of landmark
 * names — Gyeongbokgung → 경복궁, COEX → 삼성 — so a destination missing from it
 * had no subway at all: the National Museum of Korea sits 526 m from Ichon
 * Station, Starfield Library 286 m from Bongeunsa, Incheon's Chinatown 27 m from
 * Incheon Station, and each came back as "no route". The phone never had this
 * problem, because it plans from coordinates. Now the server does the same: the
 * few stations within a walk of each end, every pairing planned, and the one
 * with the least door-to-door time kept — the walks counted, not assumed away.
 */

import { planBetween, stationCodes, type SubwayGraph, type SubwayRoute } from "./subwayPlan.js";
import { stationsNear } from "./nearest.js";

export interface Point {
  lat: number;
  lng: number;
}

/** A station further than this is a bus ride away, not a walk. */
export const STATION_WALK_M = 1200;

/** Streets run about a quarter longer than the crow flies; 75 m a minute on foot. */
export function walkMinutes(metres: number): number {
  return Math.max(0, Math.round((metres * 1.25) / 75));
}

export function metresBetween(a: Point, b: Point): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface NearStationPlan {
  route: SubwayRoute;
  /** Korean station names, as the planner and the live board write them. */
  boardKo: string;
  alightKo: string;
  walkToM: number;
  walkFromM: number;
  /** Door to door: both walks and the ride. */
  minutes: number;
}

/**
 * Stations the coordinate register and the line data name differently — renamed
 * since one of them was published. Without this they have a position and no
 * trains: Everland's line lost a station, and Line 7 one by the river.
 */
const LINE_DATA_NAME: Record<string, string> = {
  뚝섬유원지: "자양",
  "운동장.송담대": "용인중앙시장",
};

/** The capital region's network (Seoul, Incheon, Gyeonggi). */
export function planCapitalNear(
  graph: SubwayGraph,
  from: Point,
  to: Point,
  maxWalkM = STATION_WALK_M,
  /** Separately, so a ride can be made to end at one particular station. */
  maxWalkToM = maxWalkM,
): NearStationPlan | undefined {
  const starts = stationsNear(from.lat, from.lng, maxWalkM, 4);
  const ends = stationsNear(to.lat, to.lng, maxWalkToM, 4);
  const named = (k: string) => LINE_DATA_NAME[k] ?? k;
  let best: NearStationPlan | undefined;
  for (const a of starts) {
    const ac = stationCodes(graph, named(a.station.k));
    if (!ac.length) continue;
    for (const b of ends) {
      if (a.station.k === b.station.k) continue;
      const bc = stationCodes(graph, named(b.station.k));
      if (!bc.length) continue;
      const route = planBetween(graph, ac, bc);
      if (!route) continue;
      const minutes = walkMinutes(a.metres) + route.minutes + walkMinutes(b.metres);
      if (!best || minutes < best.minutes) {
        best = { route, boardKo: named(a.station.k), alightKo: named(b.station.k), walkToM: a.metres, walkFromM: b.metres, minutes };
      }
    }
  }
  return best;
}
