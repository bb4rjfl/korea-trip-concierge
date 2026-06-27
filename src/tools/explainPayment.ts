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
    match: /(bus|subway|metro|transit|transport|t-?money|tmoney|cashbee|climate card|k-?pass|교통|버스|지하철|기후동행)/i,
    label: "Public transit (T-money, transfers, passes)",
    works: [
      "**T-money / Cashbee card** — buy + **cash-charge** at any convenience store (~₩2,500 card). Works on all buses, subways, and most taxis.",
      "Some subway lines accept **contactless foreign Visa/Mastercard** at open-loop gates, but coverage is partial — don't rely on it.",
    ],
    avoid: [
      "Inserting a foreign card into the bus reader — most do **not** take foreign cards directly.",
      "Forgetting to **tap OUT** — on buses and transfers you must tap when leaving, or you lose the **free 30-minute transfer discount** and can be overcharged.",
      "Sharing one card for two people — each rider needs their **own** card.",
    ],
    tip: "Tap IN and OUT every ride. Heavy travel for a few days? Look at the **Climate Card** (Seoul unlimited, ~₩65,000/30 days) or **K-Pass** (spend rebate). Refund a T-money balance (≤₩20,000, ₩500 fee) at convenience stores; the card deposit isn't refundable.",
  },
  {
    match: /(taxi|cab|kakao ?t|uber|택시)/i,
    label: "Taxi (and avoiding overcharges)",
    works: [
      "**Metered taxis** — pay **cash** or a **foreign card** at the terminal; say \"card, please / 카드요\".",
      "**Kakao T** — hail with an email/overseas number, then choose **\"Pay to the driver\"** (registering a foreign card in-app often fails). **Uber** and **k.ride** take foreign cards in-app.",
    ],
    avoid: [
      "Drivers who **turn the meter off** and quote a flat fare — insist on the meter (\"미터기 켜주세요\").",
      "Unmarked **\"call van\"** touts at Incheon Airport — they massively overcharge; use the official taxi queue, AREX, or an airport bus.",
      "Assuming every taxi has a working card terminal late at night — carry some cash.",
    ],
    tip: "Insist on the meter. A typical Incheon Airport → central Seoul ride is ~₩60,000–100,000 (+tolls). Overcharged or refused? Note the plate and call **1330** (24h, English) — they help you report it.",
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
    // Before "admission" so "hospital admission / ER" isn't read as a ticket booth (F1).
    match: /(hospital|clinic|emergency room|\ber\b|doctor|pharmac|medical|dentist|병원|의원|약국|진료|응급실|치과)/i,
    label: "Hospitals, clinics & pharmacies",
    works: [
      "**Foreign cards** and **cash** at most hospitals, clinics, and pharmacies — international clinics at big/university hospitals are used to foreign cards.",
      "Keep the itemized **receipt + diagnosis** for a **travel-insurance** claim.",
    ],
    avoid: [
      "Assuming a small neighborhood clinic has English staff — head to a **university/international hospital** for English service.",
      "Domestic-only insurance / benefit apps (residents only).",
    ],
    tip: "Pay out of pocket (card or cash) and claim on travel insurance. Emergencies: **119** (ambulance, free), **1339** (medical info / nearest ER), **1330** (24h English + live interpretation).",
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
  {
    match: /(ktx|srt|train|rail|korail|기차|열차|기차표|승차권)/i,
    label: "Train tickets (KTX / SRT)",
    works: [
      "**Foreign cards** in the **Korail / Let's Korail** app and **SRT** app (switch to English), and at staffed counters.",
      "Cash or card at the **station ticket counter**.",
    ],
    avoid: [
      "Self-service station **kiosks** — many post **\"Only Domestic Cards Accepted\"** and reject foreign cards.",
      "Last-minute booking around **Seollal / Chuseok** — trains sell out; book early in the app.",
    ],
    tip: "Buy in the Korail or SRT app with your foreign card, or use the counter — skip the domestic-only kiosks.",
  },
  {
    match: /(tax.?refund|vat|refund|tax.?free|텍스|환급|부가세)/i,
    label: "Tax refund (VAT) for tourists",
    works: [
      "Spend **≥₩15,000** at a **\"Tax Free\"** store and show your **passport**.",
      "**Immediate refund** at the store counter for smaller buys, or take the refund **slip** to claim at the airport.",
    ],
    avoid: [
      "Forgetting your **passport** — it's required to issue the refund.",
      "Packing refund goods deep in checked luggage — you may need to **show them** at airport customs.",
      "Leaving too little time at the airport — the customs-validation + refund-counter steps take a while.",
    ],
    tip: "At the airport: scan the slip at a **customs/refund kiosk** (after check-in, before security; keep goods accessible), then collect the refund. Eligible on stays ≤6 months; you get back ≈5–7% of the price.",
  },
  {
    match: /(online|website|app payment|e.?commerce|coupang|gmarket|booking site|결제\s*오류|온라인|쇼핑몰)/i,
    label: "Online & in-app payments",
    works: [
      "**International booking sites** (Klook, Trazy, Agoda, airline/hotel sites) take foreign cards.",
      "**Global versions** of Korean shops (Coupang Global, Gmarket Global) where offered.",
    ],
    avoid: [
      "Most Korean checkout pages route through **domestic gateways + identity verification (본인인증)** — foreign cards often fail, sometimes only after the first order.",
      "Apps needing a **Korean phone number / Korean bank account** (KakaoPay, Naver Pay, Toss).",
    ],
    tip: "Prefer the **global/English** version or an international reseller (Klook/Trazy) for tickets. Stuck on a Korean-only flow? Call **1330** (24h, English).",
  },
  {
    match: /(atm|withdraw|cash machine|cashpoint|현금인출|에이티엠|인출)/i,
    label: "ATMs & withdrawing cash",
    works: [
      "**\"Global ATM\"** machines (in CU/GS25/7-Eleven, banks, airports) take foreign cards — look for **Visa/Plus/Cirrus/Mastercard** logos.",
      "Set your PIN to **4 digits** before you travel — Korean ATMs expect 4.",
    ],
    avoid: [
      "Ordinary domestic-only ATMs — they reject foreign cards.",
      "The ATM's **\"convert to your home currency\" (DCC)** offer — always choose **KRW** for a better rate.",
      "Three wrong PIN tries — it can **lock** your card.",
    ],
    tip: "Withdraw at Global ATMs in convenience stores (24h). Citibank / Standard Chartered and major banks (KB, Woori, Hana, Shinhan) are the most reliable.",
  },
  {
    match: /(jjimjilbang|jjimjil|sauna|찜질방|사우나|목욕탕|bathhouse|\bspa\b|스파)/i,
    label: "Jjimjilbang / sauna / spa",
    works: [
      "**Cash** at the front desk (entry ~₩8,000–15,000); bigger spas also take **foreign cards**.",
      "You get a **locker key / wristband** — food and drinks inside are tapped to it and **paid in cash at checkout**.",
    ],
    avoid: [
      "Assuming card works at every in-building counter — many snack bars inside are **cash-only**.",
      "Losing the wristband — there's a replacement fee.",
    ],
    tip: "Bring **cash** for entry and snacks. Shoes go in a shoe locker first; settle the wristband total at the front desk when you leave.",
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

function render(g: PaymentGuide, matched: boolean, cardType?: string): string {
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

// Chip palette: most stay in explainPayment (no area needed); a few bridge to the
// sibling tool the situation implies (ATM/pharmacy/eat/menu/route), so a payment
// answer flows into the next step instead of a dead-end (P2, mirrors N4).
const P = {
  transit: { emoji: "🚌", cmdEn: "How do I pay on the bus or subway?", cmdKo: "교통 결제", descEn: "T-money, tap-out, transfers" },
  taxi: { emoji: "🚕", cmdEn: "How do I avoid getting overcharged by taxis?", descEn: "meter, fair fare, 1330" },
  refund: { emoji: "🧾", cmdEn: "How does the tourist tax refund work?", descEn: "VAT refund steps" },
  atm: { emoji: "🏧", cmdEn: "Find a Global ATM near me", descEn: "foreign-card ATMs nearby" },
  pharmacy: { emoji: "💊", cmdEn: "Find a pharmacy near me", descEn: "약국 + after-hours" },
  emergency: { emoji: "🆘", cmdEn: "Medical emergency — what do I do?", descEn: "119, 1339, 1330" },
  eat: { emoji: "🍽️", cmdEn: "Find foreigner-friendly places to eat", descEn: "restaurants that take foreign cards" },
  menu: { emoji: "🍜", cmdEn: "Explain a Korean menu item", descEn: "what's in this dish" },
  route: { emoji: "🚇", cmdEn: "Plan a transit route", descEn: "subway/bus directions" },
} satisfies Record<string, Choice>;

/** 3 next-step chips tailored to the matched payment situation (P2). */
function paymentChips(label: string, matched: boolean): Choice[] {
  if (!matched) return [P.transit, P.taxi, P.refund];
  if (label.startsWith("Public transit")) return [P.taxi, P.route, P.refund];
  if (label.startsWith("Taxi")) return [P.transit, P.route, P.atm];
  if (label.startsWith("ATMs")) return [P.atm, P.transit, P.taxi];
  if (label.startsWith("Hospitals")) return [P.pharmacy, P.emergency, P.taxi];
  if (label.startsWith("Tax refund")) return [P.transit, P.atm, P.eat];
  if (label.startsWith("Restaurants")) return [P.menu, P.eat, P.taxi];
  if (label.startsWith("Self-order")) return [P.menu, P.eat, P.transit];
  if (label.startsWith("Online")) return [P.refund, P.atm, P.transit];
  if (label.startsWith("Department")) return [P.refund, P.atm, P.eat];
  if (label.startsWith("Train")) return [P.transit, P.route, P.refund];
  if (label.startsWith("Admission")) return [P.transit, P.route, P.eat];
  if (label.startsWith("Jjimjilbang")) return [P.atm, P.transit, P.eat];
  return [P.transit, P.taxi, P.refund];
}

export const explainPayment: ToolDef = {
  name: "explainPayment",
  description:
    "Explains which payment methods a foreign visitor can actually use in a given Korean situation — transit " +
    "(T-money, tap-out transfers, Climate Card/K-Pass), taxis (meter + overcharge avoidance), KTX/SRT trains, " +
    "ATMs (Global ATM, DCC), the tourist VAT tax refund, online/app checkout, markets, kiosks, restaurants, " +
    "hotels, admission — plus tipping, bill-splitting, and Apple/Samsung Pay reality, with foreign-card caveats " +
    `and cash alternatives. Part of ${SERVICE_NAME}.`,
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
    const matched = GUIDES.find((x) => x.match.test(situation));
    const g = matched ?? GENERIC;
    return ok(render(g, Boolean(matched), cardType), paymentChips(g.label, Boolean(matched)));
  },
};
