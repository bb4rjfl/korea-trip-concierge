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

// Marquee Jeju sights — seeded ahead of the live list for the sightseeing views,
// so VisitJeju's "latest" ordering doesn't bury the icons under niche operators (P8).
const JEJU_ICONS = [
  "**Seongsan Ilchulbong (Sunrise Peak)** — UNESCO tuff cone; the classic sunrise hike",
  "**Hallasan** — Korea's highest peak; day hikes and crater lake (start early)",
  "**Manjanggul Cave** — a walkable UNESCO lava tube (~11°C inside)",
  "**Cheonjiyeon & Jeongbang Falls** — Seogwipo waterfalls (Jeongbang drops into the sea)",
  "**Udo (Cow Island)** — bike or scooter the islet off the east coast",
  "**Jusangjeolli Cliffs** — hexagonal basalt columns pounded by the surf",
];

/** Map a free-text category (incl. synonyms) to a VisitJeju bucket — so an enum
 *  miss like "spaceship" no longer leaks a raw -32602 (R7); unknown → highlights. */
function normalizeJejuCategory(raw?: string): string | undefined {
  const q = (raw ?? "").trim().toLowerCase();
  if (!q) return undefined;
  if (/attraction|sight|see|tour|landmark|nature|beach|관광|명소/.test(q)) return "attraction";
  if (/rest|eat|food|dining|cuisine|맛집|먹/.test(q)) return "restaurant";
  if (/festival|event|축제|행사/.test(q)) return "festival";
  if (/shop|shopping|mall|buy|쇼핑/.test(q)) return "shopping";
  if (/accommodation|hotel|stay|guesthouse|숙소|호텔/.test(q)) return "accommodation";
  if (/theme|park|experience|체험|테마/.test(q)) return "theme";
  return undefined; // unknown → highlights (no crash)
}

export const getJejuInfo: ToolDef = {
  name: "getJejuInfo",
  description:
    "Gives a foreign visitor English travel info for Jeju Island — attractions, restaurants, festivals, " +
    "shopping, or accommodations — from the official VisitJeju data, with names, addresses, and short intros. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    category: z
      .string()
      .optional()
      .describe(`What to show: ${CATEGORIES.join(", ")} (synonyms understood; unknown shows highlights).`),
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
    const category = normalizeJejuCategory(args.category ? String(args.category) : undefined);
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
      // Lead the sightseeing views with the must-see icons (P8).
      if (!category || category === "attraction") {
        lines.push("⭐ **Must-see sights**", ...JEJU_ICONS.map((s) => `- ${s}`), "", "_More from VisitJeju:_", "");
      }
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
