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

// NOTE: data.go.kr's real TAGO service names contain the "Inqire" typo (no 'u')
// — verified live; the corrected-spelling URLs return HTTP 500.
const STOP_BASE = "http://apis.data.go.kr/1613000/BusSttnInfoInqireService";
const ARVL_BASE = "http://apis.data.go.kr/1613000/ArvlInfoInqireService";

// TAGO's stop-name search (getSttnNoList) measures ~4–6s live, well over the
// default 2.5s guard. These are DIRECTORY lookups that we cache (1h/1d), so the
// slow path is cold-cache only; allow them more time. The real-time arrivals
// call keeps the strict default so the live portion stays fast (p99 budget).
const DIRECTORY_TIMEOUT_MS = 6000;

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
  gpslati?: number;
  gpslong?: number;
}

interface RawCity {
  citycode?: string | number;
  cityname?: string;
}

/**
 * English→Korean city aliases so foreign users can pass "Busan" etc. Matched
 * against the live getCtyCodeList names (which are Korean). Seoul is excluded on
 * purpose — TAGO has no Seoul; the tool routes Seoul to a separate source.
 */
const CITY_ALIAS: Record<string, string> = {
  busan: "부산",
  daegu: "대구",
  incheon: "인천",
  gwangju: "광주",
  daejeon: "대전",
  ulsan: "울산",
  sejong: "세종",
  jeju: "제주",
  suwon: "수원",
  seongnam: "성남",
  goyang: "고양",
  yongin: "용인",
  bucheon: "부천",
  ansan: "안산",
  cheongju: "청주",
  jeonju: "전주",
  gangneung: "강릉",
  gyeongju: "경주",
};

interface RawArrival {
  routeno?: string | number;
  arrtime?: string | number; // seconds
  arrprevstationcnt?: string | number; // stops remaining
  vehicletp?: string;
}

const stopCache = new TtlCache<BusStop[]>(60 * 60_000); // stop directory is stable
const arrivalCache = new TtlCache<BusArrival[]>(10_000); // real-time: short TTL
const cityCache = new TtlCache<RawCity[]>(24 * 60 * 60_000); // city codes ~ never change

/** Live city-code directory (getCtyCodeList). Cached for a day. */
async function cityList(): Promise<RawCity[]> {
  return cityCache.getOrLoad("cities", async () => {
    const json = await fetchJson(url(STOP_BASE, "getCtyCodeList", {}), {}, DIRECTORY_TIMEOUT_MS);
    return itemsOf<RawCity>(json);
  });
}

/**
 * Fire-and-forget warm-up of the city-code directory at server startup, so the
 * first user's bus query doesn't pay the slow (~6s) cold getCtyCodeList. Safe to
 * call without a key (it just no-ops/errors quietly). Cached 24h afterwards.
 */
export function warmCityList(): void {
  if (!ENV.BUS_API_KEY.trim()) return;
  void cityList().catch(() => {
    /* warm-up is best-effort; a failure just means the first real call pays it */
  });
}

/**
 * Resolve a city name (English or Korean) to a TAGO cityCode. Returns undefined
 * for unknown cities and for Seoul (not in TAGO — handled by the tool layer).
 */
export async function resolveCityCode(cityName: string): Promise<string | undefined> {
  const raw = cityName.trim().toLowerCase();
  if (!raw) return undefined;
  const ko = CITY_ALIAS[raw] ?? cityName.trim();
  const cities = await cityList();
  const hit =
    cities.find((c) => String(c.cityname ?? "").includes(ko)) ??
    cities.find((c) => ko.includes(String(c.cityname ?? "").replace(/(특별시|광역시|특별자치시|특별자치도|도|시)$/u, "")));
  return hit?.citycode != null ? String(hit.citycode) : undefined;
}

/**
 * Resolve a stop name within a city to candidate stops. TAGO requires cityCode
 * and does NOT echo it back in the response, so we inject the queried code.
 */
export async function resolveStop(name: string, cityCode: string): Promise<BusStop[]> {
  return stopCache.getOrLoad(`stop:${cityCode}:${name}`, async () => {
    const json = await fetchJson(url(STOP_BASE, "getSttnNoList", { cityCode, nodeNm: name }), {}, DIRECTORY_TIMEOUT_MS);
    return itemsOf<RawStop>(json)
      .filter((s) => s.nodeid)
      .map((s) => ({ nodeId: String(s.nodeid), nodeName: String(s.nodenm ?? name), cityCode }));
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
 * Result of trackBus — distinguishes the failure modes so the tool can give
 * helpful guidance instead of a dead-end "not arriving":
 *  - stop_not_found : no stop by that name in the city (likely a name typo)
 *  - no_arrival     : stop found, but that route isn't showing — we return the
 *                     routes that ARE arriving so the user can pick/correct
 *  - ok             : matching live arrival
 */
export type TrackResult =
  | { status: "stop_not_found" }
  | { status: "no_arrival"; stop: BusStop; available: string[] }
  | { status: "ok"; stop: BusStop; arrival: BusArrival };

/**
 * High-level: track a specific bus toward a drop-off stop in a given city.
 * `cityCode` must be resolved first (resolveCityCode).
 */
/**
 * Pick the best stop among candidates for a query: exact name > starts-with >
 * shortest containing name (the bare "서면" beats "(구)NC서면점"). Helps when
 * getSttnNoList returns many partial matches in an arbitrary order.
 */
function bestStop(stops: BusStop[], query: string): BusStop {
  const q = query.trim();
  return [...stops].sort((a, b) => score(b.nodeName, q) - score(a.nodeName, q) || a.nodeName.length - b.nodeName.length)[0];
}
function score(name: string, q: string): number {
  if (name === q) return 3;
  if (name.startsWith(q)) return 2;
  if (name.includes(q)) return 1;
  return 0;
}

// TAGO's stop search matches Korean names, but visitors type English. Convert
// common tourist stops EN→KO so "Haeundae" finds 해운대. (Korean input passes
// through; unknown English still tries as-is.)
const BUS_STOP_KO: Record<string, string> = {
  haeundae: "해운대", seomyeon: "서면", "gwangan": "광안리", gwangalli: "광안리",
  nampo: "남포동", "nampo-dong": "남포동", jagalchi: "자갈치", "busan station": "부산역",
  taejongdae: "태종대", "gukje market": "국제시장", gukje: "국제시장", songjeong: "송정",
  "dongdaegu": "동대구역", "daegu station": "대구역", "daejeon station": "대전역",
  "gwangju station": "광주역", "incheon station": "인천역", chinatown: "차이나타운",
  songdo: "송도", "jeonju hanok": "전주한옥마을", hanok: "한옥마을",
};

/** Convert an English stop name to Korean when we know it (else return as-is). */
function toKoreanStop(name: string): string {
  const raw = name.trim();
  if (/[가-힣]/.test(raw)) return raw; // already Korean
  const key = raw.toLowerCase().replace(/\s*(stop|station|bus stop)\.?$/i, "").trim();
  return BUS_STOP_KO[key] ?? raw;
}

export async function trackBus(
  busNumber: string,
  dropOffStop: string,
  cityCode: string,
): Promise<TrackResult> {
  const query = toKoreanStop(dropOffStop);
  const stops = await resolveStop(query, cityCode);
  if (stops.length === 0) return { status: "stop_not_found" };
  const stop = bestStop(stops, query);
  const arrivals = await getArrivals(stop.cityCode, stop.nodeId);
  const arrival = arrivals.find((a) => a.routeNo === busNumber.trim());
  if (arrival) return { status: "ok", stop, arrival };
  const available = [...new Set(arrivals.map((a) => a.routeNo).filter(Boolean))];
  return { status: "no_arrival", stop, available };
}
