import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { trackBus, resolveCityCode } from "../lib/sources/tago.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/** Seoul is not in TAGO; it has a separate real-time bus source. */
function isSeoul(city: string): boolean {
  return /seoul|서울/i.test(city.trim());
}

/**
 * trackBusArrival — K-Bus Companion (query, not push). Real-time stops-remaining
 * + ETA for a specific bus toward the user's drop-off stop, via TAGO
 * (src/lib/sources/tago.ts). NOT a push notification — the user re-asks via the
 * Refresh chip; stateless + short cache keeps each call fresh.
 */

const CHOICES: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh", cmdKo: "다시 확인", descEn: "update live position" },
  { emoji: "🚏", cmdEn: "Am I close?", cmdKo: "거의 다 왔어?", descEn: "re-check one stop before" },
  { emoji: "🗺️", cmdEn: "Route after I get off", descEn: "directions from the drop-off stop" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh", cmdKo: "다시 확인", descEn: "try the live lookup again" },
  { emoji: "🚇", cmdEn: "Plan a transit route instead", descEn: "subway/bus directions" },
];

export const trackBusArrival: ToolDef = {
  name: "trackBusArrival",
  description:
    "Looks up the real-time position of a specific Korean city bus and how many stops remain until the " +
    "user's drop-off stop, with an English heads-up message. Query-based (refresh to update). " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    busNumber: z.string().describe("Bus route number, e.g. '143'."),
    dropOffStop: z.string().describe("The stop where the user wants to get off."),
    city: z
      .string()
      .describe("City the bus runs in, e.g. 'Busan', 'Daejeon', 'Incheon'. Required to locate the stop."),
    currentStop: z.string().optional().describe("Optional current stop to measure from."),
  },
  annotations: {
    title: "Track Bus Arrival",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false, // real-time: same args, changing result
    openWorldHint: true,
  },
  handler: async (args) => {
    const bus = String(args.busNumber ?? "");
    const stop = String(args.dropOffStop ?? "");
    const city = String(args.city ?? "");

    if (!hasKey("BUS_API_KEY")) {
      return notConnected(
        "Track Bus Arrival",
        `Source: **TAGO (국토교통부) real-time bus Open API**. Tracking **Bus ${bus} → ${stop}**.`,
        CHOICES,
      );
    }

    // Seoul is not covered by TAGO — it has its own real-time bus source, which
    // is wired separately. Until that is connected, steer the user to routing.
    if (isSeoul(city)) {
      return fail(
        "Seoul real-time bus tracking is being connected",
        "Seoul buses aren't in the nationwide (TAGO) source. Seoul's own live-bus feed is being added — for now, tap **Plan a transit route** for Seoul subway + bus directions.",
        RETRY,
      );
    }

    if (!city.trim()) {
      return fail(
        "Which city is this bus in?",
        "Korean bus stops are looked up per city. Tell me the city (e.g. Busan, Daejeon, Incheon) so I can find the stop.",
        RETRY,
      );
    }

    try {
      const cityCode = await resolveCityCode(city);
      if (!cityCode) {
        return fail(
          `I couldn't recognize the city "${city}"`,
          "Try a major city name in English (e.g. Busan, Daegu, Incheon, Daejeon, Gwangju, Ulsan, Jeju) or the Korean city name.",
          RETRY,
        );
      }
      const result = await trackBus(bus, stop, cityCode);
      if (!result) {
        return fail(
          `Bus ${bus} isn't arriving at ${stop} right now`,
          "No live arrival found — the bus may not serve this stop, the stop name may differ, or service may have ended. Try the exact stop name shown on the sign.",
          RETRY,
        );
      }
      const { arrival } = result;
      const stopsWord = arrival.stopsRemaining === 1 ? "stop" : "stops";
      // Show the user's own stop wording (their language) rather than the API's
      // Korean stop name — English-first UX (U1).
      const body = [
        `🚌 **Bus ${arrival.routeNo} → ${stop}**`,
        "",
        `Currently **${arrival.stopsRemaining} ${stopsWord} away**, about **${arrival.etaMinutes} min**.`,
        arrival.stopsRemaining <= 1
          ? "🛑 **Almost there — get ready to get off!**"
          : "Tap **Refresh** as you ride to keep it live.",
      ].join("\n");
      return ok(body, CHOICES);
    } catch {
      return fail(
        "Couldn't reach the live bus service",
        "The real-time bus source didn't respond in time. Tap Refresh to try again.",
        RETRY,
      );
    }
  },
};
