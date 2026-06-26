import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchPlaces, getPlaceIntro, normalizeLang, type Place } from "../lib/sources/tourapi.js";
import { CITIES, resolveCity, getWeather, getAir } from "../lib/sources/weatherair.js";
import { resolveLandmark, landmarkVerdict } from "../lib/landmarks.js";
import { searchSeoulContent, getSeoulDetail, pickConfidentMatch, seoulHoursVerdict, clip, type SeoulDetail } from "../lib/sources/visitseoul.js";
import { matchAreaName } from "./getAreaGuide.js";
import { koreanHolidayToday, holidayBanner } from "../lib/holidays.js";
import { similarity, normalizeName } from "../lib/fuzzy.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/** Name relevance of a candidate to the query — TourAPI returns matches in an
 *  arbitrary order, so we prefer titles the query actually names (a prefix beats
 *  a mere substring beats a fuzzy resemblance). Keeps "Lotte" from picking a
 *  random "8 Seconds - LOTTE …" counter over "Lotte World". */
function relevance(query: string, title: string): number {
  const q = normalizeName(query);
  const t = normalizeName(title);
  if (!q || !t) return 0;
  if (t === q) return 3;
  if (t.startsWith(q)) return 2;
  if (t.includes(q)) return 1.5;
  return similarity(query, title);
}

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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Current time in Korea (KST), independent of server timezone. */
function koreaNow(): { label: string; hour: number; minute: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  // hour12:false can yield "24" at midnight in some runtimes — normalize to 0.
  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const dow = Math.max(0, WEEKDAYS.indexOf(wd as (typeof WEEKDAYS)[number]));
  const label = fmt.format(new Date());
  return { label, hour, minute, dow };
}

// ── VisitSeoul (Seoul) ──────────────────────────────────────────────────────
function renderSeoulNow(d: SeoulDetail, now: ReturnType<typeof koreaNow>, weather?: string, banner?: string): string {
  // Compute the go/no-go verdict from VisitSeoul's free-text hours — the tool's
  // headline promise, previously missing on the VisitSeoul path (R2).
  const verdict = seoulHoursVerdict(d.hours, d.closedDays, now.dow, now.hour * 60 + now.minute);
  const lines = [`🕒 **${d.title} — right now**`, ""];
  if (verdict) lines.push(verdict.headline, "");
  if (banner) lines.push(banner, "");
  if (d.address) lines.push(`📍 ${d.address}`);
  lines.push(`⏰ Current Korea time: **${now.label} KST**`);
  if (d.hours) lines.push(`🏛️ Opening hours: ${clip(d.hours, 160)}`);
  if (d.closedDays) lines.push(`🚫 Closed: ${clip(d.closedDays, 120)}`);
  if (!d.hours && !d.closedDays) {
    lines.push("", "_No published hours found — check on arrival. Most attractions run ~09:00–18:00._");
  }
  if (d.subway) lines.push(`🚇 ${d.subway}`);
  if (now.hour >= 21 || now.hour < 6) {
    lines.push("", "⚠️ It's late — many attractions and shops are closed now.");
  }
  lines.push("", `_via official Seoul Tourism${d.summary ? ` · ${clip(d.summary, 120)}` : ""}_`);
  if (weather) lines.push("", weather);
  return lines.join("\n");
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
      .string()
      .optional()
      .describe("Result language: en (default), ja, zh (Chinese Simplified), ko — full names like 'english' also work. Match the visitor's language."),
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
    // Korean public-holiday awareness — Chuseok/Seollal close many places that
    // English "open now" apps still show as open (docs/18 #5). Shown on every path.
    const hbanner = holidayBanner(koreanHolidayToday());

    // Curated landmark overlay (C7): the iconic attractions visitors ask about
    // most are exactly the ones TourAPI indexes poorly ("Han River" → a hotel)
    // and gives no real hours for. A confident match yields a crisp open/closed
    // verdict from accurate curated hours — instant, and needs no API key.
    const landmark = resolveLandmark(place);
    if (landmark) {
      const now = koreaNow();
      const minutes = now.hour * 60 + now.minute;
      const verdict = landmarkVerdict(landmark, now.dow, minutes);
      const lines = [
        `🕒 **${landmark.name} — right now**`,
        "",
        verdict.headline,
        ...(hbanner ? ["", hbanner] : []),
        "",
        `⏰ Current Korea time: **${now.label} KST**`,
        `🏛️ Hours: ${landmark.hoursLabel}`,
      ];
      if (landmark.closedLabel) lines.push(`🚫 Closed: ${landmark.closedLabel}`);
      lines.push("", `📝 ${landmark.note}`);
      // Live weather + air for the landmark's city (best-effort; U2).
      const weather = await weatherLine(landmark.city ?? "Seoul");
      if (weather) lines.push("", weather);
      return ok(lines.join("\n"), CHOICES);
    }

    // A bare neighbourhood ("Hongdae", "Seongsu") has no single open/closed verdict
    // — matching it to a VisitSeoul business gave a confidently-wrong answer (R1).
    // Recognise the area and steer to the right tool instead.
    const areaName = matchAreaName(place);
    if (areaName) {
      const now = koreaNow();
      const short = areaName.split(" ")[0];
      const lines = [
        `🗺️ **${areaName} — right now**`,
        "",
        `**${short}** is a neighbourhood, so it doesn't "open" or "close" — it's always there to wander.`,
        `⏰ Current Korea time: **${now.label} KST**`,
      ];
      if (hbanner) lines.push("", hbanner);
      if (now.hour >= 21 || now.hour < 6) {
        lines.push("", "🌙 It's late — most shops are shut, but nightlife spots and convenience stores stay open.");
      }
      const weather = await weatherLine(areaName);
      if (weather) lines.push("", weather);
      lines.push("", "_Want the neighbourhood guide, or a specific place to check?_");
      return ok(lines.join("\n"), [
        { emoji: "🗺️", cmdEn: `Guide me around ${short}`, cmdKo: "동네 가이드", descEn: "what's there + getting around" },
        { emoji: "🔎", cmdEn: `Find places in ${short}`, descEn: "things to see & do" },
        { emoji: "🌤️", cmdEn: "Weather & fine dust today", descEn: "forecast + air quality" },
      ]);
    }

    // VisitSeoul (Seoul) — extend the open/closed answer beyond the curated
    // landmarks to any official Seoul place, with better English hours/subway than
    // TourAPI. Confident title match only; otherwise fall through to TourAPI.
    if (hasKey("VISITSEOUL_API_KEY")) {
      try {
        // Exclude utility listings ("… Luggage Storage", lockers, info centers) so a
        // bare brand token doesn't resolve to one of them (Y7).
        const cand = (await searchSeoulContent({ keyword: place, language, limit: 8 })).filter(
          (c) => !/luggage storage|locker|information center|info center|cargo terminal|보관/i.test(c.title),
        );
        const hit = pickConfidentMatch(place, cand);
        if (hit) {
          const detail = await getSeoulDetail(hit.cid, language);
          if (detail && (detail.hours || detail.address || detail.subway)) {
            const weather = await weatherLine("Seoul");
            return ok(renderSeoulNow(detail, koreaNow(), weather, hbanner), CHOICES);
          }
        }
      } catch {
        /* fall through to TourAPI */
      }
    }

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
      // Re-rank by name relevance so the best-named match wins over TourAPI order.
      matches = [...matches].sort((a, b) => relevance(place, b.title) - relevance(place, a.title));

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
        ...(hbanner ? [hbanner, ""] : []),
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
