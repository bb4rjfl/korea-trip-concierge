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
  const g = GUIDES.find((x) => x.match.test(situation)) ?? GENERIC;
  const cardNote = cardType
    ? `\n\n_Your card: **${cardType}** — foreign-issued cards follow the same rules above; acceptance depends on the merchant terminal, not the brand._`
    : "";
  return [
    `💳 **Paying as a foreign visitor — ${g.label}**`,
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

const CHOICES: Choice[] = [
  { emoji: "🚌", cmdEn: "How do I pay on the bus?", cmdKo: "버스 결제", descEn: "transit payment details" },
  { emoji: "🏪", cmdEn: "Pay at a kiosk", cmdKo: "키오스크 결제", descEn: "self-order kiosk caveats" },
  { emoji: "🍜", cmdEn: "Find foreigner-friendly stores nearby", descEn: "stores that take foreign cards" },
];

export const explainPayment: ToolDef = {
  name: "explainPayment",
  description:
    "Explains which payment methods a foreign visitor can actually use in a given Korean situation " +
    "(transit, taxi, market, kiosk), including foreign-card and contactless caveats and cash alternatives. " +
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
