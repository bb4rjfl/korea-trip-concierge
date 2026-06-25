import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok } from "../lib/responses.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * getAreaGuide — curated one-paragraph neighborhood guides for foreign visitors.
 * Starts with a hand-picked set of high-traffic Seoul areas; expandable. Value
 * over plain LLM: concise, foreigner-oriented, links into the other tools.
 */

interface Area {
  keys: RegExp;
  name: string;
  blurb: string;
  spots: string[];
  getThere: string;
  interests: Partial<Record<"food" | "shopping" | "history" | "nightlife", string>>;
}

const AREAS: Area[] = [
  {
    keys: /(myeong-?dong|명동)/i,
    name: "Myeongdong (명동)",
    blurb:
      "Seoul's busiest shopping & street-food district — neon-lit, packed, and the most foreigner-ready area in the city (English signage, currency exchange, tax-free shops).",
    spots: ["Myeongdong street-food alley", "Myeongdong Cathedral", "Lotte Department Store", "Namsan Cable Car (nearby)"],
    getThere: "Myeongdong Stn (Line 4) or Euljiro 1-ga (Line 2).",
    interests: { food: "Street stalls (tornado potato, grilled cheese lobster) after 4pm.", shopping: "Cosmetics flagships and tax-free department stores." },
  },
  {
    keys: /(hongdae|hongik|홍대)/i,
    name: "Hongdae (홍대)",
    blurb:
      "Youthful art-and-music quarter around Hongik University — indie clubs, buskers, themed cafés, and budget eats. Liveliest at night.",
    spots: ["Hongdae busking street", "Gyeongui Line Forest Park", "Trick Eye Museum", "indie live clubs"],
    getThere: "Hongik Univ. Stn (Line 2 / AREX from the airport).",
    interests: { nightlife: "Clubs and live houses peak Fri–Sat after 10pm.", food: "Cheap eats, themed cafés, late-night pojangmacha." },
  },
  {
    keys: /(gangnam|강남)/i,
    name: "Gangnam (강남)",
    blurb:
      "Upscale business-and-fashion district — wide boulevards, flagship stores, K-beauty clinics, and polished dining. Less gritty, more premium.",
    spots: ["Gangnam Style statue (COEX)", "COEX Mall & Starfield Library", "Bongeunsa Temple", "Garosu-gil tree-lined street"],
    getThere: "Gangnam Stn (Line 2) or Samseong Stn (Line 2) for COEX.",
    interests: { shopping: "COEX Mall + Garosu-gil boutiques.", food: "Trendy restaurants and dessert cafés." },
  },
  {
    keys: /(insadong|insa-?dong|인사동)/i,
    name: "Insadong (인사동)",
    blurb:
      "Traditional-culture street — hanok teahouses, calligraphy and craft shops, galleries. The easiest place to feel 'old Korea' on foot.",
    spots: ["Ssamziegil shopping maze", "traditional teahouses", "antique & craft shops", "Jogyesa Temple (nearby)"],
    getThere: "Anguk Stn (Line 3) Exit 6.",
    interests: { history: "Pair with Gyeongbokgung & Bukchon Hanok Village, both a short walk away.", shopping: "Crafts, hanji paper, souvenirs." },
  },
  {
    keys: /(seongsu|성수)/i,
    name: "Seongsu (성수동)",
    blurb:
      "Former factory district turned hip café-and-concept-store hub — 'Brooklyn of Seoul'. Industrial-chic cafés, pop-ups, and walk-in dining.",
    spots: ["converted-warehouse cafés", "Seongsu handmade-shoe street", "Seoul Forest park", "designer pop-up stores"],
    getThere: "Seongsu Stn (Line 2) or Seoul Forest Stn (Bundang Line).",
    interests: { food: "Specialty coffee and walk-in brunch spots.", shopping: "Concept stores and pop-ups." },
  },
  {
    keys: /(itaewon|이태원)/i,
    name: "Itaewon (이태원)",
    blurb:
      "Seoul's most international quarter — global restaurants, English everywhere, halal options, and a buzzing nightlife. The easiest area for non-Korean speakers.",
    spots: ["world-cuisine restaurants", "Itaewon antique furniture street", "Leeum Museum of Art", "Gyeongridan-gil cafés"],
    getThere: "Itaewon Stn (Line 6).",
    interests: { food: "Halal, Western, and global cuisines with English menus.", nightlife: "Bars and clubs, busiest Fri–Sat." },
  },
  {
    keys: /(bukchon|북촌)/i,
    name: "Bukchon Hanok Village (북촌한옥마을)",
    blurb:
      "A preserved hillside of traditional hanok houses between two palaces — postcard alleys and city views. A residential area, so visit quietly and by day.",
    spots: ["Bukchon 8 Views photo spots", "hanok alleys", "Gyeongbokgung & Changdeokgung (both adjacent)", "craft workshops"],
    getThere: "Anguk Stn (Line 3) Exit 2.",
    interests: { history: "Pair with Gyeongbokgung, Insadong, and Samcheongdong on foot." },
  },
  {
    keys: /(dongdaemun|동대문|ddp)/i,
    name: "Dongdaemun (동대문)",
    blurb:
      "24-hour fashion-and-shopping district anchored by the spaceship-like DDP. Wholesale malls, late-night shopping, and street food that never sleeps.",
    spots: ["Dongdaemun Design Plaza (DDP)", "all-night fashion malls", "Gwangjang Market (nearby)", "Heunginjimun Gate"],
    getThere: "Dongdaemun History & Culture Park Stn (Lines 2/4/5).",
    interests: { shopping: "Wholesale & retail fashion malls, many open past midnight.", food: "Late-night street food and Gwangjang Market." },
  },
];

const INTERESTS = ["food", "shopping", "history", "nightlife"] as const;

function renderGuide(a: Area, interest?: string): string {
  const lines = [
    `🗺️ **${a.name}**`,
    "",
    a.blurb,
    "",
    "**Top spots**",
    ...a.spots.map((s) => `- ${s}`),
    "",
    `**Getting there:** ${a.getThere}`,
  ];
  if (interest) {
    const note = a.interests[interest as keyof Area["interests"]];
    if (note) lines.push("", `**For ${interest}:** ${note}`);
  }
  return lines.join("\n");
}

function renderUnknown(areaQuery: string): string {
  const known = AREAS.map((x) => x.name.split(" ")[0]).join(", ");
  return [
    `🗺️ **No hand-written guide for "${areaQuery}" yet**`,
    "",
    `I have curated guides for: ${known}.`,
    `Want one of those, or should I **search real places in ${areaQuery}** instead?`,
  ].join("\n");
}

// Footer for a matched guide — chips chain into the other tools for "here".
const CHOICES: Choice[] = [
  { emoji: "🧭", cmdEn: "Find foreigner essentials here", cmdKo: "근처 필수시설", descEn: "ATM, pharmacy, exchange" },
  { emoji: "🚇", cmdEn: "How do I get here?", cmdKo: "가는 길", descEn: "public-transit route" },
  { emoji: "🕒", cmdEn: "Is it good to go now?", descEn: "live hours + weather" },
  { emoji: "🌤️", cmdEn: "Weather & fine dust today", descEn: "forecast + air quality" },
];

/** Footer when the area isn't in our curated set — steer to a real search of
 *  that same area instead of dead-end "here" chips. */
function unknownChoices(areaQuery: string): Choice[] {
  return [
    { emoji: "🔎", cmdEn: `Search real places in ${areaQuery}`, descEn: "live place search" },
    { emoji: "🧭", cmdEn: `Find foreigner essentials in ${areaQuery}`, descEn: "ATM, pharmacy, exchange" },
    { emoji: "🗺️", cmdEn: "Show me a curated area instead", descEn: "Myeongdong, Hongdae, Gangnam…" },
  ];
}

export const getAreaGuide: ToolDef = {
  name: "getAreaGuide",
  description:
    "Gives a concise English one-paragraph guide and top spots for a Korean neighborhood, tailored to foreign " +
    "visitors, with how-to-get-there and interest-based tips. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    area: z.string().describe("Neighborhood name, e.g. 'Myeongdong' or '성수동'."),
    interest: z
      .enum(INTERESTS)
      .optional()
      .describe("Optional focus: food, shopping, history, or nightlife."),
  },
  annotations: {
    title: "Get Neighborhood Guide",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: (args) => {
    const area = String(args.area ?? "").trim();
    const interest = args.interest ? String(args.interest) : undefined;
    const a = AREAS.find((x) => x.keys.test(area));
    if (!a) return ok(renderUnknown(area), unknownChoices(area));
    return ok(renderGuide(a, interest), CHOICES);
  },
};
