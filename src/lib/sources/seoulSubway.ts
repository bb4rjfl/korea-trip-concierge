/**
 * Seoul subway real-time — TOPIS swopenAPI. Powers trackSubwayArrival.
 *  - realtimeStationArrival: next trains at a station  ← station mode
 *    (OA-15799 "일괄" backend — the Line-2 outage is fixed; verified live that a
 *     per-station query for 강남/홍대입구 now returns subwayId 1002.)
 *  - realtimePosition (OA-12601): live position of every train on a line ← line
 *    mode (D-012). Path param is the Korean line name (e.g. "2호선"); verified
 *    live (2호선 = 42 trains, statnNm/statnTnm/trainSttus fields).
 *
 * The API path param is the Korean station/line name, but our users type English,
 * so we resolve EN→KO (resolveStationName / resolveLineName).
 *
 * Uses ENV.SUBWAY_API_KEY (Seoul Open Data Plaza key, path segment — not a query
 * param). Short cache (~10s) keeps it live; fetchJson gives 2.5s + 1 retry.
 *
 * NOTE(verify-live): field names follow the documented swopenAPI schema. Seoul
 * subway runs ~05:30–01:00, so off-hours returns an empty list (errorMessage
 * code INFO-200). Confirm fields against a live daytime response; parsers are
 * locked by test/sources.test.ts fixtures.
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
  statnId?: string; // queried station's id on this line — sequential along the line
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

/** A station's id on one line. statnId is sequential along the line (verified
 *  live), so |statnId(A) − statnId(B)| on the same line = stops between them. */
export interface StationLineId {
  subwayId: string; // "1002"
  line: string; // "Line 2"
  statnId: number; // e.g. 1004000423
}

/** Extract the queried station's per-line ids (deduped by line) from arrivals. */
export function parseStationIds(json: ArrivalResponse): StationLineId[] {
  const list = json.realtimeArrivalList;
  if (!Array.isArray(list)) return [];
  const byLine = new Map<string, StationLineId>();
  for (const a of list) {
    const sid = String(a.subwayId ?? "");
    const statn = Number(a.statnId ?? 0);
    if (!sid || !statn || byLine.has(sid)) continue;
    byLine.set(sid, { subwayId: sid, line: LINE_LABEL[sid] ?? `Line ${sid}`, statnId: statn });
  }
  return [...byLine.values()];
}

// One raw fetch per station, shared by arrivals + id extraction (cached ~10s).
const rawCache = new TtlCache<ArrivalResponse>(10_000);

function fetchStation(stationKo: string): Promise<ArrivalResponse> {
  return rawCache.getOrLoad(`raw:${stationKo}`, async () => {
    // 0/20: busy interchanges (e.g. 홍대입구) return ~14 arrivals across lines.
    const url = `${BASE}/${ENV.SUBWAY_API_KEY}/json/realtimeStationArrival/0/20/${encodeURIComponent(stationKo)}`;
    return fetchJson<ArrivalResponse>(url);
  });
}

/** Real-time arrivals at a station (Korean name). Cached ~10s. */
export async function getStationArrivals(stationKo: string): Promise<SubwayArrival[]> {
  return parseArrivals(await fetchStation(stationKo));
}

/** The station's per-line ids (Korean name). Cached ~10s. */
export async function getStationLineIds(stationKo: string): Promise<StationLineId[]> {
  return parseStationIds(await fetchStation(stationKo));
}

export type StopsResult =
  | { ok: true; line: string; stops: number }
  | { ok: false; reason: "different-lines" | "no-data" };

/** Stops between two stations using their (live) statnId.
 *  - ok: they share a line; stops = |statnId gap|.
 *  - different-lines: both resolved but no shared line → a transfer is needed.
 *  - no-data: a station returned no live ids — Seoul subway runs ~05:30–01:00,
 *    so off-hours there are no arrivals to read statnId from (don't mislabel
 *    this as "different lines").
 *  Line 2 is a loop (43 main-loop stations): a raw statnId gap over half the loop
 *  is the long way round, so we take the short arc (R8). */
export async function stopsBetween(fromKo: string, toKo: string): Promise<StopsResult> {
  const [a, b] = await Promise.all([getStationLineIds(fromKo), getStationLineIds(toKo)]);
  if (!a.length || !b.length) return { ok: false, reason: "no-data" };
  for (const x of a) {
    const y = b.find((bb) => bb.subwayId === x.subwayId);
    if (!y) continue;
    let stops = Math.abs(y.statnId - x.statnId);
    // Line 2 loop: 22..42 stops one way = 21..1 the short way (leave branch-range
    // gaps ≥43 alone — those usually need a transfer anyway).
    if (x.subwayId === "1002" && stops > 21 && stops < 43) stops = 43 - stops;
    return { ok: true, line: x.line, stops };
  }
  return { ok: false, reason: "different-lines" };
}

// ── Line mode: realtimePosition (OA-12601) ──────────────────────────────────

/** Resolve a user-supplied line ("Line 2", "2", "2호선", "Sinbundang") to the
 *  Korean line name the realtimePosition API expects (e.g. "2호선"). */
export function resolveLineName(input: string): string | undefined {
  const s = input.trim().toLowerCase();
  if (!s) return undefined;
  // Numbered lines 1–9: accept "line 2", "2", "2호선", "line2" (whole-string only,
  // so "line 12" doesn't false-match the trailing "2").
  const num = s.match(/^(?:line\s*)?([1-9])\s*(?:호선|호)?$/);
  if (num) return `${num[1]}호선`;
  const named: Record<string, string> = {
    sinbundang: "신분당선",
    arex: "공항철도",
    "airport railroad": "공항철도",
    "airport rail": "공항철도",
    "gyeongui-jungang": "경의중앙선",
    "gyeongui jungang": "경의중앙선",
    "suin-bundang": "수인분당선",
    "suin bundang": "수인분당선",
    bundang: "수인분당선",
    "분당선": "수인분당선", // bare 분당선 → the merged Suin-Bundang line
    gyeongchun: "경춘선",
    "ui-sinseol": "우이신설선",
    "ui sinseol": "우이신설선",
    seohae: "서해선",
  };
  if (named[s]) return named[s];
  // Already a Korean line name the API expects ("신분당선", "경의중앙선", "공항철도",
  // "신림선"…) → pass it straight through.
  const raw = input.trim();
  if (/[가-힣]/.test(raw) && /(선|철도|라인)$/.test(raw)) return raw;
  return undefined;
}

/** trainSttus → English status (realtimePosition codes differ from arrival). */
const TRAIN_STATUS: Record<string, string> = {
  "0": "approaching",
  "1": "at station",
  "2": "departed",
  "3": "en route",
};

export interface TrainPosition {
  line: string; // e.g. "Line 2"
  currentStation: string; // 현재 정차/접근 역 (Korean)
  towards: string; // 종착역 (Korean, e.g. "성수")
  status: string; // approaching / at station / departed / en route
  updnLine: string; // "0"=상행/외선, "1"=하행/내선
  express: boolean; // 급행
  lastTrain: boolean; // 막차
}

interface RawPosition {
  subwayId?: string;
  subwayNm?: string;
  statnNm?: string;
  statnTnm?: string;
  trainSttus?: string | number;
  updnLine?: string | number;
  directAt?: string | number;
  lstcarAt?: string | number;
}

interface PositionResponse {
  errorMessage?: { code?: string; message?: string; total?: number };
  realtimePositionList?: RawPosition[];
}

export function parsePositions(json: PositionResponse): TrainPosition[] {
  const list = json.realtimePositionList;
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    const sid = String(p.subwayId ?? "");
    // 종착역 names often carry a "행"/"종착" suffix (e.g. "성수종착") — strip it.
    const towards = (p.statnTnm ?? "").replace(/(행|종착)$/u, "").trim();
    return {
      line: LINE_LABEL[sid] ?? (p.subwayNm ?? "Subway"),
      currentStation: (p.statnNm ?? "").trim(),
      towards,
      status: TRAIN_STATUS[String(p.trainSttus ?? "")] ?? "en route",
      updnLine: String(p.updnLine ?? ""),
      express: String(p.directAt ?? "0") !== "0" && String(p.directAt ?? "") !== "",
      lastTrain: String(p.lstcarAt ?? "0") === "1",
    };
  });
}

const positionCache = new TtlCache<TrainPosition[]>(10_000);

/** Real-time positions of all trains on a line (Korean line name). Cached ~10s. */
export async function getLinePositions(lineKo: string): Promise<TrainPosition[]> {
  return positionCache.getOrLoad(`pos:${lineKo}`, async () => {
    const url = `${BASE}/${ENV.SUBWAY_API_KEY}/json/realtimePosition/0/100/${encodeURIComponent(lineKo)}`;
    const json = await fetchJson<PositionResponse>(url);
    return parsePositions(json);
  });
}
