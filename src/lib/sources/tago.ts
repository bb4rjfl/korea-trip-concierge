/**
 * TAGO (국토교통부) real-time bus arrival — nationwide. Powers trackBusArrival.
 *
 * Real-time value is the anti-rejection core (docs/01 §4): this is data a plain
 * LLM cannot produce. Two-step lookup:
 *   1) BusSttnInfoInquireService/getSttnNoList  — resolve stop name → nodeId + cityCode
 *   2) ArvlInfoInquireService/getSttnAcctoArvlPrearngeInfoList — arrivals at that stop
 * Then filter by the user's route number to get stops-remaining + ETA.
 *
 * Uses ENV.BUS_API_KEY (data.go.kr DECODING key). Short cache (~10s) keeps it
 * "live" while protecting p99; 2.5s timeout via fetchJson.
 *
 * NOTE(verify-live): field names follow the documented TAGO schema; confirm
 * against a live response once BUS_API_KEY is issued. Parser locked by tests.
 */
import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";

const STOP_BASE = "http://apis.data.go.kr/1613000/BusSttnInfoInquireService";
const ARVL_BASE = "http://apis.data.go.kr/1613000/ArvlInfoInquireService";

export interface BusStop {
  nodeId: string;
  nodeName: string;
  cityCode: string;
}

export interface BusArrival {
  routeNo: string;
  stopsRemaining: number;
  etaMinutes: number;
  vehicleType?: string;
}

function url(base: string, op: string, params: Record<string, string>): string {
  const sp = new URLSearchParams({
    serviceKey: ENV.BUS_API_KEY,
    _type: "json",
    numOfRows: "30",
    pageNo: "1",
    ...params,
  });
  return `${base}/${op}?${sp.toString()}`;
}

/** data.go.kr items → array (handles "" empty and single-object cases). */
function itemsOf<T>(json: unknown): T[] {
  const body = (json as { response?: { body?: { items?: { item?: T | T[] } | "" } } })?.response?.body;
  const items = body?.items;
  if (!items || !items.item) return []; // "" (empty results) is falsy
  return Array.isArray(items.item) ? items.item : [items.item];
}

interface RawStop {
  nodeid?: string;
  nodenm?: string;
  citycode?: string | number;
}

interface RawArrival {
  routeno?: string | number;
  arrtime?: string | number; // seconds
  arrprevstationcnt?: string | number; // stops remaining
  vehicletp?: string;
}

const stopCache = new TtlCache<BusStop[]>(60 * 60_000); // stop directory is stable
const arrivalCache = new TtlCache<BusArrival[]>(10_000); // real-time: short TTL

/** Resolve a stop name to candidate stops (best match first). */
export async function resolveStop(name: string): Promise<BusStop[]> {
  return stopCache.getOrLoad(`stop:${name}`, async () => {
    const json = await fetchJson(url(STOP_BASE, "getSttnNoList", { stSrch: name }));
    return itemsOf<RawStop>(json)
      .filter((s) => s.nodeid && s.citycode != null)
      .map((s) => ({ nodeId: String(s.nodeid), nodeName: String(s.nodenm ?? name), cityCode: String(s.citycode) }));
  });
}

/** Real-time arrivals at a stop, normalized. */
export async function getArrivals(cityCode: string, nodeId: string): Promise<BusArrival[]> {
  return arrivalCache.getOrLoad(`arr:${cityCode}:${nodeId}`, async () => {
    const json = await fetchJson(
      url(ARVL_BASE, "getSttnAcctoArvlPrearngeInfoList", { cityCode, nodeId }),
    );
    return itemsOf<RawArrival>(json).map((a) => ({
      routeNo: String(a.routeno ?? ""),
      stopsRemaining: Number(a.arrprevstationcnt ?? 0),
      etaMinutes: Math.max(0, Math.round(Number(a.arrtime ?? 0) / 60)),
      vehicleType: a.vehicletp,
    }));
  });
}

/**
 * High-level: track a specific bus toward a drop-off stop. Returns the matching
 * arrival (stops remaining = stops until the bus reaches that stop) or null.
 */
export async function trackBus(
  busNumber: string,
  dropOffStop: string,
): Promise<{ stop: BusStop; arrival: BusArrival } | null> {
  const stops = await resolveStop(dropOffStop);
  if (stops.length === 0) return null;
  const stop = stops[0];
  const arrivals = await getArrivals(stop.cityCode, stop.nodeId);
  const arrival = arrivals.find((a) => a.routeNo === busNumber.trim());
  return arrival ? { stop, arrival } : null;
}
