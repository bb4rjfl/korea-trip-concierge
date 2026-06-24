import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { trackBus } from "../lib/sources/tago.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

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

    if (!hasKey("BUS_API_KEY")) {
      return notConnected(
        "Track Bus Arrival",
        `Source: **TAGO (국토교통부) real-time bus Open API**. Tracking **Bus ${bus} → ${stop}**.`,
        CHOICES,
      );
    }

    try {
      const result = await trackBus(bus, stop);
      if (!result) {
        return fail(
          `Bus ${bus} isn't arriving at ${stop} right now`,
          "No live arrival found — the bus may not serve this stop, the stop name may differ, or service may have ended. Try the exact stop name shown on the sign.",
          RETRY,
        );
      }
      const { arrival } = result;
      const stopsWord = arrival.stopsRemaining === 1 ? "stop" : "stops";
      const body = [
        `🚌 **Bus ${arrival.routeNo} → ${result.stop.nodeName}**`,
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
