import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { trackBus, resolveCityCode } from "../lib/sources/tago.js";
import { trackSeoulBus, getSeoulBusPositions, type SeoulBusPosResult } from "../lib/sources/seoul.js";
import { romanizeText } from "../lib/romanize.js";
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

// Seoul per-stop footer: also lets the rider see every bus on the route (positions mode).
const SEOUL_CHOICES: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh", cmdKo: "다시 확인", descEn: "update live position" },
  { emoji: "🚍", cmdEn: "Where are all the buses on this route?", descEn: "every bus, live" },
  { emoji: "🗺️", cmdEn: "Route after I get off", descEn: "directions from the drop-off stop" },
];

// Seoul positions-mode footer: pivot to per-stop countdown or to routing.
const SEOUL_POS_CHOICES: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh", cmdKo: "다시 확인", descEn: "update live positions" },
  { emoji: "🎯", cmdEn: "Count down to my stop", descEn: "tell me your drop-off stop" },
  { emoji: "🗺️", cmdEn: "Plan a transit route instead", descEn: "subway/bus directions" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh", cmdKo: "다시 확인", descEn: "try the live lookup again" },
  { emoji: "🚇", cmdEn: "Plan a transit route instead", descEn: "subway/bus directions" },
];

/** Render Seoul route-position mode (every bus on the route, by section order). */
function renderSeoulPositions(r: Extract<SeoulBusPosResult, { status: "ok" }>): string {
  const CAP = 12;
  const lines = [`🚌 **Seoul Bus ${r.routeNo} — live positions**`, `_${r.total} ${r.total === 1 ? "bus" : "buses"} running now_`, ""];
  for (const p of r.positions.slice(0, CAP)) {
    lines.push(`- 🚌 ${p.lastStopName ? `near **${romanizeText(p.lastStopName)}**` : `section ${p.sectOrd}`}`);
  }
  if (r.positions.length > CAP) lines.push(`- …and ${r.positions.length - CAP} more`);
  lines.push("", "_Tell me your drop-off stop and I'll count down the stops as you ride._");
  return lines.join("\n");
}

export const trackBusArrival: ToolDef = {
  name: "trackBusArrival",
  description:
    "Tracks a specific Korean city bus in real time. With a drop-off stop: how many stops remain until you " +
    "get off, with an English heads-up. By route number alone (Seoul): the live position of every bus on that " +
    "route. Query-based (refresh to update). " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    busNumber: z.string().describe("Bus route number, e.g. '143'."),
    city: z
      .string()
      .describe("City the bus runs in, e.g. 'Seoul', 'Busan', 'Daejeon', 'Incheon'. Required to locate the stop."),
    dropOffStop: z
      .string()
      .optional()
      .describe("The stop where you want to get off — gives stops-remaining. Omit (Seoul) for all live bus positions on the route."),
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

    // Seoul isn't in TAGO — use its own TOPIS real-time feed (src/lib/sources/seoul.ts).
    if (isSeoul(city)) {
      // Route-position mode (parallels subway line mode): a bus number but no
      // drop-off stop → show every bus running the route right now.
      if (!stop.trim()) {
        try {
          const r = await getSeoulBusPositions(bus);
          if (r.status === "route_not_found") {
            return fail(
              `I couldn't find Seoul bus "${bus}"`,
              "Check the bus number (e.g. '143', '4211', 'N16'), or tap **Plan a transit route** and I'll pick the buses for you.",
              RETRY,
            );
          }
          if (r.status === "no_buses") {
            return fail(
              `No buses are running on Seoul bus ${bus} right now`,
              "It may be outside service hours or between runs. Tap Refresh in a moment, or plan a transit route instead.",
              RETRY,
            );
          }
          return ok(renderSeoulPositions(r), SEOUL_POS_CHOICES);
        } catch {
          return fail(
            "Couldn't reach the Seoul bus service",
            "The Seoul real-time bus source didn't respond in time. Tap Refresh to try again.",
            RETRY,
          );
        }
      }
      try {
        const r = await trackSeoulBus(bus, stop);
        if (r.status === "route_not_found") {
          return fail(
            `I couldn't find Seoul bus "${bus}"`,
            "Check the bus number (e.g. '143', '4211', 'N16'), or tap **Plan a transit route** and I'll pick the buses for you.",
            RETRY,
          );
        }
        if (r.status === "stop_not_found") {
          return fail(
            `I couldn't find a stop named "${stop}" on Seoul bus ${bus}`,
            "Korean stop names must match the sign exactly — double-check the name, or plan a transit route instead and I'll choose the stops.",
            RETRY,
          );
        }
        if (r.status === "no_arrival") {
          const avail = r.available.length
            ? `\n\n🚌 Buses showing at **${romanizeText(r.stopName)}** now: **${r.available.slice(0, 12).join(", ")}**.`
            : "";
          return fail(
            `Bus ${bus} isn't showing at ${stop} right now`,
            `I found the stop on the route, but bus **${bus}** has no live arrival there now — it may be between runs or finished for the night.${avail}`,
            RETRY,
          );
        }
        const { arrival } = r;
        const stopsWord = arrival.stopsRemaining === 1 ? "stop" : "stops";
        const body = [
          `🚌 **Seoul Bus ${arrival.routeNo} → ${stop}**`,
          "",
          arrival.soon
            ? "🛑 **Arriving now — get ready to get off!**"
            : `Currently **${arrival.stopsRemaining} ${stopsWord} away**${arrival.etaMinutes ? `, about **${arrival.etaMinutes} min**` : ""}.`,
          arrival.stopsRemaining > 1 ? "Tap **Refresh** as you ride to keep it live." : "",
        ]
          .filter(Boolean)
          .join("\n");
        return ok(body, SEOUL_CHOICES);
      } catch {
        return fail(
          "Couldn't reach the Seoul bus service",
          "The Seoul real-time bus source didn't respond in time. Tap Refresh to try again.",
          RETRY,
        );
      }
    }

    if (!city.trim()) {
      return fail(
        "Which city is this bus in?",
        "Korean bus stops are looked up per city. Tell me the city (e.g. Busan, Daejeon, Incheon) so I can find the stop.",
        RETRY,
      );
    }

    // Non-Seoul (TAGO) needs the drop-off stop to count down — ask instead of
    // a confusing "stop not found" on an empty name.
    if (!stop.trim()) {
      return fail(
        `Which stop do you want to get off at on bus ${bus}?`,
        "For buses outside Seoul I count down to your drop-off stop — tell me its name (as shown on the sign).",
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

      // No stop by that name — most likely a spelling mismatch.
      if (result.status === "stop_not_found") {
        return fail(
          `I couldn't find a stop named "${stop}" in ${city}`,
          "Korean bus stops are matched by their exact name — check the name on the stop's sign (it can differ slightly), or plan a transit route instead and I'll pick the stops for you.",
          RETRY,
        );
      }

      // Stop found, but the requested route isn't in the live list. Show which
      // buses ARE arriving so the user can correct the number or pick another.
      if (result.status === "no_arrival") {
        const foundStop = romanizeText(result.stop.nodeName);
        const detail = result.available.length
          ? `I found the stop (**${foundStop}**), but bus **${bus}** isn't in the live list right now.\n\n🚌 Buses arriving here now: **${result.available.slice(0, 12).join(", ")}**.\n\nDouble-check your bus number (say e.g. \"track bus ${result.available[0]}\"), or it may have stopped running for the night.`
          : `I found the stop (**${foundStop}**), but no buses are showing right now — service may have ended for the night.`;
        return fail(`Bus ${bus} isn't showing at ${stop} yet`, detail, RETRY);
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
