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
import { normalizeName, similarity } from "../fuzzy.js";
import SNAPSHOT from "../data/subwayStations.json" with { type: "json" };

export interface StationRow {
  STATION_CD: string;
  STATION_NM: string;
  STATION_NM_ENG?: string;
  STATION_NM_CHN?: string;
  STATION_NM_JPN?: string;
  LINE_NUM: string;
}

export interface Station {
  /** Station code — unique per (station, line). */
  code: string;
  /** Korean name: the key the realtime arrival API uses. */
  ko: string;
  en: string;
  ja: string;
  zh: string;
  line: string;
}

export interface RouteLeg {
  line: string;
  from: string;
  to: string;
  stops: number;
}

export interface SubwayRoute {
  legs: RouteLeg[];
  stops: number;
  transfers: number;
  minutes: number;
  fareWon: number;
}

export interface SubwayGraph {
  stations: Station[];
  /** station code → neighbours, with the cost of getting there. */
  edges: Map<string, { to: string; minutes: number; transfer: boolean }[]>;
  /** normalized name (any of the four languages) → station codes. */
  byName: Map<string, string[]>;
  byCode: Map<string, Station>;
}

/** ~2.2 min between stations, ~4 min to change platforms — the usual planning rule. */
const MIN_PER_STOP = 2.2;
// Stairs, platform change and the next train: real transfers cost more than the
// timetable gap, and under-pricing them made the planner prefer a two-transfer
// detour over a direct ride.
const MIN_PER_TRANSFER = 6;
/**
 * Seoul's card fare, checked against live routing rather than remembered: a
 * two-stop ride prices at ₩1,550, not the ₩1,400 this used to claim — the base
 * went up and we were quoting under it on every single answer.
 */
const BASE_FARE = 1550;

/**
 * The Sinbundang Line bills a separate surcharge on top of the normal fare, and
 * it is steep enough to matter: Gangnam→Sinsa is ₩2,250 on it against ₩1,550 on
 * lines 2 and 3. Someone who tapped in expecting the base fare finds out at the
 * gate.
 */
const SINBUNDANG_SURCHARGE = 700;

/**
 * Not every "stop" is the same distance. The airport line runs 5-8 km between
 * stations where Line 2 runs 1 km, so costing them alike made the planner route
 * Hongdae→Anguk via AREX and two transfers instead of the obvious Line 2 ride.
 */
const LINE_MIN_PER_STOP: [RegExp, number][] = [
  [/공항철도|AREX/i, 4.2],
  [/경의|경춘|수인분당|서해/, 3.0],
  [/GTX/i, 6.5],
  [/신분당/, 2.8],
];

function stopMinutes(line: string): number {
  return LINE_MIN_PER_STOP.find(([re]) => re.test(line))?.[1] ?? MIN_PER_STOP;
}

const API = "http://openapi.seoul.go.kr:8088";
// The network is static; a day's cache keeps this to one call per deploy.
const graphCache = new TtlCache<SubwayGraph>(24 * 60 * 60_000);

const NAMED_LINES: Record<string, string> = {
  공항철도: "AREX (Airport Railroad)",
  신분당선: "Sinbundang Line",
  수인분당선: "Suin-Bundang Line",
  경의선: "Gyeongui-Jungang Line",
  경춘선: "Gyeongchun Line",
  경강선: "Gyeonggang Line",
  서해선: "Seohae Line",
  인천선: "Incheon Line 1",
  인천2호선: "Incheon Line 2",
  우이신설경전철: "Ui-Sinseol Line",
  신림선: "Sillim Line",
  김포도시철도: "Gimpo Goldline",
  용인경전철: "Everline",
  의정부경전철: "Uijeongbu LRT",
  "GTX-A": "GTX-A",
};

/** "02호선" → "Line 2"; named lines keep their English name. */
export function lineLabel(lineNum: string): string {
  const m = /^0?(\d+)호선$/.exec(lineNum);
  if (m) return `Line ${Number(m[1])}`;
  return NAMED_LINES[lineNum] ?? lineNum;
}

function toStation(r: StationRow): Station {
  return {
    code: String(r.STATION_CD),
    ko: r.STATION_NM,
    en: (r.STATION_NM_ENG || r.STATION_NM).trim(),
    ja: (r.STATION_NM_JPN || r.STATION_NM).trim(),
    zh: (r.STATION_NM_CHN || r.STATION_NM).trim(),
    line: r.LINE_NUM,
  };
}

/**
 * Build adjacency. Station codes run in order along a line, so consecutive codes
 * are consecutive stations; a gap marks a branch boundary, which we deliberately
 * do NOT bridge. The same station name on two lines is a transfer.
 */
export function buildGraph(rows: StationRow[]): SubwayGraph {
  const stations = rows.map(toStation);
  const byCode = new Map(stations.map((s) => [s.code, s]));
  const edges = new Map<string, { to: string; minutes: number; transfer: boolean }[]>();
  const link = (a: string, b: string, minutes: number, transfer: boolean): void => {
    if (!edges.has(a)) edges.set(a, []);
    edges.get(a)!.push({ to: b, minutes, transfer });
  };

  const byLine = new Map<string, Station[]>();
  for (const s of stations) {
    if (!byLine.has(s.line)) byLine.set(s.line, []);
    byLine.get(s.line)!.push(s);
  }
  for (const [line, list] of byLine) {
    const ordered = [...list].sort((a, b) => Number(a.code) - Number(b.code));
    for (let i = 1; i < ordered.length; i++) {
      const prev = ordered[i - 1];
      const cur = ordered[i];
      if (Number(cur.code) - Number(prev.code) !== 1) continue; // branch boundary
      const pace = stopMinutes(line);
      link(prev.code, cur.code, pace, false);
      link(cur.code, prev.code, pace, false);
    }
    // Station codes are assigned in build order, not running order, so a line that
    // gained a station later — or that Korail and Seoul Metro number jointly — comes
    // out of the generic rule with links the trains don't make and gaps where they
    // do. These corrections spell out the real topology for the lines visitors ride.
    const byName2 = new Map(ordered.map((st) => [st.ko, st.code]));
    const pace = stopMinutes(line);
    const chain = (names: string[]): void => {
      for (let i = 1; i < names.length; i++) {
        const a = byName2.get(names[i - 1]);
        const b = byName2.get(names[i]);
        if (!a || !b) continue;
        link(a, b, pace, false);
        link(b, a, pace, false);
      }
    };
    const unlink = (pairs: string[][]): void => {
      for (const [x, y] of pairs) {
        const a = byName2.get(x);
        const b = byName2.get(y);
        if (!a || !b) continue;
        edges.set(a, (edges.get(a) ?? []).filter((e) => e.to !== b));
        edges.set(b, (edges.get(b) ?? []).filter((e) => e.to !== a));
      }
    };

    if (line === "02호선") {
      // The branches are appended after the ring, so 까치산 looks adjacent to 시청.
      // 용두 was numbered last though it sits mid-branch, so the code rule strings
      // 신답 straight onto 신설동 and hangs 용두 off 신정네거리.
      unlink([
        ["까치산", "시청"],
        ["충정로", "용답"],
        ["신답", "신설동"],
        ["신설동", "도림천"],
        ["신정네거리", "용두"],
      ]);
      const ring = ordered.filter((st) => Number(st.code) >= 201 && Number(st.code) <= 243);
      if (ring.length > 40) {
        link(ring[0].code, ring[ring.length - 1].code, pace, false);
        link(ring[ring.length - 1].code, ring[0].code, pace, false);
      }
      chain(["성수", "용답", "신답", "용두", "신설동"]); // 성수지선
      chain(["신도림", "도림천", "양천구청", "신정네거리", "까치산"]); // 신정지선
    }

    if (line === "공항철도") {
      // 영종 opened later and sits between 청라국제도시 and 운서, not at the end.
      unlink([["청라국제도시", "운서"]]);
      chain([
        "서울역", "공덕", "홍대입구", "디지털미디어시티", "마곡나루", "김포공항", "계양",
        "검암", "청라국제도시", "영종", "운서", "공항화물청사", "인천공항1터미널", "인천공항2터미널",
      ]);
    }

    if (line === "01호선") {
      // Seoul Metro numbers the central stretch, Korail the branches, and 동묘앞
      // was inserted decades later — so the core corridor has to be stated.
      unlink([["동대문", "신설동"], ["청량리", "동묘앞"], ["대방", "영등포"]]);
      chain([
        "회기", "청량리", "제기동", "신설동", "동묘앞", "동대문", "종로5가", "종로3가", "종각",
        "시청", "서울역", "남영", "용산", "노량진", "대방", "신길", "영등포", "신도림", "구로",
      ]);
      chain(["창동", "방학"]); // northern branch hookup
      chain(["구로", "구일", "개봉"]); // 경인선 branch
    }

    if (line === "03호선") {
      // 원흥 opened between 삼송 and 원당 but was numbered before both.
      unlink([["삼송", "원당"]]);
      chain(["지축", "삼송", "원흥", "원당"]);
    }

    // Three lines were built by merging existing Korail track, so their codes bear
    // no relation to running order at all — 청량리 and 수원 sit next to each other
    // in the numbering and 36 stations apart on the ground. For these the generic
    // pass is discarded outright and the running order stated in full.
    const REBUILD: Record<string, string[][]> = {
      수인분당선: [
        [
          "청량리", "왕십리", "서울숲", "압구정로데오", "강남구청", "선정릉", "선릉", "한티", "도곡",
          "구룡", "개포동", "대모산입구", "수서", "복정", "가천대", "태평", "모란", "야탑", "이매",
          "서현", "수내", "정자", "미금", "오리", "죽전", "보정", "구성", "신갈", "기흥", "상갈",
          "청명", "영통", "망포", "매탄권선", "수원시청", "매교", "수원", "고색", "오목천", "어천",
          "야목", "사리", "한대앞", "중앙", "고잔", "초지", "안산", "신길온천", "정왕", "오이도",
          "달월", "월곶", "소래포구", "인천논현", "호구포", "남동인더스파크", "원인재", "연수",
          "송도", "인하대", "숭의", "신포", "인천",
        ],
      ],
      경의선: [
        [
          "문산", "파주", "월롱", "금촌", "금릉", "운정", "야당", "탄현", "일산", "풍산", "백마",
          "곡산", "대곡", "능곡", "행신", "강매", "한국항공대", "수색", "디지털미디어시티", "가좌",
          "홍대입구", "서강대", "공덕", "효창공원앞", "용산", "이촌", "서빙고", "한남", "옥수",
          "응봉", "왕십리", "청량리", "회기", "중랑", "상봉", "망우", "양원", "구리", "도농",
          "양정", "덕소", "도심", "팔당", "운길산", "양수", "신원", "국수", "아신", "오빈",
          "양평", "원덕", "용문", "지평",
        ],
        ["가좌", "신촌", "서울역"], // the 서울역 branch
        ["문산", "운천", "임진강"],
      ],
      서해선: [
        [
          "일산", "풍산", "백마", "곡산", "대곡", "능곡", "김포공항", "원종", "부천종합운동장",
          "소사", "소새울", "시흥대야", "신천", "신현", "시흥시청", "시흥능곡", "달미", "선부",
          "초지", "시우", "원시",
        ],
      ],
    };
    const rebuild = REBUILD[line];
    if (rebuild) {
      const own = new Set(ordered.map((st) => st.code));
      for (const code of own) {
        edges.set(code, (edges.get(code) ?? []).filter((e) => e.transfer || !own.has(e.to)));
      }
      for (const seq of rebuild) chain(seq);
    }

    if (line === "04호선") {
      chain(["남태령", "선바위"]); // Seoul Metro hands over to Korail here
      chain(["금정", "산본"]);
      chain(["오남", "별내별가람"]);
    }
  }

  // Index Korean and English through the shared normalizer, but key Japanese and
  // Chinese on the raw string: normalizeName strips kana and unmapped hanzi, which
  // collapsed dozens of stations onto the same empty-ish key and made "서울역"
  // resolve to 강변 and 교대.
  const byName = new Map<string, string[]>();
  const put = (k: string, code: string): void => {
    if (!k) return;
    if (!byName.has(k)) byName.set(k, []);
    if (!byName.get(k)!.includes(code)) byName.get(k)!.push(code);
  };
  for (const s of stations) {
    put(normalizeName(s.ko), s.code);
    put(normalizeName(s.en), s.code);
    put(`ja:${s.ja.trim().toLowerCase()}`, s.code);
    put(`zh:${s.zh.trim().toLowerCase()}`, s.code);
  }

  const koGroups = new Map<string, string[]>();
  for (const s of stations) {
    if (!koGroups.has(s.ko)) koGroups.set(s.ko, []);
    koGroups.get(s.ko)!.push(s.code);
  }
  for (const codes of koGroups.values()) {
    if (codes.length < 2) continue;
    for (const a of codes) for (const b of codes) if (a !== b) link(a, b, MIN_PER_TRANSFER, true);
  }

  return { stations, edges, byName, byCode };
}

interface StationsResponse {
  SearchSTNBySubwayLineInfo?: { row?: StationRow[] };
}

/** Slim snapshot shape committed alongside the code. */
interface SnapRow {
  c: string;
  k: string;
  e: string;
  j: string;
  z: string;
  l: string;
}

function fromSnapshot(): SubwayGraph {
  const rows: StationRow[] = (SNAPSHOT as SnapRow[]).map((r) => ({
    STATION_CD: r.c,
    STATION_NM: r.k,
    STATION_NM_ENG: r.e,
    STATION_NM_JPN: r.j,
    STATION_NM_CHN: r.z,
    LINE_NUM: r.l,
  }));
  return buildGraph(rows);
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

/** Resolve a name in any of the four languages to that station's codes. */
export function findStationCodes(graph: SubwayGraph, name: string): string[] {
  const raw = (name ?? "").trim().replace(/\s*(?:station|stn|역|駅|站)\s*$/i, "").trim();
  if (!raw) return [];
  // Japanese/Chinese first, on the raw form; then the normalized ko/en form.
  const lower = raw.toLowerCase();
  const cjk = graph.byName.get(`ja:${lower}`) ?? graph.byName.get(`zh:${lower}`);
  if (cjk?.length) return cjk;
  const q = normalizeName(raw);
  if (!q) return [];
  const exact = graph.byName.get(q);
  if (exact?.length) return exact;
  // Confident fuzzy only — a wrong station sends someone the wrong way, so require
  // a close match AND a comparable length.
  let best: { key: string; score: number } | undefined;
  for (const key of graph.byName.keys()) {
    if (key.startsWith("ja:") || key.startsWith("zh:")) continue;
    if (Math.abs(key.length - q.length) > 2) continue;
    const score = similarity(q, key);
    if (!best || score > best.score) best = { key, score };
  }
  return best && best.score >= 0.9 ? (graph.byName.get(best.key) ?? []) : [];
}

/** Cheapest path between two stations, grouped into line legs. Dijkstra. */
export function planRoute(graph: SubwayGraph, fromName: string, toName: string): SubwayRoute | undefined {
  const starts = findStationCodes(graph, fromName);
  const goals = new Set(findStationCodes(graph, toName));
  if (!starts.length || !goals.size) return undefined;
  if (starts.some((s) => goals.has(s))) return undefined; // same station

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const queue = new Set<string>();
  for (const s of starts) {
    dist.set(s, 0);
    queue.add(s);
  }

  let goal: string | undefined;
  const visited = new Set<string>();
  // ~800 nodes: a linear scan for the minimum is fast enough and keeps this simple.
  while (queue.size) {
    let cur: string | undefined;
    let best = Infinity;
    for (const c of queue) {
      const d = dist.get(c) ?? Infinity;
      if (d < best) {
        best = d;
        cur = c;
      }
    }
    if (!cur) break;
    queue.delete(cur);
    visited.add(cur);
    if (goals.has(cur)) {
      goal = cur;
      break;
    }
    for (const e of graph.edges.get(cur) ?? []) {
      if (visited.has(e.to)) continue;
      const nd = best + e.minutes;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, cur);
        queue.add(e.to);
      }
    }
  }
  if (!goal) return undefined;

  const path: string[] = [];
  for (let c: string | undefined = goal; c; c = prev.get(c)) path.unshift(c);

  const legs: RouteLeg[] = [];
  let stops = 0;
  let transfers = 0;
  for (let i = 1; i < path.length; i++) {
    const a = graph.byCode.get(path[i - 1])!;
    const b = graph.byCode.get(path[i])!;
    if (a.ko === b.ko) {
      transfers++; // changed platform, not a stop
      continue;
    }
    stops++;
    const last = legs[legs.length - 1];
    if (last && last.line === b.line) {
      last.to = b.ko;
      last.stops++;
    } else {
      legs.push({ line: b.line, from: a.ko, to: b.ko, stops: 1 });
    }
  }
  if (!legs.length) return undefined;

  // The search already priced every edge at its line's real pace; reusing that
  // total keeps the quoted time honest for express lines.
  const minutes = Math.round(dist.get(goal) ?? stops * MIN_PER_STOP + transfers * MIN_PER_TRANSFER);
  // Seoul fare: the base covers 10km, then ~100 won per 5km. Stops approximate distance.
  const premium = legs.some((l) => /신분당/.test(l.line)) ? SINBUNDANG_SURCHARGE : 0;
  const fareWon = BASE_FARE + Math.max(0, Math.floor((stops - 10) / 5)) * 100 + premium;
  return { legs, stops, transfers, minutes, fareWon };
}
