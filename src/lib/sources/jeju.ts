/**
 * VisitJeju Tour Info OPEN API — powers getJejuInfo.
 *
 * Why this source: VisitJeju serves Jeju attractions/restaurants/festivals with
 * `locale=en` already in English (titles, addresses, intros) — exactly the
 * structured, foreign-ready data a plain LLM can't pull live. data.go.kr's
 * nationwide TourAPI has thin Jeju coverage, so this is a real complement.
 *
 * MUST use HTTPS — the documented http:// endpoint refuses connections (verified
 * live). Auth is the apiKey query param (ENV.JEJU_API_KEY). Cached + timed.
 */
import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";

const BASE = "https://api.visitjeju.net/vsjApi/contents/searchList";

/** VisitJeju content categories (contentscd) → friendly keys. */
export const JEJU_CATEGORY: Record<string, string> = {
  attraction: "c1", // Tourist Destination
  shopping: "c2",
  accommodation: "c3",
  restaurant: "c4",
  food: "c4",
  festival: "c5", // Festivals/Events
  event: "c5",
  theme: "c6", // Theme Travel
};

export interface JejuPlace {
  title: string;
  category?: string;
  address: string;
  intro?: string;
  tel?: string;
  image?: string;
  lat?: number;
  lng?: number;
}

interface RawItem {
  title?: string;
  contentscd?: { label?: string };
  address?: string;
  roadaddress?: string;
  introduction?: string;
  phoneno?: string;
  latitude?: number;
  longitude?: number;
  repPhoto?: { photoid?: { thumbnailpath?: string; imgpath?: string } };
}

interface SearchResponse {
  result?: string;
  resultMessage?: string;
  totalCount?: number;
  items?: RawItem[];
}

/** Normalize a VisitJeju item. phoneno is "*" when absent — treated as empty. */
export function parseJeju(json: SearchResponse): JejuPlace[] {
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((it) => {
    const tel = (it.phoneno ?? "").replace(/\*/g, "").trim();
    const photo = it.repPhoto?.photoid;
    return {
      title: (it.title ?? "").trim(),
      category: it.contentscd?.label?.trim() || undefined,
      address: (it.roadaddress?.trim() || it.address?.trim() || "").trim(),
      intro: it.introduction?.trim() || undefined,
      tel: tel || undefined,
      image: photo?.thumbnailpath?.trim() || photo?.imgpath?.trim() || undefined,
      lat: typeof it.latitude === "number" ? it.latitude : undefined,
      lng: typeof it.longitude === "number" ? it.longitude : undefined,
    };
  });
}

const cache = new TtlCache<JejuPlace[]>(30 * 60_000); // Jeju catalog is static

export interface JejuOptions {
  category?: string;
  limit?: number;
  page?: number;
}

/** Fetch Jeju contents (optionally by category), in English. */
export async function searchJeju(opts: JejuOptions = {}): Promise<JejuPlace[]> {
  const ccode = opts.category ? JEJU_CATEGORY[opts.category.toLowerCase()] : undefined;
  const page = opts.page ?? 1;
  const key = `jeju:${ccode ?? "all"}:${page}`;
  const places = await cache.getOrLoad(key, async () => {
    const sp = new URLSearchParams({
      apiKey: ENV.JEJU_API_KEY,
      locale: "en",
      page: String(page),
    });
    if (ccode) sp.set("category", ccode);
    const json = await fetchJson<SearchResponse>(`${BASE}?${sp.toString()}`);
    return parseJeju(json);
  });
  return typeof opts.limit === "number" ? places.slice(0, opts.limit) : places;
}
