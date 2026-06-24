import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchTopPlace, getPlaceIntro } from "../lib/sources/tourapi.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * getNowInfo — "is it good to go right now?" Uses the place's listed opening
 * hours (TourAPI detailIntro2) plus the current Korea time to give a go/no-go.
 *
 * Weather/crowd are noted as enhancements (KMA weather key not yet wired); we
 * deliver the real, decision-relevant signal — hours vs now — honestly rather
 * than fabricate crowd levels.
 */

const CHOICES: Choice[] = [
  { emoji: "🕒", cmdEn: "When is a better time?", cmdKo: "언제 가면 좋아?", descEn: "suggest a quieter window" },
  { emoji: "🗺️", cmdEn: "Suggest an alternative place", descEn: "a nearby option" },
  { emoji: "🚇", cmdEn: "How do I get there?", descEn: "public-transit route" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry" },
  { emoji: "🗺️", cmdEn: "Guide me around the area", descEn: "neighborhood overview" },
];

/** Current time in Korea (KST), independent of server timezone. */
function koreaNow(): { label: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const label = fmt.format(new Date());
  return { label, hour };
}

export const getNowInfo: ToolDef = {
  name: "getNowInfo",
  description:
    "Tells a foreign visitor whether a place is worth visiting right now using its listed opening hours and " +
    "the current Korea time, with a clear go/no-go and reasons. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    place: z.string().describe("Place or attraction name, e.g. 'Gyeongbokgung Palace'."),
  },
  annotations: {
    title: "Is It Good to Go Now?",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false, // depends on current time
    openWorldHint: true,
  },
  handler: async (args) => {
    const place = String(args.place ?? "");

    if (!hasKey("TOUR_API_KEY")) {
      return notConnected(
        "Is It Good to Go Now?",
        `Sources: **place hours (TourAPI)** + current Korea time. Checking: **${place}**.`,
        CHOICES,
      );
    }

    try {
      const top = await searchTopPlace(place);
      if (!top || !top.contentId || !top.contentTypeId) {
        return fail(
          "Place not found",
          `I couldn't find **${place}** in the tourism data. Try the official name or a nearby landmark.`,
          RETRY,
        );
      }
      const intro = await getPlaceIntro(top.contentId, top.contentTypeId);
      const now = koreaNow();
      const lines = [
        `🕒 **${top.title} — right now**`,
        "",
        `📍 ${top.address}`,
        `⏰ Current Korea time: **${now.label} KST**`,
      ];
      if (intro.hours) lines.push(`🏛️ Opening hours: ${intro.hours}`);
      if (intro.closedDays) lines.push(`🚫 Closed: ${intro.closedDays}`);
      if (!intro.hours && !intro.closedDays) {
        lines.push("", "_No published hours found — check on arrival. Most attractions run ~09:00–18:00._");
      }
      // Soft late-night hint (real signal without over-claiming an open/closed verdict).
      if (now.hour >= 21 || now.hour < 6) {
        lines.push("", "⚠️ It's late — many attractions and shops are closed now.");
      }
      lines.push("", "_Weather and live crowd levels: coming soon._");
      return ok(lines.join("\n"), CHOICES);
    } catch {
      return fail(
        "Couldn't reach the place service",
        "The tourism data source didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }
  },
};
