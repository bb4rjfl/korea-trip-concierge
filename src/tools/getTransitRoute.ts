import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchTopPlace } from "../lib/sources/tourapi.js";
import { routesBetween, type TransitRoute } from "../lib/sources/odsay.js";
import { romanizeText } from "../lib/romanize.js";
import { resolvePlaceCoord } from "../lib/places.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/** Geocode a place: curated index first (instant + accurate), then TourAPI. */
async function geocode(name: string): Promise<{ lng: number; lat: number } | undefined> {
  const curated = resolvePlaceCoord(name);
  if (curated) return { lng: curated.lng, lat: curated.lat };
  const p = await searchTopPlace(name);
  return p?.mapx != null && p?.mapy != null ? { lng: p.mapx, lat: p.mapy } : undefined;
}

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

/** Primary mode of a route — used to label the option (🚇 / 🚌 / both). */
function primaryMode(r: TransitRoute): "subway" | "bus" | "mixed" {
  const transit = r.legs.filter((l) => l.mode !== "walk");
  const hasSub = transit.some((l) => l.mode === "subway");
  const hasBus = transit.some((l) => l.mode === "bus");
  if (hasSub && hasBus) return "mixed";
  if (hasSub) return "subway";
  if (hasBus) return "bus";
  return "mixed";
}

const MODE_LABEL: Record<string, string> = {
  subway: "🚇 Subway",
  bus: "🚌 Bus",
  mixed: "🚇🚌 Subway + Bus",
};

function renderRoute(r: TransitRoute, idx: number): string {
  const fare = r.fare ? ` · 💳 ₩${r.fare.toLocaleString()}` : "";
  const legs = r.legs
    .map((l) => {
      const icon = MODE_ICON[l.mode] ?? "•";
      // Romanize Korean line/station names from ODsay for English-first readers (U1).
      const line = l.line ? ` **${romanizeText(l.line)}**` : "";
      const seg = l.from && l.to ? ` ${romanizeText(l.from)} → ${romanizeText(l.to)}` : "";
      return `   ${icon}${line}${seg}`;
    })
    .join("\n");
  return `**Option ${idx + 1} · ${MODE_LABEL[primaryMode(r)]} — ${r.totalMinutes} min${fare}**\n${legs}`;
}

/**
 * Build dynamic "track this" chips from the actual routes so the user can pick a
 * mode and jump straight into live tracking (journey UX). A subway option →
 * "Track subway at {boarding}", a bus option → "Track bus {no}".
 */
function trackChips(routes: TransitRoute[]): Choice[] {
  const legs = routes.flatMap((r) => r.legs);
  const subLeg = legs.find((l) => l.mode === "subway" && l.from);
  const busLeg = legs.find((l) => l.mode === "bus" && l.line);
  const chips: Choice[] = [];
  if (subLeg?.from) {
    chips.push({
      emoji: "🚇",
      cmdEn: `Track the subway at ${romanizeText(subLeg.from)}`,
      descEn: "live arrivals + train position",
    });
  }
  if (busLeg?.line) {
    chips.push({ emoji: "🚌", cmdEn: `Track bus ${romanizeText(busLeg.line)}`, descEn: "where the bus is + when it arrives" });
  }
  chips.push({ emoji: "💳", cmdEn: "How do I pay for this?", descEn: "transit payment guide" });
  // Always offer a recompute; add destination-area only if there's still room.
  if (chips.length < 3) chips.push({ emoji: "🗺️", cmdEn: "Tell me about the destination area", descEn: "neighborhood guide" });
  chips.push({ emoji: "🔄", cmdEn: "Refresh for leaving now", cmdKo: "지금 출발 새로고침", descEn: "recompute" });
  return chips.slice(0, 4);
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
      const [a, b] = await Promise.all([geocode(from), geocode(to)]);
      if (!a || !b) {
        return fail(
          "Couldn't locate one of the places",
          `I couldn't pin coordinates for ${!a ? `**${from}**` : `**${to}**`}. Try a well-known landmark or station name.`,
          RETRY,
        );
      }
      const routes = await routesBetween(a, b);
      if (routes.length === 0) {
        return fail("No transit route found", `No public-transit path from **${from}** to **${to}** was returned.`, RETRY);
      }
      const top = routes.slice(0, 2).map(renderRoute).join("\n\n");
      // Use the user's own place wording in the header (geocoding may resolve to a
      // nearby shop with an ugly name; the route itself is correct).
      const body = [`🚇🚌 **${from} → ${to}** — pick how you want to go`, "", top].join("\n");
      // Dynamic chips: tap a mode to jump into live tracking (journey UX, Phase 1).
      return ok(body, trackChips(routes.slice(0, 2)));
    } catch {
      return fail(
        "Couldn't reach the routing service",
        "The transit routing source didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }
  },
};
