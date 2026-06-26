/**
 * VisitSeoul — Seoul Tourism Organization official content API
 * (api-call.visitseoul.net). Powers the Seoul layer of searchPlaceForeigner and
 * getNowInfo.
 *
 * Why this source: VisitSeoul ships *official, pre-translated English* content
 * (summary, hours, road address, subway directions) for Seoul places — exactly
 * the structured English a foreign visitor needs, which TourAPI's thin English
 * service (~15k) and a plain LLM cannot supply live. It is Seoul-only, so it acts
 * as the PRIMARY Seoul discovery source while TourAPI/POI ground the gaps and the
 * rest of the country (see searchPlaceForeigner).
 *
 * Auth: header `VISITSEOUL-API-KEY` (a UUID-style key, not a data.go.kr key).
 * Endpoints: category/list, code/lang (GET) · contents/list, contents/info (POST).
 * Languages: en · ja · zh-CN · zh-TW · ru · ms · ko (we map our en/ja/zh/ko).
 *
 * Resilience: the gateway rate-limits rapid calls (returns 200 with no
 * `data`/`paging`), so every parse tolerates a missing body and the tool layer
 * treats an empty result as "fall back to grounding", never an error. Responses
 * are cached (TtlCache) and time-bounded (fetchJson → 2.5s + 1 retry) to protect
 * p99 (live latency ~0.4–0.6s, but we never want to depend on it).
 */
import { ENV } from "../env.js";
import { fetchJson } from "../http.js";
import { TtlCache } from "../cache.js";
import { resolvePlaceCoord } from "../places.js";
import { similarity, normalizeName } from "../fuzzy.js";
import type { Lang } from "./tourapi.js";

const API_HOST = "https://api-call.visitseoul.net/api/v1";

/** Our 4 tool languages → VisitSeoul language code (zh → Simplified). */
const VS_LANG: Record<Lang, string> = {
  en: "en",
  ja: "ja",
  zh: "zh-CN",
  ko: "ko",
};
export function toVsLang(lang: Lang): string {
  return VS_LANG[lang] ?? "en";
}

/**
 * Intent → VisitSeoul category serial number. Level-1 codes aggregate all their
 * descendants (verified live: Cuisine L1 = 1256 vs Korean-Restaurants L2 = 539),
 * so we target the broadest sensible node for discovery. Dining (cafe/restaurant/
 * food) is intentionally absent — coordinate POI search (Naver/Foursquare) serves
 * those better, so the tool layer routes dining away from VisitSeoul.
 */
export const VS_CATEGORY = {
  culture: "Ca0o2d4", // Culture (incl. Landmarks, Parks, Museums…)
  history: "Ca1z6p7", // History (palaces, historic & religious sites)
  nature: "Co6c2n2", // Nature (mountains, rivers, parks)
  shopping: "Cu8e6t5", // Shopping (malls, markets, duty-free, dept stores)
  accommodation: "Ch4v8z7", // Accommodations (hotels, hostels)
  experience: "Cc9i5o2", // Experience Programs (temple stay, hanbok, crafts)
  festival: "Cv7s8m5", // Festivals / Events / Performances
  market: "Cn7z1h7", // Shopping > Traditional Markets
  museum: "Cg1x6l1", // Culture > Cultural Facilities (museums & galleries)
  templestay: "Cq9d5v0", // Experience Programs > Temple Stays
  themepark: "Cy5h2x9", // Culture > Theme Parks (kid/family-friendly)
} as const;

/** Keyword → VisitSeoul category, richer than TourAPI's inferCategory so Seoul
 *  discovery targets the right node ("temple stay" → Temple Stays, "museum" →
 *  Cultural Facilities, "palace" → History). Returns undefined for dining and for
 *  unclassifiable queries (→ broad area browse). Pure/deterministic. */
export function inferSeoulCategory(text: string): string | undefined {
  const q = (text ?? "").toLowerCase();
  if (/temple\s*stay|템플스테이/.test(q)) return VS_CATEGORY.templestay;
  // Kid/family/theme-park intent (incl. ja/zh) → theme parks, before generic culture.
  if (/kid|child|family|toddler|아이|어린이|가족|子供|親子|亲子|theme\s*park|amusement\s*park|놀이공원|에버랜드|롯데월드/.test(q))
    return VS_CATEGORY.themepark;
  if (/hanbok|한복|craft|공방|workshop|체험|experience|wellness|temple\s*food/.test(q))
    return VS_CATEGORY.experience;
  if (/mus[eu]+ms?|museam|박물관|gallery|galleries|미술관|exhibit|전시/.test(q)) return VS_CATEGORY.museum;
  if (/market|시장|재래/.test(q)) return VS_CATEGORY.market;
  if (/palace|궁|temple|historic|heritage|유적|역사|shrine|fortress|성곽/.test(q)) return VS_CATEGORY.history;
  if (/park|mountain|river|han\s*river|nature|산|강|공원|hiking|trail|숲/.test(q)) return VS_CATEGORY.nature;
  if (/shop|shopping|mall|outlet|duty.?free|백화점|쇼핑|면세/.test(q)) return VS_CATEGORY.shopping;
  if (/hotel|hostel|stay|guesthouse|숙소|호텔/.test(q)) return VS_CATEGORY.accommodation;
  if (/festival|축제|event|행사|performance|공연|concert/.test(q)) return VS_CATEGORY.festival;
  // Generic sightseeing intent, incl. ja/zh and "things to see / worth visiting".
  if (/landmark|attraction|sight|tower|관광|명소|구경|view|spot|볼거리|가\s*볼|things?\s*to\s*(see|do)|worth\s*(see|visit)|観光|名所|スポット|景点|景區|景区|打卡/.test(q))
    return VS_CATEGORY.culture;
  return undefined;
}

// Seoul bounding box (WGS84) — generous enough to cover the city, tight enough to
// exclude Incheon Airport (126.45), Busan (~129), and Jeju (~126.5/33.4).
const SEOUL_BBOX = { minLng: 126.76, maxLng: 127.18, minLat: 37.43, maxLat: 37.70 };

/** True if the text names Seoul or a coordinate-known place inside the Seoul box.
 *  Used to route a query to VisitSeoul (Seoul-only) vs the national sources. */
export function isSeoulText(text?: string): boolean {
  const t = (text ?? "").trim();
  if (!t) return false;
  if (/\bseoul\b|서울/i.test(t)) return true;
  const c = resolvePlaceCoord(t);
  if (!c) return false;
  return (
    c.lng >= SEOUL_BBOX.minLng &&
    c.lng <= SEOUL_BBOX.maxLng &&
    c.lat >= SEOUL_BBOX.minLat &&
    c.lat <= SEOUL_BBOX.maxLat
  );
}

export interface SeoulContent {
  cid: string;
  title: string;
  summary?: string;
  image?: string;
  categoryPath?: string;
}

export interface SeoulDetail extends SeoulContent {
  hours?: string;
  closedDays?: string;
  tel?: string;
  homepage?: string;
  address?: string;
  lng?: number;
  lat?: number;
  subway?: string;
  tags?: string[];
  freeAdmission?: boolean;
  description?: string;
}

/** Raw shapes (subset we use). */
interface RawList {
  cid?: string;
  post_sj?: string;
  sumry?: string;
  main_img?: string;
  cate_depth?: unknown;
}
interface RawDetail extends RawList {
  relate_img?: unknown;
  tag?: unknown;
  extra?: {
    cmmn_telno?: string;
    cmmn_hmpg_url?: string;
    cmmn_use_time?: string;
    closed_days?: string;
    cmmn_important?: string;
    trrsrt_use_chrge?: string;
  };
  traffic?: {
    adres?: string;
    new_adres?: string;
    map_position_x?: string;
    map_position_y?: string;
    subway_info?: string;
  };
  post_desc?: string;
}
interface VsListResponse {
  data?: RawList[];
  paging?: { total_count?: number };
  result_code?: number;
}
interface VsDetailResponse {
  data?: RawDetail;
  result_code?: number;
}

/** Strip a single trailing duplicate parenthetical and collapse whitespace.
 *  VisitSeoul English titles are already English (no romanization needed). */
function cleanTitle(t?: string): string {
  return (t ?? "").replace(/\s{2,}/g, " ").trim();
}

/** Clip text to n chars on a word boundary with an ellipsis (avoids mid-word cuts
 *  in rendered summaries). */
export function clip(s: string, n: number): string {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + "…";
}

const DOW_FULL = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DOW_ABBR = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);
const hhmm = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export interface HoursVerdict {
  status: "open" | "closed";
  headline: string;
}

/**
 * Best-effort open/closed verdict from VisitSeoul's free-text hours/closed fields
 * (R2 — getNowInfo's whole promise). Handles the common shapes seen live:
 * "Tuesday~Sunday 09:00~18:00 (Last Admission 17:30)", "Closed every Monday",
 * "Normal hours 10:30–20:00 / Extended 10:30–20:30", midnight-crossing ranges.
 * Returns undefined when nothing parseable is present (caller then shows hours
 * without a verdict rather than guessing). `dow` 0=Sun…6=Sat, `minutes` KST.
 */
export function seoulHoursVerdict(
  hours: string | undefined,
  closed: string | undefined,
  dow: number,
  minutes: number,
): HoursVerdict | undefined {
  const h = (hours ?? "").toLowerCase();
  const c = (closed ?? "").toLowerCase();
  const today = DOW_FULL[dow];

  // 1) Explicit closed-days text naming today (e.g. "closed every monday").
  if (today && c.includes(today)) {
    return { status: "closed", headline: `🔴 Closed today (${cap(today)}).` };
  }
  // 2) Operating day-range in the hours text (e.g. "Tuesday~Sunday 09:00~18:00").
  const dr = h.match(/(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*[~\-–—]\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*/);
  if (dr) {
    const start = DOW_ABBR.indexOf(dr[1]);
    const end = DOW_ABBR.indexOf(dr[2]);
    if (start >= 0 && end >= 0) {
      const days = new Set<number>();
      for (let i = 0; i < 7; i++) {
        const d = (start + i) % 7;
        days.add(d);
        if (d === end) break;
      }
      if (!days.has(dow)) {
        return { status: "closed", headline: `🔴 Closed today — open ${cap(DOW_ABBR[start])}–${cap(DOW_ABBR[end])}.` };
      }
    }
  }
  // 3) Widest [open, close] across all HH:MM–HH:MM ranges (handles multi-part hours).
  const ranges = [...h.matchAll(/(\d{1,2}):(\d{2})\s*[~\-–—]\s*(\d{1,2}):(\d{2})/g)];
  if (ranges.length === 0) return undefined; // nothing parseable → no verdict
  let minOpen = Infinity;
  let maxClose = -Infinity;
  for (const m of ranges) {
    const o = Number(m[1]) * 60 + Number(m[2]);
    let cl = Number(m[3]) * 60 + Number(m[4]);
    if (cl <= o) cl += 24 * 60; // crosses midnight
    minOpen = Math.min(minOpen, o);
    maxClose = Math.max(maxClose, cl);
  }
  const inWindow = (t: number): boolean => t >= minOpen && t < maxClose;
  if (inWindow(minutes) || (maxClose > 24 * 60 && inWindow(minutes + 24 * 60))) {
    return { status: "open", headline: `🟢 Open now (until ${hhmm(maxClose % (24 * 60))}).` };
  }
  if (minutes < minOpen) return { status: "closed", headline: `🔴 Closed now — opens ${hhmm(minOpen)}.` };
  // Extended-hours hedge: a later time than the main close appears in the text
  // ("Extended Hours: Every Friday until 21:00") — don't confidently say "closed"
  // inside that window, since some days run later. Only for same-day ranges.
  if (maxClose <= 24 * 60) {
    const allTimes = [...h.matchAll(/(\d{1,2}):(\d{2})/g)].map((m) => Number(m[1]) * 60 + Number(m[2]));
    const latest = allTimes.length ? Math.max(...allTimes) : maxClose;
    if (latest > maxClose && minutes >= maxClose && minutes < latest) {
      return {
        status: "open",
        headline: `🟡 Possibly open — some days have extended hours (until ${hhmm(latest)}); check before you go.`,
      };
    }
  }
  return { status: "closed", headline: "🔴 Closed now — closed for the day." };
}

/** Best-effort plain text from VisitSeoul's HTML body (Naver SmartEditor markup
 *  with inline CSS). Drops style/script, tags, leftover CSS rules, decodes the
 *  common entities, and collapses whitespace. */
export function stripHtml(html?: string): string {
  if (!html) return "";
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\{[^{}]*\}/g, " ") // leftover CSS rule bodies
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function catPath(cate_depth: unknown): string | undefined {
  if (Array.isArray(cate_depth)) return cate_depth.filter(Boolean).join(" > ") || undefined;
  if (typeof cate_depth === "string") return cate_depth.trim() || undefined;
  return undefined;
}

/** Normalize a contents/list body into SeoulContent[]. Tolerates the rate-limit
 *  shape (no `data`) by returning []. */
export function parseList(json: VsListResponse): SeoulContent[] {
  const arr = Array.isArray(json?.data) ? json.data : [];
  return arr
    .filter((it) => it && it.cid && it.post_sj)
    .map((it) => ({
      cid: String(it.cid),
      title: cleanTitle(it.post_sj),
      summary: it.sumry?.replace(/\s+/g, " ").trim() || undefined,
      image: it.main_img?.trim() || undefined,
      categoryPath: catPath(it.cate_depth),
    }));
}

/** Normalize a contents/info body into a SeoulDetail (or undefined if empty). */
export function parseDetail(json: VsDetailResponse): SeoulDetail | undefined {
  const d = json?.data;
  if (!d || !d.cid) return undefined;
  const e = d.extra ?? {};
  const tr = d.traffic ?? {};
  const tags = Array.isArray(d.tag)
    ? (d.tag as unknown[]).map((s) => String(s).trim()).filter(Boolean)
    : undefined;
  const x = tr.map_position_x ? Number(tr.map_position_x) : undefined;
  const y = tr.map_position_y ? Number(tr.map_position_y) : undefined;
  return {
    cid: String(d.cid),
    title: cleanTitle(d.post_sj),
    summary: d.sumry?.replace(/\s+/g, " ").trim() || undefined,
    image: d.main_img?.trim() || undefined,
    categoryPath: catPath(d.cate_depth),
    hours: stripHtml(e.cmmn_use_time) || undefined,
    closedDays: e.closed_days?.replace(/\s+/g, " ").trim() || undefined,
    tel: e.cmmn_telno?.trim() || undefined,
    homepage: e.cmmn_hmpg_url?.trim() || undefined,
    address: (tr.new_adres || tr.adres)?.trim() || undefined,
    lng: Number.isFinite(x) ? x : undefined,
    lat: Number.isFinite(y) ? y : undefined,
    subway: tr.subway_info?.replace(/\s+/g, " ").trim() || undefined,
    tags: tags && tags.length ? tags : undefined,
    freeAdmission: e.trrsrt_use_chrge === "N" ? true : undefined,
    description: stripHtml(d.post_desc) || undefined,
  };
}

/** Pick a result only on a confident title match — VisitSeoul's keyword search is
 *  a literal substring, so "Gyeongbokgung" would otherwise surface a café whose
 *  name merely contains it. Accepts exact / prefix / strong-substring (the query
 *  is ≥half the title) / high fuzzy similarity; rejects weak substrings so the
 *  caller can fall back to another source. Pure/deterministic. */
export function pickConfidentMatch<T extends { title: string }>(place: string, items: T[]): T | undefined {
  const q = normalizeName(place);
  if (!q) return undefined;
  let best: { it: T; s: number } | undefined;
  for (const it of items) {
    const t = normalizeName(it.title);
    let s: number;
    // A bare area token ("hongdae") must NOT win as a mere prefix of a long
    // business name ("hongdaesoysaucemarinatedcrab") — require the query to be a
    // meaningful share of the title for prefix/substring matches (R1).
    if (t === q) s = 3;
    else if (t.startsWith(q) && q.length >= Math.ceil(t.length * 0.5)) s = 2.4;
    else if (t.includes(q) && q.length >= Math.ceil(t.length * 0.5)) s = 2;
    else s = similarity(place, it.title);
    if (!best || s > best.s) best = { it, s };
  }
  return best && best.s >= 1.6 ? best.it : undefined;
}

function headers(): Record<string, string> {
  return {
    "VISITSEOUL-API-KEY": ENV.VISITSEOUL_API_KEY,
    "Content-Type": "application/json;charset=UTF-8",
    Accept: "application/json;charset=UTF-8",
  };
}

const listCache = new TtlCache<SeoulContent[]>(10 * 60_000); // tourism content is static
const detailCache = new TtlCache<SeoulDetail | undefined>(30 * 60_000);

export interface SeoulSearchOptions {
  category?: string; // a VS_CATEGORY serial number
  keyword?: string;
  language?: Lang;
  limit?: number;
}

/** contents/list — search Seoul content by category and/or keyword. Cached +
 *  time-bounded; returns [] on rate-limit/empty/failure (caller grounds the gap). */
export async function searchSeoulContent(opts: SeoulSearchOptions): Promise<SeoulContent[]> {
  const lang = opts.language ?? "en";
  const kw = (opts.keyword ?? "").trim();
  const cat = opts.category ?? "";
  const key = `vs:list:${toVsLang(lang)}:${cat}:${kw}`;
  const body: Record<string, string | number> = { lang_code_id: toVsLang(lang), page_no: 1 };
  if (cat) body.com_ctgry_sn = cat;
  if (kw) body.keyword = kw;

  const items = await listCache.getOrLoad(key, async () => {
    const json = await fetchJson<VsListResponse>(API_HOST + "/contents/list", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
    });
    return parseList(json);
  });
  return typeof opts.limit === "number" ? items.slice(0, opts.limit) : items;
}

/** contents/info — full detail for a content id. Cached; undefined on miss. */
export async function getSeoulDetail(cid: string, language: Lang = "en"): Promise<SeoulDetail | undefined> {
  const key = `vs:info:${toVsLang(language)}:${cid}`;
  return detailCache.getOrLoad(key, async () => {
    const json = await fetchJson<VsDetailResponse>(API_HOST + "/contents/info", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ cid, lang_code_id: toVsLang(language) }),
    });
    return parseDetail(json);
  });
}
