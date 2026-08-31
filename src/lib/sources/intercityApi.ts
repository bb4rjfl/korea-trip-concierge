/**
 * Real intercity departures — trains and express/intercity buses.
 *
 * Until now "Seoul → Gyeongju" answered "KTX, about 2 hours", which is true and
 * useless: a visitor deciding whether to go needs the next train, what it costs,
 * and whether the bus is better. Two national services answer exactly that, and
 * both run on the data.go.kr key we already hold:
 *
 *   1613000/TrainInfo        — GetCtyAcctoTrainSttnList, GetStrtpntAlocFndTrainInfo
 *   1613000/SuburbsBusInfo   — GetSuberbsBusTrminlList, GetStrtpntAlocFndSuberbsBusInfo
 *
 * Both index endpoints by opaque node ids, so the first job is turning "Busan"
 * into NAT014445. Those indexes change on the scale of years, so they are built
 * once and cached for a day.
 *
 * Source: 국토교통부 TAGO (ⓒ국토교통부).
 */

import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";
import { normalizeName, similarity } from "../fuzzy.js";
import { romanizeHangul } from "../romanize.js";

const HOST = "https://apis.data.go.kr/1613000";

/** The province/metro codes both services share. */
const CITY_CODES = ["11", "21", "22", "23", "24", "25", "26", "31", "32", "33", "34", "35", "36", "37", "38", "39"];

export interface Departure {
  /** "KTX", "ITX-Saemaeul", "Premium" … */
  grade: string;
  from: string;
  to: string;
  /** HH:MM, Korea time. */
  depart: string;
  arrive: string;
  minutes: number;
  fareWon?: number;
}

interface Node {
  id: string;
  ko: string;
}

const indexCache = new TtlCache<Node[]>(24 * 60 * 60_000);
const departureCache = new TtlCache<Departure[]>(30 * 60_000);

interface TagoBody<T> {
  response?: { body?: { items?: { item?: T[] | T } | "" } };
}

function rows<T>(json: TagoBody<T>): T[] {
  const items = json.response?.body?.items;
  if (!items || !items.item) return [];
  return Array.isArray(items.item) ? items.item : [items.item];
}

function url(path: string, params: Record<string, string>): string {
  const sp = new URLSearchParams({
    serviceKey: ENV.BUS_API_KEY,
    _type: "json",
    numOfRows: "200",
    pageNo: "1",
    ...params,
  });
  return `${HOST}/${path}?${sp.toString()}`;
}

/** Every train station in the country, once a day. */
async function trainStations(): Promise<Node[]> {
  return indexCache.getOrLoad("train:stations", async () => {
    const all: Node[] = [];
    for (const cityCode of CITY_CODES) {
      try {
        const json = await fetchJson<TagoBody<{ nodeid?: string; nodename?: string }>>(
          url("TrainInfo/GetCtyAcctoTrainSttnList", { cityCode }),
        );
        for (const r of rows(json)) {
          if (r.nodeid && r.nodename) all.push({ id: String(r.nodeid), ko: String(r.nodename) });
        }
      } catch {
        /* one province failing shouldn't empty the index */
      }
    }
    return all;
  });
}

/** Every intercity bus terminal, once a day. */
async function busTerminals(): Promise<Node[]> {
  return indexCache.getOrLoad("bus:terminals", async () => {
    const all: Node[] = [];
    for (const cityCode of CITY_CODES) {
      try {
        const json = await fetchJson<TagoBody<{ terminalId?: string; terminalNm?: string }>>(
          url("SuburbsBusInfo/GetSuberbsBusTrminlList", { cityCode }),
        );
        for (const r of rows(json)) {
          if (r.terminalId && r.terminalNm) all.push({ id: String(r.terminalId), ko: String(r.terminalNm) });
        }
      } catch {
        /* as above */
      }
    }
    return all;
  });
}

/**
 * Match what a visitor typed against the index.
 *
 * They write "Busan" or "Gyeongju"; the index holds 부산 and 신경주. Comparing the
 * romanization of each entry covers both directions without a hand-written table,
 * and the exact-prefix preference keeps "Seoul" off 서울교외선-style near-misses.
 */
function rank(nodes: Node[], wanted: string): Node[] {
  const q = normalizeName(wanted);
  if (!q) return [];
  const scored: { node: Node; score: number }[] = [];
  for (const node of nodes) {
    const ko = normalizeName(node.ko);
    const en = normalizeName(romanizeHangul(node.ko));
    const exact = ko === q || en === q;
    // A loose match invents journeys: "Jeju" scored well enough against 제천 and
    // produced a train timetable to an island with no railway. Require the names
    // to actually contain one another — which also keeps "Seoul" on 동서울 and
    // 서울경부, the terminals a Seoul departure really leaves from.
    const related = en.includes(q) || q.includes(en) || ko.includes(q) || q.includes(ko);
    const score = exact ? 1.2 : Math.max(similarity(q, ko), similarity(q, en));
    if (exact || (related && score >= 0.55) || score >= 0.85) scored.push({ node, score: exact ? 1.2 : score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.node);
}

const hhmm = (stamp: string): string => `${String(stamp).slice(8, 10)}:${String(stamp).slice(10, 12)}`;

function minutesBetween(dep: string, arr: string): number {
  const parse = (s: string): number =>
    Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
      Number(s.slice(8, 10)),
      Number(s.slice(10, 12)),
    );
  return Math.max(0, Math.round((parse(String(arr)) - parse(String(dep))) / 60_000));
}

/**
 * Train and bus classes, in English.
 *
 * The feed names them in Korean — ITX-마음, KTX-이음, 무궁화호 — and a visitor
 * comparing a ₩59,800 KTX against a ₩42,600 ITX needs to know which is which.
 */
const TRAIN_GRADE: [RegExp, string][] = [
  [/KTX-?산천/, "KTX-Sancheon"],
  [/KTX-?이음/, "KTX-Eum"],
  [/ITX-?새마을/, "ITX-Saemaeul"],
  [/ITX-?청춘/, "ITX-Cheongchun"],
  [/ITX-?마음/, "ITX-Maum"],
  [/무궁화/, "Mugunghwa (slow, cheapest)"],
  [/누리로/, "Nuriro"],
  [/새마을/, "Saemaeul"],
  [/통근/, "Commuter"],
];

export function trainGradeLabel(ko: string): string {
  const raw = (ko ?? "").trim();
  const hit = TRAIN_GRADE.find(([re]) => re.test(raw));
  if (hit) return raw.replace(/\([^)]*\)/g, "").trim().replace(/^[^ ]+/, hit[1]);
  return /[가-힣]/.test(raw) ? romanizeHangul(raw) : raw;
}

/** Grade names come back in Korean for buses; these are the three that exist. */
function busGradeLabel(ko: string): string {
  const raw = (ko ?? "").trim();
  if (!raw) return "Bus";
  // Grades combine — 심야우등 is a night service in an excellent-class coach.
  const night = /심야/.test(raw) ? "Night " : "";
  if (/프리미엄/.test(raw)) return `${night}Premium (lie-flat)`;
  if (/우등/.test(raw)) return `${night}Excellent (2+1 seats)`;
  if (/일반/.test(raw)) return `${night}Standard`;
  return /[가-힣]/.test(raw) ? romanizeHangul(raw) : raw;
}

/** Trains from one place to another on a date (YYYYMMDD), soonest first. */
export async function trainsBetween(from: string, to: string, date: string): Promise<Departure[]> {
  if (!ENV.BUS_API_KEY.trim()) return [];
  const stations = await trainStations();
  return firstNonEmpty(rank(stations, from), rank(stations, to), (a, b) =>
    departureCache.getOrLoad(`train:${a.id}:${b.id}:${date}`, async () => {
      const json = await fetchJson<
        TagoBody<{
          traingradename?: string;
          depplacename?: string;
          arrplacename?: string;
          depplandtime?: string | number;
          arrplandtime?: string | number;
          adultcharge?: string | number;
        }>
      >(
        url("TrainInfo/GetStrtpntAlocFndTrainInfo", {
          depPlaceId: a.id,
          arrPlaceId: b.id,
          depPlandTime: date,
          numOfRows: "60",
        }),
      );
      return rows(json)
        .filter((r) => r.depplandtime && r.arrplandtime)
        .map((r) => ({
          grade: trainGradeLabel(String(r.traingradename ?? "Train")),
          from: String(r.depplacename ?? a.ko),
          to: String(r.arrplacename ?? b.ko),
          depart: hhmm(String(r.depplandtime)),
          arrive: hhmm(String(r.arrplandtime)),
          minutes: minutesBetween(String(r.depplandtime), String(r.arrplandtime)),
          fareWon: Number(r.adultcharge) || undefined,
        }))
        .sort((x, y) => x.depart.localeCompare(y.depart));
    }),
  );
}

/**
 * A city has several stations and several bus terminals, and which one serves a
 * given destination is exactly the local knowledge a visitor does not have —
 * Sokcho leaves Seoul from Dongseoul, Busan from Seoul Express. Try the strongest
 * few candidates and answer with the pair that actually runs.
 */
async function firstNonEmpty(
  origins: Node[],
  destinations: Node[],
  query: (a: Node, b: Node) => Promise<Departure[]>,
): Promise<Departure[]> {
  for (const a of origins.slice(0, 3)) {
    for (const b of destinations.slice(0, 2)) {
      if (a.id === b.id) continue;
      try {
        const list = await query(a, b);
        if (list.length) return list;
      } catch {
        /* try the next pair */
      }
    }
  }
  return [];
}

/** Intercity/express buses from one terminal to another on a date. */
export async function busesBetween(from: string, to: string, date: string): Promise<Departure[]> {
  if (!ENV.BUS_API_KEY.trim()) return [];
  const terminals = await busTerminals();
  return firstNonEmpty(rank(terminals, from), rank(terminals, to), (a, b) =>
    departureCache.getOrLoad(`bus:${a.id}:${b.id}:${date}`, async () => {
      const json = await fetchJson<
        TagoBody<{
          gradeNm?: string;
          depPlaceNm?: string;
          arrPlaceNm?: string;
          depPlandTime?: string | number;
          arrPlandTime?: string | number;
          charge?: string | number;
        }>
      >(
        url("SuburbsBusInfo/GetStrtpntAlocFndSuberbsBusInfo", {
          depTerminalId: a.id,
          arrTerminalId: b.id,
          depPlandTime: date,
          numOfRows: "60",
        }),
      );
      return rows(json)
        .filter((r) => r.depPlandTime && r.arrPlandTime)
        .map((r) => ({
          grade: busGradeLabel(String(r.gradeNm ?? "")),
          from: String(r.depPlaceNm ?? a.ko),
          to: String(r.arrPlaceNm ?? b.ko),
          depart: hhmm(String(r.depPlandTime)),
          arrive: hhmm(String(r.arrPlandTime)),
          minutes: minutesBetween(String(r.depPlandTime), String(r.arrPlandTime)),
          fareWon: Number(r.charge) || undefined,
        }))
        .sort((x, y) => x.depart.localeCompare(y.depart));
    }),
  );
}

/** Today in Korea as the YYYYMMDD both services expect. */
export function todayYmdKST(): string {
  const k = new Date(Date.now() + 9 * 3600_000);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
}

/** The next few departures after the current Korea time, or the first of the day. */
export function upcoming(list: Departure[], limit = 3): Departure[] {
  const k = new Date(Date.now() + 9 * 3600_000);
  const now = `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
  const later = list.filter((d) => d.depart >= now);
  return (later.length ? later : list).slice(0, limit);
}
