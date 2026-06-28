import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok } from "../lib/responses.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * recommendTripCourse — persona-based "what visitors like you actually do in
 * Korea" discovery. Foreign visitors follow strong, predictable patterns by
 * profile (20s women → K-beauty/photo studios/hanbok; families → hanbok+palace,
 * theme parks; K-pop fans → agency streets + concerts; foodies → markets+BBQ),
 * so leading with a curated set of popular courses solves the "what can I even do
 * here?" first-step problem and then hands each item off to the other tools via
 * chips. Knowledge-only curation (no API, no PII, no ads) — Kakao-rule-safe and
 * higher-trust than an LLM web search. Medical/aesthetic items are kept at the
 * category/how-it-works level (no clinic steering — Korean medical law).
 */

interface Persona {
  match: RegExp;
  label: string;
  emoji: string;
  intro: string;
  courses: string[];
  chips: Choice[];
}

// Reusable bridging chips → the sibling tool a course most naturally continues into.
const C = {
  now: { emoji: "🕒", cmdEn: "Is one of these open right now?", descEn: "live hours + weather" },
  route: { emoji: "🚇", cmdEn: "How do I get to one of these?", descEn: "public-transit route" },
  area: { emoji: "🗺️", cmdEn: "Guide me around one of these areas", descEn: "neighborhood overview" },
  find: { emoji: "🔎", cmdEn: "Find specific places for this", descEn: "real spots to visit" },
  menu: { emoji: "🍜", cmdEn: "Explain a Korean dish from this course", descEn: "what's in it + allergens" },
  service: { emoji: "🧭", cmdEn: "Get past a Korean app for this (tickets/booking)", descEn: "foreigner workaround" },
  pay: { emoji: "💳", cmdEn: "How do I pay for these as a foreigner?", descEn: "cards, cash, T-money" },
} satisfies Record<string, Choice>;

const PERSONAS: Persona[] = [
  {
    match: /(20s?|twenties|young)\s*(wom[ae]n|girl|female|lady)|k-?beauty|beauty|skincare|make ?up|hair ?(salon)?|nail|photo ?studio|profile ?photo|인생네컷|이십대\s*여|뷰티|화장|미용/i,
    label: "K-beauty & photo (popular with 20s women)",
    emoji: "💄",
    intro: "What a lot of 20-something visitors come to Korea to do — the K-beauty, salon and photo-studio run, plus hanbok and café-hopping:",
    courses: [
      "📸 **Profile / 인생네컷 photo studio** — a self-photo booth (인생네컷) or a pro profile-photo studio; many do hair & makeup first for the full look. Walk-in or same-day booking is common.",
      "💇 **Hair & makeup salon (미용실)** — Hongdae/Gangnam salons; some run English-friendly tourist styling packages.",
      "💅 **Nail art** — Korean nail studios are world-class; book same-day or walk in.",
      "🧴 **K-beauty shopping** — Olive Young flagships (Myeongdong/Hongdae) + Seongsu pop-ups; tax-free for tourists with a passport.",
      "👘 **Hanbok + palace photos** — rent a hanbok by Gyeongbokgung/Bukchon (palace entry is free in hanbok).",
      "☕ **Aesthetic café-hopping** — Seongsu, Yeonnam, and Ikseon-dong.",
      "💉 **K-beauty derma/aesthetic clinics (info only)** — 'glass-skin' facials, laser and lifting are popular; bigger clinics have foreigner consultations in English. _I can explain the options and how a consultation works, but I can't book a medical procedure (Korean law)._",
    ],
    chips: [C.find, C.area, C.now],
  },
  {
    match: /(famil|kids?|children|child|toddler|parents?|with my (kid|son|daughter)|가족|아이|아기|어린이)/i,
    label: "Family with kids",
    emoji: "👨‍👩‍👧",
    intro: "The crowd-pleasers that work for kids and parents together:",
    courses: [
      "👘 **Hanbok + Gyeongbokgung** — free palace entry in hanbok; catch the changing-of-the-guard.",
      "🎢 **Lotte World or Everland** — Lotte World is indoor+outdoor (great on a rainy/cold day); Everland has the safari and panda twins.",
      "🐠 **COEX Aquarium + Starfield Library** — easy indoor combo in Gangnam.",
      "🚡 **Namsan cable car + N Seoul Tower** — city views; the plaza is open even when the deck isn't.",
      "🚲 **Han River park** — rent bikes/a mat, order fried chicken to the park, watch the bridge fountain.",
      "🦖 **National Museum of Korea / War Memorial** — free, big, with outdoor tanks & planes kids love.",
    ],
    chips: [C.now, C.route, C.pay],
  },
  {
    match: /(couple|honeymoon|romantic|date|anniversary|girlfriend|boyfriend|partner|커플|연인|데이트|신혼)/i,
    label: "Couple / romantic",
    emoji: "💑",
    intro: "The classic Seoul date-course mix of views, walks and food:",
    courses: [
      "🌉 **N Seoul Tower at sunset** — cable car up, 'love locks', night skyline.",
      "🧺 **Han River picnic + chimaek** — mat + fried chicken and beer delivered to the park; Banpo Bridge rainbow-fountain show (Apr–Oct evenings).",
      "🏯 **Bukchon & Samcheong-dong stroll** — hanok alleys, galleries, quiet cafés; pair with hanbok at the palace.",
      "🌃 **Lotte World Tower – Seoul Sky** — the city's highest night view.",
      "☕ **Ikseon-dong hanok cafés** — pretty courtyards, small-plate bistros (book ahead on weekends).",
    ],
    chips: [C.now, C.route, C.area],
  },
  {
    match: /(k-?pop|kpop|hallyu|idol|fan|fancafe|concert|bts|blackpink|stray|seventeen|연예|아이돌|팬|콘서트|굿즈)/i,
    label: "K-pop / Hallyu fan",
    emoji: "🎤",
    intro: "The fan pilgrimage — agencies, photo spots, concerts and goods:",
    courses: [
      "🏢 **Entertainment-agency streets** — HYBE (Yongsan), SM (SMTOWN COEX), JYP (Seongsu); cafés and goods nearby.",
      "🎫 **Concerts / fan-sign tickets** — sales gate on Korean ID; use **Interpark Global** or Klook (ask me to walk you through it).",
      "📍 **MV / drama filming spots** — pilgrimage stops around Seoul + Nami Island.",
      "🛍️ **K-pop goods** — Myeongdong, Hongdae, and the Seoul-station/online album shops.",
      "🍢 **Gwangjang Market food run** — the classic Korea food-vlog experience.",
      "👘 **Hanbok + palace** — the photo set everyone posts.",
    ],
    chips: [C.service, C.find, C.route],
  },
  {
    match: /(food(ie)?|eat|eating|cuisine|gourmet|street ?food|bbq|barbecue|미식|맛집|먹방|먹거리)/i,
    label: "Foodie",
    emoji: "🍜",
    intro: "Eat your way through Korea — markets, BBQ, chimaek and regional specialties:",
    courses: [
      "🏪 **Market street food** — Gwangjang & Tongin markets (bindaetteok, mayak gimbap, the coin lunchbox).",
      "🥩 **Korean BBQ** — samgyeopsal/galbi grilled at the table, with soju-beer (somaek).",
      "🍗 **Chimaek** — Korean fried chicken + beer, the national pairing.",
      "🍲 **Regional runs** — Busan dwaeji-gukbap & milmyeon; Jeju black-pork & galchi; Jeonju bibimbap.",
      "🌃 **Night-market & pojangmacha** — Myeongdong carts, Euljiro 'Hipjiro' alleys.",
      "☕ **Dessert & café tour** — Seongsu/Yeonnam specialty coffee and bingsu.",
    ],
    chips: [C.menu, C.find, C.pay],
  },
  {
    match: /(history|historic|culture|cultural|tradition|heritage|palace|temple|museum|senior|elder(ly)?|older|역사|문화|전통|시니어|어르신)/i,
    label: "Culture & history",
    emoji: "🏛️",
    intro: "A slower, deeper route through old Korea:",
    courses: [
      "🏯 **The five grand palaces** — Gyeongbokgung & Changdeokgung (book the Secret Garden), plus Deoksugung's stone-wall walk.",
      "⛩️ **Jongmyo Shrine & Bongeunsa/Jogyesa temples** — UNESCO shrine + working Zen temples.",
      "🏺 **National Museum of Korea** — free, world-class; the gold crowns and Pensive Bodhisattva.",
      "🏘️ **Bukchon & Insadong** — hanok lanes, crafts, teahouses; Namsangol Hanok Village.",
      "🌿 **Day trip: Jeonju Hanok Village or Gyeongju** — Korea's heritage towns.",
    ],
    chips: [C.now, C.route, C.area],
  },
];

// First-timer / solo / generic fallback.
const GENERIC: Persona = {
  match: /.*/,
  label: "First-timer in Seoul",
  emoji: "🧭",
  intro: "The classic first-timer loop that almost everyone does — a solid Seoul starter:",
  courses: [
    "👘 **Gyeongbokgung + hanbok** — free entry in hanbok; changing-of-the-guard.",
    "🌉 **N Seoul Tower (Namsan)** — city views, cable car, sunset.",
    "🛍️ **Myeongdong** — shopping + an evening street-food run.",
    "🏘️ **Bukchon Hanok Village & Insadong** — old-Korea alleys and crafts.",
    "🍢 **Gwangjang Market** — classic street eats (bindaetteok, mayak gimbap).",
    "🧺 **Han River park** — picnic, bikes, and the bridge fountain.",
    "🚆 **Day trip** — Nami Island/Garden of Morning Calm, or Everland.",
  ],
  chips: [C.find, C.now, C.route],
};

function render(p: Persona, matched: boolean, interest?: string): string {
  const head = matched
    ? `${p.emoji} **Popular in Korea — ${p.label}**`
    : [
        `${p.emoji} **${p.label}**`,
        "",
        `_(Tell me a traveler profile — e.g. "20s woman", "family with kids", "K-pop fan", "foodie", "couple", "history lover" — for a tailored set.)_`,
      ].join("\n");
  const lines = [head, "", p.intro, "", ...p.courses];
  if (interest) {
    lines.push("", `_You mentioned **${interest.slice(0, 40)}** — tap "Find specific places" below and I'll narrow to that._`);
  }
  lines.push(
    "",
    "_These are popular patterns, not ads — pick one and I'll help with hours, directions, the area, menus, or getting past any Korean-only app._",
  );
  return lines.join("\n");
}

export const recommendTripCourse: ToolDef = {
  name: "recommendTripCourse",
  description:
    "Recommends popular Korea trip courses tailored to a foreign visitor's profile/persona — e.g. 20s women " +
    "(K-beauty, hair/nail salons, photo studios, hanbok), families (hanbok + palace, theme parks), couples, " +
    "K-pop/Hallyu fans (agency streets, concerts), foodies (markets, BBQ, chimaek), and culture/history lovers — " +
    "as a curated set of what visitors like them actually do, with chips into hours, routes, areas, menus and " +
    `app workarounds. Curated knowledge, no booking or ads. Part of ${SERVICE_NAME}.`,
  inputSchema: {
    persona: z
      .string()
      .optional()
      .describe(
        "Traveler profile, e.g. '20s woman', 'family with kids', 'couple', 'K-pop fan', 'foodie', 'history lover', " +
          "'first-timer'. Omit for the classic first-timer course.",
      ),
    interest: z.string().optional().describe("Optional extra focus, e.g. 'photography', 'shopping', 'nightlife'."),
  },
  annotations: {
    title: "Recommend Trip Courses by Traveler Profile",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: (args) => {
    const persona = String(args.persona ?? "").trim();
    const interest = args.interest ? String(args.interest) : undefined;
    const q = `${persona} ${interest ?? ""}`.trim();
    const matched = q ? PERSONAS.find((p) => p.match.test(q)) : undefined;
    const p = matched ?? GENERIC;
    return ok(render(p, Boolean(matched), interest), p.chips);
  },
};
