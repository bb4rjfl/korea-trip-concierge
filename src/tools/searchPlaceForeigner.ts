import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchPlacesAny, searchPlacesNearby, normalizeLang, type Place } from "../lib/sources/tourapi.js";
import { searchForeignerPois, hasPoiProvider, type PoiPlace } from "../lib/sources/poi.js";
import {
  searchSeoulContent,
  isSeoulText,
  inferSeoulCategory,
  isStalePastEvent,
  currentYearKST,
  clip,
  VS_CATEGORY,
  type SeoulContent,
} from "../lib/sources/visitseoul.js";
import { resolvePlaceCoord, findPlaceInText } from "../lib/places.js";
import { similarity } from "../lib/fuzzy.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * searchPlaceForeigner — natural-language place search weighted for
 * foreigner-friendliness. Live source: Korea Tourism Organization TourAPI
 * (English service, EngService2) via src/lib/sources/tourapi.ts.
 */

const CHOICES: Choice[] = [
  { emoji: "💳", cmdEn: "Where do foreign cards work to eat here?", descEn: "foreign-card-friendly food spots" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", cmdKo: "동네 가이드", descEn: "neighborhood overview" },
  { emoji: "🚇", cmdEn: "How do I get there?", descEn: "public-transit route" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry the search" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", descEn: "neighborhood overview instead" },
];

// Food sub-keywords → the concrete term we hand to the POI search, so "vegan
// ramen" actually searches ramen instead of the literal word "restaurant".
const FOOD_TERMS: [RegExp, string][] = [
  [/ramen|라멘|라면/i, "ramen"],
  [/sushi|초밥|스시/i, "sushi"],
  [/bbq|barbecue|gogi|고기|구이|삼겹/i, "barbecue"],
  [/pizza|피자/i, "pizza"],
  [/burger|버거|햄버거/i, "burger"],
  [/fried chicken|치킨|chimaek|치맥/i, "chicken"],
  [/vegan|vegetarian|plant.?based|비건|채식/i, "vegan"],
  [/halal|할랄/i, "halal"],
  [/pho|쌀국수|vietnam/i, "pho"],
  [/hot ?pot|전골|샤브|마라/i, "hotpot"],
  [/dumpling|만두/i, "dumpling"],
  [/seafood|해산물|회|sashimi/i, "seafood"],
  [/dessert|디저트|케이크|cake/i, "dessert"],
  [/bakery|베이커리|빵|bread/i, "bakery"],
  [/bar|pub|호프|술집|이자카야|izakaya/i, "bar"],
  [/noodle|국수|면요리/i, "noodles"],
  // Specific Korean dishes — so a dish query routes to coordinate POI (real
  // restaurants) instead of VisitSeoul area-browse (R3). More specific first.
  [/tteokbokki|떡볶이/i, "tteokbokki"],
  [/bibimbap|비빔밥/i, "bibimbap"],
  [/dak.?galbi|닭갈비|jjimdak|찜닭/i, "dakgalbi"],
  [/bulgogi|불고기/i, "bulgogi"],
  [/galbi|갈비|kalbi|short ?rib/i, "galbi"],
  [/samgyeopsal|삼겹살|pork belly/i, "samgyeopsal"],
  [/naengmyeon|냉면|cold noodle/i, "naengmyeon"],
  [/gimbap|kimbap|김밥/i, "gimbap"],
  [/jjajang|짜장|jajang/i, "jjajangmyeon"],
  [/tonkatsu|donkatsu|돈까스|돈카츠/i, "pork cutlet"],
  [/jokbal|족발|bossam|보쌈/i, "jokbal"],
  [/gopchang|곱창/i, "gopchang"],
  [/sundae|순대/i, "sundae"],
  [/samgyetang|삼계탕|ginseng chicken/i, "samgyetang"],
  [/gukbap|국밥|해장국|haejangguk/i, "gukbap"],
  [/jjigae|찌개|stew/i, "jjigae"],
  [/korean (food|cuisine|bbq|barbecue)|한식|local food/i, "korean restaurant"],
  [/brunch|브런치/i, "brunch"],
  [/cafe|coffee|카페|커피/i, "cafe"],
];

// Diet/style qualifiers we keep alongside the dish so "vegan ramen" searches
// "vegan ramen", not generic ramen (Y2).
const DIET_QUALIFIER = /\b(vegan|vegetarian|halal|kosher)\b/i;

/** Pick a concrete food keyword from the query for the POI search (else
 *  "restaurant"), preserving a diet qualifier when present (Y2). */
function foodKeyword(query: string): string {
  for (const [re, kw] of FOOD_TERMS) {
    if (!re.test(query)) continue;
    const m = query.match(DIET_QUALIFIER);
    const q = m?.[1]?.toLowerCase();
    return q && q !== kw ? `${q} ${kw}` : kw;
  }
  return "restaurant";
}

/** Infer a TourAPI category from the natural-language query when not given. */
function inferCategory(query: string, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const q = query.toLowerCase();
  if (
    /cafe|coffee|restaurant|brunch|dining|eat|food|meal|lunch|dinner|breakfast|hungry|tasty|맛집|카페|레스토랑|식당|음식/.test(q) ||
    FOOD_TERMS.some(([re]) => re.test(q))
  )
    return "food";
  if (/shop|shopping|mall|store|market|boutique|outlet|쇼핑|상점|쇼핑몰/.test(q)) return "shopping";
  // Sightseeing intent — incl. typos, "things to see", kid/family, and ja/zh terms
  // — so these route to discovery, never default into restaurants (R3).
  if (
    /mus[eu]+ms?|museam|palace|temple|park|beach|coast|mountain|hik|attraction|sight|landmark|tour|view|things?\s*to\s*(see|do)|worth\s*(see|visit)|관광|명소|구경|볼거리|해변|해수욕장|가\s*볼|観光|名所|スポット|景点|景區|景区|kid|child|family|아이|어린이|가족|子供|親子/.test(
      q,
    )
  )
    return "attraction";
  if (/hotel|stay|guesthouse|hostel|accommodation|숙소|호텔/.test(q)) return "accommodation";
  return undefined;
}

function renderPois(query: string, pois: PoiPlace[]): string {
  const lines = pois.map((p, i) => {
    const tel = p.tel ? ` · ☎ ${p.tel}` : "";
    const cat = p.category ? ` · _${p.category}_` : "";
    return `**${i + 1}. ${p.name}**${cat}\n   📍 ${p.address}${tel}`;
  });
  const out = [`🔎 **Places for** _"${query}"_ — _live local search_`, "", ...lines];
  // Diet honesty: search can't verify vegan/halal — tell the visitor to confirm (Y2).
  if (/\b(vegan|vegetarian|halal|kosher)\b/i.test(query)) {
    out.push("", "> ⚠️ I can't verify dietary options remotely — confirm vegan/halal etc. with the restaurant.");
  }
  return out.join("\n");
}

function renderPlaces(query: string, places: Place[]): string {
  if (places.length === 0) {
    return `🔎 **No places found for** _"${query}"_.\n\nTry a broader term or a nearby landmark.`;
  }
  const lines = places.map((p, i) => {
    // No inline image markdown: the chat surface renders `![photo](longURL)` as
    // raw noise (and eats the 24k budget), so we keep results text-only (N11).
    const tel = p.tel ? ` · ☎ ${p.tel}` : "";
    return `**${i + 1}. ${p.title}**\n   📍 ${p.address}${tel}`;
  });
  return [
    `🔎 **Places for** _"${query}"_ — _from Korea Tourism data_`,
    "",
    ...lines,
  ].join("\n");
}

// ── Seoul layer (VisitSeoul) ────────────────────────────────────────────────
// For Seoul, VisitSeoul's official curation is the primary source; its chips
// chain straight into "is it open now?" (getNowInfo also reads VisitSeoul).
const SEOUL_CHOICES: Choice[] = [
  { emoji: "🕒", cmdEn: "Is it good to go now?", cmdKo: "지금 가도 돼?", descEn: "live hours for a place above" },
  { emoji: "🚇", cmdEn: "How do I get there?", descEn: "public-transit route" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", cmdKo: "동네 가이드", descEn: "neighborhood overview" },
];

const SEOUL_AREAS = [
  "Myeongdong", "Hongdae", "Gangnam", "Insadong", "Itaewon", "Bukchon", "Dongdaemun",
  "Yeouido", "Jamsil", "Seongsu", "Euljiro", "Samcheong", "Garosu", "Sinsa", "Jongno",
  "Gwanghwamun", "Ikseon", "Gwangjang", "Namdaemun", "Apgujeong", "Cheongdam", "Yeonnam",
  "Hapjeong", "Mangwon", "Seochon", "Konkuk", "Sinchon",
];

/** The keyword we hand VisitSeoul to narrow to a neighborhood. "Seoul" itself is
 *  not a useful title keyword, so the bare city → category browse (empty). */
function seoulKeyword(area: string, query: string): string {
  const a = area.trim();
  if (a && !/^seoul(특별시)?$|^서울(특별시)?$/i.test(a)) return a;
  for (const name of SEOUL_AREAS) if (new RegExp(name, "i").test(query)) return name;
  return "";
}

// Iconic must-see lists, seeded ahead of the live results for a GENERIC, city-wide
// sightseeing query (e.g. "things to see in Busan") — so the flagship first-timer
// query leads with real marquee sights instead of a current exhibition (Seoul) or
// a rough romanized POI (non-Seoul) (P-V2, extended to major cities, D-021). A
// specific neighbourhood or a specific noun ("museums") skips this.
const CITY_MUSTSEE: Record<string, string[]> = {
  Seoul: [
    "**Gyeongbokgung Palace** — the grand royal palace + changing-of-the-guard",
    "**N Seoul Tower (Namsan)** — city views, cable car, sunset",
    "**Bukchon Hanok Village** — traditional hanok alleys between the palaces",
    "**Myeongdong** — shopping + evening street food",
    "**Insadong & Gwangjang Market** — crafts, teahouses, classic street eats",
    "**Han River Park (Hangang)** — riverside picnics & bike paths",
  ],
  Busan: [
    "**Haeundae Beach** — the famous bay + Blue Line beach train",
    "**Gamcheon Culture Village** — pastel hillside art village",
    "**Haedong Yonggungsa** — seaside temple on the rocks",
    "**Jagalchi Market & Nampo-dong** — huge fish market + BIFF Square",
    "**Gwangalli Beach** — café strip facing the lit Gwangan Bridge",
    "**Taejongdae / Oryukdo Skywalk** — coastal cliffs and sea views",
  ],
  Jeju: [
    "**Seongsan Ilchulbong (Sunrise Peak)** — UNESCO tuff cone, sunrise hike",
    "**Hallasan** — Korea's highest peak (start early)",
    "**Manjanggul Cave** — a walkable UNESCO lava tube",
    "**Cheonjiyeon & Jeongbang Falls** — Seogwipo waterfalls",
    "**Udo (Cow Island)** — bike the islet off the east coast",
    "**Seopjikoji & Jusangjeolli** — coastal cape and basalt cliffs",
  ],
  Gyeongju: [
    "**Bulguksa Temple & Seokguram Grotto** — UNESCO Silla masterpieces",
    "**Daereungwon Tumuli Park** — grassy royal burial mounds (Cheonmachong)",
    "**Cheomseongdae** — the ancient stone observatory",
    "**Donggung Palace & Wolji Pond** — stunning at night",
    "**Gyeongju National Museum** — Silla gold crowns & the Emille Bell",
  ],
};
const SEOUL_GENERIC_RE =
  /things?\s*to\s*(see|do)|worth\s*(see|visit)|sightsee|what\s*to\s*(see|do)|must.?see|attraction|landmark|명소|관광|볼거리|가\s*볼|観光|觀光|观光|名所|景点|景區|景区|景點/i;

/** Detect the headline city named in a generic query, for must-see seeding. */
function detectMustSeeCity(query: string, area: string): keyof typeof CITY_MUSTSEE | null {
  const t = `${area} ${query}`;
  if (/\bseoul\b|서울|ソウル|首爾|首尔/i.test(t)) return "Seoul";
  if (/busan|부산|釜山|プサン/i.test(t)) return "Busan";
  if (/jeju|제주|济州|済州|濟州|チェジュ/i.test(t)) return "Jeju";
  if (/gyeongju|경주|慶州/i.test(t)) return "Gyeongju";
  return null;
}

/** Lead block of curated must-see sights for a generic, city-wide sightseeing
 *  query; "" otherwise. Pure/exported for testing. (P-V2, multi-city) */
export function cityMustSeeLead(query: string, area: string): string {
  if (!SEOUL_GENERIC_RE.test(query)) return ""; // a specific noun (e.g. "museums") → targeted
  // A specific Seoul neighbourhood keyword → targeted VisitSeoul results, no seed.
  if (seoulKeyword(area, query) && detectMustSeeCity(query, area) === "Seoul") return "";
  const city = detectMustSeeCity(query, area);
  if (!city) return "";
  return (
    [`⭐ **${city} must-see**`, ...CITY_MUSTSEE[city].map((s) => `- ${s}`), "", "_More ideas below:_", ""].join("\n") + "\n"
  );
}

function dedupeByTitle(items: SeoulContent[], limit: number): SeoulContent[] {
  const seen = new Set<string>();
  const out: SeoulContent[] = [];
  for (const it of items) {
    const k = it.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

function renderSeoul(query: string, items: SeoulContent[]): string {
  const lines = items.map((p, i) => {
    // Text-only (no raw image markdown) — see renderPlaces (N11).
    const cat = p.categoryPath ? ` · _${p.categoryPath.split(">").pop()?.trim()}_` : "";
    const sum = p.summary ? `\n   ${clip(p.summary, 180)}` : "";
    return `**${i + 1}. ${p.title}**${cat}${sum}`;
  });
  return [
    `🔎 **Seoul ideas for** _"${query}"_ — _official Seoul Tourism_`,
    "",
    ...lines,
  ].join("\n");
}

// Ephemeral content (a current exhibition/concert/festival) that the "latest"
// sort surfaces first — demoted for general sightseeing so real, permanent places
// lead "things to see in Seoul" (P-V2).
const EPHEMERAL_RE = /festival|exhibition|concert|performance|\bshow\b|biennale|fair\b|행사|축제|전시|공연|콘서트|페스티벌/i;

/** Rank Seoul results for the query: float a specific noun (museum/palace/gallery)
 *  up (Y3), and demote ephemeral events/exhibitions for general sightseeing intent
 *  (P-V2) — unless the user explicitly asked for events. */
function rankByIntent(items: SeoulContent[], query: string): SeoulContent[] {
  const q = query.toLowerCase();
  const want = /museum|박물관/.test(q)
    ? /museum/i
    : /palace|궁/.test(q)
      ? /palace|궁/i
      : /gallery|미술관/.test(q)
        ? /galler|미술/i
        : null;
  const wantsEvents = /festival|event|exhibition|concert|performance|\bshow\b|축제|행사|전시|공연|콘서트/.test(q);
  if (!want && wantsEvents) return items; // user wants events → keep the live order
  const score = (c: SeoulContent): number => {
    let s = 0;
    if (want) s += (want.test(c.title) ? 2 : 0) + (c.categoryPath && want.test(c.categoryPath) ? 1 : 0);
    if (!wantsEvents && (EPHEMERAL_RE.test(c.title) || (c.categoryPath && EPHEMERAL_RE.test(c.categoryPath)))) s -= 2;
    return s;
  };
  return items
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

/** Fuzzy-correct a typo'd Seoul area to a known name ("Seongsoo"→"Seongsu") so it
 *  resolves instead of returning "no places" (Y6). Leaves known/unknown as-is. */
function correctArea(area: string): string {
  const a = area.trim();
  if (!a || resolvePlaceCoord(a)) return a;
  let best = "";
  let bestS = 0;
  for (const name of SEOUL_AREAS) {
    const s = similarity(a, name);
    if (s > bestS) {
      bestS = s;
      best = name;
    }
  }
  return bestS >= 0.7 ? best : a;
}

/**
 * VisitSeoul (Seoul, non-dining) — official curated discovery. Returns rendered
 * Markdown when it has picks, else "" so the caller grounds the gap with the
 * national sources (TourAPI/POI). Dining is handled by coordinate POI elsewhere.
 */
async function trySeoul(
  query: string,
  area: string,
  cat: string | undefined,
  language: ReturnType<typeof normalizeLang>,
): Promise<string | undefined> {
  const vsCat =
    inferSeoulCategory([cat, query, area].filter(Boolean).join(" ")) ??
    (cat === "shopping" ? VS_CATEGORY.shopping : cat === "accommodation" ? VS_CATEGORY.accommodation : undefined);
  const kw = seoulKeyword(area, query);
  try {
    // 1) area-narrowed within category; broaden if thin so we still lead with VS.
    let vs = await searchSeoulContent({ category: vsCat, keyword: kw, language, limit: 8 });
    if (vs.length < 3) {
      const broaden = vsCat ?? VS_CATEGORY.culture; // generic discovery → things to see
      const more = await searchSeoulContent({ category: broaden, keyword: kw, language, limit: 8 });
      vs = dedupeByTitle([...vs, ...more], 8);
    }
    // Drop stale past-dated events (Y1) and float intent-matching picks (Y3).
    const year = currentYearKST();
    vs = rankByIntent(
      vs.filter((c) => !isStalePastEvent(c.title, year)),
      query,
    ).slice(0, 6);
    return vs.length ? renderSeoul(query, vs) : undefined;
  } catch {
    return undefined; // fall through to national grounding
  }
}

export const searchPlaceForeigner: ToolDef = {
  name: "searchPlaceForeigner",
  description:
    "Recommends places in Korea from a foreign visitor's natural-language intent, weighting " +
    "foreigner-friendliness (English support, walk-in, foreign-card acceptance). " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    query: z
      .string()
      .optional()
      .describe("Natural-language intent, e.g. 'quiet cafe near Hongdae with English menu'. If omitted, give an area."),
    area: z.string().optional().describe("Optional area/neighborhood to focus on."),
    category: z.string().optional().describe("Optional category: food, cafe, attraction, shopping, culture."),
    language: z
      .string()
      .optional()
      .describe("Result language: en (default), ja, zh (Chinese Simplified), ko — full names like 'english' also work. Match the visitor's language."),
  },
  annotations: {
    title: "Search Places for Foreign Visitors",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (args) => {
    const query = String(args.query ?? "");
    const area = correctArea(args.area ? String(args.area) : ""); // typo → known area (Y6)
    const category = args.category ? String(args.category) : undefined;
    const cat = inferCategory(query, category);
    const language = normalizeLang(args.language as string | undefined);
    // Curated must-see lead for a generic, city-wide sightseeing query (P-V2/D-021);
    // "" otherwise. Prepended to whichever result path runs.
    const mustSee = cat !== "food" ? cityMustSeeLead(query, area) : "";

    // No query and no area → ask, instead of letting an empty search run (N3).
    if (!query.trim() && !area.trim()) {
      return ok(
        '🔎 **What are you looking for?**\n\nTell me a place type and/or an area — e.g. _"quiet cafe in Hongdae"_, _"things to see in Seoul"_, or _"vegan food near Itaewon"_.',
        CHOICES,
      );
    }

    // "temple stay" with no city context → route to Seoul's VisitSeoul templestay
    // curation (its best English coverage) instead of generic TourAPI geography
    // (P3). A named non-Seoul city (e.g. "temple stay in Busan") opts out.
    let forceSeoulTemple = false;
    if (/temple\s*stay|templestay|템플스테이/i.test(query) && !area.trim()) {
      const qc = findPlaceInText(query);
      forceSeoulTemple = !qc || isSeoulText(qc.label);
    }

    // Seoul + non-dining → VisitSeoul official curation leads (D-010): pre-translated
    // English summaries/hours/subway for the sightseeing, shopping, culture, nature
    // and experience places visitors ask about. Dining stays on coordinate POI
    // below (stronger for restaurants); any VisitSeoul gap falls through to the
    // national grounding sources (TourAPI/POI).
    if (cat !== "food" && hasKey("VISITSEOUL_API_KEY") && (isSeoulText(area) || isSeoulText(query) || forceSeoulTemple)) {
      const seoul = await trySeoul(query, area, cat, language);
      if (seoul) return ok(mustSee + seoul, SEOUL_CHOICES);
    }

    // Dining queries → richer comprehensive POI (Naver/Foursquare, converted to
    // English) rather than TourAPI's sparse tourism dining data.
    if (cat === "food" && hasPoiProvider()) {
      try {
        const what = foodKeyword(query); // concrete term (ramen/sushi/vegan…) not just "restaurant"
        const coord = resolvePlaceCoord(area) ?? resolvePlaceCoord(query) ?? findPlaceInText(query) ?? findPlaceInText(area);
        const pois = await searchForeignerPois({
          area: area || query,
          query: what,
          coord: coord ? { lat: coord.lat, lng: coord.lng } : undefined,
          limit: 6,
        });
        if (pois.length) return ok(renderPois(query, pois), CHOICES);
      } catch {
        /* fall through to TourAPI */
      }
    }

    if (!hasKey("TOUR_API_KEY")) {
      return notConnected(
        "Search Places",
        `Sources: **comprehensive POI (Naver/Foursquare) + Korea Tourism TourAPI**. Query: _"${query.slice(0, 120)}"_.`,
        CHOICES,
      );
    }

    // Try the combined phrase first, then fall back to area-only / query-only so
    // a literal "cafe Hongdae" miss still surfaces useful results.
    const candidates = [[query, area].filter(Boolean).join(" "), area, query];
    try {
      const places = await searchPlacesAny(candidates, { category: cat, limit: 5, language });
      // The English TourAPI is sparse (~15k vs ~50k entries). When it's thin and
      // we know the area's coordinates, broaden with the much larger KOREAN
      // dataset by radius (romanized) — far better national/long-tail coverage.
      if (places.length < 5 && language === "en") {
        const coord = resolvePlaceCoord(area) ?? resolvePlaceCoord(query) ?? findPlaceInText(query) ?? findPlaceInText(area);
        if (coord) {
          const ko = await searchPlacesNearby({
            lat: coord.lat,
            lng: coord.lng,
            radius: 2000,
            category: cat,
            limit: 8,
            language: "ko",
          });
          const seen = new Set(places.map((p) => p.title.toLowerCase()));
          for (const p of ko) {
            if (places.length >= 6) break;
            const k = p.title.toLowerCase();
            if (!seen.has(k)) {
              seen.add(k);
              places.push(p);
            }
          }
        }
      }
      return ok(mustSee + renderPlaces(query, places), CHOICES);
    } catch {
      // Even when live data is slow, still serve the curated must-see lead so the
      // fallback doesn't vanish exactly when the API fails (P-V2 cold case).
      if (mustSee) {
        return ok(
          mustSee + "_Live results are slow right now — the must-see picks above are a solid start; tap one to check it, or try again._",
          CHOICES,
        );
      }
      return fail(
        "Couldn't reach the places service",
        "The Korea Tourism data source didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }
  },
};
