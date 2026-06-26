import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail } from "../lib/responses.js";
import { searchForeignerPois, hasPoiProvider, type PoiPlace } from "../lib/sources/poi.js";
import { resolvePlaceCoord } from "../lib/places.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * findForeignerFriendlyStore — "foreigner essentials" finder (D-013). The things
 * a visitor actually gets stuck on in a Korean neighborhood: currency exchange,
 * foreign-card ATMs, pharmacies, 24h convenience stores, tourist-info centers,
 * and foreign-card-friendly food.
 *
 * Differentiator = CURATED foreigner knowledge (which chains/options really work
 * for foreigners, how each works) — always available, no key needed (D-009
 * curation-grounding). When a POI key is present we also list real nearby spots
 * of that category. This is distinct from searchPlaceForeigner (general place
 * recommendations); here the need-type drives a known foreigner-readiness answer.
 */

const NEEDS = [
  "currencyExchange",
  "atm",
  "pharmacy",
  "convenience",
  "touristInfo",
  "foreignCardDining",
  "emergency",
] as const;
type Need = (typeof NEEDS)[number];

interface Essential {
  label: string;
  emoji: string;
  short: string; // one-liner for the overview
  tip: string; // curated foreigner guidance (the differentiator)
  query: string; // Korean keyword for live nearby POI search
}

const ESSENTIALS: Record<Need, Essential> = {
  currencyExchange: {
    label: "Currency exchange",
    emoji: "💱",
    short: "best rates at banks & licensed booths (Myeongdong/Itaewon)",
    tip: "Banks (KB, Woori, Shinhan, Hana) and **licensed exchange booths** give the best rates — Myeongdong and Itaewon have many no-commission booths. Bring your **passport**. Airport counters work but rates are worse, so change just enough there.",
    query: "환전",
  },
  atm: {
    label: "Foreign-card ATM",
    emoji: "🏧",
    short: "look for 'Global ATM' — convenience stores, banks, airports",
    tip: "Look for **“Global ATM”** or a card-network logo (Visa/Mastercard/Plus/Cirrus). ATMs inside **CU, GS25, 7-Eleven**, major banks, and airports take foreign cards; **Citibank** and **Standard Chartered** are the most reliable. Set your PIN to **4 digits** before you travel (3 wrong tries can lock the card), withdraw in **KRW**, and **decline** the machine's currency-conversion (DCC) offer for a better rate.",
    query: "ATM",
  },
  pharmacy: {
    label: "Pharmacy",
    emoji: "💊",
    short: "green '약' sign; convenience stores sell basic meds after hours",
    tip: "A pharmacy is **약국 (yakguk)** — look for a green **약** sign. Pharmacists in tourist areas often speak some English; show symptoms on your phone if needed. Hours are ~09:00–18:00 (some 24h near hospitals). After hours, **convenience stores** sell basic painkillers and digestives.",
    query: "약국",
  },
  convenience: {
    label: "Convenience store",
    emoji: "🏪",
    short: "24h lifeline: foreign cards, T-money reload, ATM, SIM",
    tip: "**CU, GS25, 7-Eleven, emart24** are everywhere and **24h**. They take **foreign cards**, **sell & reload T-money** transit cards, have **ATMs**, stock **SIM/eSIM**, and offer English self-checkout — your one-stop foreigner lifeline.",
    query: "편의점",
  },
  touristInfo: {
    label: "Tourist information center",
    emoji: "ℹ️",
    short: "free multilingual help; dial 1330 (24h) anywhere",
    tip: "Official **“i” Tourist Information Centers** give free English/Japanese/Chinese help, maps, and transit tips. Big ones: **Myeongdong, Gwanghwamun, Seoul Station, Incheon Airport**. Anywhere, anytime you can call the **1330 Korea Travel Hotline** (24h, multilingual) — just dial **1330**.",
    query: "관광안내소",
  },
  foreignCardDining: {
    label: "Foreign-card-friendly food",
    emoji: "💳",
    short: "franchises & department-store food halls take foreign cards",
    tip: "**Franchises and department-store food courts** reliably take foreign cards: **Olive Young, Starbucks, Paris Baguette, Lotte/Shinsegae food halls**, and most chain restaurants. Small old eateries and street stalls are often **cash-only** — carry some KRW and ask “카드 되나요?” (kadeu doynayo? = do you take card?).",
    query: "맛집",
  },
  emergency: {
    label: "Emergency & medical help",
    emoji: "🆘",
    short: "119 ambulance · 1339 medical · 1330 (24h English) · 약국 till ~9pm",
    tip: "**119** = ambulance/fire (free; has interpretation). **112** = police. **1339** = medical advice / nearest ER. **1330** = the 24h multilingual **Korea Travel Hotline** — they do **3-way medical interpretation** and route you. Pharmacies (**약국**, green sign) close ~20:00–21:00; after hours use a **24h pharmacy** or a hospital **ER** (foreign cards accepted). Bring your medicines' **generic names**.",
    query: "응급실",
  },
};

const NEED_BY_ALIAS: Record<string, Need> = {
  currencyexchange: "currencyExchange",
  exchange: "currencyExchange",
  currency: "currencyExchange",
  atm: "atm",
  pharmacy: "pharmacy",
  convenience: "convenience",
  conveniencestore: "convenience",
  touristinfo: "touristInfo",
  tourist: "touristInfo",
  foreigncarddining: "foreignCardDining",
  dining: "foreignCardDining",
  food: "foreignCardDining",
  restaurant: "foreignCardDining",
  emergency: "emergency",
  medical: "emergency",
  hospital: "emergency",
  ambulance: "emergency",
  doctor: "emergency",
  clinic: "emergency",
  sick: "emergency",
};

function resolveNeed(input?: string): Need | undefined {
  if (!input) return undefined;
  const k = input.toLowerCase().replace(/[^a-z]/g, "");
  return NEED_BY_ALIAS[k];
}

const CHOICES: Choice[] = [
  { emoji: "💳", cmdEn: "How do I pay here as a foreigner?", cmdKo: "결제 방법", descEn: "payment options guide" },
  { emoji: "🚇", cmdEn: "How do I get there?", descEn: "public-transit route" },
  { emoji: "🧭", cmdEn: "What other essentials are nearby?", descEn: "exchange, ATM, pharmacy, info" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry the search" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", descEn: "neighborhood overview instead" },
];

function renderNearby(places: PoiPlace[], query: string, need: Need): string[] {
  // Guard against junk rows: empty address, or a name that's just the bare search
  // keyword echoed back (e.g. a "맛집" row with no address).
  const q = query.trim();
  // For non-dining needs, drop café/restaurant/bar results the keyword search drags
  // in (an "ATM" search returning a pizzeria) — keeps the list on-need (Y11).
  const foodNeed = need === "foreignCardDining";
  const FOOD_RE = /caf[eé]|restaurant|bar\b|pub|bakery|dessert|bistro|커피|카페|맛집|식당|레스토랑/i;
  const clean = places.filter((p) => {
    const name = (p.name ?? "").trim();
    const addr = (p.address ?? "").trim();
    if (!name || !addr || name === q || name.startsWith(`${q} (`)) return false;
    if (!foodNeed && FOOD_RE.test(`${name} ${p.category ?? ""}`)) return false;
    return true;
  });
  if (!clean.length) return [];
  const lines = clean.map((p, i) => {
    const tel = p.tel ? ` · ☎ ${p.tel}` : "";
    return `**${i + 1}. ${p.name}**\n   📍 ${p.address}${tel}`;
  });
  return ["", "**Nearby:**", ...lines];
}

/** Overview when no specific need is given — a menu of essentials to pick from. */
function renderOverview(area: string): string {
  const items = NEEDS.map((n) => {
    const e = ESSENTIALS[n];
    return `- ${e.emoji} **${e.label}** — ${e.short}`;
  });
  return [
    `🧭 **Foreigner essentials in ${area}**`,
    "",
    "The things visitors get stuck on here — pick what you need:",
    "",
    ...items,
    "",
    "_Tap a need below (or ask, e.g. “foreign-card ATM near Myeongdong”)._",
  ].join("\n");
}

// Overview footer: let the visitor jump straight to a specific essential.
const OVERVIEW_CHOICES: Choice[] = [
  { emoji: "🏧", cmdEn: "Find a foreign-card ATM here", descEn: "ATMs that take foreign cards" },
  { emoji: "💱", cmdEn: "Where can I exchange money?", descEn: "best-rate currency exchange" },
  { emoji: "💊", cmdEn: "Find a pharmacy here", descEn: "약국 + after-hours options" },
  { emoji: "🏪", cmdEn: "Find a convenience store", descEn: "24h card/T-money/ATM" },
];

export const findForeignerFriendlyStore: ToolDef = {
  name: "findForeignerFriendlyStore",
  description:
    "Finds the foreigner essentials a visitor gets stuck on in a Korean neighborhood — currency exchange, " +
    "foreign-card ATMs, pharmacies, 24h convenience stores, tourist-information centers, foreign-card-" +
    "friendly food, and emergency/medical help (119/1339/1330) — with curated tips on which chains and " +
    `options actually work for foreigners, plus real nearby places. Part of ${SERVICE_NAME}.`,
  inputSchema: {
    area: z.string().describe("Neighborhood/area, e.g. 'Myeongdong' or '명동'."),
    need: z
      .string()
      .optional()
      .describe(
        "What you need: currencyExchange, atm (foreign-card), pharmacy, convenience, touristInfo, " +
          "foreignCardDining, or emergency (medical/119/1330) — synonyms understood. Omit for an overview.",
      ),
  },
  annotations: {
    title: "Find Foreigner Essentials",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (args) => {
    const area = String(args.area ?? "").trim();
    const need = resolveNeed(args.need as string | undefined);

    if (!area) {
      return fail(
        "Which area?",
        "Tell me a neighborhood (e.g. Myeongdong, Hongdae, Itaewon) and what you need — a foreign-card ATM, pharmacy, currency exchange, convenience store, or tourist info.",
        RETRY,
      );
    }

    // No specific need → overview menu (curated, always works).
    if (!need) {
      return ok(renderOverview(area), OVERVIEW_CHOICES);
    }

    const e = ESSENTIALS[need];
    const head = [`${e.emoji} **${e.label} in ${area}**`, "", e.tip];

    // Curated guidance always renders; add live nearby spots when a POI key exists.
    let nearby: string[] = [];
    if (hasPoiProvider()) {
      try {
        const coord = resolvePlaceCoord(area);
        const places = await searchForeignerPois({
          area,
          query: e.query,
          coord: coord ? { lat: coord.lat, lng: coord.lng } : undefined,
          limit: 5,
        });
        nearby = renderNearby(places, e.query, need);
      } catch {
        // Live lookup is best-effort; the curated tip already answered the need.
        nearby = ["", "_(Couldn't load nearby spots right now — tap “How do I get there?” or try again.)_"];
      }
    }

    return ok([...head, ...nearby].join("\n"), CHOICES);
  },
};
