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
];

function render(areaQuery: string, interest?: string): string {
  const a = AREAS.find((x) => x.keys.test(areaQuery));
  if (!a) {
    const known = AREAS.map((x) => x.name.split(" ")[0]).join(", ");
    return [
      `🗺️ **No guide yet for "${areaQuery}"**`,
      "",
      `Curated areas so far: ${known}.`,
      "Ask for one of those, or use **Search places** to explore freely.",
    ].join("\n");
  }
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
    const key = interest.toLowerCase() as keyof Area["interests"];
    const note = a.interests[key];
    if (note) lines.push("", `**For ${interest}:** ${note}`);
  }
  return lines.join("\n");
}

const CHOICES: Choice[] = [
  { emoji: "🍜", cmdEn: "Find foreigner-friendly restaurants here", cmdKo: "근처 맛집", descEn: "stores that take foreign cards" },
  { emoji: "🚇", cmdEn: "How do I get here?", cmdKo: "가는 길", descEn: "public-transit route" },
  { emoji: "🕒", cmdEn: "Is it good to go now?", descEn: "live hours, crowds, weather" },
];

export const getAreaGuide: ToolDef = {
  name: "getAreaGuide",
  description:
    "Gives a concise English one-paragraph guide and top spots for a Korean neighborhood, tailored to foreign " +
    "visitors, with how-to-get-there and interest-based tips. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    area: z.string().describe("Neighborhood name, e.g. 'Myeongdong' or '성수동'."),
    interest: z
      .string()
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
    const area = String(args.area ?? "");
    const interest = args.interest ? String(args.interest) : undefined;
    return ok(render(area, interest), CHOICES);
  },
};
