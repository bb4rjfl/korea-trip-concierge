import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchPlacesAny, normalizeLang, type Place } from "../lib/sources/tourapi.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * searchPlaceForeigner — natural-language place search weighted for
 * foreigner-friendliness. Live source: Korea Tourism Organization TourAPI
 * (English service, EngService2) via src/lib/sources/tourapi.ts.
 */

const CHOICES: Choice[] = [
  { emoji: "🍜", cmdEn: "Only show foreign-card-friendly spots", descEn: "filter to foreigner-friendly stores" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", cmdKo: "동네 가이드", descEn: "neighborhood overview" },
  { emoji: "🚇", cmdEn: "How do I get there?", descEn: "public-transit route" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry the search" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", descEn: "neighborhood overview instead" },
];

/** Infer a TourAPI category from the natural-language query when not given. */
function inferCategory(query: string, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const q = query.toLowerCase();
  if (/cafe|coffee|restaurant|brunch|dining|eat|food|맛집|카페|레스토랑/.test(q)) return "food";
  if (/shop|shopping|mall|store|market|boutique|쇼핑|상점/.test(q)) return "shopping";
  if (/museum|palace|temple|park|attraction|sight|landmark|tour|관광|명소/.test(q)) return "attraction";
  if (/hotel|stay|guesthouse|hostel|accommodation|숙소|호텔/.test(q)) return "accommodation";
  return undefined;
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

    if (!hasKey("TOUR_API_KEY")) {
      return notConnected(
        "Search Places",
        `Source: **Korea Tourism Organization TourAPI** (English service). Query received: _"${query.slice(0, 120)}"_.`,
        CHOICES,
      );
    }

    // Try the combined phrase first, then fall back to area-only / query-only so
    // a literal "cafe Hongdae" miss still surfaces useful results. Infer the
    // category from the query (e.g. "cafe" → food) so the type filter applies.
    const candidates = [[query, area].filter(Boolean).join(" "), area, query];
    const cat = inferCategory(query, category);
    const language = normalizeLang(args.language as string | undefined);
    try {
      const places = await searchPlacesAny(candidates, { category: cat, limit: 5, language });
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
