import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchJeju } from "../lib/sources/jeju.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * getJejuInfo — Jeju Island travel info in English, from the VisitJeju Open API
 * (src/lib/sources/jeju.ts). Jeju is a top foreign destination yet thin in the
 * nationwide TourAPI, so this dedicated source enriches the concierge with
 * attractions, restaurants, and festivals already localized to English.
 */

const CHOICES: Choice[] = [
  { emoji: "🏞️", cmdEn: "Jeju attractions", descEn: "top sights to visit" },
  { emoji: "🍴", cmdEn: "Jeju restaurants", descEn: "where to eat" },
  { emoji: "🎉", cmdEn: "Jeju festivals", descEn: "events happening on the island" },
  { emoji: "🗺️", cmdEn: "How do I get around Jeju?", descEn: "transit options" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry" },
  { emoji: "🏞️", cmdEn: "Jeju attractions", descEn: "top sights to visit" },
];

const CATEGORIES = ["attraction", "restaurant", "festival", "shopping", "accommodation", "theme"] as const;

export const getJejuInfo: ToolDef = {
  name: "getJejuInfo",
  description:
    "Gives a foreign visitor English travel info for Jeju Island — attractions, restaurants, festivals, " +
    "shopping, or accommodations — from the official VisitJeju data, with names, addresses, and short intros. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    category: z
      .enum(CATEGORIES)
      .optional()
      .describe("What to show: attraction, restaurant, festival, shopping, accommodation, or theme."),
    limit: z.number().int().min(1).max(10).optional().describe("How many results (default 6)."),
  },
  annotations: {
    title: "Jeju Island Info",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (args) => {
    const category = args.category ? String(args.category) : undefined;
    const limit = typeof args.limit === "number" ? args.limit : 6;
    const label = category ?? "highlights";

    if (!hasKey("JEJU_API_KEY")) {
      return notConnected(
        "Jeju Island Info",
        `Source: **VisitJeju Open API** (English). Showing Jeju **${label}**.`,
        CHOICES,
      );
    }

    try {
      const places = await searchJeju({ category, limit });
      if (places.length === 0) {
        return fail(
          "No Jeju results right now",
          "I couldn't load Jeju info for that category. Try a different one (attraction, restaurant, festival).",
          RETRY,
        );
      }
      const lines = [`🌴 **Jeju Island — ${label}**`, ""];
      for (const p of places) {
        lines.push(`**${p.title}**${p.category ? ` · _${p.category}_` : ""}`);
        if (p.address) lines.push(`📍 ${p.address}`);
        if (p.intro) lines.push(p.intro.length > 160 ? p.intro.slice(0, 157) + "..." : p.intro);
        if (p.tel) lines.push(`☎️ ${p.tel}`);
        lines.push("");
      }
      lines.push("_Tip: ask for a transit route to plan how to reach any of these._");
      return ok(lines.join("\n"), CHOICES);
    } catch {
      return fail(
        "Couldn't reach the Jeju info service",
        "The VisitJeju source didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }
  },
};
