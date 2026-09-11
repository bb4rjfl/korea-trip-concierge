/**
 * The tourism board's sights, as one file the phone keeps.
 *
 * "What's worth seeing around me" is answered on the traveller's phone
 * (src/lib/deviceTask.ts), so the phone needs the listings themselves rather
 * than a search around its position — a search around its position would tell
 * us the position. Every visitor gets the same file for their language, whoever
 * and wherever they are, and the phone does the measuring.
 *
 * Source: Korea Tourism Organization TourAPI areaBasedList2 (ⓒ한국관광공사) —
 * attractions and culture venues, plus leisure in the foreign-language services,
 * where it is a couple of hundred theme parks and ski resorts rather than the
 * Korean service's thousands of local sports facilities.
 */

import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { cleanTitle, tourUrl, type Lang, type TourApiResponse } from "./tourapi.js";

/**
 * One sight: TourAPI content id, title as the service writes it, WGS84 × 10⁵
 * (about a metre — plenty for "450 m away", and half the bytes of a float),
 * the content type, and whether it has a photo — the listings with photos are,
 * almost without exception, the ones worth walking to.
 */
export type SightRow = [id: string, title: string, lat5: number, lng5: number, type: number, photo: 0 | 1];

export interface SightsFile {
  lang: Lang;
  /** When this copy was taken, epoch ms. */
  at: number;
  rows: SightRow[];
}

/** Content types, per service: the foreign services share one numbering, Korean has its own. */
const TYPES: Record<Lang, number[]> = {
  en: [76, 78, 75],
  ja: [76, 78, 75],
  zh: [76, 78, 75],
  ko: [12, 14],
};

const PAGE = 1000;
/**
 * Read live and held briefly, like every other TourAPI answer here: the contest
 * asks for live calls over stored copies (docs/27 §2-4), so this is a short
 * cache of a live read, not a dataset — rebuilt from the API when someone asks
 * and it is more than an hour old, never on a timer.
 */
const MAX_AGE_MS = 60 * 60_000;

interface Built {
  at: number;
  rows: number;
  json: Buffer;
  gzip: Buffer;
  etag: string;
}

const built = new Map<Lang, Built>();
const building = new Map<Lang, Promise<Built | undefined>>();

function parseRows(json: TourApiResponse, type: number): SightRow[] {
  const items = json.response?.body?.items;
  if (!items || !items.item) return [];
  const list = Array.isArray(items.item) ? items.item : [items.item];
  const rows: SightRow[] = [];
  for (const it of list) {
    const lat = Number(it.mapy);
    const lng = Number(it.mapx);
    // Korea only: a few listings carry 0,0 or swapped axes.
    if (!(lat > 33 && lat < 39 && lng > 124 && lng < 132)) continue;
    // Brackets are tags ("[Tax Refund Shop]"); the Korean in parentheses stays,
    // because it is what the sign and the taxi driver say.
    const title = cleanTitle(it.title, "ko");
    if (!it.contentid || !title) continue;
    rows.push([it.contentid, title, Math.round(lat * 1e5), Math.round(lng * 1e5), type, it.firstimage ? 1 : 0]);
  }
  return rows;
}

async function fetchAll(lang: Lang): Promise<SightRow[]> {
  const rows: SightRow[] = [];
  for (const type of TYPES[lang]) {
    for (let page = 1; page <= 30; page++) {
      const url = tourUrl(
        "areaBasedList2",
        { contentTypeId: String(type), numOfRows: String(PAGE), pageNo: String(page), arrange: "A" },
        lang,
      );
      const json = await fetchJson<TourApiResponse>(url, {}, 20_000);
      const got = parseRows(json, type);
      rows.push(...got);
      const total = Number(json.response?.body?.totalCount ?? 0);
      if (page * PAGE >= total || got.length === 0) break;
    }
  }
  // One row per content id — a listing appears once per type it is filed under.
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r[0]) ? false : (seen.add(r[0]), true)));
}

async function build(lang: Lang): Promise<Built | undefined> {
  if (!ENV.TOUR_API_KEY.trim()) return undefined;
  const rows = await fetchAll(lang);
  // An upstream hiccup that returns a fraction of the listings is not a new copy.
  const previous = built.get(lang);
  if (!rows.length || (previous && rows.length < previous.rows * 0.8)) return previous;
  const file: SightsFile = { lang, at: Date.now(), rows };
  const json = Buffer.from(JSON.stringify(file));
  const b: Built = {
    at: file.at,
    rows: rows.length,
    json,
    gzip: gzipSync(json, { level: 9 }),
    etag: `"${createHash("sha1").update(json).digest("base64url").slice(0, 16)}"`,
  };
  built.set(lang, b);
  return b;
}

/**
 * The file for a language: the current copy, rebuilt in the background when it
 * is over an hour old. The first request after a cold start waits for the build
 * (a few seconds); warmSightsIndex() is there so that it normally does not.
 */
export async function sightsFile(lang: Lang): Promise<Built | undefined> {
  const have = built.get(lang);
  const stale = !have || Date.now() - have.at > MAX_AGE_MS;
  if (stale && !building.has(lang)) {
    const p = build(lang)
      .catch((err: unknown) => {
        console.warn(`[sights] ${lang} build failed: ${err instanceof Error ? err.message : String(err)}`);
        return built.get(lang);
      })
      .finally(() => building.delete(lang));
    building.set(lang, p);
  }
  return have ?? (await building.get(lang));
}

/** Build every language's copy one after another, so the first visitor does not wait. */
export async function warmSightsIndex(): Promise<void> {
  for (const lang of ["en", "ko", "ja", "zh"] as Lang[]) await sightsFile(lang).catch(() => undefined);
}
