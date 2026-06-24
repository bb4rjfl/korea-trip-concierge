/**
 * Seoul subway real-time — TOPIS swopenAPI. Powers trackSubwayArrival.
 *  - realtimeStationArrival (OA-12764): next trains at a station  ← primary
 *  - realtimePosition       (OA-12601): live train positions on a line
 *
 * The API path param is the Korean station name, but our users type English, so
 * we resolve EN→KO for high-traffic / tourist stations (resolveStationName).
 *
 * Uses ENV.SUBWAY_API_KEY (Seoul Open Data Plaza key, path segment — not a query
 * param). Short cache (~10s) keeps it live; fetchJson gives 2.5s + 1 retry.
 *
 * NOTE(verify-live): field names follow the documented swopenAPI schema. Seoul
 * subway runs ~05:30–01:00, so off-hours returns an empty list (errorMessage
 * code INFO-200). Confirm arrival fields against a live daytime response; parser
 * is locked by test/sources.test.ts fixtures.
 */
import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";
import { resolveStationKo } from "../romanize.js";

const BASE = "http://swopenapi.seoul.go.kr/api/subway";

/** Resolve a user-supplied station name to the Korean name the API expects. */
export const resolveStationName = resolveStationKo;

/** subwayId → human line label (common lines + tourist-relevant metro). */
const LINE_LABEL: Record<string, string> = {
  "1001": "Line 1",
  "1002": "Line 2",
  "1003": "Line 3",
  "1004": "Line 4",
  "1005": "Line 5",
  "1006": "Line 6",
  "1007": "Line 7",
  "1008": "Line 8",
  "1009": "Line 9",
  "1063": "Gyeongui–Jungang",
  "1065": "Airport Railroad (AREX)",
  "1067": "Gyeongchun",
  "1075": "Suin–Bundang",
  "1077": "Sinbundang",
  "1092": "Ui–Sinseol",
  "1093": "Seohae",
};

/** arvlCd → English status. */
const ARVL_STATUS: Record<string, string> = {
  "0": "approaching",
  "1": "arrived",
  "2": "departed",
  "3": "departed previous stop",
  "4": "approaching previous stop",
  "5": "arrived previous stop",
  "99": "en route",
};

export interface SubwayArrival {
  line: string;
  destination: string; // 종착역 (Korean)
  towards: string; // 방면 description (Korean)
  etaMinutes?: number;
  status: string;
  currentLocation?: string; // 현재 위치 역 (Korean)
}

interface RawArrival {
  subwayId?: string;
  trainLineNm?: string;
  bstatnNm?: string;
  barvlDt?: string | number; // seconds
  arvlMsg2?: string;
  arvlMsg3?: string; // current location station
  arvlCd?: string | number;
}

interface ArrivalResponse {
  errorMessage?: { code?: string; message?: string; total?: number };
  realtimeArrivalList?: RawArrival[];
}

export function parseArrivals(json: ArrivalResponse): SubwayArrival[] {
  const list = json.realtimeArrivalList;
  if (!Array.isArray(list)) return [];
  return list.map((a) => {
    const secs = Number(a.barvlDt ?? 0);
    const sid = String(a.subwayId ?? "");
    return {
      line: LINE_LABEL[sid] ?? (sid ? `Line ${sid}` : "Subway"),
      destination: (a.bstatnNm ?? "").trim(),
      towards: (a.trainLineNm ?? "").trim(),
      etaMinutes: secs > 0 ? Math.round(secs / 60) : undefined,
      status: ARVL_STATUS[String(a.arvlCd ?? "")] ?? "en route",
      currentLocation: a.arvlMsg3?.trim() || undefined,
    };
  });
}

const arrivalCache = new TtlCache<SubwayArrival[]>(10_000);

/** Real-time arrivals at a station (Korean name). Cached ~10s. */
export async function getStationArrivals(stationKo: string): Promise<SubwayArrival[]> {
  return arrivalCache.getOrLoad(`sub:${stationKo}`, async () => {
    const url = `${BASE}/${ENV.SUBWAY_API_KEY}/json/realtimeStationArrival/0/10/${encodeURIComponent(stationKo)}`;
    const json = await fetchJson<ArrivalResponse>(url);
    return parseArrivals(json);
  });
}
