/**
 * Local-business POI providers (restaurants/cafes/shops) — comprehensive
 * coverage that TourAPI's tourism-curated data lacks. Pluggable so whichever
 * keys exist are used, in preference order, and the tool degrades gracefully
 * when none are configured.
 *
 *  - Naver Local Search : keyword-based, strong Korean coverage (NAVER_CLIENT_*)
 *  - Foursquare Places  : coordinate-based, English-first (FOURSQUARE_API_KEY)
 *
 * NOTE(verify-live): response shapes follow each provider's current docs; both
 * keys are pending issuance. Confirm field names against a live response when a
 * key is added — parsers are locked by fixtures in test/sources.test.ts.
 */
import { ENV, hasKey } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";
import { romanizeHangul } from "../romanize.js";

export interface PoiPlace {
  name: string;
  address: string;
  category?: string;
  tel?: string;
  source: "naver" | "foursquare";
}

export function hasPoiProvider(): boolean {
  return (hasKey("NAVER_CLIENT_ID") && hasKey("NAVER_CLIENT_SECRET")) || hasKey("FOURSQUARE_API_KEY");
}

const cache = new TtlCache<PoiPlace[]>(5 * 60_000);

// ---------- Naver Local Search ----------

interface NaverItem {
  title?: string; // contains <b></b> markup
  category?: string;
  telephone?: string;
  address?: string;
  roadAddress?: string;
}
interface NaverResponse {
  items?: NaverItem[];
}

const stripTags = (s?: string): string => (s ?? "").replace(/<\/?[^>]+>/g, "").trim();

/** Translate a Naver Korean category into an English cuisine label (keyword-based). */
export function translateNaverCategory(cat?: string): string | undefined {
  const c = cat ?? "";
  if (!c) return undefined;
  const has = (...ks: string[]) => ks.some((k) => c.includes(k));
  if (has("삼겹살", "갈비", "고기", "육류", "곱창", "구이")) return "Korean BBQ";
  if (has("해물", "생선", "회", "조개", "수산")) return "Seafood";
  if (has("곰탕", "설렁탕", "국밥", "백반", "가정식", "한정식", "찌개", "전골", "한식")) return "Korean";
  if (has("초밥", "스시", "돈가스", "라멘", "우동", "japanese", "일식", "이자카야")) return "Japanese";
  if (has("중식", "중국", "마라", "양꼬치")) return "Chinese";
  if (has("이탈리", "파스타", "피자", "스테이크", "프랑스", "양식")) return "Western";
  if (has("베트남", "쌀국수", "태국", "인도", "터키", "케밥", "아시아")) return "Asian";
  if (has("카페", "커피", "디저트", "베이커리", "빵", "브런치")) return "Café";
  if (has("떡볶이", "분식", "김밥")) return "Korean street food";
  if (has("치킨", "닭")) return "Chicken";
  if (has("버거", "햄버거")) return "Burger";
  if (has("뷔페", "부페")) return "Buffet";
  if (has("주점", "호프", "포장마차", "바", "술집", "와인", "맥주", "펍")) return "Bar / pub";
  return "Restaurant";
}

/** Korean address → readable English-ish: drop admin/floor noise, then transliterate. */
function romanizeAddress(ko: string): string {
  const cleaned = (ko ?? "")
    .replace(/서울특별시|서울시/g, "Seoul")
    .replace(/(지하\s*)?\d+층|지하\s*\d+|[BbＢ]\d+/g, "") // floor / basement
    .replace(/\s{2,}/g, " ")
    .trim();
  let out = romanizeHangul(cleaned).replace(/\s{2,}/g, " ").trim();
  // Balance parens — source strings sometimes get cut mid-"(…)" leaving a dangling "(".
  const opens = (out.match(/\(/g) ?? []).length;
  const closes = (out.match(/\)/g) ?? []).length;
  if (opens > closes) out = out.replace(/\s*\([^)]*$/, "").trim(); // drop the dangling fragment
  return out;
}

export function parseNaver(json: NaverResponse): PoiPlace[] {
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((it) => {
    const ko = stripTags(it.title);
    const roman = romanizeHangul(ko);
    return {
      // Romanized (pronounceable) + Korean for matching the storefront sign.
      name: roman && roman !== ko ? `${roman} (${ko})` : ko,
      address: romanizeAddress(it.roadAddress?.trim() || it.address?.trim() || ""),
      category: translateNaverCategory(it.category),
      tel: it.telephone?.trim() || undefined,
      source: "naver" as const,
    };
  });
}

async function naverSearch(query: string): Promise<PoiPlace[]> {
  const url = `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5&sort=random`;
  const json = await fetchJson<NaverResponse>(url, {
    headers: {
      "X-Naver-Client-Id": ENV.NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": ENV.NAVER_CLIENT_SECRET,
    },
  });
  return parseNaver(json);
}

// ---------- Foursquare Places (v3) ----------

interface FsqResult {
  name?: string;
  tel?: string;
  location?: { address?: string; locality?: string; formatted_address?: string };
  categories?: { name?: string }[];
}
interface FsqResponse {
  results?: FsqResult[];
}

export function parseFoursquare(json: FsqResponse): PoiPlace[] {
  const results = Array.isArray(json.results) ? json.results : [];
  return results.map((r) => {
    const loc = r.location ?? {};
    const address =
      [loc.address, loc.locality].filter(Boolean).join(", ").trim() ||
      (loc.formatted_address ?? "").trim();
    return {
      name: (r.name ?? "").trim(),
      address,
      category: r.categories?.[0]?.name?.trim() || undefined,
      tel: r.tel?.trim() || undefined,
      source: "foursquare" as const,
    };
  });
}

// Foursquare Places API (2025): English place names + categories — ideal for
// foreign visitors. Service Key via Bearer, dated version header.
const FSQ_API_VERSION = "2025-06-17";

async function foursquareSearch(lat: number, lng: number, query: string): Promise<PoiPlace[]> {
  const url =
    `https://places-api.foursquare.com/places/search?ll=${lat},${lng}` +
    `&radius=1500&query=${encodeURIComponent(query)}&limit=8`;
  const json = await fetchJson<FsqResponse>(url, {
    headers: {
      Authorization: `Bearer ${ENV.FOURSQUARE_API_KEY}`,
      "X-Places-Api-Version": FSQ_API_VERSION,
      accept: "application/json",
    },
  });
  return parseFoursquare(json);
}

// ---------- Orchestration ----------

export interface PoiSearchOptions {
  area: string;
  query?: string; // e.g. "restaurant", "cafe"
  coord?: { lat: number; lng: number };
  limit?: number;
}

/**
 * Find local-business POIs, preferring Naver (keyword) then Foursquare (coord).
 * Returns [] if no provider key is configured (caller falls back to TourAPI).
 */
export async function searchForeignerPois(opts: PoiSearchOptions): Promise<PoiPlace[]> {
  const what = (opts.query ?? "restaurant").trim();
  const limit = opts.limit ?? 5;
  const key = `poi:${opts.area}:${what}`;

  const naverOk = hasKey("NAVER_CLIENT_ID") && hasKey("NAVER_CLIENT_SECRET");
  const fsqOk = hasKey("FOURSQUARE_API_KEY") && !!opts.coord;
  const naver = () => naverSearch(`${opts.area} ${what}`.trim());
  const fsq = () => foursquareSearch(opts.coord!.lat, opts.coord!.lng, what);

  const places = await cache.getOrLoad(key, async () => {
    // Korean keyword → Naver first (deep Korean coverage, converted to English).
    // English keyword → Foursquare first (native English names), by coordinate.
    const koreanQuery = /[가-힣]/.test(opts.area);
    const order = koreanQuery ? [naverOk && naver, fsqOk && fsq] : [fsqOk && fsq, naverOk && naver];
    for (const run of order) {
      if (!run) continue;
      const r = await run();
      if (r.length) return r;
    }
    return [];
    // TODO(visitseoul): when VISITSEOUL_API_KEY is live, merge its (natively
    // multilingual) results here and dedupe for richer combined output (D-010).
  });
  return places.slice(0, limit);
}
