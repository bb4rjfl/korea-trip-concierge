import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok } from "../lib/responses.js";
import {
  resolvePersonas,
  composeCourse,
  type Duration,
  type DayPlan,
  type PersonaDef,
  type City,
} from "../lib/courses.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * recommendTripCourse — persona-based, combinable, duration-aware trip-course
 * discovery (D-025). Foreign visitors follow strong profile patterns (20s women →
 * K-beauty/photo/hanbok; families → palace+theme parks; K-pop fans → agency
 * streets+concerts; foodies → markets/BBQ), so we lead with a rich, customizable
 * itinerary and hand each stop off to the other tools via chips.
 *
 * Personas COMBINE ("20s woman, foodie") and the engine blends their themes;
 * duration scales the plan (half-day / 1-day / 2-day, Seoul Phase 1); explicit
 * themes/location refine it. Curated knowledge composed from tagged spots — no
 * API, no PII, no ads, deterministic (src/lib/courses.ts). Medical/aesthetic
 * items stay info-only (no clinic steering — Korean medical law).
 */

// Bridging chips → the sibling tool a stop most naturally continues into.
const C = {
  now: { emoji: "🕒", cmdEn: "Is one of these open right now?", descEn: "live hours + weather" },
  route: { emoji: "🚇", cmdEn: "How do I get between these stops?", descEn: "public-transit route" },
  area: { emoji: "🗺️", cmdEn: "Guide me around one of these areas", descEn: "neighborhood overview" },
  find: { emoji: "🔎", cmdEn: "Find specific places for a stop", descEn: "real spots (salon, café…)" },
  menu: { emoji: "🍜", cmdEn: "Explain a dish from the food stops", descEn: "what's in it + allergens" },
  service: { emoji: "🧭", cmdEn: "Get past a Korean app (tickets/booking)", descEn: "foreigner workaround" },
  remix: { emoji: "🎛️", cmdEn: "Remix this — different persona, days, or theme", descEn: "e.g. 'couple, 2-day, nature'" },
} satisfies Record<string, Choice>;

function normalizeDuration(raw: string): { dur: Duration; over: boolean } {
  const q = raw.toLowerCase();
  if (/half|반나절|아침|morning|few hours|몇\s*시간/.test(q)) return { dur: "half-day", over: false };
  if (/\b[4-9]\b|four|five|week|일주일|[4-9]\s*day|[4-9]일|닷새|장기|더\s*길/.test(q)) return { dur: "3-day", over: true }; // 4+ → 3-day base + extend note
  if (/\b3\b|three|3\s*day|삼일|사흘|3일|이상/.test(q)) return { dur: "3-day", over: false };
  if (/\b2\b|two|2\s*day|이틀|이일|2일|양일/.test(q)) return { dur: "2-day", over: false };
  return { dur: "1-day", over: false };
}

/** Resolve a supported course city (Seoul/Busan/Jeju) from any text, else undefined. */
function resolveCity(s: string): City | undefined {
  if (/busan|부산/i.test(s)) return "Busan";
  if (/jeju|제주/i.test(s)) return "Jeju";
  if (/seoul|서울/i.test(s)) return "Seoul";
  return undefined;
}
// Recognised cities we don't have curated course spots for yet → steer to other tools.
const OTHER_CITY = /daegu|대구|gyeongju|경주|incheon|인천|gangneung|강릉|jeonju|전주|sokcho|속초|suwon|수원|gwangju|광주|daejeon|대전/i;

const THEME_SYNONYM: Record<string, string> = {
  drinks: "nightlife", bar: "nightlife", club: "nightlife", eat: "food", dining: "food",
  coffee: "cafe", cafes: "cafe", sightseeing: "history", palace: "history", museum: "history",
  scenery: "nature", hike: "nature", hiking: "nature", views: "view", shop: "shopping",
  makeup: "beauty", skincare: "beauty", spa: "experience", templestay: "experience",
};
function parseThemes(raw: string): string[] {
  return raw
    .split(/[,&+/]| and /i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => THEME_SYNONYM[t] ?? t);
}

function personaTitle(personas: PersonaDef[]): string {
  if (!personas.length) return "first-timer";
  return personas.map((p) => `${p.emoji} ${p.label}`).join(" + ");
}

function renderDay(d: DayPlan): string[] {
  const lines = [`**${d.title}**`];
  for (const s of d.stops) {
    lines.push(`${s.block}`);
    lines.push(`- **${s.spot.name}** _(${s.spot.area})_ — ${s.spot.note}`);
    if (s.alt) lines.push(`  ↔ _or:_ **${s.alt.name}** _(${s.alt.area})_`);
  }
  return lines;
}

export const recommendTripCourse: ToolDef = {
  name: "recommendTripCourse",
  description:
    "Recommends rich, customizable Korea trip courses for a foreign visitor's profile — personas COMBINE " +
    "(e.g. '20s woman, foodie'), with duration (half-day / 1-day / 2-day / 3-day), theme (beauty, photo, food, " +
    "history, nature, shopping, nightlife, K-pop, hanbok…), and location (Seoul, Busan, Jeju). Returns a day-by-day " +
    "itinerary with swap alternatives and chips into hours, routes, areas, menus and app workarounds. Curated, no " +
    `booking or ads; medical/aesthetic items are info-only. Part of ${SERVICE_NAME}.`,
  inputSchema: {
    persona: z
      .string()
      .optional()
      .describe("Traveler profile(s), combinable — e.g. '20s woman', 'family', 'couple', 'K-pop fan', 'foodie', 'history lover', or '20s woman, foodie'. Omit for first-timer."),
    duration: z.string().optional().describe("Trip length: 'half-day', '1-day', '2-day', '3-day' (4+ returns a 3-day base)."),
    themes: z.string().optional().describe("Optional focus, comma-separated — e.g. 'beauty, photo' or 'nature, nightlife'."),
    location: z.string().optional().describe("City: Seoul, Busan, or Jeju (default Seoul). Other cities steer to getAreaGuide."),
  },
  annotations: {
    title: "Recommend Trip Courses by Traveler Profile",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: (args) => {
    const personaRaw = String(args.persona ?? "").trim();
    const durationRaw = String(args.duration ?? "").trim();
    const themesRaw = String(args.themes ?? "").trim();
    const location = String(args.location ?? "").trim();

    const personas = resolvePersonas(personaRaw);
    const explicitThemes = parseThemes(themesRaw);
    const { dur, over } = normalizeDuration(durationRaw);

    // Seoul/Busan/Jeju have curated course spots; another named city steers out.
    const blob = `${location} ${personaRaw} ${themesRaw}`;
    const city: City = resolveCity(blob) ?? "Seoul";
    if (resolveCity(blob) === undefined && OTHER_CITY.test(blob)) {
      const where = blob.match(OTHER_CITY)?.[0] ?? "there";
      return ok(
        [
          `🗺️ **Day-by-day courses for ${where} — coming soon**`,
          "",
          `Full curated courses cover **Seoul, Busan, and Jeju** for now. For **${where}**, I can still help right away:`,
          "",
          `- **getAreaGuide** — a ${where} overview + top spots`,
          `- **searchPlaceForeigner** — 'things to see in ${where}' (it leads with the must-see sights)`,
        ].join("\n"),
        [
          { emoji: "🗺️", cmdEn: `Guide me around ${where}`, descEn: "area overview + top spots" },
          { emoji: "🔎", cmdEn: `Things to see in ${where}`, descEn: "must-see sights" },
          { emoji: "🧭", cmdEn: "Seoul / Busan / Jeju course instead", descEn: "persona day-by-day itinerary" },
        ],
      );
    }

    const course = composeCourse(personas, dur, explicitThemes, city);
    const durLabel = dur === "half-day" ? "Half-day" : dur === "2-day" ? "2-day" : dur === "3-day" ? "3-day" : "1-day";
    const head = `🗺️ **${durLabel} ${city} course — for a ${personaTitle(personas)}**`;
    const lines = [head];
    if (course.themes.length) lines.push(`_Themes: ${course.themes.slice(0, 5).join(" · ")}_`);
    if (over) lines.push("", "_(Longer trip? Here's a strong 3-day base — extend by repeating a day with a fresh persona, theme, or city.)_");
    for (const d of course.days) {
      lines.push("", ...renderDay(d));
    }
    lines.push(
      "",
      "_Tap any stop and I'll do hours, directions, the area, menus, or getting past a Korean-only app. These are popular patterns, not ads._",
    );

    // Chips: tailor a couple to the course content (food stops → menu; K-pop/ticketed → service).
    const allThemes = course.days.flatMap((d) => d.stops.flatMap((s) => s.spot.themes));
    const chips: Choice[] = [C.now, C.route];
    if (allThemes.includes("food") || allThemes.includes("market")) chips.push(C.menu);
    else if (allThemes.includes("kpop")) chips.push(C.service);
    else chips.push(C.find);
    chips.push(C.remix);
    return ok(lines.join("\n"), chips.slice(0, 4));
  },
};
