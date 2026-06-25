import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import {
  getStationArrivals,
  getLinePositions,
  resolveStationName,
  resolveLineName,
  type SubwayArrival,
  type TrainPosition,
} from "../lib/sources/seoulSubway.js";
import { formatSubwayDirection, romanizeText } from "../lib/romanize.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * trackSubwayArrival — real-time Seoul subway info in English, via TOPIS
 * swopenAPI (src/lib/sources/seoulSubway.ts). Two modes (D-012), stateless:
 *  - station: next-train arrivals at a station (realtimeStationArrival)
 *  - line:    live position of every train on a line (realtimePosition)
 * Query-based (Refresh chip to update). Resolves English names to Korean.
 */

const CHOICES: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh", cmdKo: "다시 확인", descEn: "update live arrivals" },
  { emoji: "🗺️", cmdEn: "Plan a route from here", descEn: "full transit directions" },
  { emoji: "🏙️", cmdEn: "What's around this station?", descEn: "neighborhood guide" },
];

// Line-mode footer: pivot back to a specific station or to routing.
const LINE_CHOICES: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh", cmdKo: "다시 확인", descEn: "update live positions" },
  { emoji: "🚉", cmdEn: "Arrivals at a station", descEn: "next trains at one stop" },
  { emoji: "🗺️", cmdEn: "Plan a transit route", descEn: "subway/bus directions" },
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
  for (const [, arr] of byDir) {
    // Romanize the Korean direction string for English-first readers (U1).
    lines.push(`**→ ${formatSubwayDirection(arr[0].towards || arr[0].destination)}**`);
    for (const a of arr) {
      const eta = a.etaMinutes != null ? `**${a.etaMinutes} min**` : `_${a.status}_`;
      const loc = a.currentLocation ? ` · near ${romanizeText(a.currentLocation)}` : "";
      lines.push(`- ${a.line}: ${eta}${loc}`);
    }
    lines.push("");
  }
  lines.push("_Tap Refresh on the platform to keep it live._");
  return lines.join("\n");
}

const PER_DIR = 8; // cap trains shown per direction (busy loops run 40+)

function renderPositions(lineLabel: string, trains: TrainPosition[]): string {
  // Group by destination (clearer for foreigners than 상행/하행 codes).
  const byDir = new Map<string, TrainPosition[]>();
  for (const t of trains) {
    const key = t.towards || t.updnLine || "—";
    const arr = byDir.get(key) ?? [];
    arr.push(t);
    byDir.set(key, arr);
  }

  const lines = [`🚇 **${lineLabel} — live train positions**`, `_${trains.length} trains running now_`, ""];
  for (const [dir, arr] of byDir) {
    lines.push(`**→ toward ${romanizeText(dir) || "—"}**`);
    for (const t of arr.slice(0, PER_DIR)) {
      const flags = [t.express ? "express" : "", t.lastTrain ? "last train" : ""].filter(Boolean).join(", ");
      const tail = flags ? ` _(${flags})_` : "";
      lines.push(`- now at ${romanizeText(t.currentStation)} · _${t.status}_${tail}`);
    }
    if (arr.length > PER_DIR) lines.push(`- …and ${arr.length - PER_DIR} more`);
    lines.push("");
  }
  lines.push("_Tap Refresh to update positions._");
  return lines.join("\n");
}

export const trackSubwayArrival: ToolDef = {
  name: "trackSubwayArrival",
  description:
    "Real-time Seoul subway info in English for foreign visitors. By station: the next-train arrivals " +
    "(line, direction, destination, minutes away). By line: the live position of every train (current " +
    "station, direction, status). Query-based (refresh to update). " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    station: z
      .string()
      .optional()
      .describe("Station name (English or Korean) for next-train arrivals, e.g. 'Hongik University' or '강남'."),
    line: z
      .string()
      .optional()
      .describe("Line for live train positions, e.g. 'Line 2', '2', or 'Sinbundang'. Give a station OR a line."),
  },
  annotations: {
    title: "Track Subway Arrival",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false, // real-time
    openWorldHint: true,
  },
  handler: async (args) => {
    const station = String(args.station ?? "").trim();
    const line = String(args.line ?? "").trim();

    if (!hasKey("SUBWAY_API_KEY")) {
      return notConnected(
        "Track Subway Arrival",
        `Source: **Seoul TOPIS real-time subway Open API**. ${line ? `Line: **${line}**` : `Station: **${station}**`}.`,
        CHOICES,
      );
    }

    // Line mode (D-012): live position of every train on a line.
    if (line) {
      const lineKo = resolveLineName(line);
      if (!lineKo) {
        return fail(
          `I don't recognize the line "${line}" yet`,
          "Try a numbered line (e.g. 'Line 2' or just '2') or a named line (Sinbundang, AREX, Gyeongui-Jungang, Suin-Bundang).",
          RETRY,
        );
      }
      try {
        const trains = await getLinePositions(lineKo);
        if (trains.length === 0) {
          return fail(
            `No live trains on ${line} right now`,
            "Seoul subway runs about 05:30–01:00. If it's within service hours, double-check the line.",
            RETRY,
          );
        }
        return ok(renderPositions(trains[0].line, trains), LINE_CHOICES);
      } catch {
        return fail(
          "Couldn't reach the live subway service",
          "The real-time subway source didn't respond in time. Tap Refresh to try again.",
          RETRY,
        );
      }
    }

    // Station mode: next-train arrivals.
    if (!station) {
      return fail(
        "Which station or line?",
        "Tell me a **station** for next-train arrivals (e.g. Gangnam), or a **line** for live train positions (e.g. Line 2).",
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
