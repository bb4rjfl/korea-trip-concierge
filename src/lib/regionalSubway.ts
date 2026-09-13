/**
 * The subway networks outside the capital, for routes the server plans
 * between named places — Busan, Daegu, Gwangju, Daejeon.
 *
 * These routes used to come only from the metered routing service, whose
 * daily allowance ran out one evening while a traveller in Busan could still be
 * asking. The networks are public and barely change, so like Seoul's they are
 * planned on our own graph first, and the service is left for the rest.
 * The same data serves the phone's planner (web/client/src/device/networks.ts).
 */

import DATA from "./data/regionalSubway.json" with { type: "json" };
import { graphFromNetwork, planBetween, planRoute, regionalFare, type RegionalNetwork, type SubwayGraph, type SubwayRoute } from "./subwayPlan.js";
import { STATION_WALK_M, metresBetween, walkMinutes, type NearStationPlan, type Point } from "./stationPlan.js";

let graphs: { id: string; net: RegionalNetwork; graph: SubwayGraph }[] | undefined;

function all(): { id: string; net: RegionalNetwork; graph: SubwayGraph }[] {
  graphs ??= Object.entries(DATA as unknown as Record<string, RegionalNetwork>)
    .filter(([, net]) => Array.isArray(net?.stations) && net.stations.length > 0)
    .map(([id, net]) => ({ id, net, graph: graphFromNetwork(net) }));
  return graphs;
}

/** A city's stations by that city's own names: Busan's 교대 is not Seoul's. */
function labeller(graph: SubwayGraph): (ko: string) => string {
  return (ko: string): string => {
    const s = graph.stations.find((x) => x.ko === ko);
    const bare = ko.replace(/역$/, "");
    return s && s.en && s.en !== ko ? `${s.en} (${bare})` : ko;
  };
}

/**
 * A ride between two named stations in one of the regional networks — both
 * ends must be in the same city's network, which is also what keeps Daegu's
 * 중앙로 from answering for Daejeon's.
 */
export function planRegional(
  from: string,
  to: string,
): (SubwayRoute & { network: string; label: (ko: string) => string }) | undefined {
  for (const { id, graph } of all()) {
    const r = planRoute(graph, from, to);
    if (!r) continue;
    return { ...r, fareWon: regionalFare(id, r.stops), network: id, label: labeller(graph) };
  }
  return undefined;
}

/** The stations of one network within a walk of a point, one entry per station however many lines call there. */
function nearIn(net: RegionalNetwork, p: Point, maxWalkM: number, limit: number): { k: string; codes: string[]; metres: number }[] {
  const byName = new Map<string, { k: string; codes: string[]; metres: number }>();
  for (const s of net.stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const metres = Math.round(metresBetween(p, s));
    if (metres > maxWalkM) continue;
    const e = byName.get(s.k);
    if (e) {
      e.codes.push(s.c);
      e.metres = Math.min(e.metres, metres);
    } else byName.set(s.k, { k: s.k, codes: [s.c], metres });
  }
  return [...byName.values()].sort((a, b) => a.metres - b.metres).slice(0, limit);
}

/**
 * The same trip planned from where the two ends are — E-World is 583 m from
 * Duryu Station, and no name table had ever said so.
 */
export function planRegionalNear(
  from: Point,
  to: Point,
  maxWalkM = STATION_WALK_M,
  maxWalkToM = maxWalkM,
): (NearStationPlan & { network: string; label: (ko: string) => string }) | undefined {
  let best: (NearStationPlan & { network: string; label: (ko: string) => string }) | undefined;
  for (const { id, net, graph } of all()) {
    const starts = nearIn(net, from, maxWalkM, 4);
    if (!starts.length) continue;
    const ends = nearIn(net, to, maxWalkToM, 4);
    for (const a of starts) {
      for (const b of ends) {
        if (a.k === b.k) continue;
        const r = planBetween(graph, a.codes, b.codes);
        if (!r) continue;
        const minutes = walkMinutes(a.metres) + r.minutes + walkMinutes(b.metres);
        if (!best || minutes < best.minutes) {
          best = {
            route: { ...r, fareWon: regionalFare(id, r.stops) },
            boardKo: a.k,
            alightKo: b.k,
            walkToM: a.metres,
            walkFromM: b.metres,
            minutes,
            network: id,
            label: labeller(graph),
          };
        }
      }
    }
  }
  return best;
}

/** Every regional station within reach of a point, nearest first — for a subway ride that ends in a bus. */
export function regionalStationsNear(p: Point, maxM: number, limit: number): { k: string; network: string; lat: number; lng: number; metres: number }[] {
  const out: { k: string; network: string; lat: number; lng: number; metres: number }[] = [];
  for (const { id, net } of all()) {
    const seen = new Set<string>();
    for (const s of net.stations) {
      if (seen.has(s.k) || !Number.isFinite(s.lat)) continue;
      const metres = Math.round(metresBetween(p, s));
      if (metres > maxM) continue;
      seen.add(s.k);
      out.push({ k: s.k, network: id, lat: s.lat, lng: s.lng, metres });
    }
  }
  return out.sort((a, b) => a.metres - b.metres).slice(0, limit);
}

/** Plan between two named stations of one regional network. */
export function planRegionalStations(network: string, fromKo: string, toKo: string): SubwayRoute | undefined {
  const g = all().find((x) => x.id === network);
  if (!g) return undefined;
  const codes = (k: string) => g.net.stations.filter((s) => s.k === k).map((s) => s.c);
  const r = planBetween(g.graph, codes(fromKo), codes(toKo));
  return r ? { ...r, fareWon: regionalFare(network, r.stops) } : undefined;
}
