/**
 * Korea Tourism Organization TourAPI — English service (EngService2).
 * Powers searchPlaceForeigner, findForeignerFriendlyStore, getNowInfo.
 *
 * Why this source: EngService2 returns titles/addresses already in English —
 * ideal for foreign visitors — which a plain LLM cannot pull live/structured.
 *
 * Uses the data.go.kr DECODING service key (ENV.TOUR_API_KEY); URLSearchParams
 * encodes it exactly once. Responses are cached (TtlCache) and time-bounded
 * (fetchJson → 2.5s + 1 retry) to protect p99.
 *
 * NOTE(verify-live): field names below follow the documented EngService2 schema.
 * Confirm against a live response once TOUR_API_KEY is issued; parser is locked
 * by test/sources.test.ts fixtures so any drift surfaces immediately.
 */
import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";

const BASE = "http://apis.data.go.kr/B551011/EngService2";
const MOBILE_APP = "KoreaTripConcierge";

/** EngService2 content type IDs (English service uses its own numbering). */
export const ENG_CONTENT_TYPE: Record<string, number> = {
  attraction: 76,
  culture: 78,
  festival: 85,
  course: 75,
  leisure: 77,
  accommodation: 80,
  shopping: 79,
  food: 82,
  cafe: 82, // no distinct cafe type; restaurants
  restaurant: 82,
};

export interface Place {
  title: string;
  address: string;
  tel?: string;
  image?: string;
  mapx?: number;
  mapy?: number;
  contentId?: string;
  contentTypeId?: string;
}

const cache = new TtlCache<Place[]>(5 * 60_000); // tourism data is fairly static

/** Raw EngService2 item shape (subset we use). */
interface RawItem {
  title?: string;
  addr1?: string;
  addr2?: string;
  tel?: string;
  firstimage?: string;
  firstimage2?: string;
  mapx?: string;
  mapy?: string;
  contentid?: string;
  contenttypeid?: string;
}

interface TourApiResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: RawItem[] | RawItem } | "";
      totalCount?: number;
    };
  };
}

/**
 * Clean a TourAPI English title for Markdown output. EngService titles often
 * carry a trailing Korean name in parentheses and bracketed tags, e.g.
 * "...Flagship Store [Tax Refund Shop](앤더슨벨 …)" — the `[x](y)` shape renders
 * as a broken link and the Hangul is unreadable for our users. Strip any
 * parenthetical containing Hangul so what remains is clean English.
 */
export function cleanTitle(t?: string): string {
  return (t ?? "")
    .replace(/\s*[(（][^()（）]*[가-힣][^()（）]*[)）]/g, "") // Korean parenthetical
    .replace(/\s*\[[^\]]*\]/g, "") // bracketed tags e.g. "[Tax Refund Shop]"
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Normalize a TourAPI body into Place[]. data.go.kr quirks handled:
 * - `items` is "" (empty string) when there are no results
 * - `items.item` is a single object (not an array) when exactly one result
 */
export function parsePlaces(json: TourApiResponse): Place[] {
  // data.go.kr returns "" (falsy) for empty results — caught by `!items`.
  const items = json.response?.body?.items;
  if (!items || !items.item) return [];
  const arr = Array.isArray(items.item) ? items.item : [items.item];
  return arr.map((it) => ({
    title: cleanTitle(it.title),
    address: [it.addr1, it.addr2].filter(Boolean).join(" ").trim(),
    tel: it.tel?.trim() || undefined,
    image: it.firstimage?.trim() || it.firstimage2?.trim() || undefined,
    mapx: it.mapx ? Number(it.mapx) : undefined,
    mapy: it.mapy ? Number(it.mapy) : undefined,
    contentId: it.contentid,
    contentTypeId: it.contenttypeid,
  }));
}

function buildUrl(operation: string, params: Record<string, string>): string {
  const sp = new URLSearchParams({
    serviceKey: ENV.TOUR_API_KEY,
    MobileOS: "ETC",
    MobileApp: MOBILE_APP,
    _type: "json",
    numOfRows: "8",
    pageNo: "1",
    arrange: "O", // by title (EngService2 GW rejects listYN — verified live)
    ...params,
  });
  return `${BASE}/${operation}?${sp.toString()}`;
}

export interface SearchOptions {
  keyword: string;
  category?: string;
  limit?: number;
}

/** Keyword search (searchKeyword2). Cached + time-bounded. */
export async function searchPlaces(opts: SearchOptions): Promise<Place[]> {
  const ctype = opts.category ? ENG_CONTENT_TYPE[opts.category.toLowerCase()] : undefined;
  const key = `kw:${opts.keyword}:${ctype ?? ""}`;
  const params: Record<string, string> = { keyword: opts.keyword };
  if (ctype) params.contentTypeId = String(ctype);

  const places = await cache.getOrLoad(key, async () => {
    const json = await fetchJson<TourApiResponse>(buildUrl("searchKeyword2", params));
    return parsePlaces(json);
  });
  return typeof opts.limit === "number" ? places.slice(0, opts.limit) : places;
}

/**
 * Try several keyword candidates in order, returning the first non-empty result.
 * searchKeyword2 matches the keyword against the TITLE, so a combined phrase like
 * "cafe Hongdae" often misses — falling back to "Hongdae" then "cafe" recovers
 * useful results instead of showing "no places found".
 */
export async function searchPlacesAny(
  keywords: string[],
  opts: { category?: string; limit?: number } = {},
): Promise<Place[]> {
  const seen = new Set<string>();
  for (const kw of keywords.map((k) => k.trim()).filter(Boolean)) {
    if (seen.has(kw)) continue;
    seen.add(kw);
    const places = await searchPlaces({ keyword: kw, category: opts.category, limit: opts.limit });
    if (places.length) return places;
  }
  return [];
}

/** Best-match single place for a free-text name (for hours/route lookups). */
export async function searchTopPlace(keyword: string): Promise<Place | undefined> {
  const places = await searchPlaces({ keyword, limit: 1 });
  return places[0];
}

export interface PlaceIntro {
  hours?: string;
  closedDays?: string;
  contact?: string;
}

/**
 * Type-specific intro fields per EngService2 content type. Field names differ by
 * type (food vs attraction vs shopping …); we probe the candidates and take the
 * first non-empty. NOTE(verify-live): confirm field names against a live
 * detailIntro2 response when the key is issued.
 */
const HOURS_FIELDS = ["opentimefood", "usetime", "opentime", "usetimeculture", "checkintime"];
const CLOSED_FIELDS = ["restdatefood", "restdate", "restdateculture", "restdateshopping"];
const CONTACT_FIELDS = ["infocenterfood", "infocenter", "infocenterculture", "infocentershopping"];

function firstField(raw: Record<string, unknown>, fields: string[]): string | undefined {
  for (const f of fields) {
    const v = raw[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

const introCache = new TtlCache<PlaceIntro>(30 * 60_000);

/** detailIntro2 — opening hours / closed days for a known content id. */
export async function getPlaceIntro(contentId: string, contentTypeId: string): Promise<PlaceIntro> {
  return introCache.getOrLoad(`intro:${contentId}`, async () => {
    const url = buildUrl("detailIntro2", { contentId, contentTypeId });
    const json = await fetchJson<{ response?: { body?: { items?: { item?: unknown } | "" } } }>(url);
    const itemsNode = json.response?.body?.items; // "" when empty (falsy)
    const item = itemsNode ? (itemsNode as { item?: unknown }).item : undefined;
    const raw = (Array.isArray(item) ? item[0] : item) as Record<string, unknown> | undefined;
    if (!raw) return {};
    return {
      hours: firstField(raw, HOURS_FIELDS),
      closedDays: firstField(raw, CLOSED_FIELDS),
      contact: firstField(raw, CONTACT_FIELDS),
    };
  });
}
