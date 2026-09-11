/**
 * The subway networks the phone can plan on: the capital's, and Busan, Daegu,
 * Gwangju and Daejeon's. Each answers the same four questions — which
 * stations are near a point, a station by its Korean name, the ride between
 * two stations, and roughly what it costs — so the route card does not need to
 * know which city it is in.
 *
 * Loaded only when a route is planned: the station tables and graphs are the
 * heaviest things the phone ever downloads.
 */

import type { SubwayGraph, SubwayRoute, RegionalNetwork } from "../../../../src/lib/subwayPlan.js";
import type { StationNames } from "./lines.js";
import { metres, type Point } from "./card.js";

/** A station within reach, with every platform code it has in its network. */
export interface Stop {
  station: StationNames & Point;
  metres: number;
  codes: string[];
}

export interface Network {
  id: string;
  /** Stations within `maxMetres` of a point, nearest first, one per physical station. */
  near(p: Point, maxMetres: number, limit: number): Stop[];
  /** A station by its Korean name, as a gateway is given. */
  byKo(ko: string): Stop | undefined;
  /** The ride between two stations' platforms. */
  plan(from: string[], to: string[]): SubwayRoute | undefined;
  /** A station's names, by its Korean name, for the ride legs. */
  names(ko: string): StationNames;
  /** Roughly what the ride costs by card. */
  fare(r: SubwayRoute): number;
  /** Whether a live arrivals board exists for it (Seoul's does). */
  live: boolean;
}

let loaded: Promise<Network[]> | undefined;

/** Every network the phone knows, the capital first. */
export function networks(): Promise<Network[]> {
  loaded ??= Promise.all([capital(), regional()]).then(([c, r]) => [c, ...r]);
  return loaded;
}

async function capital(): Promise<Network> {
  const [{ stationsNear, stationByKo }, plan] = await Promise.all([
    import("../../../../src/lib/nearest.js"),
    import("../../../../src/lib/subwayPlan.js"),
  ]);
  const g = plan.fromSnapshot();
  const stop = (s: StationNames & Point, m: number): Stop => ({ station: s, metres: m, codes: plan.stationCodes(g, s.k) });
  return {
    id: "capital",
    near: (p, max, limit) => stationsNear(p.lat, p.lng, max, limit).map((x) => stop(x.station, x.metres)),
    byKo: (ko) => {
      const s = stationByKo(ko);
      return s ? stop(s, 0) : undefined;
    },
    plan: (a, b) => plan.planBetween(g, a, b),
    names: (ko) => namesIn(g, plan.stationCodes(g, ko)[0]) ?? stationByKo(ko) ?? { k: ko },
    fare: (r) => r.fareWon,
    live: true,
  };
}

function namesIn(g: SubwayGraph, code?: string): StationNames | undefined {
  const s = code ? g.byCode.get(code) : undefined;
  return s ? { k: s.ko, e: s.en, j: s.ja, z: s.zh } : undefined;
}

async function regional(): Promise<Network[]> {
  const [data, plan] = await Promise.all([
    import("../../../../src/lib/data/regionalSubway.json").then((m) => m.default as unknown as Record<string, RegionalNetwork>).catch(() => ({}) as Record<string, RegionalNetwork>),
    import("../../../../src/lib/subwayPlan.js"),
  ]);
  return Object.entries(data).map(([id, net]) => {
    const g = plan.graphFromNetwork(net);
    // One stop per physical station: a transfer station is two codes, one name.
    const places = new Map<string, { station: StationNames & Point; codes: string[] }>();
    for (const s of net.stations) {
      const key = `${s.k}@${Math.round(s.lat * 200)},${Math.round(s.lng * 200)}`;
      const place = places.get(key) ?? { station: { k: s.k, e: s.e, j: s.e, z: s.e, lat: s.lat, lng: s.lng }, codes: [] };
      place.codes.push(s.c);
      places.set(key, place);
    }
    const all = [...places.values()];
    const fare = (stops: number): number => plan.regionalFare(id, stops);
    return {
      id,
      near: (p, max, limit) =>
        all
          .map((x) => ({ ...x, metres: metres(p, x.station) }))
          .filter((x) => x.metres <= max)
          .sort((a, b) => a.metres - b.metres)
          .slice(0, limit),
      byKo: (ko) => {
        const bare = ko.replace(/역$/, "");
        const x = all.find((s) => s.station.k === bare);
        return x ? { ...x, metres: 0 } : undefined;
      },
      plan: (a, b) => {
        const r = plan.planBetween(g, a, b);
        return r ? { ...r, fareWon: fare(r.stops) } : undefined;
      },
      names: (ko) => all.find((s) => s.station.k === ko)?.station ?? { k: ko },
      fare: (r) => r.fareWon,
      live: false,
    } satisfies Network;
  });
}
