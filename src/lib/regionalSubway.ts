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
import { graphFromNetwork, planRoute, regionalFare, type RegionalNetwork, type SubwayGraph, type SubwayRoute } from "./subwayPlan.js";

let graphs: { id: string; graph: SubwayGraph }[] | undefined;

function all(): { id: string; graph: SubwayGraph }[] {
  graphs ??= Object.entries(DATA as unknown as Record<string, RegionalNetwork>)
    .filter(([, net]) => Array.isArray(net?.stations) && net.stations.length > 0)
    .map(([id, net]) => ({ id, graph: graphFromNetwork(net) }));
  return graphs;
}

/**
 * A ride between two named stations in one of the regional networks — both
 * ends must be in the same city's network, which is also what keeps Daegu's
 * 중앙로 from answering for Daejeon's.
 */
export function planRegional(from: string, to: string): (SubwayRoute & { network: string }) | undefined {
  for (const { id, graph } of all()) {
    const r = planRoute(graph, from, to);
    if (r) return { ...r, fareWon: regionalFare(id, r.stops), network: id };
  }
  return undefined;
}
