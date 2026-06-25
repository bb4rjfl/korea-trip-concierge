import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchPlaces, getPlaceIntro, normalizeLang, type Place } from "../lib/sources/tourapi.js";
import { CITIES, resolveCity, getWeather, getAir } from "../lib/sources/weatherair.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/** TourAPI content type → human label (both foreign and Korean numberings). */
const TYPE_LABEL: Record<string, string> = {
  "76": "attraction", "12": "attraction",
  "78": "cultural site", "14": "cultural site",
  "85": "festival", "15": "festival",
  "75": "travel course", "25": "travel course",
  "77": "leisure", "28": "leisure",
  "80": "accommodation", "32": "accommodation",
  "79": "shop", "38": "shop",
  "82": "restaurant", "39": "restaurant",
};
const typeLabel = (ct?: string): string => (ct && TYPE_LABEL[ct]) || "place";
const TYPE_EMOJI: Record<string, string> = {
  attraction: "🏛️", "cultural site": "🎭", festival: "🎉", restaurant: "🍽️",
  shop: "🛍️", accommodation: "🏨", leisure: "🏞️", "travel course": "🧭", place: "📍",
};

/** Pick one candidate per distinct kind (palace vs restaurant …), up to 3. */
function distinctByType(places: Place[]): Place[] {
  const seen = new Set<string>();
  const out: Place[] = [];
  for (const p of places) {
    const lbl = typeLabel(p.contentTypeId);
    if (seen.has(lbl)) continue;
    seen.add(lbl);
    out.push(p);
    if (out.length >= 3) break;
  }
  return out;
}

/** Detect a known city from a TourAPI (English) address; defaults to Seoul. */
function cityFromAddress(address: string): string {
  const a = (address ?? "").toLowerCase();
  for (const c of Object.values(CITIES)) {
    if (a.includes(c.label.toLowerCase())) return c.label;
  }
  return "Seoul";
}

/** One-line live weather + air for the place's city (best-effort; empty on failure). */
async function weatherLine(address: string): Promise<string | undefined> {
  if (!hasKey("BUS_API_KEY")) return undefined;
  const city = resolveCity(cityFromAddress(address));
  // Independent best-effort calls — show whichever succeeds (resilient to a
  // single cold-cache timeout, U2/reliability).
  const [wRes, airRes] = await Promise.allSettled([getWeather(city), getAir(city)]);
  const bits: string[] = [];
  if (wRes.status === "fulfilled") {
    const w = wRes.value;
    if (w.tempC != null) bits.push(`${w.tempC}°C`);
    if (w.sky) bits.push(w.sky);
    if (w.rainProb != null) bits.push(`rain ${w.rainProb}%`);
  }
  if (airRes.status === "fulfilled") {
    const air = airRes.value;
    if (air.pm10 != null || air.pm25 != null) bits.push(`air ${air.grade}`);
  }
  return bits.length ? `🌤️ Now in ${city.label}: ${bits.join(" · ")}` : undefined;
}

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
    language: z
      .enum(["en", "ja", "zh", "ko"])
      .optional()
      .describe("Result language: en (default), ja, zh (Chinese Simplified), ko. Match the visitor's language."),
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
    const language = normalizeLang(args.language as string | undefined);

    if (!hasKey("TOUR_API_KEY")) {
      return notConnected(
        "Is It Good to Go Now?",
        `Sources: **place hours (TourAPI)** + current Korea time. Checking: **${place}**.`,
        CHOICES,
      );
    }

    try {
      // Search in the requested language; if a non-English locale returns nothing
      // (the place name was given in English/romanized), fall back to the English
      // service so ja/zh users don't hit a dead end for a place that exists.
      let effLang = language;
      let matches = await searchPlaces({ keyword: place, language, limit: 6 });
      if (matches.length === 0 && language !== "en") {
        effLang = "en";
        matches = await searchPlaces({ keyword: place, language: "en", limit: 6 });
      }
      if (matches.length === 0) {
        return fail(
          "Place not found",
          `I couldn't find **${place}** in the tourism data. Try the official name or a nearby landmark.`,
          RETRY,
        );
      }

      // Ask the user to disambiguate only when there's no exact-name match AND the
      // candidates are genuinely different KINDS of place (e.g. a palace vs a
      // restaurant both named "Gyeongbokgung"). Otherwise proceed with the best.
      const exact = matches.find((p) => p.title.trim().toLowerCase() === place.trim().toLowerCase());
      if (!exact) {
        const distinct = distinctByType(matches);
        if (distinct.length >= 2) {
          const chips: Choice[] = distinct.map((p) => ({
            emoji: TYPE_EMOJI[typeLabel(p.contentTypeId)] ?? "📍",
            cmdEn: p.title,
            descEn: `${typeLabel(p.contentTypeId)}${p.address ? ` · ${p.address.split(",")[0]}` : ""}`,
          }));
          const body =
            `🤔 **A few places match "${place}" — which one?**\n\n` +
            `Tap the one you mean and I'll check if it's good to go right now.`;
          return ok(body, chips);
        }
      }

      const top = exact ?? matches[0];
      if (!top.contentId || !top.contentTypeId) {
        return fail(
          "Place not found",
          `I couldn't find **${place}** in the tourism data. Try the official name or a nearby landmark.`,
          RETRY,
        );
      }
      const intro = await getPlaceIntro(top.contentId, top.contentTypeId, effLang);
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
      // Live weather + air for the place's city (U2 — real data, not "coming soon").
      const weather = await weatherLine(top.address);
      if (weather) lines.push("", weather);
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
