import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import {
  getStationArrivals,
  getLinePositions,
  stopsBetween,
  resolveLineName,
  type SubwayArrival,
  type TrainPosition,
} from "../lib/sources/seoulSubway.js";
import { formatSubwayDirection, romanizeText, resolveStationFuzzy, type StationPair } from "../lib/romanize.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/** "Did you mean?" chips from fuzzy station candidates — each re-issues the call
 *  with the confirmed station baked in (cmdFn decides the wording per mode). */
function suggestChips(items: StationPair[], cmdFn: (s: StationPair) => string): Choice[] {
  return items.slice(0, 3).map((s) => ({ emoji: "🚇", cmdEn: cmdFn(s), descEn: "Seoul subway station" }));
}

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

// Journey-mode footer: re-query as you ride, or check the destination.
const JOURNEY_CHOICES: Choice[] = [
  { emoji: "🔄", cmdEn: "Where am I now", cmdKo: "지금 어디", descEn: "re-check stops from your current stop" },
  { emoji: "🏁", cmdEn: "Arrivals at my destination", descEn: "when trains reach your stop" },
  { emoji: "🗺️", cmdEn: "Show the full route again", descEn: "subway/bus directions" },
];

function renderJourney(
  fromLabel: string,
  toLabel: string,
  line: string,
  stops: number,
  arrivals: SubwayArrival[],
): string {
  const lines = [`🚇 **On ${line} — heading to ${toLabel}**`, ""];
  if (stops === 0) {
    lines.push(`📍 **You're already at ${toLabel}.** Time to get off!`);
  } else {
    const word = stops === 1 ? "stop" : "stops";
    lines.push(`📍 **${stops} ${word} to go** from ${fromLabel}. Stay on until **${toLabel}**, then get off.`);
  }
  // Show next trains on this line so they know which one to board / how long to wait.
  const onLine = arrivals.filter((a) => a.line === line).slice(0, 4);
  if (onLine.length) {
    lines.push("", `**Next trains from ${fromLabel}:**`);
    for (const a of onLine) {
      const eta = a.etaMinutes != null ? `**${a.etaMinutes} min**` : `_${a.status}_`;
      const dir = a.towards ? ` · ${formatSubwayDirection(a.towards)}` : "";
      lines.push(`- ${eta}${dir}`);
    }
    lines.push("", `_Board the train heading toward **${toLabel}**'s side._`);
  }
  lines.push("", "_Tap “Where am I now” at each stop to count down._");
  return lines.join("\n");
}

export const trackSubwayArrival: ToolDef = {
  name: "trackSubwayArrival",
  description:
    "Real-time Seoul subway info in English for foreign visitors. By station: next-train arrivals (line, " +
    "direction, destination, minutes away). By station + destination: how many stops are left until you " +
    "get off (countdown as you ride). By line: the live position of every train. Query-based (refresh to " +
    `update). Part of ${SERVICE_NAME}.`,
  inputSchema: {
    station: z
      .string()
      .optional()
      .describe("Your current/boarding station (English or Korean), e.g. 'Hongik University' or '강남'."),
    to: z
      .string()
      .optional()
      .describe("Destination station — with `station`, returns stops remaining until you get off."),
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
    const to = String(args.to ?? "").trim();
    const line = String(args.line ?? "").trim();

    if (!hasKey("SUBWAY_API_KEY")) {
      return notConnected(
        "Track Subway Arrival",
        `Source: **Seoul TOPIS real-time subway Open API**. ${line ? `Line: **${line}**` : `Station: **${station}**`}.`,
        CHOICES,
      );
    }

    // Journey mode (D-012 Phase 2): station + destination → stops remaining.
    if (station && to) {
      const fromRes = resolveStationFuzzy(station);
      const toRes = resolveStationFuzzy(to);
      // Unknown endpoint → ask; close-but-unsure → "did you mean?" candidates.
      if (fromRes.kind === "none" || toRes.kind === "none") {
        const bad = fromRes.kind === "none" ? station : to;
        return fail(
          `I don't recognize the station "${bad}" yet`,
          "Try major Seoul stations (e.g. Gangnam, Hongik University, Myeongdong, Seoul Station) or the Korean name.",
          RETRY,
        );
      }
      if (fromRes.kind === "suggest") {
        return ok(
          `🤔 Which starting station did you mean by **"${station}"**?`,
          suggestChips(fromRes.items, (s) => `Stops from ${s.en} to ${to}`),
        );
      }
      if (toRes.kind === "suggest") {
        return ok(
          `🤔 Which destination did you mean by **"${to}"**?`,
          suggestChips(toRes.items, (s) => `Stops from ${station} to ${s.en}`),
        );
      }
      const fromKo = fromRes.item.ko;
      const toKo = toRes.item.ko;
      try {
        const [info, arrivals] = await Promise.all([stopsBetween(fromKo, toKo), getStationArrivals(fromKo)]);
        if (!info.ok && info.reason === "no-data") {
          return fail(
            "Couldn't get live subway data right now",
            `Live stop counts need running trains, and the Seoul subway runs about **05:30–01:00**. Try during service hours, or ask me to **plan a route** from ${station} to ${to}.`,
            RETRY,
          );
        }
        if (!info.ok) {
          return fail(
            `${station} and ${to} aren't on the same line`,
            `You'll need a transfer. Ask me to **plan a route** from ${station} to ${to} and I'll pick the lines and stops.`,
            RETRY,
          );
        }
        return ok(renderJourney(station, to, info.line, info.stops, arrivals), JOURNEY_CHOICES);
      } catch {
        return fail(
          "Couldn't reach the live subway service",
          "The real-time subway source didn't respond in time. Tap Refresh to try again.",
          RETRY,
        );
      }
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

    const res = resolveStationFuzzy(station);
    if (res.kind === "none") {
      return fail(
        `I don't recognize the station "${station}" yet`,
        "Try a major Seoul station (e.g. Gangnam, Hongik University, Myeongdong, Seoul Station, Itaewon) or type the Korean name (e.g. 강남).",
        RETRY,
      );
    }
    if (res.kind === "suggest") {
      return ok(
        `🤔 I'm not sure which station you mean by **"${station}"**. Did you mean:`,
        suggestChips(res.items, (s) => `Next trains at ${s.en}`),
      );
    }
    const stationKo = res.item.ko;

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
