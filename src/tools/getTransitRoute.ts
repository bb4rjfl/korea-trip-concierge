import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchTopPlace } from "../lib/sources/tourapi.js";
import { routesBetween, type TransitRoute } from "../lib/sources/odsay.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * getTransitRoute — subway/bus directions with fares, transfers, and time,
 * explained in English. Resolves place names to coordinates via TourAPI, then
 * routes via ODsay (src/lib/sources/odsay.ts). Needs TRANSIT + TOUR keys.
 */

const CHOICES: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh for leaving now", cmdKo: "지금 출발 새로고침", descEn: "recompute" },
  { emoji: "🚇", cmdEn: "Next subway train at a station", descEn: "real-time Seoul subway" },
  { emoji: "💳", cmdEn: "How do I pay for this?", descEn: "transit payment guide" },
  { emoji: "🗺️", cmdEn: "Tell me about the destination area", descEn: "neighborhood guide" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry routing" },
  { emoji: "💳", cmdEn: "How do I pay for transit?", descEn: "payment options" },
];

const MODE_ICON: Record<string, string> = { subway: "🚇", bus: "🚌", walk: "🚶" };

function renderRoute(r: TransitRoute, idx: number): string {
  const fare = r.fare ? ` · 💳 ₩${r.fare.toLocaleString()}` : "";
  const legs = r.legs
    .map((l) => {
      const icon = MODE_ICON[l.mode] ?? "•";
      const line = l.line ? ` **${l.line}**` : "";
      const seg = l.from && l.to ? ` ${l.from} → ${l.to}` : "";
      return `   ${icon}${line}${seg}`;
    })
    .join("\n");
  return `**Option ${idx + 1} — ${r.totalMinutes} min${fare}**\n${legs}`;
}

export const getTransitRoute: ToolDef = {
  name: "getTransitRoute",
  description:
    "Returns public-transit routes (subway/bus) between two points in Korea with fares, transfers, and time, " +
    "explained in English for foreign visitors. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    to: z.string().describe("Destination: place name, station, or address."),
    from: z
      .string()
      .optional()
      .describe("Origin: place name, station, or address. If the user hasn't said where they are, ask first."),
    departAt: z.string().optional().describe("Optional departure time (ISO 8601); defaults to now."),
  },
  annotations: {
    title: "Get Public Transit Route",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (args) => {
    const from = String(args.from ?? "").trim();
    const to = String(args.to ?? "").trim();

    // U3: a transit route needs a starting point. If the user only gave a
    // destination (common from chips), ask for the origin instead of failing.
    if (!from) {
      return fail(
        "Where are you starting from?",
        `I can route you to **${to || "your destination"}** — just tell me your starting point (a station, landmark, or address).`,
        CHOICES,
      );
    }

    if (!hasKey("TRANSIT_API_KEY") || !hasKey("TOUR_API_KEY")) {
      return notConnected(
        "Get Public Transit Route",
        `Source: **ODsay routing** + TourAPI geocoding. Route requested: **${from} → ${to}**.`,
        CHOICES,
      );
    }

    try {
      const [a, b] = await Promise.all([searchTopPlace(from), searchTopPlace(to)]);
      if (!a?.mapx || !a?.mapy || !b?.mapx || !b?.mapy) {
        return fail(
          "Couldn't locate one of the places",
          `I couldn't pin coordinates for ${!a?.mapx ? `**${from}**` : `**${to}**`}. Try a well-known landmark or station name.`,
          RETRY,
        );
      }
      const routes = await routesBetween(
        { lng: a.mapx, lat: a.mapy },
        { lng: b.mapx, lat: b.mapy },
      );
      if (routes.length === 0) {
        return fail("No transit route found", `No public-transit path from **${from}** to **${to}** was returned.`, RETRY);
      }
      const top = routes.slice(0, 2).map(renderRoute).join("\n\n");
      const body = [`🚇 **${a.title} → ${b.title}**`, "", top].join("\n");
      return ok(body, CHOICES);
    } catch {
      return fail(
        "Couldn't reach the routing service",
        "The transit routing source didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }
  },
};
