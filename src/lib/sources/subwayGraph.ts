/**
 * Seoul metropolitan subway graph — our own route planner.
 *
 * Why this exists: route planning used to depend on a single commercial routing
 * API with a hard daily quota. A QA sweep exhausted it twice and the product's
 * core feature went dark for the rest of the day. The subway network, though, is
 * public data and barely changes: Seoul Open Data publishes every station with
 * its line and an ordered station code, so we can build the graph ourselves and
 * plan routes with no quota at all — and the same dataset carries English,
 * Japanese and Chinese station names, which the rest of the product needs anyway.
 *
 * Source: Seoul Open Data Plaza `SearchSTNBySubwayLineInfo` (ⓒ서울특별시).
 */

import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";
import { buildGraph, fromSnapshot, type StationRow, type SubwayGraph } from "../subwayPlan.js";

// The graph and planner are shared with the phone; this module only keeps it current.
export * from "../subwayPlan.js";

const API = "http://openapi.seoul.go.kr:8088";
// The network is static; a day's cache keeps this to one call per deploy.
const graphCache = new TtlCache<SubwayGraph>(24 * 60 * 60_000);

interface StationsResponse {
  SearchSTNBySubwayLineInfo?: { row?: StationRow[] };
}

let refreshed = false;

/**
 * The station graph.
 *
 * A committed snapshot answers instantly and can never fail, so routing works
 * even if the upstream is slow or down — the whole point of moving off a metered
 * routing API. A single background refresh per process pulls the live list from
 * Seoul Open Data and replaces the snapshot when it succeeds, so the network map
 * stays current without any request ever waiting on it.
 */
export async function getGraph(): Promise<SubwayGraph> {
  const cached = graphCache.get("graph");
  if (!cached) graphCache.set("graph", fromSnapshot());
  void refreshFromApi();
  return graphCache.get("graph") ?? fromSnapshot();
}

async function refreshFromApi(): Promise<void> {
  if (refreshed) return;
  refreshed = true;
  const key = ENV.SEOUL_API_KEY.trim();
  if (!key) return;
  try {
    const json = await fetchJson<StationsResponse>(
      `${API}/${key}/json/SearchSTNBySubwayLineInfo/1/1000/`,
      {},
      25000,
    );
    const rows = json.SearchSTNBySubwayLineInfo?.row ?? [];
    if (rows.length >= 700) graphCache.set("graph", buildGraph(rows));
  } catch {
    /* the snapshot already serves — nothing to do */
  }
}
