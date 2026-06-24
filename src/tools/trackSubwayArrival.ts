import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { getStationArrivals, resolveStationName, type SubwayArrival } from "../lib/sources/seoulSubway.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * trackSubwayArrival — real-time next-train info at a Seoul subway station, in
 * English, via TOPIS swopenAPI (src/lib/sources/seoulSubway.ts). Query-based
 * (Refresh chip to update), stateless. Resolves English station names to Korean.
 */

const CHOICES: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh", cmdKo: "다시 확인", descEn: "update live arrivals" },
  { emoji: "🗺️", cmdEn: "Plan a route from here", descEn: "full transit directions" },
  { emoji: "🏙️", cmdEn: "What's around this station?", descEn: "neighborhood guide" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh", cmdKo: "다시 확인", descEn: "try the live lookup again" },
  { emoji: "🗺️", cmdEn: "Plan a transit route instead", descEn: "subway/bus directions" },
];

function render(station: string, arrivals: SubwayArrival[]): string {
  // Group by direction (towards), keep the soonest 1–2 per direction.
  const byDir = new Map<string, SubwayArrival[]>();
  for (const a of arrivals) {
    const key = a.towards || a.destination || a.line;
    const arr = byDir.get(key) ?? [];
    if (arr.length < 2) arr.push(a);
    byDir.set(key, arr);
  }

  const lines = [`🚇 **${station} — next trains**`, ""];
  for (const [dir, arr] of byDir) {
    lines.push(`**→ ${dir}**`);
    for (const a of arr) {
      const eta = a.etaMinutes != null ? `**${a.etaMinutes} min**` : `_${a.status}_`;
      const loc = a.currentLocation ? ` · near ${a.currentLocation}` : "";
      lines.push(`- ${a.line}: ${eta}${loc}`);
    }
    lines.push("");
  }
  lines.push("_Tap Refresh on the platform to keep it live._");
  return lines.join("\n");
}

export const trackSubwayArrival: ToolDef = {
  name: "trackSubwayArrival",
  description:
    "Looks up real-time next-train arrivals at a Seoul subway station — line, direction, destination, and " +
    "minutes away — explained in English for foreign visitors. Query-based (refresh to update). " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    station: z.string().describe("Subway station name, English or Korean, e.g. 'Hongik University' or '강남'."),
  },
  annotations: {
    title: "Track Subway Arrival",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false, // real-time
    openWorldHint: true,
  },
  handler: async (args) => {
    const station = String(args.station ?? "");

    if (!hasKey("SUBWAY_API_KEY")) {
      return notConnected(
        "Track Subway Arrival",
        `Source: **Seoul TOPIS real-time subway Open API**. Station: **${station}**.`,
        CHOICES,
      );
    }

    const stationKo = resolveStationName(station);
    if (!stationKo) {
      return fail(
        `I don't recognize the station "${station}" yet`,
        "Try a major Seoul station (e.g. Gangnam, Hongik University, Myeongdong, Seoul Station, Itaewon) or type the Korean name (e.g. 강남).",
        RETRY,
      );
    }

    try {
      const arrivals = await getStationArrivals(stationKo);
      if (arrivals.length === 0) {
        return fail(
          `No live trains at ${station} right now`,
          "Seoul subway runs about 05:30–01:00. If it's within service hours, double-check the station name.",
          RETRY,
        );
      }
      return ok(render(station, arrivals), CHOICES);
    } catch {
      return fail(
        "Couldn't reach the live subway service",
        "The real-time subway source didn't respond in time. Tap Refresh to try again.",
        RETRY,
      );
    }
  },
};
