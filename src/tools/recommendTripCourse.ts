import { z } from "zod";
import { isIndoorIntent } from "../lib/sources/visitseoul.js";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok } from "../lib/responses.js";
import {
  resolvePersonas,
  composeCourse,
  haversineKm,
  type Duration,
  type DayPlan,
  type PersonaDef,
  type City,
  type Spot,
} from "../lib/courses.js";
import { livePool } from "../lib/livePool.js";
import { readProfile, profileNote, isEmptyProfile } from "../lib/profile.js";
import { getGraph, planRoute } from "../lib/sources/subwayGraph.js";
import { resolveCity as geoForCity, getWeather } from "../lib/sources/weatherair.js";
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
  guided: { emoji: "🚶", cmdEn: "Any free official guided tours for these?", descEn: "free multilingual Seoul walking tours" },
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

/** Resolve a supported course city (Seoul/Busan/Jeju/Gyeongju) from any text, else undefined. */
function resolveCity(s: string): City | undefined {
  if (/busan|부산/i.test(s)) return "Busan";
  if (/jeju|제주/i.test(s)) return "Jeju";
  if (/gyeongju|경주/i.test(s)) return "Gyeongju";
  if (/seoul|서울/i.test(s)) return "Seoul";
  return undefined;
}
// Recognised cities we don't have curated course spots for yet → steer to other tools.
const OTHER_CITY = /daegu|대구|incheon|인천|gangneung|강릉|jeonju|전주|sokcho|속초|suwon|수원|gwangju|광주|daejeon|대전/i;

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

/**
 * "(Seoul)" next to a stop in a Seoul course tells the reader nothing — it is
 * what we fall back to when a live listing arrived without an address. Say the
 * neighbourhood or say nothing.
 */
function areaTag(area: string): string {
  return !area || CITY_AS_AREA.test(area) ? "" : ` _(${area})_`;
}

function renderDay(d: DayPlan): string[] {
  const lines = [`**${d.title}**`];
  for (const s of d.stops) {
    lines.push(`${s.block}`);
    const note = s.spot.note ? ` — ${s.spot.note}` : "";
    lines.push(`- **${s.spot.name}**${areaTag(s.spot.area)}${note}`);
    // The station and exit, where the city's own data gave us one. A place name
    // a visitor cannot find is not an answer.
    if (s.spot.access) lines.push(`  🚇 _${s.spot.access}_`);
    if (s.alt) lines.push(`  ↔ _or:_ **${s.alt.name}**${areaTag(s.alt.area)}`);
  }
  return lines;
}

/**
 * Price and time the hops between consecutive stops on the first day.
 *
 * The subway graph is already in memory, so this costs nothing and turns a list
 * of place names into a plan someone can actually follow and budget for.
 */
/** A live listing with no address lands here — not a neighbourhood we can route. */
const CITY_AS_AREA = /^(?:Seoul|Busan|Jeju|Gyeongju|Korea)$/i;

/** Brisk city walking, allowing for crossings and stairs. */
const WALK_KMH = 4.2;

async function legsBetweenStops(
  stops: { spot: Spot }[],
): Promise<{ label: string; minutes: number; fareWon: number }[]> {
  if (stops.length < 2) return [];
  try {
    const graph = await getGraph();
    const out: { label: string; minutes: number; fareWon: number }[] = [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1].spot;
      const b = stops[i].spot;

      // Two stops we have points for: answer from the points. Most of the pool
      // carries coordinates now, and "1.1 km, about 16 min on foot" is both
      // truer and more useful than a subway hop between two district names —
      // especially when the honest answer is that you should just walk.
      if (a.lat != null && a.lng != null && b.lat != null && b.lng != null) {
        const km = haversineKm({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
        if (km < 0.15) continue; // effectively the same spot
        if (km <= 1.5) {
          out.push({
            label: `${shortName(a.name)} → ${shortName(b.name)} ${Math.round((km / WALK_KMH) * 60)}min walk`,
            minutes: Math.round((km / WALK_KMH) * 60),
            fareWon: 0,
          });
          continue;
        }
      }

      // Prefer the station each place names for itself; fall back to the
      // neighbourhood, which only routes when it happens to also be a station.
      const from = stationFromAccess(a.access) ?? a.area;
      const to = stationFromAccess(b.access) ?? b.area;
      if (!from || !to || from === to) continue;
      // Live listings often carry no address, so their "area" is the city name.
      // "Seoul → Myeongdong 4min" is a routing artefact, not a leg of anyone's
      // day — better to show one honest hop than two and a fiction.
      if (CITY_AS_AREA.test(from) || CITY_AS_AREA.test(to)) continue;
      const route = planRoute(graph, from, to);
      if (!route) continue;
      out.push({
        label: `${shortName(a.name)} → ${shortName(b.name)} ${route.minutes}min`,
        minutes: route.minutes,
        fareWon: route.fareWon,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * The station a place tells you to get off at.
 *
 * Routing between neighbourhood labels only works when the neighbourhood happens
 * to share a station's name — "Gwanghwamun" routes, "Bukchon" and "Jongno" do
 * not, so most days had no transit line at all. VisitSeoul states the station
 * outright ("Subway Line 5 Jongno 3-ga Station Exit 7, 383m"), which is both
 * exact and the station a local would actually name.
 */
export function stationFromAccess(access?: string): string | undefined {
  if (!access) return undefined;
  const withoutLines = access.replace(/^\s*(?:subway\s*)?lines?\s*[\d/A-Za-z–—-]*\s*,?\s*/i, "");
  const m = /^([^,()]+?)\s+station\b/i.exec(withoutLines) ?? /([^,()]+?)\s+station\b/i.exec(access);
  const name = m?.[1]?.replace(/^(?:subway\s*)?lines?\s*[\d/A-Za-z]*\s*/i, "").trim();
  return name && name.length > 1 ? name : undefined;
}

/** Enough of a name to recognise the stop, without a line of parentheses. */
function shortName(name: string): string {
  const trimmed = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return trimmed.length > 34 ? `${trimmed.slice(0, 33).trimEnd()}…` : trimmed;
}

export const recommendTripCourse: ToolDef = {
  name: "recommendTripCourse",
  description:
    "Recommends rich, customizable Korea trip courses for a foreign visitor's profile — personas COMBINE " +
    "(e.g. '20s woman, foodie'), with duration (half-day / 1-day / 2-day / 3-day), theme (beauty, photo, food, " +
    "history, nature, shopping, nightlife, K-pop, hanbok…), and location (Seoul, Busan, Jeju, Gyeongju). Returns a day-by-day " +
    "itinerary with swap alternatives and chips into hours, routes, areas, menus and app workarounds. Curated, no " +
    `booking or ads; medical/aesthetic items are info-only. Part of ${SERVICE_NAME}.`,
  inputSchema: {
    persona: z
      .string()
      .optional()
      .describe("Traveler profile(s), combinable — e.g. '20s woman', 'family', 'couple', 'K-pop fan', 'foodie', 'history lover', or '20s woman, foodie'. Omit for first-timer."),
    duration: z.string().optional().describe("Trip length: 'half-day', '1-day', '2-day', '3-day' (4+ returns a 3-day base)."),
    themes: z.string().optional().describe("Optional focus, comma-separated — e.g. 'beauty, photo' or 'nature, nightlife'."),
    notes: z
      .string()
      .optional()
      .describe(
        "Anything the traveler said about how they want to travel, in their own words — " +
          "'we're on a budget', 'my mother walks slowly', 'not another market', 'we have a toddler'. " +
          "Passed through verbatim; the course is filtered and paced by it.",
      ),
    variant: z
      .number()
      .optional()
      .describe(
        "Which alternative to return. 0 (default) is the strongest course; pass 1, 2, 3… when the traveler " +
          "asks for another one, and each returns a different day in a different part of the city.",
      ),
    location: z.string().optional().describe("City: Seoul, Busan, Jeju, or Gyeongju (default Seoul). Other cities steer to getAreaGuide."),
  },
  annotations: {
    title: "Recommend Trip Courses by Traveler Profile",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (args) => {
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
          `Full curated courses cover **Seoul, Busan, Jeju, and Gyeongju** for now. For **${where}**, I can still help right away:`,
          "",
          `- **getAreaGuide** — a ${where} overview + top spots`,
          `- **searchPlaceForeigner** — 'things to see in ${where}' (it leads with the must-see sights)`,
        ].join("\n"),
        [
          { emoji: "🗺️", cmdEn: `Guide me around ${where}`, descEn: "area overview + top spots" },
          { emoji: "🔎", cmdEn: `Things to see in ${where}`, descEn: "must-see sights" },
          { emoji: "🧭", cmdEn: "Seoul / Busan / Jeju / Gyeongju instead", descEn: "persona day-by-day itinerary" },
        ],
      );
    }

    // Honour a stated weather constraint: a rainy-day course must actually be
    // sheltered, not the same itinerary with an 'indoors' label on it.
    // A plan that ignores the sky is a brochure. If it is raining or the forecast
    // says it will be, shelter the day without being asked — and say why, because
    // a course that quietly changed shape is confusing.
    let indoor = isIndoorIntent(blob);
    let weatherNote = "";
    if (!indoor) {
      const wx = await getWeather(geoForCity(city)).catch(() => undefined);
      const wet = /rain|shower|snow|drizzle/i.test(`${wx?.precip ?? ""}`) || (wx?.rainProb ?? 0) >= 60;
      if (wet) {
        indoor = true;
        weatherNote = `_☔ It's ${wx?.precip ? wx.precip.toLowerCase() : "likely to rain"} in ${city} today (${wx?.rainProb ?? "?"}% chance), so this day stays under cover. Ask for the outdoor version if you'd rather risk it._`;
      }
    }
    const variant = Math.max(0, Math.floor(Number(args.variant ?? 0)) || 0);
    // The city's own tourism data behind the curated spots — a few hundred more
    // candidates, which is what makes "give me another one" mean anything.
    const extra = await livePool(city).catch(() => []);
    // What they told us about how they want to travel — budget, pace, walking,
    // children, and anything they have already said no to.
    const profile = readProfile([String(args.notes ?? ""), personaRaw, themesRaw].filter(Boolean));
    // "What should we do on the first evening?" — a half-day that starts with a
    // palace at 9am answers a different question.
    const eveningOnly =
      dur === "half-day" &&
      /\b(?:this |first |tomorrow )?evening\b|\btonight\b|after dark|for dinner|첫날 ?저녁|오늘 ?저녁|저녁에|밤에|今夜|夜だけ|今晩|今晚|晚上/i.test(
        `${blob} ${String(args.notes ?? "")}`,
      );
    const course = composeCourse(personas, dur, explicitThemes, city, indoor, variant, extra, profile, eveningOnly);
    const durLabel = dur === "half-day" ? (eveningOnly ? "Evening" : "Half-day") : dur === "2-day" ? "2-day" : dur === "3-day" ? "3-day" : "1-day";
    const head = `🗺️ **${durLabel} ${city} course — for a ${personaTitle(personas)}**`;
    const lines = [head];
    if (course.themes.length) lines.push(`_Themes: ${course.themes.slice(0, 5).join(" · ")}_`);
    // Say back what we took from what they said, so the tailoring is visible and
    // correctable rather than mysterious.
    if (!isEmptyProfile(profile)) lines.push(profileNote(profile));
    if (weatherNote) lines.push("", weatherNote);
    if (over) lines.push("", "_(Longer trip? Here's a strong 3-day base — extend by repeating a day with a fresh persona, theme, or city.)_");
    for (const d of course.days) {
      lines.push("", ...renderDay(d));
    }
    // What the day costs to move around, from the same subway graph the route
    // answers use — "how do I get there and what does it cost" is the question,
    // and a course that skips it is a list of names.
    const hops = await legsBetweenStops(course.days[0]?.stops ?? []);
    if (hops.length) {
      const total = hops.reduce((sum, h) => sum + h.fareWon, 0);
      const minutes = hops.reduce((sum, h) => sum + h.minutes, 0);
      // A day whose hops are all walks costs nothing to move around, and saying
      // "₩0 of transit" makes the reader check whether something is broken.
      const summary = total
        ? `_About ${minutes} min and ₩${total.toLocaleString()} of transit across the day, before entry fees._`
        : `_About ${minutes} min of walking between stops — no transit fare needed for this day._`;
      lines.push("", `🚇 **Getting between them:** ${hops.map((h) => h.label).join(" · ")}`, summary);
    }

    lines.push(
      "",
      "_Tap any stop and I'll do hours, directions, the area, menus, or getting past a Korean-only app. These are popular patterns, not ads._",
    );

    // Chips: tailor a couple to the course content (food stops → menu; K-pop/ticketed → service).
    const allThemes = course.days.flatMap((d) => d.stops.flatMap((s) => s.spot.themes));
    // One-click routing: name the first two stops so the route chip lands straight in
    // getTransitRoute (strip the trailing "(...)" / "— ..." so the chip stays short).
    const short = (n: string) => n.split(/\s\(|\s—|—/)[0].trim();
    const d0 = course.days[0]?.stops ?? [];
    const routeChip: Choice =
      d0.length >= 2
        ? { emoji: "🚇", cmdEn: `How do I get from ${short(d0[0].spot.name)} to ${short(d0[1].spot.name)}?`, descEn: "route between the first stops" }
        : C.route;
    const chips: Choice[] = [C.now, routeChip];
    // Seoul's free dobo walking tours fit history/culture/hanbok courses — offer that
    // chip first there (nearly every course also has a food stop, so don't let the
    // menu chip always win) (D-034).
    const cultural = allThemes.some((t) => t === "history" || t === "hanbok" || t === "experience");
    if (city === "Seoul" && cultural) chips.push(C.guided);
    else if (allThemes.includes("food") || allThemes.includes("market")) chips.push(C.menu);
    else if (allThemes.includes("kpop")) chips.push(C.service);
    else if (city === "Seoul") chips.push(C.guided);
    else chips.push(C.find);
    chips.push(C.remix);
    return ok(lines.join("\n"), chips.slice(0, 4));
  },
};
