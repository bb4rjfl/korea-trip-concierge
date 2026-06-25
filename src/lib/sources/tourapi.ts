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
import { romanizeHangul } from "../romanize.js";

const API_HOST = "http://apis.data.go.kr/B551011";
const MOBILE_APP = "KoreaTripConcierge";

/** Supported content languages — one TourAPI service per language (U4). */
export type Lang = "en" | "ja" | "zh" | "ko";

/** language → TourAPI service path (all on the same TOUR_API_KEY). */
const SERVICE: Record<Lang, string> = {
  en: "EngService2",
  ja: "JpnService2",
  zh: "ChsService2", // Chinese (Simplified)
  ko: "KorService2",
};

/** Foreign services (en/ja/zh) share one content-type numbering… */
const CONTENT_TYPE_FOREIGN: Record<string, number> = {
  attraction: 76,
  culture: 78,
  festival: 85,
  course: 75,
  leisure: 77,
  accommodation: 80,
  shopping: 79,
  food: 82,
  cafe: 82,
  restaurant: 82,
};
/** …while the Korean service uses the original numbering. */
const CONTENT_TYPE_KOR: Record<string, number> = {
  attraction: 12,
  culture: 14,
  festival: 15,
  course: 25,
  leisure: 28,
  accommodation: 32,
  shopping: 38,
  food: 39,
  cafe: 39,
  restaurant: 39,
};

export function normalizeLang(input?: string): Lang {
  const v = (input ?? "").toLowerCase();
  if (v === "ja" || v === "jp" || v === "japanese") return "ja";
  if (v === "zh" || v === "cn" || v === "chinese" || v === "zh-cn") return "zh";
  if (v === "ko" || v === "kr" || v === "korean") return "ko";
  return "en";
}

function contentTypeFor(lang: Lang, category: string): number | undefined {
  const map = lang === "ko" ? CONTENT_TYPE_KOR : CONTENT_TYPE_FOREIGN;
  return map[category.toLowerCase()];
}

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
export function cleanTitle(t?: string, lang: Lang = "en"): string {
  let s = (t ?? "").replace(/\s*\[[^\]]*\]/g, ""); // bracketed tags e.g. "[Tax Refund Shop]"
  // Strip Korean parentheticals only for non-Korean output (for the Korean
  // service the whole title is Korean and should be kept).
  if (lang !== "ko") s = s.replace(/\s*[(（][^()（）]*[가-힣][^()（）]*[)）]/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

/**
 * Normalize a TourAPI body into Place[]. data.go.kr quirks handled:
 * - `items` is "" (empty string) when there are no results
 * - `items.item` is a single object (not an array) when exactly one result
 */
export function parsePlaces(json: TourApiResponse, lang: Lang = "en"): Place[] {
  // data.go.kr returns "" (falsy) for empty results — caught by `!items`.
  const items = json.response?.body?.items;
  if (!items || !items.item) return [];
  const arr = Array.isArray(items.item) ? items.item : [items.item];
  return arr.map((it) => {
    let title = cleanTitle(it.title, lang);
    let address = [it.addr1, it.addr2].filter(Boolean).join(" ").trim();
    // The Korean service (KorService2) has ~3× the data but Korean text — romanize
    // names/addresses so an English-first reader can use them (D-005 coverage,
    // names become pronounceable & match storefront signs; "이름 (Romanized)").
    if (lang === "ko") {
      const roman = romanizeHangul(title);
      if (roman && roman !== title) title = `${roman} (${title})`;
      address = romanizeHangul(address);
    }
    return {
      title,
      address,
      tel: it.tel?.trim() || undefined,
      image: it.firstimage?.trim() || it.firstimage2?.trim() || undefined,
      mapx: it.mapx ? Number(it.mapx) : undefined,
      mapy: it.mapy ? Number(it.mapy) : undefined,
      contentId: it.contentid,
      contentTypeId: it.contenttypeid,
    };
  });
}

function buildUrl(operation: string, params: Record<string, string>, lang: Lang): string {
  const sp = new URLSearchParams({
    serviceKey: ENV.TOUR_API_KEY,
    MobileOS: "ETC",
    MobileApp: MOBILE_APP,
    _type: "json",
    numOfRows: "8",
    pageNo: "1",
    arrange: "O", // by title (the *Service2 GW rejects listYN — verified live)
    ...params,
  });
  return `${API_HOST}/${SERVICE[lang]}/${operation}?${sp.toString()}`;
}

export interface SearchOptions {
  keyword: string;
  category?: string;
  limit?: number;
  language?: Lang;
}

/**
 * Re-rank results by NAME match only — accuracy-first, no type guessing:
 * exact title > prefix > contains > original order (e.g. "Gyeongbokgung" floats
 * "Gyeongbokgung Palace" above "Andersson Bell Gyeongbokgung Store"). When the
 * remaining ambiguity is about *kind of place* (palace vs restaurant), the tool
 * layer asks the user instead of guessing (see getNowInfo). Pure/deterministic (A).
 */
export function rankPlaces(places: Place[], keyword: string): Place[] {
  const q = keyword.trim().toLowerCase();
  if (!q) return places;
  const score = (p: Place): number => {
    const t = p.title.toLowerCase();
    if (t === q) return 100;
    if (t.startsWith(q)) return 50;
    if (t.includes(q)) return 20;
    return 0;
  };
  // Stable sort: equal scores keep TourAPI's original order.
  return places
    .map((p, i) => ({ p, i, s: score(p) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

/** Keyword search (searchKeyword2) in the requested language. Cached + time-bounded. */
export async function searchPlaces(opts: SearchOptions): Promise<Place[]> {
  const lang = opts.language ?? "en";
  const ctype = opts.category ? contentTypeFor(lang, opts.category) : undefined;
  const key = `kw:${lang}:${opts.keyword}:${ctype ?? ""}`;
  const params: Record<string, string> = { keyword: opts.keyword };
  if (ctype) params.contentTypeId = String(ctype);

  const places = await cache.getOrLoad(key, async () => {
    const json = await fetchJson<TourApiResponse>(buildUrl("searchKeyword2", params, lang));
    return parsePlaces(json, lang);
  });
  const ranked = rankPlaces(places, opts.keyword);
  return typeof opts.limit === "number" ? ranked.slice(0, opts.limit) : ranked;
}

export interface NearbyOptions {
  lat: number;
  lng: number;
  radius?: number; // meters (default 1000)
  category?: string;
  limit?: number;
  language?: Lang;
}

/**
 * Radius search (locationBasedList2) around coordinates, distance-sorted (C).
 * Better coverage than title-keyword search for "<food> near <area>" — pairs
 * with the curated coord index. Returns [] when the area has no nearby listings.
 */
export async function searchPlacesNearby(opts: NearbyOptions): Promise<Place[]> {
  const lang = opts.language ?? "en";
  const ctype = opts.category ? contentTypeFor(lang, opts.category) : undefined;
  const radius = opts.radius ?? 1000;
  const key = `loc:${lang}:${opts.lng.toFixed(4)},${opts.lat.toFixed(4)}:${ctype ?? ""}:${radius}`;
  const params: Record<string, string> = {
    mapX: String(opts.lng),
    mapY: String(opts.lat),
    radius: String(radius),
    arrange: "E", // by distance
  };
  if (ctype) params.contentTypeId = String(ctype);

  const places = await cache.getOrLoad(key, async () => {
    const json = await fetchJson<TourApiResponse>(buildUrl("locationBasedList2", params, lang));
    return parsePlaces(json, lang);
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
  opts: { category?: string; limit?: number; language?: Lang } = {},
): Promise<Place[]> {
  const seen = new Set<string>();
  for (const kw of keywords.map((k) => k.trim()).filter(Boolean)) {
    if (seen.has(kw)) continue;
    seen.add(kw);
    const places = await searchPlaces({
      keyword: kw,
      category: opts.category,
      limit: opts.limit,
      language: opts.language,
    });
    if (places.length) return places;
  }
  return [];
}

/** Best-match single place for a free-text name (for hours/route lookups). */
export async function searchTopPlace(keyword: string, language: Lang = "en"): Promise<Place | undefined> {
  const places = await searchPlaces({ keyword, limit: 1, language });
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
export async function getPlaceIntro(
  contentId: string,
  contentTypeId: string,
  language: Lang = "en",
): Promise<PlaceIntro> {
  return introCache.getOrLoad(`intro:${language}:${contentId}`, async () => {
    const url = buildUrl("detailIntro2", { contentId, contentTypeId }, language);
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
