/**
 * Every train approaching every station in Seoul — one board, the same for
 * everyone.
 *
 * "When's the next train?" from someone standing near a station is answered on
 * their phone (src/lib/deviceTask.ts): the phone knows which station is nearest,
 * and asking us for that station's board would tell us where they are. So the
 * phone asks for the whole city's board and reads its own station off it. Seoul
 * publishes exactly that — realtimeStationArrival/ALL, every approaching train
 * at all ~560 stations in one response — and one copy serves every visitor.
 *
 * Source: Seoul Open Data Plaza realtime subway arrivals (ⓒ서울특별시).
 */

import { gzipSync } from "node:zlib";
import { ENV } from "../env.js";
import { fetchJson } from "../http.js";

/**
 * One approaching train, compact: station and terminus in Korean (the phone
 * turns them into the reader's script from its own station table), the line's
 * subwayId, direction (상행/하행/내선/외선), the arrival code, seconds to
 * arrival when known, stops away when that is all that is known, and flags
 * (1 = express, 2 = last train of the day).
 */
export type BoardRow = [station: string, line: string, dir: string, terminus: string, code: number, secs: number, stops: number, flags: number];

export interface TrainBoard {
  /** When the board was read, epoch ms — the phone counts the seconds down from here. */
  at: number;
  rows: BoardRow[];
}

interface RawRow {
  statnNm?: string;
  subwayId?: string;
  updnLine?: string;
  bstatnNm?: string;
  barvlDt?: string;
  arvlCd?: string;
  arvlMsg2?: string;
  btrainSttus?: string;
  lstcarAt?: string;
  recptnDt?: string;
}

interface AllResponse {
  realtimeArrivalList?: RawRow[];
}

/** "1분 20초 후 (광나루)" → 80; "3분 후" → 180. */
function secondsSaid(msg: string): number {
  const m = /(?:(\d+)\s*분)?\s*(?:(\d+)\s*초)?\s*후/.exec(msg);
  if (!m || (!m[1] && !m[2])) return 0;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}

/** "[5]번째 전역 (창동)" → 5. */
function stopsSaid(msg: string): number {
  const m = /\[(\d+)\]번째\s*전역/.exec(msg);
  return m ? Number(m[1]) : 0;
}

/** "2026-09-11 21:09:06" as KST, epoch ms. */
function kst(ts?: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(ts ?? "");
  if (!m) return undefined;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5], +m[6]);
}

export function compactBoard(json: AllResponse, now = Date.now()): TrainBoard {
  const rows: BoardRow[] = [];
  for (const r of json.realtimeArrivalList ?? []) {
    const station = (r.statnNm ?? "").trim();
    const code = Number(r.arvlCd ?? 99);
    // A train that has left is not one to run for.
    if (!station || code === 2) continue;
    const msg = r.arvlMsg2 ?? "";
    let secs = Number(r.barvlDt ?? 0) || secondsSaid(msg);
    // Counted from when the train reported, not from now.
    const at = kst(r.recptnDt);
    if (secs && at) secs = Math.max(0, secs - Math.round((now - at) / 1000));
    const flags = (/급행|특급|ITX/.test(r.btrainSttus ?? "") ? 1 : 0) | (r.lstcarAt === "1" ? 2 : 0);
    rows.push([station, String(r.subwayId ?? ""), (r.updnLine ?? "").trim(), (r.bstatnNm ?? "").trim(), code, secs, stopsSaid(msg), flags]);
  }
  return { at: now, rows };
}

/** How long one reading of the board serves: trains move a station in about two minutes. */
const FRESH_MS = 20_000;
/** An older board is still better than none, for a minute or two of upstream trouble. */
const USABLE_MS = 3 * 60_000;

let current: { board: TrainBoard; json: Buffer; gzip: Buffer } | undefined;
let reading: Promise<typeof current> | undefined;

async function read(): Promise<typeof current> {
  const key = ENV.SUBWAY_API_KEY.trim();
  if (!key) return undefined;
  const json = await fetchJson<AllResponse>(
    `http://swopenapi.seoul.go.kr/api/subway/${key}/json/realtimeStationArrival/ALL`,
    {},
    8000,
  );
  const board = compactBoard(json);
  if (!board.rows.length) return current;
  const body = Buffer.from(JSON.stringify(board));
  current = { board, json: body, gzip: gzipSync(body) };
  return current;
}

/** The current board, read at most once per twenty seconds however many phones ask. */
export async function trainBoard(): Promise<typeof current> {
  if (current && Date.now() - current.board.at < FRESH_MS) return current;
  reading ??= read()
    .catch(() => (current && Date.now() - current.board.at < USABLE_MS ? current : undefined))
    .finally(() => (reading = undefined));
  return reading;
}
