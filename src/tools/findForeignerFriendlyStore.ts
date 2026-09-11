import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail } from "../lib/responses.js";
import { search, confident } from "../lib/retrieval.js";
import { searchForeignerPois, hasPoiProvider, type PoiPlace } from "../lib/sources/poi.js";
import { resolvePlaceCoord } from "../lib/places.js";
import { pharmaciesNear } from "../lib/sources/pharmacyIndex.js";
import { romanizeHangul } from "../lib/romanize.js";
import { mapLinksAt } from "../lib/maplinks.js";
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
  "luggage",
  "laundry",
  "vegan",
  "prayer",
  "post",
] as const;
export type Need = (typeof NEEDS)[number];

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
  luggage: {
    label: "Luggage storage",
    emoji: "🧳",
    short: "station coin lockers, or leave bags at your hotel",
    tip: "**Ask your hotel first** — almost every hotel and guesthouse in Korea holds luggage free before check-in and after check-out, including on your last day. Otherwise, **subway station lockers (물품보관함)** are the standard answer: most stations have them, they take a **T-money card or a card payment**, they have an English menu, and they run about **₩2,000–4,000** for a few hours depending on size. The big interchanges — **Seoul Station, Hongik Univ., Myeongdong, Gangnam, Busan Station** — have the most, and they do fill up on weekends. Incheon Airport has staffed left-luggage counters and same-day delivery to city hotels.",
    query: "물품보관함",
  },
  laundry: {
    label: "Laundry",
    emoji: "🧺",
    short: "24h coin laundries; hotel laundry is far pricier",
    tip: "**Coin laundries (코인빨래방)** are open 24 hours, unstaffed, and everywhere in residential areas. A wash and dry runs about **₩4,000–7,000** total, machines take **cards and cash**, detergent is dispensed automatically, and the panels usually have an English mode. Guesthouses often have a free or cheap machine — ask before you pay hotel laundry rates, which are charged per item.",
    query: "코인빨래방",
  },
  // Vegan travellers were reaching the halal card and getting an answer about
  // half their table: "I'm vegan and my friend eats only halal" is a common
  // pairing and Itaewon happens to be the honest answer to both, but only if
  // the card says so.
  vegan: {
    label: "Vegan & vegetarian food",
    emoji: "🌱",
    short: "temple cuisine, Itaewon and Haebangchon; watch for fish sauce",
    tip: "Korean food is harder than it looks for vegans: **kimchi, most stews and nearly every broth contain fish sauce, anchovy or shrimp**, and 'vegetarian' is often read as 'no big pieces of meat'. What works — **사찰음식 (temple cuisine)**, which is vegan by doctrine and served at temple-stay restaurants and around Insadong and Jogyesa; **Itaewon and Haebangchon**, which hold most of Seoul's dedicated vegan kitchens and sit next to the halal restaurants, so a mixed table can actually eat together; and **bibimbap without egg and gochujang on the side**, which most restaurants will do if you ask. Say **\"고기, 생선, 계란, 유제품 다 빼주세요\"** (no meat, fish, egg or dairy) — writing it down works better than saying it.",
    query: "비건 채식 식당",
  },
  prayer: {
    label: "Prayer room & halal",
    emoji: "🕌",
    short: "Seoul Central Masjid in Itaewon; prayer rooms at the airport and malls",
    tip: "**Seoul Central Masjid** in Itaewon is the main mosque, and the streets below it hold most of the city's **halal-certified restaurants**. Prayer rooms are also available at **Incheon Airport (both terminals)**, **COEX**, **Lotte World Tower**, and several department stores — look for 기도실 / prayer room on the floor guide. The Korea Tourism Organization publishes a Muslim-friendly restaurant classification (certified / self-certified / pork-free), which is worth checking before you rely on a sign in a window.",
    query: "이슬람 기도실",
  },
  post: {
    label: "Post & shipping home",
    emoji: "📮",
    short: "Korea Post EMS for overseas; convenience stores are domestic only",
    tip: "**Korea Post (우체국)** is how you send things home — ask for **EMS**, which is trackable and reaches most countries in under a week. They sell **boxes at the counter**, so you can arrive with loose shopping. Post offices open weekdays about **09:00–18:00** and close at weekends, so plan around it. Convenience-store parcel services (편의점 택배) are cheap but **domestic only**. Tax-refund goods must stay unopened until you clear the refund desk at the airport.",
    query: "우체국",
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
  luggage: "luggage",
  luggagestorage: "luggage",
  locker: "luggage",
  coinlocker: "luggage",
  bag: "luggage",
  bags: "luggage",
  storage: "luggage",
  laundry: "laundry",
  laundromat: "laundry",
  washing: "laundry",
  wash: "laundry",
  prayer: "prayer",
  prayerroom: "prayer",
  mosque: "prayer",
  muslim: "prayer",
  halal: "prayer",
  vegan: "vegan",
  vegetarian: "vegan",
  plantbased: "vegan",
  veggie: "vegan",
  비건: "vegan",
  채식: "vegan",
  사찰음식: "vegan",
  templefood: "vegan",
  post: "post",
  postoffice: "post",
  shipping: "post",
  parcel: "post",
  mail: "post",
  ems: "post",
  // The same needs as a Korean, Japanese or Chinese speaker writes them. Until
  // these were here, "附近的药店" — a pharmacy nearby — got the generic menu of
  // every essential, because nothing in this table was written in Chinese.
  약국: "pharmacy",
  薬局: "pharmacy",
  ドラッグストア: "pharmacy",
  药店: "pharmacy",
  药房: "pharmacy",
  藥局: "pharmacy",
  藥房: "pharmacy",
  편의점: "convenience",
  コンビニ: "convenience",
  便利店: "convenience",
  便利商店: "convenience",
  환전: "currencyExchange",
  환전소: "currencyExchange",
  両替: "currencyExchange",
  换钱: "currencyExchange",
  兑换: "currencyExchange",
  換錢: "currencyExchange",
  관광안내소: "touristInfo",
  観光案内所: "touristInfo",
  游客中心: "touristInfo",
  旅游咨询: "touristInfo",
  병원: "emergency",
  응급: "emergency",
  病院: "emergency",
  医院: "emergency",
  醫院: "emergency",
  急诊: "emergency",
  짐보관: "luggage",
  물품보관함: "luggage",
  コインロッカー: "luggage",
  荷物預かり: "luggage",
  行李寄存: "luggage",
  빨래방: "laundry",
  세탁: "laundry",
  コインランドリー: "laundry",
  洗衣: "laundry",
  기도실: "prayer",
  할랄: "prayer",
  ハラール: "prayer",
  祈祷室: "prayer",
  清真: "prayer",
  우체국: "post",
  郵便局: "post",
  邮局: "post",
  郵局: "post",
};

/**
 * People do not type a keyword, they type a sentence: "coin laundry", "send a
 * parcel home", "where can I leave my bags". Exact-key lookup matched the first
 * of those and missed the rest, dropping them into the generic essentials menu.
 * Longest alias first, so "conveniencestore" cannot be beaten by "convenience".
 */
const ALIASES_BY_LENGTH = Object.keys(NEED_BY_ALIAS).sort((a, b) => b.length - a.length);

function resolveNeed(input?: string): Need | undefined {
  if (!input) return undefined;
  // Japanese and Chinese are kept, not stripped: the filter used to allow only
  // Latin and Hangul, so "药店" arrived here as an empty string.
  const k = input.toLowerCase().replace(/[^a-z가-힣぀-ヿ一-鿿]/g, "");
  if (NEED_BY_ALIAS[k]) return NEED_BY_ALIAS[k];
  // A three-letter floor stops "atm" matching inside unrelated English words; a
  // CJK word carries a whole meaning in two characters (약국, 薬局, 药店), so the
  // floor does not apply to it.
  const hit = ALIASES_BY_LENGTH.find((a) => (a.length >= 3 || /[^a-z]/.test(a)) && k.includes(a));
  return hit ? NEED_BY_ALIAS[hit] : undefined;
}

/**
 * A need, recognised in whatever words and language it was asked, with the
 * advice that goes with it — for the phone, which answers "near me" itself and
 * shows this under what it finds. The advice is the same whoever asks and from
 * wherever, which is what lets it come from here.
 */
export function essentialFor(input?: string): { need: Need; emoji: string; label: string; tip: string } | undefined {
  const need = resolveNeed(input);
  if (!need) return undefined;
  const e = ESSENTIALS[need];
  return { need, emoji: e.emoji, label: e.label, tip: e.tip };
}

const CHOICES: Choice[] = [
  { emoji: "💳", cmdEn: "How do I pay here as a foreigner?", cmdKo: "결제 방법", descEn: "payment options guide" },
  { emoji: "🚇", cmdEn: "How do I get there?", descEn: "public-transit route" },
  { emoji: "🧭", cmdEn: "What other essentials are nearby?", descEn: "exchange, ATM, pharmacy, info" },
];

// Emergency context needs different next steps than "how do I pay" (N10).
const EMERGENCY_CHOICES: Choice[] = [
  { emoji: "💊", cmdEn: "Find a pharmacy near me", descEn: "약국 + after-hours options" },
  { emoji: "🚇", cmdEn: "How do I get to a hospital?", descEn: "transit route" },
  { emoji: "ℹ️", cmdEn: "Find a tourist information center", descEn: "multilingual help + 1330" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry the search" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", descEn: "neighborhood overview instead" },
];

/**
 * A licensed pharmacy, by its name. Every one in Korea is called something-약국,
 * so the name is the test — not the directory's category, which files Olive
 * Young under "Pharmacy" too. Health-and-beauty chains are named outright,
 * because they are the lookalike a traveller actually walks into.
 */
const IS_A_PHARMACY = /약국|yakguk|pharmac|薬局|药店|药房|藥局/i;
const HEALTH_AND_BEAUTY = /올리브영|olive\s?young|olribeuyeong|랄라블라|lalavla|롭스|lohbs|시코르|chicor/i;

function renderNearby(places: PoiPlace[], query: string, need: Need): string[] {
  // Guard against junk rows: empty address, or a name that's just the bare search
  // keyword echoed back (e.g. a "맛집" row with no address).
  const q = query.trim();
  // For non-dining needs, drop café/restaurant/bar results the keyword search drags
  // in (an "ATM" search returning a pizzeria) — keeps the list on-need (Y11).
  const foodNeed = need === "foreignCardDining";
  // For a utility need (ATM/exchange/pharmacy…), the keyword search drags in
  // eateries and culture venues — drop both so the list stays on-need (Y11/P-V4).
  const FOOD_RE =
    /caf[eé]|coffee|restaurant|bar\b|pub|bakery|dessert|bistro|pizz|burger|grill|\bbbq\b|brunch|noodle|chicken|커피|카페|맛집|식당|레스토랑|피자|치킨|베이커리|디저트|이자카야|호프|포차|주점/i;
  const NOISE_RE =
    /gallery|galler|museum|art\s?space|exhibition|piknic|studio|theat(er|re)|cinema|\bclub\b|갤러리|미술관|전시|스튜디오|공방|클럽/i;
  // Never surface adult-entertainment venues on a family/KakaoTalk surface (N2).
  const ADULT_RE = /룸\s?싸롱|룸\s?살롱|풀\s?싸롱|단란|안마|유흥|텐프로|레깅스룸|room\s?salon|host\s?bar|성인/i;
  const clean = places.filter((p) => {
    const name = (p.name ?? "").trim();
    const addr = (p.address ?? "").trim();
    const hay = `${name} ${p.category ?? ""}`;
    if (!name || !addr || name === q || name.startsWith(`${q} (`)) return false;
    if (ADULT_RE.test(hay)) return false;
    if (!foodNeed && (FOOD_RE.test(hay) || NOISE_RE.test(hay))) return false;
    // Only a 약국 can sell medicine in Korea. Sorted nearest-first, a search for
    // pharmacies near Mangwon put an Olive Young third — a cosmetics chain with a
    // green-ish shopfront, and exactly where a traveller with a fever would go
    // and find nothing to buy.
    if (need === "pharmacy" && (!IS_A_PHARMACY.test(name) || HEALTH_AND_BEAUTY.test(name))) return false;
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
    // Optional so a missing area hits the graceful "Which area?" fallback in the
    // handler instead of leaking a raw -32602 — the last required field (N13).
    area: z.string().optional().describe("Neighborhood/area, e.g. 'Myeongdong' or '명동'."),
    need: z
      .string()
      .optional()
      .describe(
        "What you need: currencyExchange, atm (foreign-card), pharmacy, convenience, touristInfo, " +
          "foreignCardDining, emergency (medical/119/1330), luggage (storage/coin lockers), " +
          "laundry (coin laundry), prayer (prayer room, mosque, halal), or post (sending things home, EMS) " +
          "— synonyms and whole sentences understood. Omit for an overview.",
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
    // A comma-separated need means the traveller stated more than one, and
    // answering only the first one is answering half the table.
    const extraNeeds = String(args.need ?? "")
      .split(",")
      .map((n) => resolveNeed(n.trim()))
      .filter((n): n is Need => Boolean(n) && n !== need);

    if (!area) {
      // Someone describing chest pain or a collapse must never be handed a menu of
      // ATMs and currency exchange. When the need is medical, the hotlines and what
      // to do come first; the area only refines WHERE, and can be asked afterwards.
      if (need === "emergency") {
        const e = ESSENTIALS.emergency;
        return ok(
          [
            `${e.emoji} **${e.label}**`,
            "",
            e.tip,
            "",
            "_Tell me the neighborhood you're in (e.g. Myeongdong, Hongdae, Itaewon) and I'll add the nearest emergency room and pharmacies._",
          ].join("\n"),
          EMERGENCY_CHOICES,
        );
      }
      // Before asking a traveller to fill in a field, check whether they already
      // said enough. "I'm vegan and my friend eats only halal, where can we eat
      // together" names no neighbourhood and has an obvious answer — Itaewon —
      // and it was coming back as "Which area?".
      const said = [args.need, args.area].filter(Boolean).join(" ");
      if (said) {
        const hits = await search(said, { kinds: ["area", "spot"], limit: 3, rerank: true }).catch(() => []);
        const guess = hits[0];
        if (guess && confident(hits) && guess.doc.area) {
          return ok(
            [
              `📍 **Best bet: ${guess.doc.area}**`,
              "",
              renderOverview(guess.doc.area.replace(/\s*\([^)]*\)\s*$/, "")),
              "",
              `_You didn't name a neighbourhood, so I picked the one that fits "${said}". Tell me another and I'll switch._`,
            ].join("\n"),
            OVERVIEW_CHOICES,
          );
        }
      }
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

    // "Near me" never reaches here: the phone answers it from its own GPS fix
    // (src/lib/deviceTask.ts), and this server is never told where anyone is.
    const e = ESSENTIALS[need];
    const head = [`${e.emoji} **${e.label} in ${area}**`, "", e.tip];
    // A second stated need gets its own section rather than being dropped. Two
    // people at one table with different requirements is the common case, and
    // answering one of them reads as not having listened to the other.
    for (const other of extraNeeds) {
      const o = ESSENTIALS[other];
      head.push("", `${o.emoji} **${o.label}**`, "", o.tip);
    }
    if (extraNeeds.length) {
      head.push("", "_You named more than one requirement, so both are above — Itaewon and Haebangchon sit next to each other, which is why a mixed table usually ends up there._");
    }

    // A pharmacy is wanted *open*: with the National Medical Center's hours we
    // can say which one is, and until when — "no 24-hour pharmacy is listed"
    // was true and no help to someone with a fever at 11pm.
    if (need === "pharmacy") {
      const coord = resolvePlaceCoord(area);
      const hours = coord ? await pharmaciesNear(coord.lat, coord.lng, 1500, 5).catch(() => undefined) : undefined;
      const open = hours?.filter((p) => p.state.open) ?? [];
      // Late at night the nearest open one may be further off than a walk.
      const wider = hours && open.length < 2 && coord ? await pharmaciesNear(coord.lat, coord.lng, 5000, 5).catch(() => undefined) : undefined;
      const list = (wider?.some((p) => p.state.open) ? wider : hours) ?? [];
      if (list.length) {
        const lines = list.map((p, i) => {
          const status = p.state.open
            ? p.state.allDay
              ? "🟢 **Open 24 hours today**"
              : `🟢 **Open now** · until ${p.state.until}`
            : p.state.opens
              ? `🔴 Closed · opens ${p.state.opens}${p.state.opensLater ? " (a later day)" : ""}`
              : "🔴 Closed";
          const tel = p.tel ? ` · ☎ ${p.tel}` : "";
          const name = romanizeHangul(p.name);
          return `**${i + 1}. ${name && name !== p.name ? `${name} (${p.name})` : p.name}**\n   ${status} · ${(p.m / 1000).toFixed(1)} km from ${area}${tel}\n   ${mapLinksAt(p.name, p.lat, p.lng)}`;
        });
        return ok(
          [...head, "", "**Open now first:**", ...lines, "", "_Hours: National Medical Center pharmacy data (ⓒ국립중앙의료원); call ahead late at night._"].join("\n"),
          CHOICES,
        );
      }
    }

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
          // An essential is wanted close, not good — see PoiSearchOptions.
          nearestFirst: true,
        });
        nearby = renderNearby(places, e.query, need);
      } catch {
        // Live lookup is best-effort; the curated tip already answered the need.
        nearby = ["", "_(Couldn't load nearby spots right now — tap “How do I get there?” or try again.)_"];
      }
    }

    return ok([...head, ...nearby].join("\n"), need === "emergency" ? EMERGENCY_CHOICES : CHOICES);
  },
};
