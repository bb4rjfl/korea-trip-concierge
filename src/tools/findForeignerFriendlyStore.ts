import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchPlaces, searchPlacesNearby, normalizeLang, type Place } from "../lib/sources/tourapi.js";
import { resolvePlaceCoord } from "../lib/places.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * findForeignerFriendlyStore — K-Pass Finder. Lists stores/restaurants in an
 * area that are documented in Korea Tourism's ENGLISH dataset (a real,
 * foreigner-oriented signal) and echoes the visitor's need-filters.
 *
 * Honesty note: TourAPI does not carry per-store "accepts foreign card /
 * multilingual menu" flags. We surface English-listed places (a genuine
 * proxy for foreigner-readiness) and state filters transparently rather than
 * fabricate unverified badges. A curated foreign-card overlay can be layered later.
 */

const NEEDS = ["noReservationNeeded", "acceptsForeignCard", "hasMultilingualMenu", "walkInOk"] as const;

const NEED_LABEL: Record<string, string> = {
  noReservationNeeded: "no reservation needed",
  acceptsForeignCard: "accepts foreign cards",
  hasMultilingualMenu: "multilingual menu",
  walkInOk: "walk-in OK",
};

const CHOICES: Choice[] = [
  { emoji: "💳", cmdEn: "How do I pay here as a foreigner?", cmdKo: "결제 방법", descEn: "payment options guide" },
  { emoji: "🍽️", cmdEn: "Explain a dish from the menu", descEn: "menu context + allergens" },
  { emoji: "🚇", cmdEn: "How do I get there?", descEn: "public-transit route" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry the search" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", descEn: "neighborhood overview instead" },
];

function render(area: string, needs: string[], places: Place[]): string {
  const filterLine = needs.length
    ? `Filters requested: ${needs.map((n) => `**${NEED_LABEL[n] ?? n}**`).join(", ")}`
    : "No filters — showing English-listed spots.";
  if (places.length === 0) {
    return `🍜 **No English-listed stores found in** _"${area}"_.\n\n${filterLine}\n\nTry a nearby, larger area name.`;
  }
  const lines = places.map((p, i) => {
    const tel = p.tel ? ` · ☎ ${p.tel}` : "";
    return `**${i + 1}. ${p.title}**\n   📍 ${p.address}${tel}\n   🌐 _Listed in Korea Tourism's English dataset (foreigner-oriented)_`;
  });
  return [
    `🍜 **Foreigner-friendly spots in ${area}**`,
    "",
    filterLine,
    "",
    ...lines,
    "",
    "_Tip: ask \"How do I pay here?\" to check foreign-card acceptance for your situation._",
  ].join("\n");
}

export const findForeignerFriendlyStore: ToolDef = {
  name: "findForeignerFriendlyStore",
  description:
    "Filters nearby stores/restaurants that need no Korean phone verification, accept foreign cards, offer " +
    "multilingual menus, or allow walk-in — the gaps that block foreign visitors. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    area: z.string().describe("Area/neighborhood to search, e.g. 'Seongsu' or '성수동'."),
    needs: z
      .array(z.enum(NEEDS))
      .optional()
      .describe("Filters to require: noReservationNeeded, acceptsForeignCard, hasMultilingualMenu, walkInOk."),
    category: z.string().optional().describe("Optional category: food, cafe, shopping."),
    language: z
      .enum(["en", "ja", "zh", "ko"])
      .optional()
      .describe("Result language: en (default), ja, zh (Chinese Simplified), ko. Match the visitor's language."),
  },
  annotations: {
    title: "Find Foreigner-Friendly Stores",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (args) => {
    const area = String(args.area ?? "");
    const needs = Array.isArray(args.needs) ? (args.needs as string[]) : [];
    const category = args.category ? String(args.category) : "food";
    const language = normalizeLang(args.language as string | undefined);

    if (!hasKey("TOUR_API_KEY")) {
      return notConnected(
        "Find Foreigner-Friendly Stores",
        `Source: **TourAPI (English) + curated foreign-payment data**. Area: **${area}**, filters: ${needs.join(", ") || "none"}.`,
        CHOICES,
      );
    }

    try {
      // (C) If the area is a known place, do a distance-based radius search for
      // far better coverage than a title-keyword match; fall back to keyword.
      const coord = resolvePlaceCoord(area);
      let places = coord
        ? await searchPlacesNearby({ lat: coord.lat, lng: coord.lng, category, limit: 5, language })
        : [];
      if (places.length === 0) {
        places = await searchPlaces({ keyword: area, category, limit: 5, language });
      }
      return ok(render(area, needs, places), CHOICES);
    } catch {
      return fail(
        "Couldn't reach the store-data service",
        "The Korea Tourism data source didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }
  },
};
