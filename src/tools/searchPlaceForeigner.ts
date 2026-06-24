import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchPlaces, type Place } from "../lib/sources/tourapi.js";
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

function renderPlaces(query: string, places: Place[]): string {
  if (places.length === 0) {
    return `🔎 **No places found for** _"${query}"_.\n\nTry a broader term or a nearby landmark.`;
  }
  const lines = places.map((p, i) => {
    const img = p.image ? ` ![photo](${p.image})` : "";
    const tel = p.tel ? ` · ☎ ${p.tel}` : "";
    return `**${i + 1}. ${p.title}**${img}\n   📍 ${p.address}${tel}`;
  });
  return [
    `🔎 **Places for** _"${query}"_ — _English-friendly results from Korea Tourism data_`,
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

    const keyword = [query, area].filter(Boolean).join(" ").trim();
    try {
      const places = await searchPlaces({ keyword, category, limit: 5 });
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
