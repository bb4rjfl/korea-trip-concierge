import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchPlacesAny, searchPlacesNearby, normalizeLang, type Place } from "../lib/sources/tourapi.js";
import { searchForeignerPois, hasPoiProvider, type PoiPlace } from "../lib/sources/poi.js";
import { resolvePlaceCoord } from "../lib/places.js";
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
  [/brunch|브런치/i, "brunch"],
  [/cafe|coffee|카페|커피/i, "cafe"],
];

/** Pick a concrete food keyword from the query for the POI search (else "restaurant"). */
function foodKeyword(query: string): string {
  for (const [re, kw] of FOOD_TERMS) if (re.test(query)) return kw;
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
  if (/museum|palace|temple|park|attraction|sight|landmark|tour|view|관광|명소|구경/.test(q)) return "attraction";
  if (/hotel|stay|guesthouse|hostel|accommodation|숙소|호텔/.test(q)) return "accommodation";
  return undefined;
}

function renderPois(query: string, pois: PoiPlace[]): string {
  const lines = pois.map((p, i) => {
    const tel = p.tel ? ` · ☎ ${p.tel}` : "";
    const cat = p.category ? ` · _${p.category}_` : "";
    return `**${i + 1}. ${p.name}**${cat}\n   📍 ${p.address}${tel}`;
  });
  return [`🔎 **Places for** _"${query}"_ — _live local search_`, "", ...lines].join("\n");
}

function renderPlaces(query: string, places: Place[]): string {
  if (places.length === 0) {
    return `🔎 **No places found for** _"${query}"_.\n\nTry a broader term or a nearby landmark.`;
  }
  const lines = places.map((p, i) => {
    // Only the top 2 results get a thumbnail — keeps the response scannable and
    // well under the 24k budget (U8).
    const img = p.image && i < 2 ? ` ![photo](${p.image})` : "";
    const tel = p.tel ? ` · ☎ ${p.tel}` : "";
    return `**${i + 1}. ${p.title}**${img}\n   📍 ${p.address}${tel}`;
  });
  return [
    `🔎 **Places for** _"${query}"_ — _from Korea Tourism data_`,
    "",
    ...lines,
  ].join("\n");
}

export const searchPlaceForeigner: ToolDef = {
  name: "searchPlaceForeigner",
  description:
    "Recommends places in Korea from a foreign visitor's natural-language intent, weighting " +
    "foreigner-friendliness (English support, walk-in, foreign-card acceptance). " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    query: z.string().describe("Natural-language intent, e.g. 'quiet cafe near Hongdae with English menu'."),
    area: z.string().optional().describe("Optional area/neighborhood to focus on."),
    category: z.string().optional().describe("Optional category: food, cafe, attraction, shopping, culture."),
    language: z
      .enum(["en", "ja", "zh", "ko"])
      .optional()
      .describe("Result language: en (default), ja, zh (Chinese Simplified), ko. Match the visitor's language."),
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
    const area = args.area ? String(args.area) : "";
    const category = args.category ? String(args.category) : undefined;
    const cat = inferCategory(query, category);
    const language = normalizeLang(args.language as string | undefined);

    // Dining queries → richer comprehensive POI (Naver/Foursquare, converted to
    // English) rather than TourAPI's sparse tourism dining data.
    if (cat === "food" && hasPoiProvider()) {
      try {
        const what = foodKeyword(query); // concrete term (ramen/sushi/vegan…) not just "restaurant"
        const coord = resolvePlaceCoord(area) ?? resolvePlaceCoord(query);
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
        const coord = resolvePlaceCoord(area) ?? resolvePlaceCoord(query);
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
      return ok(renderPlaces(query, places), CHOICES);
    } catch {
      return fail(
        "Couldn't reach the places service",
        "The Korea Tourism data source didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }
  },
};
