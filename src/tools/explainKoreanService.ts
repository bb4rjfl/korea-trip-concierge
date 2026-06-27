import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok } from "../lib/responses.js";
import { todayKST } from "../lib/holidays.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * explainKoreanService — curated "get past the Korean system" navigator (docs/18
 * §C, feasibility GO). The biggest foreigner friction in Korea is that everyday
 * services assume you're a local: taxi/delivery/reservation/shopping/signup all
 * gate on a Korean phone number + identity verification (본인인증), so one gap
 * blocks a dozen services at once.
 *
 * The durable insight ("teach the twin, not the brand"): every Korean incumbent
 * app has a foreigner-targeted twin built to bypass that wall — Kakao T → k.ride,
 * Baemin → Shuttle Delivery, CatchTable(KR) → CatchTable Global, Coupang → its
 * Global site, tickets → Klook/Trazy. We curate the blocker + the workaround +
 * the twin + a human fallback + the 1330 hotline. Knowledge-only: no API, no
 * login, no personal data (Kakao-rule-safe). Volatile facts are date-stamped and
 * entry-document advice has a year-guard so it can't silently go stale.
 */

interface ServiceGuide {
  match: RegExp;
  label: string;
  emoji: string;
  blocker: string;
  workaround: string[];
  twin?: string; // the foreigner-friendly alternative app/site
  fallback?: string; // the human / offline path
  dated?: string; // volatile facts → "As of …; verify at …"
}

const SERVICES: ServiceGuide[] = [
  {
    // `kakao ?t\b` so "KakaoTalk" (a different service) doesn't match the taxi guide (N1).
    match: /(taxi|kakao ?t\b|cab|\bhail\b|ride.?hail|택시|카카오\s*t\b)/i,
    label: "Taxi apps (Kakao T)",
    emoji: "🚕",
    blocker:
      "Kakao T rejects **foreign-card registration** for in-app payment (it routes through Korean domestic gateways + phone verification).",
    workaround: [
      "Sign up with an **email / overseas number**, hail the taxi, then swipe to **“Pay to the driver” (직접결제)** — pay the **metered** fare to the driver by cash, foreign card, or T-money.",
      "Insist on the **meter** (\"미터기 켜주세요\"); a flat quote is a red flag.",
    ],
    twin: "**k.ride** (Kakao Mobility's foreigner app — Google/email sign-up, foreign card works in-app), **Uber/UT**, or **TABA**.",
    fallback: "Street-hail any metered taxi and pay the driver directly. Overcharged or refused? Note the plate and call **1330**.",
  },
  {
    match: /(deliver|baemin|coupang eats|yogiyo|배달|배민|food to my)/i,
    label: "Food delivery",
    emoji: "🛵",
    blocker:
      "Baemin / Coupang Eats / Yogiyo need a **Korean-phone identity check** and Korean payment — most foreigners can't get past sign-up.",
    workaround: ["Order in English with a **foreign card / PayPal** — no Korean phone or ID required."],
    twin: "**Shuttle Delivery** — English app built for foreigners (foreign cards + PayPal). Coverage is limited to certain cities/areas.",
    fallback: "Ask your hotel's front desk to order for you, or grab a meal at a 24h convenience store.",
    dated: "Shuttle's delivery zones change — check the app covers your area.",
  },
  {
    // Require a determiner-ish word after "book" so "book a (popular) restaurant"
    // matches but "I read a book about restaurants" doesn't (P5).
    match: /(reserv|booking|book(?:ing)?\s+(?!about|on\b|by\b)[\w\s]{0,15}?(?:table|seat|spot|restaurant|reservation)|waitlist|catch ?table|tabling|naver booking|예약|웨이팅|catchtable)/i,
    label: "Restaurant reservations & waitlists",
    emoji: "🍽️",
    blocker:
      "Popular restaurants book via **Naver / CatchTable(KR) / Tabling**, which require a **Korean-phone-verified** account in Korean.",
    workaround: ["Book popular and Michelin spots with **Google/Apple/email** sign-up and a **foreign card** — no Korean number."],
    twin: "**CatchTable Global** (EN/JA/ZH, foreign cards). For Tabling waitlists, use the **on-site kiosk's “Foreigner” / QR** option.",
    fallback: "Call the restaurant, ask your hotel concierge to book, or simply **walk in and wait** (많은 곳이 워크인 가능).",
  },
  {
    match: /(online shop|checkout|coupang|gmarket|e.?commerce|buy.*online|website won't|payment fail|온라인|쇼핑몰|결제\s*오류)/i,
    label: "Online shopping & checkout",
    emoji: "🛒",
    blocker:
      "Korean checkout pages route through **domestic gateways + identity verification (본인인증)**, so foreign cards often fail — sometimes only after your first order.",
    workaround: ["Use the **global version** of the shop — **Coupang Global** / **Gmarket Global** — which accept foreign cards / PayPal."],
    twin: "For tickets, passes, SIMs, and even KTX, buy on **Klook** or **Trazy** (international, foreign-card-friendly).",
    fallback: "Buy in person, or have a Korean friend pay with Kakao/Naver Pay and settle up.",
  },
  {
    // No bare "ticket" (would steal "train/bus ticket"); require an event context.
    match: /(concert|k-?pop|kpop|interpark|yes24|melon ?ticket|fan ?meet|fan.?sign|musical|baseball game|event ?ticket|show ?ticket|gig|예매|콘서트|공연|티켓)/i,
    label: "Concert & event tickets",
    emoji: "🎫",
    blocker:
      "Interpark / Yes24 / Melon Ticket — Korea's main ticketing sites — need a **Korean-phone identity check (본인인증)**, and many K-pop sales are Korean-only or open a tiny global window that sells out instantly.",
    workaround: [
      "Use the **global ticketing site** when one exists — **Interpark Global** (English) sells many concerts, musicals, and shows to overseas buyers with a foreign card.",
      "For festivals, shows, and theme parks, **Klook / Trazy** resell tickets to foreigners (no Korean ID).",
    ],
    twin: "**Interpark Global** (globalinterpark, EN/JA/ZH) and **Klook / Trazy** for events; for a **baseball** game, just buy at the **stadium box office** on the day.",
    fallback: "Ask your hotel concierge to book, or have a Korean friend buy with their account and pay them back.",
    dated: "K-pop on-sales and global-window timing change per tour — check the artist's official channels for the global sale date.",
  },
  {
    // No bare "account" — that stole "open a bank account" from the banking guide;
    // a KakaoTalk/Naver account still matches by name or "sign-up".
    match: /(kakaotalk|kakao talk|naver|sign.?up|본인인증|verif|카톡|가입|인증)/i,
    label: "KakaoTalk / Naver sign-up & identity verification",
    emoji: "🆔",
    blocker:
      "Basic **chat/maps** work with a foreign number — the wall is Korean **identity verification (본인인증)**, which is tied to a Korean ID/ARC and locks the **Pay** features.",
    workaround: [
      "Sign up with **email** and use KakaoTalk/Naver for **messaging and maps** normally.",
      "Treat **KakaoPay / Naver Pay / Toss** as residents-only — don't rely on them.",
    ],
    fallback: "Pay with a **foreign card** on global sites and in stores instead of a domestic pay app.",
  },
  {
    match: /(sim|esim|e-?sim|wifi|wi-?fi|data plan|mobile|phone number|유심|이심|데이터)/i,
    label: "SIM / eSIM / data",
    emoji: "📶",
    blocker:
      "A tourist SIM/eSIM is **anonymous**: it can receive SMS codes for reservation/taxi apps, but it **cannot pass bank or government identity verification** (that needs a Korean ID/ARC).",
    workaround: [
      "**eSIM** = instant data, no airport queue. A **voice SIM (010 number)** also gets you SMS codes for app sign-ups.",
      "Buy a **T-money** card separately for transit (a SIM doesn't cover that).",
    ],
    twin: "Order a **Klook/Trazy eSIM** before you fly, or buy at an **airport carrier desk** (SK/KT/LG U+) — they register SIMs in English.",
    fallback: "A pocket **WiFi egg** covers a group on one device.",
    dated: "Plan prices and data caps change constantly — don't trust an old quote; compare on arrival.",
  },
  {
    match: /(tax.?refund|vat|refund|tax.?free|duty.?free|tax back|텍스|환급|부가세|면세)/i,
    label: "Tourist tax refund (VAT)",
    emoji: "🧾",
    blocker: "Two refund systems (immediate in-store vs. at the airport) and a customs step trip people up.",
    workaround: [
      "Spend **≥₩15,000** at a **“Tax Free”** store and show your **passport**.",
      "Take the **immediate** refund at the counter for smaller buys, or keep the **slip** for the airport.",
      "At the airport (after check-in, before security): scan the slip/passport at a **customs/refund kiosk**, keep the goods accessible, then collect the refund.",
    ],
    fallback: "Downtown refund counters exist too, but they put a hold on your card until you scan out at the airport.",
    dated: "As of 2026: ≥₩15,000/receipt, stays ≤6 months, ≈5–7% back. Verify at koreataxrefund / VisitKorea.",
  },
  {
    match: /(k-?eta|keta|arrival card|e-?arrival|entry|immigration|visa|입국|입국신고|q-?code)/i,
    label: "Entry documents (e-Arrival Card / K-ETA)",
    emoji: "🛂",
    blocker: "Three things get confused: **K-ETA**, the **e-Arrival Card**, and **Q-code**.",
    workaround: [
      "Paper arrival cards were **abolished (Jan 2026)**. If you hold a valid **K-ETA**, you're **exempt** from the e-Arrival Card.",
      "If you don't need K-ETA, file the **e-Arrival Card** online (up to 72h before arrival) and show the QR at the gate.",
      "**Q-code** is only for arrivals from a designated health watch-zone — most travelers skip it.",
    ],
    fallback: "Unsure? Your airline or the official sites can confirm what your nationality needs.",
    dated:
      "⚠️ Rules change every year — **as of 2026**, K-ETA is **waived for 67 visa-waiver nationalities through Dec 31 2026**. **Always verify** at **k-eta.go.kr** and **e-arrivalcard.go.kr** before you fly.",
  },
  {
    match: /(emergency|ambulance|hospital|sick|doctor|medical|pharmac|119|1339|약국|응급|병원|아파)/i,
    label: "Emergency & medical help",
    emoji: "🆘",
    blocker: "Not knowing which number to call for **English** help, or where to go after pharmacies close.",
    workaround: [
      "**119** — ambulance & fire (free; has interpretation). **112** — police.",
      "**1339** — medical advice / nearest ER. **1330** — 24h multilingual hotline that does **3-way medical interpretation**.",
      "Pharmacies (**약국**, green sign) close ~20:00–21:00 → after hours use a **24h pharmacy** or a hospital **ER** (foreign cards accepted).",
    ],
    fallback: "Carry your medicines' **generic names**; major hospitals have international clinics with English-speaking staff.",
  },
  {
    match: /(kiosk|self.?order|touchscreen|unmanned|키오스크|무인|주문기)/i,
    label: "Korean-only ordering kiosks",
    emoji: "🖥️",
    blocker: "Touchscreen kiosks (fast food, cafés) are often **Korean-only** or hide the language toggle.",
    workaround: [
      "Look for a **flag / “ENG”** button (usually a **top corner**).",
      "No toggle? Point **Google Translate's camera** at the screen.",
    ],
    fallback: "Order at the **counter** (\"영어 메뉴 있어요?\") — counter registers usually take foreign cards even when the kiosk doesn't.",
  },
  {
    match: /(banking|bank account|open.*account|mobile bank|kakao ?bank|toss bank|\bwise\b|revolut|remittance|wire money|send money|transfer money|송금|계좌|은행)/i,
    label: "Banking & money transfers",
    emoji: "🏦",
    blocker:
      "Opening a Korean bank account or using **KakaoPay / Toss / Naver Pay** needs an **ARC (resident card) + Korean phone** — short-stay tourists generally can't, which also locks domestic transfers and pay apps.",
    workaround: [
      "For spending, use a **foreign card** + cash from **Global ATMs** (choose KRW, decline the DCC conversion).",
      "To move money in or out, use **Wise / Revolut** or your home bank — not a Korean account.",
    ],
    twin: "**Wise** or **Revolut** for FX and transfers; for cash, the **Global ATMs** in convenience stores (24h).",
    fallback: "Staying long-term with an **ARC** (student/work)? Internet banks **Kakao Bank / Toss Bank** onboard foreigners who have one.",
    dated: "Foreign-card and FX-app fees change — compare Wise/Revolut and your bank's overseas-ATM fee before you travel.",
  },
];

const GENERIC: ServiceGuide = {
  match: /.*/,
  label: "Korean services that assume you're a local",
  emoji: "🧭",
  blocker:
    "Many Korean apps/services gate on a **Korean phone number + identity verification (본인인증)** or **domestic-only payment**, so foreigners hit a wall.",
  workaround: [
    "Look for the **foreigner / global version** of the app (most have one), pay with a **foreign card**, and verify with **email** where possible.",
  ],
  fallback: "When a Korean-only flow blocks you, a human can usually do it — counter staff, hotel concierge, or the 1330 hotline.",
};

/** entryDocs is the one volatile, dangerous-if-stale category — flip the advice
 *  once the 2026 K-ETA waiver expires so we never serve "you don't need K-ETA"
 *  in 2027 (feasibility year-guard). */
function entryDocsExpired(): boolean {
  return todayKST() >= "2027-01-01";
}

function render(g: ServiceGuide, matched: boolean): string {
  const lines = matched
    ? [`🧭 **${g.emoji} ${g.label} — getting past it**`]
    : [
        `🧭 **${g.label}**`,
        "",
        `_(General guidance — name the exact service, e.g. "taxi app", "food delivery", "restaurant booking", "tax refund", for specific steps.)_`,
      ];
  lines.push("", `**⛔ The blocker**`, g.blocker);
  lines.push("", `**✅ What to do**`, ...g.workaround.map((w) => `- ${w}`));
  if (g.twin) lines.push("", `**🔁 Foreigner-friendly app:** ${g.twin}`);
  if (g.fallback) lines.push("", `**🆘 Fallback:** ${g.fallback}`);
  // Year-guard for entry documents.
  if (g.label.startsWith("Entry documents") && entryDocsExpired()) {
    lines.push(
      "",
      "**⚠️ Update:** the 2026 K-ETA waiver has **expired** — **K-ETA is required again**. Apply at **k-eta.go.kr** before you fly.",
    );
  } else if (g.dated) {
    lines.push("", `📅 _${g.dated}_`);
  }
  // 1330 is the universal safety net — thread it through every answer.
  lines.push("", "☎️ _Stuck on anything? Call **1330** — Korea's free 24h tourist hotline (English/JA/ZH) with live interpretation._");
  return lines.join("\n");
}

// Reusable bridging chips → the sibling tool or related service the visitor most
// likely needs next, so a "stuck" answer flows into the next step (N4).
const C = {
  pay: { emoji: "💳", cmdEn: "How do I pay for this in Korea?", descEn: "cards, cash, T-money" },
  route: { emoji: "🚇", cmdEn: "Plan a transit route", descEn: "subway/bus directions" },
  menu: { emoji: "🍜", cmdEn: "Explain a Korean menu item", descEn: "what's in this dish" },
  pharm: { emoji: "💊", cmdEn: "Find a pharmacy near me", descEn: "약국 + after-hours" },
  resv: { emoji: "🍽️", cmdEn: "How do I book a restaurant as a tourist?", descEn: "CatchTable Global, walk-ins" },
  sim: { emoji: "📶", cmdEn: "Which SIM or eSIM should I get?", descEn: "data + the verification trap" },
  taxi: { emoji: "🚕", cmdEn: "How do I get a taxi without a Korean number?", descEn: "Kakao T workaround" },
  kiosk: { emoji: "🖥️", cmdEn: "How do I use a Korean-only kiosk?", descEn: "find the English toggle" },
  shop: { emoji: "🛒", cmdEn: "Why does my card fail on Korean websites?", descEn: "online checkout workaround" },
  refund: { emoji: "🧾", cmdEn: "How does the tourist tax refund work?", descEn: "VAT refund steps" },
  open: { emoji: "🕒", cmdEn: "Is this place open right now?", descEn: "live hours" },
  eat: { emoji: "🔎", cmdEn: "Find foreigner-friendly places to eat", descEn: "restaurants nearby" },
} satisfies Record<string, Choice>;

/** 3 next-step chips tailored to the matched service (never itself). */
function serviceChips(g: ServiceGuide): Choice[] {
  const L = g.label;
  if (L.startsWith("Taxi")) return [C.pay, C.route, C.resv];
  if (L.startsWith("Food")) return [C.resv, C.eat, C.pay];
  if (L.startsWith("Restaurant")) return [C.open, C.eat, C.pay];
  if (L.startsWith("Online")) return [C.pay, C.refund, C.resv];
  if (L.startsWith("Concert")) return [C.shop, C.pay, C.route];
  if (L.startsWith("KakaoTalk")) return [C.pay, C.taxi, C.resv];
  if (L.startsWith("SIM")) return [C.taxi, C.route, C.pay];
  if (L.startsWith("Tourist tax")) return [C.shop, C.pay, C.resv];
  if (L.startsWith("Entry")) return [C.sim, C.taxi, C.pay];
  if (L.startsWith("Emergency")) return [C.pharm, C.route, C.pay]; // find care → get there → pay (P6: drop off-topic kiosk)
  if (L.startsWith("Korean-only")) return [C.menu, C.pay, C.resv];
  if (L.startsWith("Banking")) return [C.pay, C.shop, C.refund];
  return [C.taxi, C.resv, C.kiosk]; // GENERIC
}

export const explainKoreanService: ToolDef = {
  name: "explainKoreanService",
  description:
    "Explains how a foreign visitor gets past Korean services and apps that assume you're a local — taxi apps " +
    "(Kakao T), food delivery, restaurant reservations, online checkout, concert/event ticketing, KakaoTalk/Naver " +
    "sign-up & identity verification, SIM/eSIM, banking & money transfers, the tourist VAT refund, entry documents " +
    "(e-Arrival Card / K-ETA), medical emergencies, and Korean-only kiosks — naming the foreigner-usable workaround " +
    "or alternative app for each. " +
    `No login or personal information needed. Part of ${SERVICE_NAME}.`,
  inputSchema: {
    service: z
      .string()
      .describe(
        "The Korean service/system you're stuck on, e.g. 'taxi app', 'food delivery', 'restaurant reservation', " +
          "'online shopping', 'KakaoTalk sign-up', 'eSIM', 'tax refund', 'K-ETA / arrival card', 'medical emergency', 'kiosk'.",
      ),
    detail: z.string().optional().describe("Optional specifics, e.g. 'Kakao T card error' or 'K-ETA for the US'."),
  },
  annotations: {
    title: "Get Past Korean Apps & Systems",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: (args) => {
    const service = String(args.service ?? "");
    const detail = args.detail ? String(args.detail) : "";
    const q = `${service} ${detail}`.trim();
    const matched = SERVICES.find((s) => s.match.test(q));
    const g = matched ?? GENERIC;
    return ok(render(g, Boolean(matched)), serviceChips(g));
  },
};
