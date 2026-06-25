import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok } from "../lib/responses.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * translateMenuContext — curated, knowledge-based. More than literal
 * translation: spice level, key ingredients, and common allergens for Korean
 * dishes, plus allergy flags tailored to the user's concerns.
 */

interface Dish {
  match: RegExp;
  en: string;
  desc: string;
  spice: 0 | 1 | 2 | 3; // 0 none … 3 very spicy
  allergens: string[]; // lowercase tokens: gluten, egg, soy, shellfish, fish, peanut, dairy, sesame, pork
}

const DISHES: Dish[] = [
  { match: /김치찌개|kimchi.?jjigae/i, en: "Kimchi stew", desc: "Tangy, fermented-cabbage stew, usually with pork and tofu.", spice: 2, allergens: ["soy", "pork", "fish"] },
  { match: /된장찌개|doenjang/i, en: "Soybean-paste stew", desc: "Savory, earthy stew from fermented soybean paste with vegetables and tofu.", spice: 1, allergens: ["soy", "shellfish"] },
  { match: /비빔밥|bibimbap/i, en: "Bibimbap", desc: "Rice topped with seasoned vegetables, egg, and gochujang; mix before eating.", spice: 1, allergens: ["egg", "soy", "sesame"] },
  { match: /불고기|bulgogi/i, en: "Bulgogi", desc: "Sweet-savory marinated grilled beef.", spice: 0, allergens: ["soy", "sesame", "gluten"] },
  { match: /삼겹살|samgyeopsal/i, en: "Grilled pork belly", desc: "DIY-grilled pork belly, wrapped in lettuce with garlic and ssamjang.", spice: 0, allergens: ["soy", "pork", "sesame"] },
  { match: /떡볶이|tteokbokki/i, en: "Tteokbokki", desc: "Chewy rice cakes in a sweet-spicy gochujang sauce.", spice: 3, allergens: ["gluten", "soy"] },
  { match: /순두부|sundubu/i, en: "Soft-tofu stew", desc: "Silky soft tofu in a spicy seafood-or-pork broth, served bubbling.", spice: 2, allergens: ["soy", "egg", "shellfish", "fish"] },
  { match: /냉면|naengmyeon/i, en: "Cold buckwheat noodles", desc: "Chilled noodles in icy broth (mul) or spicy sauce (bibim).", spice: 1, allergens: ["gluten", "egg", "soy"] },
  { match: /김밥|kimbap|gimbap/i, en: "Kimbap", desc: "Seaweed rice rolls with vegetables, egg, and often ham or tuna.", spice: 0, allergens: ["egg", "sesame", "fish", "soy"] },
  { match: /제육|jeyuk/i, en: "Spicy stir-fried pork", desc: "Pork stir-fried in a spicy gochujang marinade.", spice: 2, allergens: ["soy", "pork", "sesame"] },
  { match: /삼계탕|samgyetang/i, en: "Ginseng chicken soup", desc: "Whole young chicken stuffed with rice, ginseng, and garlic in a mild broth — a summer health dish.", spice: 0, allergens: [] },
  { match: /잡채|japchae/i, en: "Glass noodle stir-fry", desc: "Sweet-savory sweet-potato glass noodles with vegetables and beef.", spice: 0, allergens: ["soy", "sesame", "egg"] },
  { match: /해장국|haejangguk/i, en: "Hangover soup", desc: "Hearty soup (often with ox-blood, pork spine, or cabbage) eaten to recover from drinking.", spice: 1, allergens: ["soy"] },
  { match: /순대|sundae/i, en: "Korean blood sausage", desc: "Steamed pig-intestine sausage filled with noodles and barley — savory, often with offal.", spice: 0, allergens: ["pork", "soy"] },
  { match: /파전|pajeon|jeon/i, en: "Savory pancake", desc: "Pan-fried scallion (and often seafood) pancake; crispy edges, soft center.", spice: 0, allergens: ["gluten", "egg", "shellfish", "soy"] },
];

const SPICE_LABEL = ["🌶️ none", "🌶️ mild", "🌶️🌶️ medium", "🌶️🌶️🌶️ hot"];

function renderDish(d: Dish, concerns: string[]): string {
  const hits = d.allergens.filter((a) => concerns.includes(a));
  const allergenLine = d.allergens.length
    ? `Allergens: ${d.allergens.join(", ")}`
    : "No common allergens";
  const warn = hits.length ? `\n  - ⚠️ **Contains ${hits.join(", ")}** (you flagged this)` : "";
  return `- **${d.en}** — ${d.desc}\n  - Spice: ${SPICE_LABEL[d.spice]} · ${allergenLine}${warn}`;
}

function render(menuText: string, concerns: string[]): string {
  const found = DISHES.filter((d) => d.match.test(menuText));
  const head = `🍽️ **Menu, explained in context**`;
  if (found.length === 0) {
    return [
      head,
      "",
      `I couldn't match a known dish in: _"${menuText.slice(0, 120)}"_.`,
      "Try a single dish name (Korean or romanized), e.g. `tteokbokki`, `bibimbap`, `삼겹살`.",
    ].join("\n");
  }
  const lines = [head];
  if (concerns.length) lines.push("", `_Checking against your allergy concerns: **${concerns.join(", ")}**_`);
  lines.push("", ...found.map((d) => renderDish(d, concerns)));
  return lines.join("\n");
}

const CHOICES: Choice[] = [
  { emoji: "🗣️", cmdEn: "Make an ordering sentence", cmdKo: "주문 문장 만들기", descEn: "a phrase to order this" },
  { emoji: "🌶️", cmdEn: "Show only non-spicy options", descEn: "filter out spicy dishes" },
  { emoji: "🍜", cmdEn: "Find a place that serves this", descEn: "foreigner-friendly restaurants" },
];

export const translateMenuContext: ToolDef = {
  name: "translateMenuContext",
  description:
    "Explains Korean menu items with cultural, spice-level, and allergen context in English — more than " +
    "literal translation. Flags allergens against the visitor's stated concerns. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    menuText: z.string().describe("Menu text or dish name(s), Korean or romanized."),
    allergyConcerns: z
      .array(z.string())
      .optional()
      .describe("Allergens to flag, e.g. ['gluten','shellfish','peanut']."),
  },
  annotations: {
    title: "Explain Korean Menu in Context",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: (args) => {
    const menuText = String(args.menuText ?? "");
    const concerns = Array.isArray(args.allergyConcerns)
      ? (args.allergyConcerns as unknown[]).map((c) => String(c).toLowerCase())
      : [];
    return ok(render(menuText, concerns), CHOICES);
  },
};
