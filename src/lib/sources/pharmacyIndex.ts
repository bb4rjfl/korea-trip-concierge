/**
 * Every pharmacy in Korea with its opening hours — one file, the same for
 * everyone, so the phone can say which one near the traveller is open *now*
 * without saying where it is (src/lib/deviceTask.ts).
 *
 * Source: National Medical Center, nationwide pharmacy information service
 * (국립중앙의료원 전국 약국 정보 조회 서비스, via data.go.kr): name, telephone,
 * WGS84 position and opening hours for each weekday and for public holidays.
 * About 24,000 pharmacies; the hours repeat so much that they are stored once
 * per distinct week and referred to by number.
 *
 * Needs the data.go.kr key (TOUR_API_KEY is the account's key) to be approved
 * for this service; until it is, the file is simply absent and the phone uses
 * Kakao's directory without hours.
 */

import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { ENV } from "../env.js";
import { koreanHolidayOn } from "../holidays.js";
import { koreaNow, openState, type WeekHours } from "../pharmacyHours.js";

/** One pharmacy: WGS84 × 10⁵, name, telephone, and which week of hours it keeps. */
export type PharmacyRow = [lat5: number, lng5: number, name: string, tel: string, week: number];

export interface PharmacyFile {
  at: number;
  /** Each distinct week of hours, Monday…Sunday then holidays, "HHMM-HHMM" or "" per slot. */
  weeks: WeekHours[];
  /** Public holidays in the next few weeks (YYYYMMDD), so the phone reads the holiday hours. */
  holidays: string[];
  rows: PharmacyRow[];
}

const API = "http://apis.data.go.kr/B552657/ErmctInsttInfoInqireService/getParmacyListInfoInqire";
const PAGE = 1000;
const MAX_AGE_MS = 24 * 3600_000;

interface Built {
  at: number;
  file: PharmacyFile;
  json: Buffer;
  gzip: Buffer;
  etag: string;
}

let built: Built | undefined;
let building: Promise<Built | undefined> | undefined;

/** The value of a tag in one XML item, or "". */
function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml);
  return (m?.[1] ?? "").trim();
}

/** One page of the listing, as raw items — the service answers in XML. */
export function parseItems(xml: string): Record<string, string>[] {
  const FIELDS = ["dutyName", "dutyTel1", "wgs84Lat", "wgs84Lon"];
  for (let d = 1; d <= 8; d++) FIELDS.push(`dutyTime${d}s`, `dutyTime${d}c`);
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => Object.fromEntries(FIELDS.map((f) => [f, tag(m[1], f)])));
}

/** The eight slots of a week, as the file stores them. */
export function weekOf(item: Record<string, string>): WeekHours {
  const slots: string[] = [];
  for (let d = 1; d <= 8; d++) {
    const s = item[`dutyTime${d}s`];
    const c = item[`dutyTime${d}c`];
    slots.push(/^\d{3,4}$/.test(s) && /^\d{3,4}$/.test(c) ? `${s.padStart(4, "0")}-${c.padStart(4, "0")}` : "");
  }
  return slots.join("|");
}

async function page(n: number): Promise<{ items: Record<string, string>[]; total: number }> {
  const url = `${API}?${new URLSearchParams({ serviceKey: ENV.TOUR_API_KEY, pageNo: String(n), numOfRows: String(PAGE), ORD: "NAME" })}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    const xml = await res.text();
    if (/SERVICE_KEY_IS_NOT_REGISTERED|SERVICE ERROR|<resultCode>(?!00)/.test(xml) && !/<item>/.test(xml)) {
      throw new Error(tag(xml, "returnAuthMsg") || tag(xml, "resultMsg") || "not available");
    }
    return { items: parseItems(xml), total: Number(tag(xml, "totalCount")) || 0 };
  } finally {
    clearTimeout(timer);
  }
}

async function build(): Promise<Built | undefined> {
  if (!ENV.TOUR_API_KEY.trim()) return undefined;
  const weeks: WeekHours[] = [];
  const weekIndex = new Map<WeekHours, number>();
  const rows: PharmacyRow[] = [];
  for (let n = 1; n <= 40; n++) {
    const { items, total } = await page(n);
    for (const it of items) {
      const lat = Number(it.wgs84Lat);
      const lng = Number(it.wgs84Lon);
      if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132) || !it.dutyName) continue;
      const week = weekOf(it);
      let w = weekIndex.get(week);
      if (w === undefined) {
        w = weeks.length;
        weeks.push(week);
        weekIndex.set(week, w);
      }
      rows.push([Math.round(lat * 1e5), Math.round(lng * 1e5), it.dutyName, it.dutyTel1, w]);
    }
    if (items.length < PAGE || n * PAGE >= total) break;
  }
  // A partial read is not a new copy.
  if (!rows.length || (built && rows.length < built.file.rows.length * 0.8)) return built;
  const holidays: string[] = [];
  for (let d = 0; d < 21; d++) {
    const k = new Date(Date.now() + 9 * 3600_000 + d * 24 * 3600_000);
    const ymd = `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
    if (koreanHolidayOn(ymd)) holidays.push(ymd);
  }
  const file: PharmacyFile = { at: Date.now(), weeks, holidays, rows };
  const json = Buffer.from(JSON.stringify(file));
  built = {
    at: file.at,
    file,
    json,
    gzip: gzipSync(json, { level: 9 }),
    etag: `"${createHash("sha1").update(json).digest("base64url").slice(0, 16)}"`,
  };
  return built;
}

/** After a failed build — the service not yet approved, say — wait this long before asking again. */
const RETRY_AFTER_MS = 10 * 60_000;
let failedAt = 0;

/** The file, rebuilt in the background once a day; undefined while the service is not available to us. */
export async function pharmacyFile(): Promise<Built | undefined> {
  const stale = !built || Date.now() - built.at > MAX_AGE_MS;
  if (stale && !building && Date.now() - failedAt > RETRY_AFTER_MS) {
    building = build()
      .catch((err: unknown) => {
        failedAt = Date.now();
        console.warn(`[pharmacies] build failed: ${err instanceof Error ? err.message : String(err)}`);
        return built;
      })
      .finally(() => (building = undefined));
  }
  return built ?? (await building);
}

/**
 * Pharmacies near a named place, open ones first — for the server's own
 * answers about somewhere the traveller named ("a 24-hour pharmacy in Hongdae").
 */
export async function pharmaciesNear(lat: number, lng: number, radiusM = 1500, limit = 5) {
  const b = await pharmacyFile().catch(() => undefined);
  if (!b) return undefined;
  const now = koreaNow();
  const holidayToday = b.file.holidays.includes(now.ymd);
  const holidayYesterday = b.file.holidays.includes(now.yesterdayYmd);
  const R = 6371000;
  const near = b.file.rows
    .map(([la, ln, name, tel, w]) => {
      const pLat = la / 1e5;
      const pLng = ln / 1e5;
      const dLat = ((pLat - lat) * Math.PI) / 180;
      const dLng = ((pLng - lng) * Math.PI) / 180;
      const h = Math.sin(dLat / 2) ** 2 + Math.cos((lat * Math.PI) / 180) * Math.cos((pLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      const m = Math.round(2 * R * Math.asin(Math.sqrt(h)));
      return { name, tel, lat: pLat, lng: pLng, m, state: openState(b.file.weeks[w], now.day, now.minute, holidayToday, holidayYesterday) };
    })
    .filter((p) => p.m <= radiusM)
    .sort((a, b2) => Number(b2.state.open) - Number(a.state.open) || a.m - b2.m);
  return near.slice(0, limit);
}
