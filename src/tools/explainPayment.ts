import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok } from "../lib/responses.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * explainPayment — curated, knowledge-based (no external API). Encodes the
 * real-world "can a foreign card / contactless actually be used here?" rules
 * that trip up visitors, by situation. Value over plain LLM: structured,
 * Korea-specific, up-to-date caveats curated for foreigners.
 */

interface PaymentGuide {
  match: RegExp;
  label: string;
  works: string[];
  avoid: string[];
  tip: string;
}

const GUIDES: PaymentGuide[] = [
  {
    match: /(tip|tipping|gratuity|service charge|팁)/i,
    label: "Tipping",
    works: [
      "**No tipping** — Korea has no tipping culture; service is included in the price.",
      "Rounding up or leaving change is fine but never expected.",
    ],
    avoid: [
      "Leaving cash on the table — staff may chase you to return it.",
      "Tipping taxi drivers, cafés, or restaurants — it can cause confusion.",
    ],
    tip: "Don't tip. The price you see is the price you pay. (Some hotels and private tour guides accept optional tips.)",
  },
  {
    match: /(split|share the bill|divide the bill|going dutch|separate check|더치|나눠|각자)/i,
    label: "Splitting the bill",
    works: [
      "**Each person taps their own card** at the counter — most places do this happily (“따로 계산이요” = pay separately).",
      "Or one person pays and friends send their share by cash.",
    ],
    avoid: [
      "Expecting to split one bill across several **foreign** cards — terminals often do one card, so settle the rest in cash.",
      "Domestic split apps (Toss, KakaoPay 1/N) — they need a Korean bank account.",
    ],
    tip: "Say “따로 계산해 주세요” (pay separately). For foreign cards, one card + cash for the rest is the smoothest.",
  },
  {
    match: /(apple ?pay|samsung ?pay|google ?pay|mobile pay|tap to pay|phone pay|애플페이|삼성페이|구글페이)/i,
    label: "Mobile pay (Apple / Samsung / Google Pay)",
    works: [
      "**Apple Pay** works at terminals showing the contactless / Apple Pay logo — but only **some** Korean merchants support it (growing, not universal).",
      "**Samsung Pay** generally needs a **Korean-issued** card to be useful.",
    ],
    avoid: [
      "Assuming mobile pay works everywhere — coverage is **spotty**, especially small shops and transit gates.",
      "**Google Pay** — not usable for in-store payments in Korea.",
    ],
    tip: "Treat mobile pay as a nice bonus, not your main method. Always carry a physical foreign card **and** some cash.",
  },
  {
    match: /(bus|subway|metro|transit|transport|t-?money|tmoney|교통|버스|지하철)/i,
    label: "Public transit (bus / subway)",
    works: [
      "**T-money / Cashbee card** (buy + cash-charge at any convenience store, ~₩2,500 card). Works everywhere.",
      "Some lines accept **contactless foreign Visa/Mastercard** via open-loop gates, but coverage is partial — don't rely on it.",
    ],
    avoid: [
      "Inserting a foreign card into the bus reader — most do **not** take foreign cards directly.",
      "Mobile pay (Samsung/Apple Pay registered to a foreign card) — acceptance at gates is inconsistent.",
    ],
    tip: "Buy a T-money card on arrival and charge it with cash. It's the single most reliable transit payment for foreigners.",
  },
  {
    match: /(taxi|cab|택시)/i,
    label: "Taxi",
    works: [
      "**Cash** (always).",
      "**Foreign credit cards** in most metered taxis with a card terminal — say \"card, please / 카드요\".",
      "**Kakao T / Uber** apps let you pre-register a foreign card (app-based, not a Korea card).",
    ],
    avoid: ["Assuming every taxi has a working terminal late at night — carry some cash as backup."],
    tip: "For airport or long rides, app-hailing avoids cash and language friction.",
  },
  {
    match: /(market|street|vendor|pojangmacha|시장|포장마차|노점)/i,
    label: "Traditional market / street vendor",
    works: ["**Cash** is king.", "Some stalls accept **domestic transfer / local QR** only."],
    avoid: ["Foreign cards — most small vendors are cash-only.", "Expecting card terminals at food stalls."],
    tip: "Carry small-denomination cash (₩1,000–₩10,000). ATMs marked 'Global' dispense cash from foreign cards.",
  },
  {
    match: /(convenience|cu|gs25|7.?eleven|emart24|편의점)/i,
    label: "Convenience store",
    works: [
      "**Foreign credit/debit cards** (tap or insert) — widely accepted at CU, GS25, 7-Eleven, Emart24.",
      "**Cash**.",
    ],
    avoid: ["Domestic-only QR pay apps (KakaoPay/Naver Pay) unless you have a Korean account."],
    tip: "Convenience stores are the most reliable place to use a foreign card for small purchases — and to buy/charge a T-money card.",
  },
  {
    match: /(department|duty.?free|mall|백화점|면세)/i,
    label: "Department store / duty-free",
    works: [
      "**Foreign cards** (all major brands) and **mobile pay** registered abroad.",
      "**Tax-free / immediate tax refund** for tourists — show your passport at the counter.",
    ],
    avoid: ["Forgetting your passport — it's required for tax-free purchases."],
    tip: "Ask for 'tax refund / 택스 리펀드' and keep receipts; refunds are processed at the airport or instantly in-store.",
  },
  {
    match: /(kiosk|self.?order|unmanned|키오스크|무인)/i,
    label: "Self-order kiosk",
    works: [
      "**Foreign cards** at many franchise kiosks (insert/tap).",
      "Cash where a bill slot exists.",
    ],
    avoid: [
      "Kiosks that only show a QR for **domestic apps** (KakaoPay/Naver Pay) — those need a Korean account.",
      "Membership-phone prompts — you can skip them (look for 'No / 아니오').",
    ],
    tip: "If a kiosk only offers domestic-app QR, ask staff to ring it up at the counter instead.",
  },
  {
    match: /(restaurant|dining|eatery|diner|food court|식당|음식점|밥집|맛집)/i,
    label: "Restaurants & dining",
    works: [
      "**Foreign cards** at most sit-down restaurants, franchises, and department-store food courts.",
      "**Cash** always.",
    ],
    avoid: [
      "Small old eateries, pojangmacha, and some noodle/gukbap shops are **cash-only**.",
      "Assuming you pay at the table — in Korea you usually pay at the **counter on the way out**.",
    ],
    tip: "Ask “카드 되나요?” (do you take card?). Carry some cash for the small local spots that don't.",
  },
  {
    match: /(hotel|accommodation|guesthouse|hostel|motel|pension|lodging|check.?in|숙소|호텔|모텔|게스트하우스)/i,
    label: "Hotels & accommodation",
    works: [
      "**Foreign cards** at all hotels; a **card hold / deposit** at check-in is normal.",
      "**Passport** required at check-in for foreign guests.",
    ],
    avoid: [
      "Expecting the deposit hold to release instantly — it can take a few days.",
      "Budget guesthouses/pensions that are **cash- or bank-transfer-only** — confirm before booking.",
    ],
    tip: "Bring the card you booked with + your passport. Keep some cash for small family-run stays.",
  },
  {
    match: /(temple|palace|admission|entrance|entry fee|ticket booth|museum|attraction|사찰|입장|관람|매표|입장료)/i,
    label: "Admission (palaces, temples, attractions)",
    works: [
      "**Cards / kiosks** at major sites (Gyeongbokgung, big museums, theme parks).",
      "**Cash** at small temple and local-museum ticket booths.",
    ],
    avoid: ["Assuming a small temple or rural attraction takes cards — many gates are **cash-only**."],
    tip: "Carry ₩10,000–₩20,000 cash for admission. Many palaces are ~₩3,000 (some free) and close one day a week (often Mon/Tue).",
  },
];

const GENERIC: PaymentGuide = {
  match: /.*/,
  label: "General payment in Korea",
  works: [
    "**Foreign Visa/Mastercard/Amex** at most franchises, hotels, department stores, and larger restaurants.",
    "**Cash (KRW)** everywhere; withdraw from 'Global ATM' machines.",
  ],
  avoid: [
    "Domestic-only rails: **KakaoPay / Naver Pay / Toss / local QR** generally need a Korean bank account or phone.",
    "Assuming small/old shops take cards — many are cash-only.",
  ],
  tip: "Keep both a foreign card and some cash. For transit, use a T-money card.",
};

function render(situation: string, cardType?: string): string {
  const matched = GUIDES.find((x) => x.match.test(situation));
  const g = matched ?? GENERIC;
  const cardNote = cardType
    ? `\n\n_Your card: **${cardType}** — foreign-issued cards follow the same rules above; acceptance depends on the merchant terminal, not the brand._`
    : "";
  // Signal when we couldn't match the situation, so the user knows this is
  // general guidance (not silently pretending we understood "tipping" etc.).
  const head = matched
    ? `💳 **Paying as a foreign visitor — ${g.label}**`
    : `💳 **General payment in Korea**\n\n_(I gave general guidance — name the exact situation, e.g. "taxi", "tipping", "Apple Pay", for tailored tips.)_`;
  return [
    head,
    "",
    "**✅ What works**",
    ...g.works.map((w) => `- ${w}`),
    "",
    "**⛔ What to avoid / won't work**",
    ...g.avoid.map((a) => `- ${a}`),
    "",
    `**💡 Tip:** ${g.tip}${cardNote}`,
  ].join("\n");
}

// Location-free chips: keep the user in explainPayment (which needs no area) and
// surface the high-value new topics, instead of a "find stores nearby" dead-end.
const CHOICES: Choice[] = [
  { emoji: "🚌", cmdEn: "How do I pay on the bus or subway?", cmdKo: "교통 결제", descEn: "T-money + transit cards" },
  { emoji: "📱", cmdEn: "Can I use Apple Pay or Samsung Pay?", descEn: "mobile-pay reality in Korea" },
  { emoji: "💵", cmdEn: "Do I tip, and how do we split the bill?", descEn: "tipping + splitting etiquette" },
];

export const explainPayment: ToolDef = {
  name: "explainPayment",
  description:
    "Explains which payment methods a foreign visitor can actually use in a given Korean situation — transit, " +
    "taxi, market, kiosk, restaurant, hotel, admission — plus tipping etiquette, bill-splitting, and Apple/" +
    "Samsung Pay reality, including foreign-card and contactless caveats and cash alternatives. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    situation: z.string().describe("The situation, e.g. 'paying for the subway' or 'street food market'."),
    cardType: z.string().optional().describe("Optional card brand/type, e.g. 'Visa credit'."),
  },
  annotations: {
    title: "Explain Payment Options for Foreigners",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: (args) => {
    const situation = String(args.situation ?? "");
    const cardType = args.cardType ? String(args.cardType) : undefined;
    return ok(render(situation, cardType), CHOICES);
  },
};
