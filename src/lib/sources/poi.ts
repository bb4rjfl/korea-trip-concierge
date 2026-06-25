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

export function parseNaver(json: NaverResponse): PoiPlace[] {
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((it) => ({
    name: stripTags(it.title),
    address: (it.roadAddress?.trim() || it.address?.trim() || "").trim(),
    category: it.category?.split(">").pop()?.trim() || it.category?.trim() || undefined,
    tel: it.telephone?.trim() || undefined,
    source: "naver" as const,
  }));
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

  const places = await cache.getOrLoad(key, async () => {
    // Prefer Foursquare when we have coordinates — English names + categories,
    // which is what foreign visitors need.
    if (hasKey("FOURSQUARE_API_KEY") && opts.coord) {
      const r = await foursquareSearch(opts.coord.lat, opts.coord.lng, what);
      if (r.length) return r;
    }
    // Naver: deep Korean coverage, keyword-based (works without coordinates).
    if (hasKey("NAVER_CLIENT_ID") && hasKey("NAVER_CLIENT_SECRET")) {
      return naverSearch(`${opts.area} ${what}`.trim());
    }
    return [];
  });
  return places.slice(0, limit);
}
