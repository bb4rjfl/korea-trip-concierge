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
 * 중앙로 from answering for Daejeon's. It carries its own station labels:
 * Busan's 교대 is not Seoul's, and the Seoul index would name it as if it were.
 */
export function planRegional(
  from: string,
  to: string,
): (SubwayRoute & { network: string; label: (ko: string) => string }) | undefined {
  for (const { id, graph } of all()) {
    const r = planRoute(graph, from, to);
    if (!r) continue;
    const label = (ko: string): string => {
      const s = graph.stations.find((x) => x.ko === ko);
      const bare = ko.replace(/역$/, "");
      return s && s.en && s.en !== ko ? `${s.en} (${bare})` : ko;
    };
    return { ...r, fareWon: regionalFare(id, r.stops), network: id, label };
  }
  return undefined;
}
