import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import {
  searchPlacesAny,
  searchPlacesNearby,
  searchFestivals,
  normalizeLang,
  type Place,
  type Festival,
} from "../lib/sources/tourapi.js";
import { todayKST } from "../lib/holidays.js";
import { asksAboutMalls, mallsCard } from "../lib/malls.js";
import { search, confident } from "../lib/retrieval.js";
import { searchForeignerPois, hasPoiProvider, type PoiPlace } from "../lib/sources/poi.js";
import {
  searchSeoulContent,
  isSeoulText,
  inferSeoulCategory,
  isStalePastEvent,
  currentYearKST,
  clip,
  VS_CATEGORY,
  isIndoorIntent,
  isLikelyOutdoor,
  getSeoulDetail,
  type SeoulContent,
} from "../lib/sources/visitseoul.js";
import { resolvePlaceCoord, findPlaceInText } from "../lib/places.js";
import { similarity, cjkToKorean } from "../lib/fuzzy.js";
import { mapLinks, mapLinksAt } from "../lib/maplinks.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/**
 * searchPlaceForeigner — natural-language place search weighted for
 * foreigner-friendliness. Live source: Korea Tourism Organization TourAPI
 * (English service, EngService2) via src/lib/sources/tourapi.ts.
 */

const CHOICES: Choice[] = [
  { emoji: "💳", cmdEn: "Where do foreign cards work to eat here?", descEn: "foreign-card-friendly food spots" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", cmdKo: "동네 가이드", descEn: "neighborhood overview" },
  { emoji: "🚇", cmdEn: "How do I get there?", descEn: "public-transit route" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry the search" },
  { emoji: "🗺️", cmdEn: "Guide me around this area", descEn: "neighborhood overview instead" },
];

// City names (don't name them in a "get to {x}?" chip — the user is already in the city).
const SEARCH_CITY_RE = /^(seoul|busan|jeju|incheon|daegu|daejeon|gwangju|ulsan|gyeongju|jeonju|gangneung|sokcho|suwon|서울|부산|제주|인천|대구|대전|광주|울산|경주|전주|강릉|속초|수원)$/i;

/** Contextual follow-up chips for a result list — name the area when we know it
 *  (like getAreaGuide), and refer to "one of these" for the list. `areaLabel` is the
 *  resolved neighbourhood/city; isFood swaps the food chip for a transit one. (D-035) */
export function searchChoices(areaLabel?: string, isFood?: boolean): Choice[] {
  const a = areaLabel?.trim();
  const named = a && !SEARCH_CITY_RE.test(a) ? a : undefined; // neighbourhood → name it; bare city → generic
  const now: Choice = { emoji: "🕒", cmdEn: "Is one of these open right now?", cmdKo: "지금 열려 있어?", descEn: "live hours + weather" };
  const route: Choice = named
    ? { emoji: "🚇", cmdEn: `How do I get to ${named}?`, cmdKo: `${named} 가는 길`, descEn: "public-transit route" }
    : { emoji: "🚇", cmdEn: "How do I get to one of these?", descEn: "public-transit route" };
  const guide: Choice = a
    ? { emoji: "🗺️", cmdEn: `Guide me around ${a}`, cmdKo: `${a} 가이드`, descEn: "neighborhood overview" }
    : { emoji: "🗺️", cmdEn: "Guide me around this area", cmdKo: "동네 가이드", descEn: "neighborhood overview" };
  const food: Choice = named
    ? { emoji: "🍽️", cmdEn: `Where to eat in ${named} with a foreign card?`, descEn: "foreigner-friendly dining" }
    : { emoji: "💳", cmdEn: "Where do foreign cards work to eat here?", descEn: "foreign-card-friendly food" };
  // Always offer "how do I get there?" (the user's key follow-up); non-food results
  // also cross-sell a dining chip (max 4 per footer).
  return isFood ? [now, route, guide] : [now, route, guide, food];
}

// Food sub-keywords → the concrete term we hand to the POI search, so "vegan
// ramen" actually searches ramen instead of the literal word "restaurant".
const FOOD_TERMS: [RegExp, string][] = [
  [/ramen|라멘|라면|ラーメン|拉[面麵]/i, "ramen"],
  [/sushi|초밥|스시|寿司|壽司/i, "sushi"],
  [/bbq|barbecue|gogi|고기|구이|삼겹|焼肉|烤肉/i, "barbecue"],
  [/pizza|피자|ピザ|披[萨薩]/i, "pizza"],
  [/burger|버거|햄버거|バーガー|[汉漢]堡/i, "burger"],
  [/fried chicken|치킨|chimaek|치맥|チキン|フライドチキン|炸[鸡雞]/i, "chicken"],
  [/vegan|vegetarian|plant.?based|비건|채식|ビーガン|ベジタリアン|素食|[纯純]素/i, "vegan"],
  [/halal|할랄|ハラル|清真/i, "halal"],
  [/pho|쌀국수|vietnam|フォー|河粉|越南/i, "pho"],
  [/hot ?pot|전골|샤브|마라|しゃぶ|火鍋|火锅/i, "hotpot"],
  [/dumpling|만두|餃子|饺子/i, "dumpling"],
  [/seafood|해산물|회|sashimi|刺身|海鮮|海鲜/i, "seafood"],
  [/dessert|디저트|케이크|cake|デザート|ケーキ|甜[点點]|蛋糕/i, "dessert"],
  [/bakery|베이커리|빵|bread|ベーカリー|パン屋|[面麵]包/i, "bakery"],
  [/bar|pub|호프|술집|이자카야|izakaya|居酒屋|酒吧/i, "bar"],
  [/noodle|국수|면요리|[麺麵]料理|面[条條]/i, "noodles"],
  // Specific Korean dishes — so a dish query routes to coordinate POI (real
  // restaurants) instead of VisitSeoul area-browse (R3). More specific first.
  [/tteokbokki|떡볶이/i, "tteokbokki"],
  [/bibimbap|비빔밥/i, "bibimbap"],
  [/dak.?galbi|닭갈비|jjimdak|찜닭/i, "dakgalbi"],
  [/bulgogi|불고기/i, "bulgogi"],
  [/galbi|갈비|kalbi|short ?rib/i, "galbi"],
  [/samgyeopsal|삼겹살|pork belly/i, "samgyeopsal"],
  [/naengmyeon|냉면|cold noodle/i, "naengmyeon"],
  [/gimbap|kimbap|김밥/i, "gimbap"],
  [/jjajang|짜장|jajang/i, "jjajangmyeon"],
  [/tonkatsu|donkatsu|돈까스|돈카츠/i, "pork cutlet"],
  [/jokbal|족발|bossam|보쌈/i, "jokbal"],
  [/gopchang|곱창/i, "gopchang"],
  [/sundae|순대/i, "sundae"],
  [/samgyetang|삼계탕|ginseng chicken/i, "samgyetang"],
  [/gukbap|국밥|해장국|haejangguk/i, "gukbap"],
  [/jjigae|찌개|stew/i, "jjigae"],
  [/korean (food|cuisine|bbq|barbecue)|한식|local food|韓国料理|韓国グルメ|[韩韓][国國]料理|[韩韓]食/i, "korean restaurant"],
  [/brunch|브런치|ブランチ|早午餐/i, "brunch"],
  [/cafe|coffee|카페|커피|カフェ|コーヒー|咖啡/i, "cafe"],
];

// Diet/style qualifiers we keep alongside the dish so "vegan ramen" searches
// "vegan ramen", not generic ramen (Y2).
const DIET_QUALIFIER = /\b(vegan|vegetarian|halal|kosher)\b/i;

/** Pick a concrete food keyword from the query for the POI search (else
 *  "restaurant"), preserving a diet qualifier when present (Y2). */
function foodKeyword(query: string): string {
  for (const [re, kw] of FOOD_TERMS) {
    if (!re.test(query)) continue;
    const m = query.match(DIET_QUALIFIER);
    const q = m?.[1]?.toLowerCase();
    return q && q !== kw ? `${q} ${kw}` : kw;
  }
  // Someone who names a brand wants that brand, not "a restaurant near there".
  const brand = BRAND.exec(query)?.[0];
  return brand ?? "restaurant";
}

/** Chains people ask for by name — usually for a familiar breakfast or a toilet. */
const BRAND =
  /starbucks|스타벅스|tous les jours|뚜레쥬르|paris ?baguette|파리바게[뜨트]|mcdonald'?s?|맥도날드|burger king|버거킹|kfc|lotteria|롯데리아|mom'?s touch|맘스터치|twosome|투썸|ediya|이디야|gong ?cha|공차|domino'?s?|도미노|pizza hut|피자헛/i;

/** Is this "what's on / any festivals" rather than "find me a place"? */
export function asksAboutEvents(text: string): boolean {
  return /festival|what'?s on|events? (?:on|happening|near|this)|anything happening|celebration|matsuri|축제|행사|열리는|イベント|祭り|お祭り|活[动動]|[节節]日|慶典|庆典/i.test(
    text ?? "",
  );
}

/** Dated events, with the dates leading — that is what makes them useful. */
function renderFestivals(list: Festival[], areaLabel?: string): string {
  const fmt = (ymd: string): string => `${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;
  const lines = list.map((f, i) => {
    const when = f.startDate === f.endDate ? fmt(f.startDate) : `${fmt(f.startDate)}–${fmt(f.endDate)}`;
    const where = f.address ? `\n   📍 ${f.address}` : "";
    return `**${i + 1}. ${f.title}** · _${when}_${where}\n   ${mapLinks(f.title)}`;
  });
  return [
    `🎉 **On around ${areaLabel ?? "Korea"} right now** — _festivals from Korea Tourism data_`,
    "",
    ...lines,
    "",
    "_Dates come from the organisers via the tourism board; check the venue page before a long trip._",
  ].join("\n");
}

/** Infer a TourAPI category from the natural-language query when not given. */
function inferCategory(query: string, explicit?: string): string | undefined {
  if (explicit) return explicit;
  const q = query.toLowerCase();
  if (
    // ja/zh food words belong here too: a Japanese visitor asking for 韓国料理 was
    // getting a playground and an art gallery, because the intent never registered.
    /cafe|coffee|restaurant|brunch|dining|eat|food|meal|lunch|dinner|breakfast|hungry|tasty|맛집|카페|레스토랑|식당|음식|グルメ|レストラン|食堂|美味し|おいしい|食べ|ご飯|[美好]食|好吃|餐[厅廳]|吃的|用餐|小吃/.test(
      q,
    ) ||
    // Naming a chain is a dining query too — "where's a Starbucks?" was reaching
    // the sightseeing curation and coming back with a hair salon.
    /starbucks|스타벅스|tous les jours|뚜레쥬르|paris ?baguette|파리바게|mcdonald|맥도날드|burger king|버거킹|\bkfc\b|lotteria|롯데리아|mom'?s touch|맘스터치|twosome|투썸|ediya|이디야|gong ?cha|공차|domino|도미노|pizza hut|피자헛/.test(
      q,
    ) ||
    FOOD_TERMS.some(([re]) => re.test(q))
  )
    return "food";
  if (/shop|shopping|mall|store|market|boutique|outlet|쇼핑|상점|쇼핑몰/.test(q)) return "shopping";
  // Sightseeing intent — incl. typos, "things to see", kid/family, and ja/zh terms
  // — so these route to discovery, never default into restaurants (R3).
  if (
    /mus[eu]+ms?|museam|palace|temple|park|beach|coast|mountain|hik|attraction|sight|landmark|tour|view|things?\s*to\s*(see|do)|worth\s*(see|visit)|관광|명소|구경|볼거리|해변|해수욕장|가\s*볼|観光|名所|スポット|景点|景區|景区|kid|child|family|아이|어린이|가족|子供|親子/.test(
      q,
    )
  )
    return "attraction";
  if (/hotel|stay|guesthouse|hostel|accommodation|숙소|호텔/.test(q)) return "accommodation";
  return undefined;
}

/**
 * A heading that reads properly when the router extracted an area but no keyword —
 * `Places for ""` was appearing on perfectly good result lists.
 */
function searchHeading(icon: string, query: string, area: string | undefined, source: string): string {
  const what = (query ?? "").trim() || (area ?? "").trim();
  return what ? `${icon} **Places for** _"${what}"_ — _${source}_` : `${icon} **Places to go** — _${source}_`;
}

function renderPois(query: string, pois: PoiPlace[], area?: string): string {
  const lines = pois.map((p, i) => {
    const tel = p.tel ? ` · ☎ ${p.tel}` : "";
    const cat = p.category ? ` · _${p.category}_` : "";
    return `**${i + 1}. ${p.name}**${cat}\n   📍 ${p.address}${tel}\n   ${mapLinks(p.name)}`;
  });
  const out = [searchHeading("🔎", query, area, "live local search"), "", ...lines];
  // Diet honesty: search can't verify vegan/halal — tell the visitor to confirm (Y2).
  if (/\b(vegan|vegetarian|halal|kosher)\b/i.test(query)) {
    out.push("", "> ⚠️ I can't verify dietary options remotely — confirm vegan/halal etc. with the restaurant.");
  }
  return out.join("\n");
}

// City centres, so a bare city name still anchors the reach filter. Without one,
// "vegetarian food in Seoul" kept matching restaurants NAMED "Seoul" in Suncheon
// and Mokpo, 300km away.
interface CityAnchor {
  lat: number;
  lng: number;
  /** How the city appears in an address, so a result can be sanity-checked. */
  addr: RegExp;
}
// Every city is named in all four languages. Listing only English and Korean meant
// a Japanese visitor writing ソウル or a Taiwanese one writing 首爾 produced no
// anchor at all, which switched off the coordinate search their query depended on
// — "ソウルで韓国料理のおすすめは？" came back "nothing matched".
const CITY_CENTER: [RegExp, CityAnchor][] = [
  [/\bseoul\b|서울|ソウル|首[尔爾]/i, { lat: 37.5665, lng: 126.978, addr: /seoul|서울/i }],
  [/\bbusan\b|부산|プサン|釜山/i, { lat: 35.1796, lng: 129.0756, addr: /busan|부산/i }],
  [/\bjeju\b|제주|チェジュ|[済濟济]州/i, { lat: 33.4996, lng: 126.5312, addr: /jeju|제주/i }],
  [/\bincheon\b|인천|インチョン|仁川/i, { lat: 37.4563, lng: 126.7052, addr: /incheon|인천/i }],
  [/\bdaegu\b|대구|テグ|大邱/i, { lat: 35.8714, lng: 128.6014, addr: /daegu|대구/i }],
  [/\bdaejeon\b|대전|テジョン|大田/i, { lat: 36.3504, lng: 127.3845, addr: /daejeon|대전/i }],
  [/\bgwangju\b|광주|クァンジュ|光州/i, { lat: 35.1595, lng: 126.8526, addr: /gwangju|광주/i }],
  [/\bgyeongju\b|경주|キョンジュ|[慶庆]州/i, { lat: 35.8562, lng: 129.2247, addr: /gyeongju|경주/i }],
];

function cityCenter(text: string): CityAnchor | undefined {
  for (const [re, c] of CITY_CENTER) if (re.test(text)) return c;
  return undefined;
}

/**
 * Drop results that are nowhere near the area the visitor asked about.
 *
 * TourAPI keyword search matches the NAME, so "vegetarian food in Seoul" returned
 * "Seoul Bokjip" in Suncheon and "Seoul Sikdang" in Mokpo — 300km away — and an
 * ATM "in Myeongdong" came back in Jongno. When we know the anchor coordinates we
 * keep only what is plausibly reachable; with no anchor we change nothing.
 */
function withinReach<T extends { mapx?: number; mapy?: number }>(
  items: T[],
  anchor: { lat: number; lng: number } | undefined,
  km: number,
  cityAddr?: RegExp,
): T[] {
  if (!anchor && !cityAddr) return items;
  const near = items.filter((p) => {
    if (typeof p.mapx !== "number" || typeof p.mapy !== "number") {
      // No coordinates? Fall back to the address — TourAPI's keyword search matches
      // NAMES, so "Seoul Bokjip" in Suncheon looks like a Seoul result until you
      // read where it is.
      const addr = (p as { address?: string }).address ?? "";
      return !cityAddr || !addr ? true : cityAddr.test(addr);
    }
    if (!anchor) return true;
    const dLat = (p.mapy - anchor.lat) * 111;
    const dLng = (p.mapx - anchor.lng) * 111 * Math.cos((anchor.lat * Math.PI) / 180);
    return Math.hypot(dLat, dLng) <= km;
  });
  // If everything is far, return nothing rather than the far list: the caller's
  // coordinate-radius fallback below produces genuinely local results, and a
  // Suncheon restaurant is not an answer to "in Seoul".
  return near;
}

/**
 * When the tourism API has nothing, answer from what we know ourselves.
 *
 * This is the difference between a search box and a concierge: a person who
 * says they are tired of shopping and wants somewhere quiet has told us plenty,
 * and the only reason it produced *Nothing matched* is that no regular
 * expression in the pipeline was looking for it.
 *
 * Only places are offered here, and only when retrieval is confident — a wrong
 * place stated plainly is worse than admitting the search found nothing.
 */
async function rescueBySearch(query: string, areaLabel?: string): Promise<string | undefined> {
  const hits = await search(query, { kinds: ["spot", "landmark", "area"], limit: 4 }).catch(() => []);
  if (!hits.length || !confident(hits)) return undefined;
  const lines = hits.slice(0, 3).map((h, i) => {
    const where = h.doc.area && !/^(?:Seoul|Busan|Jeju|Gyeongju)$/i.test(h.doc.area) ? ` _(${h.doc.area})_` : "";
    // The document text is our own blurb; the part of it that reads like a
    // sentence is the reason to go, which is the part worth printing.
    const why = h.doc.text.split(" · ").find((part) => part.length > 30 && !part.includes("allergens"));
    return `**${i + 1}. ${h.doc.title}**${where}${why ? `\n   ${why}` : ""}\n   ${mapLinks(h.doc.title)}`;
  });
  return [
    `🔎 **Closest matches for** _"${query}"_${areaLabel ? ` in ${areaLabel}` : ""}`,
    "",
    ...lines,
    "",
    "_Matched from this service's own place knowledge rather than a keyword search, so tell me if I read you wrong._",
  ].join("\n");
}

function renderPlaces(query: string, places: Place[]): string {
  if (places.length === 0) {
return (
      `🔎 **Nothing matched** _"${query}"_\n\n` +
      "That search was too specific for the tourism data. Try a place type plus an area — " +
      "_\"cafe in Hongdae\"_, _\"museum near Gyeongbokgung\"_ — or ask me for a neighbourhood guide."
    );
  }
  const lines = places.map((p, i) => {
    // No inline image markdown: the chat surface renders `![photo](longURL)` as
    // raw noise (and eats the 24k budget), so we keep results text-only (N11).
    // Map links ARE kept — concrete Naver/Kakao URLs are useful and survive paraphrase.
    const tel = p.tel ? ` · ☎ ${p.tel}` : "";
    return `**${i + 1}. ${p.title}**\n   📍 ${p.address}${tel}\n   ${mapLinks(p.title)}`;
  });
  return [
    searchHeading("🔎", query, undefined, "from Korea Tourism data"),
    "",
    ...lines,
  ].join("\n");
}

// ── Seoul layer (VisitSeoul) ────────────────────────────────────────────────
// For Seoul, VisitSeoul's official curation is the primary source; its result
// chips are built contextually by searchChoices() (D-035).

const SEOUL_AREAS = [
  "Myeongdong", "Hongdae", "Gangnam", "Insadong", "Itaewon", "Bukchon", "Dongdaemun",
  "Yeouido", "Jamsil", "Seongsu", "Euljiro", "Samcheong", "Garosu", "Sinsa", "Jongno",
  "Gwanghwamun", "Ikseon", "Gwangjang", "Namdaemun", "Apgujeong", "Cheongdam", "Yeonnam",
  "Hapjeong", "Mangwon", "Seochon", "Konkuk", "Sinchon",
];

/** The keyword we hand VisitSeoul to narrow to a neighborhood. "Seoul" itself is
 *  not a useful title keyword, so the bare city → category browse (empty). */
// Filler that carries no search signal. Visitors type sentences, not keywords —
// "지금 밤인데 술 말고 실내 갈 데 있어?" was posted verbatim to a keyword API and
// returned nothing at all. Stripping the question scaffolding leaves the nouns
// that actually retrieve.
const QUERY_FILLER =
  /\b(?:please|can you|could you|i(?:'m| am)?|we(?:'re| are)?|want|would like|looking for|find|show|tell|me|us|any|some|good|nice|best|around|near(?:by)?|here|there|now|today|tonight|right now|is|are|there|a|an|the|to|for|in|at|of|and|or|but|what|where|which|how|do|does|go|going|visit|recommend(?:ation)?s?)\b/gi;
const QUERY_FILLER_KO =
  /(?:알려줘|추천(?:해줘|좀|해)?|있어|있나요|있을까|어디|뭐|무슨|좀|해줘|해주세요|하고 ?싶어|가고 ?싶어|갈 ?만한|갈 ?데|괜찮은|지금|오늘|이|가|을|를|에|에서|은|는|의|같은|정도|말고)/g;

// The same job for Japanese and Chinese, which this used to skip entirely — so
// "ソウルで韓国料理のおすすめは？" reached the search verbatim and matched nothing.
// Only multi-character fillers are stripped: Japanese particles are single
// characters that also live inside words, and shredding them costs more than the
// filler does.
const QUERY_FILLER_JA =
  /(?:おすすめ|オススメ|お勧め|教えてください|教えて|ください|下さい|ありますか|ありませんか|でしょうか|ですか|したいです|したい|行きたい|食べたい|探しています|探して|人気の|人気|有名な|有名|近くの|近く|周辺の|周辺|辺り|どこか|どこ|どんな|なにか|何か|いいところ|良いところ|ところ|場所|ですか|です|ます)/g;
const QUERY_FILLER_ZH =
  /(?:推荐|推薦|請問|请问|有什[么麼]|有哪些|哪[里裡儿兒]|附近的|附近|周[边邊]|好吃的|好玩的|不[错錯]的|想去|想吃|我要|我想|可以|地方)/g;

/**
 * Particles left dangling once the filler around them is gone — "弘大の 近く で
 * カフェ" loses its middle and leaves "の" and "で" floating between the words
 * that matter. Dropped wherever they end up standing alone.
 */
const STRAY_PARTICLE = /[はがをにでのとやも吗嗎呢的]\s|\s[はがをにでのとやも吗嗎呢的]/g;
const TRAILING_PARTICLE = /[はがをにでのとやも吗嗎呢的]\s*$/;

/** Compact a free-text request into the terms a keyword search can actually use. */
export function searchTerms(query: string): string {
  const compact = (query ?? "")
    .replace(/[?？!！.,，、]/g, " ")
    .replace(QUERY_FILLER, " ")
    .replace(QUERY_FILLER_KO, " ")
    .replace(QUERY_FILLER_JA, " ")
    .replace(QUERY_FILLER_ZH, " ")
    .replace(STRAY_PARTICLE, " ")
    .replace(STRAY_PARTICLE, " ") // removal creates new adjacencies
    .replace(/\s{2,}/g, " ")
    .replace(TRAILING_PARTICLE, "")
    .trim();
  // If stripping ate everything, keep the original — a bad search beats no search.
  return compact.length >= 2 ? compact : (query ?? "").trim();
}
function seoulKeyword(area: string, query: string): string {
  // 首爾 / ソウル / 首尔 name the whole CITY. Treating them as a neighbourhood
  // switched off the must-see seeding, so "首爾有哪些必去景點？" led with luggage
  // lockers instead of the palaces.
  const a = cjkToKorean(area).trim();
  if (a && !/^seoul(특별시)?$|^서울(특별시)?$/i.test(a)) return a;
  for (const name of SEOUL_AREAS) if (new RegExp(name, "i").test(query)) return name;
  return "";
}

// Iconic must-see lists, seeded ahead of the live results for a GENERIC, city-wide
// sightseeing query (e.g. "things to see in Busan") — so the flagship first-timer
// query leads with real marquee sights instead of a current exhibition (Seoul) or
// a rough romanized POI (non-Seoul) (P-V2, extended to major cities, D-021). A
// specific neighbourhood or a specific noun ("museums") skips this.
const CITY_MUSTSEE: Record<string, string[]> = {
  Seoul: [
    "**Gyeongbokgung Palace** — the grand royal palace + changing-of-the-guard",
    "**N Seoul Tower (Namsan)** — city views, cable car, sunset",
    "**Bukchon Hanok Village** — traditional hanok alleys between the palaces",
    "**Myeongdong** — shopping + evening street food",
    "**Insadong & Gwangjang Market** — crafts, teahouses, classic street eats",
    "**Han River Park (Hangang)** — riverside picnics & bike paths",
  ],
  Busan: [
    "**Haeundae Beach** — the famous bay + Blue Line beach train",
    "**Gamcheon Culture Village** — pastel hillside art village",
    "**Haedong Yonggungsa** — seaside temple on the rocks",
    "**Jagalchi Market & Nampo-dong** — huge fish market + BIFF Square",
    "**Gwangalli Beach** — café strip facing the lit Gwangan Bridge",
    "**Taejongdae / Oryukdo Skywalk** — coastal cliffs and sea views",
  ],
  Jeju: [
    "**Seongsan Ilchulbong (Sunrise Peak)** — UNESCO tuff cone, sunrise hike",
    "**Hallasan** — Korea's highest peak (start early)",
    "**Manjanggul Cave** — a walkable UNESCO lava tube",
    "**Cheonjiyeon & Jeongbang Falls** — Seogwipo waterfalls",
    "**Udo (Cow Island)** — bike the islet off the east coast",
    "**Seopjikoji & Jusangjeolli** — coastal cape and basalt cliffs",
  ],
  Gyeongju: [
    "**Bulguksa Temple & Seokguram Grotto** — UNESCO Silla masterpieces",
    "**Daereungwon Tumuli Park** — grassy royal burial mounds (Cheonmachong)",
    "**Cheomseongdae** — the ancient stone observatory",
    "**Donggung Palace & Wolji Pond** — stunning at night",
    "**Gyeongju National Museum** — Silla gold crowns & the Emille Bell",
  ],
};
const SEOUL_GENERIC_RE =
  /things?\s*to\s*(see|do)|worth\s*(see|visit)|sightsee|what\s*to\s*(see|do)|must.?see|attraction|landmark|명소|관광|볼거리|가\s*볼|観光|觀光|观光|名所|景点|景區|景区|景點/i;

/** Detect the headline city named in a generic query, for must-see seeding. */
function detectMustSeeCity(query: string, area: string): keyof typeof CITY_MUSTSEE | null {
  const t = `${area} ${query}`;
  if (/\bseoul\b|서울|ソウル|首爾|首尔/i.test(t)) return "Seoul";
  if (/busan|부산|釜山|プサン/i.test(t)) return "Busan";
  if (/jeju|제주|济州|済州|濟州|チェジュ/i.test(t)) return "Jeju";
  if (/gyeongju|경주|慶州/i.test(t)) return "Gyeongju";
  return null;
}

/** Lead block of curated must-see sights for a generic, city-wide sightseeing
 *  query; "" otherwise. Pure/exported for testing. (P-V2, multi-city) */
export function cityMustSeeLead(query: string, area: string): string {
  if (!SEOUL_GENERIC_RE.test(query)) return ""; // a specific noun (e.g. "museums") → targeted
  // A specific Seoul neighbourhood keyword → targeted VisitSeoul results, no seed.
  if (seoulKeyword(area, query) && detectMustSeeCity(query, area) === "Seoul") return "";
  const city = detectMustSeeCity(query, area);
  if (!city) return "";
  return (
    [`⭐ **${city} must-see**`, ...CITY_MUSTSEE[city].map((s) => `- ${s}`), "", "_More ideas below:_", ""].join("\n") + "\n"
  );
}

/** Curated lead for "templestay" queries (P3) — it's a specific cultural program,
 *  not a place, so a plain place search misses it. Evergreen primer + the official
 *  nonprofit booking site + foreigner-friendly temples; "" otherwise. Pure/exported. */
export function templeStayLead(query: string): string {
  if (!/temple\s*stay|templestay|템플스테이/i.test(query)) return "";
  return (
    [
      "🧘 **Templestay** — an overnight (or day) stay at a Korean Buddhist temple: meditation, a tea ceremony, temple meals (_barugongyong_), and dawn chanting. Many programs run **in English** for foreigners.",
      "- **Book official:** ~140 temples are listed at **eng.templestay.com** — the official nonprofit program site (not an ad).",
      "- **Foreigner-friendly picks:** **Jogyesa** & **Bongeunsa** (Seoul, day programs), **Beomeosa** (Busan), **Golgulsa** (Gyeongju, Seonmudo training), **Haeinsa** (the Tripitaka Koreana).",
      "",
      "_Specific temples below — tap one for hours, or ask me to route you there:_",
      "",
    ].join("\n") + "\n"
  );
}

/** Curated lead for "guided tour / 도보해설" queries — Seoul runs an official FREE
 *  multilingual guided-walking-tour program that a plain place search misses. Like
 *  the templestay primer (D-030): structured, official, not an ad. "" otherwise. */
export function guidedTourLead(query: string): string {
  if (!/guided\s*tour|walking\s*tour|도보\s*해설|해설\s*관광|문화관광해설|free\s*(official\s*)?(guided\s*)?(walking\s*)?tour|dobo|docent/i.test(query)) return "";
  return (
    [
      "🚶 **Seoul's free official guided walking tours (Seoul Dobo Tour)** — the city runs **scores of courses** led by certified cultural-tourism commentators: the **palaces, Bukchon & Namsangol hanok villages, Jeong-dong, Seoul City Wall, night routes**, and more.",
      "- **100% free**, in **7 languages incl. English / Japanese / Chinese** — reserve **≥3 days ahead** at **dobo.visitseoul.net**.",
      "- Runs about **twice daily (10:00 & 14:00)**; some barrier-free and sign-language courses too.",
      "- Palaces (Gyeongbokgung, Changdeokgung…) also have their **own free scheduled English tours** at the gate.",
      "",
      "_Specific sights below — tap one for hours, or ask me how to get there:_",
      "",
    ].join("\n") + "\n"
  );
}

function dedupeByTitle(items: SeoulContent[], limit: number): SeoulContent[] {
  const seen = new Set<string>();
  const out: SeoulContent[] = [];
  for (const it of items) {
    const k = it.title.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
    if (out.length >= limit) break;
  }
  return out;
}

/** A Seoul card enriched with the Korean name + coordinates used for map links. */
interface SeoulCard extends SeoulContent {
  koTitle?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

/**
 * Korean map services search their Korean place database, so a link built from an
 * English display name finds nothing. Fetch each shown item's Korean detail
 * (cached, in parallel) for the Korean name + exact coordinates and link with
 * those. Fail-soft: a miss falls back to the English-name search link.
 */
async function enrichForLinks(items: SeoulContent[]): Promise<SeoulCard[]> {
  return Promise.all(
    items.map(async (c): Promise<SeoulCard> => {
      try {
        const ko = await getSeoulDetail(c.cid, "ko");
        return { ...c, koTitle: ko?.title, address: ko?.address, lat: ko?.lat, lng: ko?.lng };
      } catch {
        return { ...c };
      }
    }),
  );
}

function renderSeoul(query: string, items: SeoulCard[], indoor = false): string {
  const lines = items.map((p, i) => {
    // Text-only (no raw image markdown) — see renderPlaces (N11).
    const cat = p.categoryPath ? ` · _${p.categoryPath.split(">").pop()?.trim()}_` : "";
    const sum = p.summary ? `\n   ${clip(p.summary, 180)}` : "";
    const addr = p.address ? `\n   📍 ${p.address}` : "";
    const linkName = p.koTitle || p.title;
    const link =
      typeof p.lat === "number" && typeof p.lng === "number"
        ? mapLinksAt(linkName, p.lat, p.lng)
        : mapLinks(linkName);
    return `**${i + 1}. ${p.title}**${cat}${sum}${addr}\n   ${link}`;
  });
  return [
    indoor
      ? `🔎 **Seoul — indoor picks for** _"${query}"_ · _stay dry_ — _official Seoul Tourism_`
      : searchHeading("🔎", query, undefined, "official Seoul Tourism").replace("Places for", "Seoul ideas for").replace("Places to go", "Seoul ideas"),
    "",
    ...lines,
  ].join("\n");
}

// Ephemeral content (a current exhibition/concert/festival) that the "latest"
// sort surfaces first — demoted for general sightseeing so real, permanent places
// lead "things to see in Seoul" (P-V2).
const EPHEMERAL_RE = /festival|exhibition|concert|performance|\bshow\b|biennale|fair\b|행사|축제|전시|공연|콘서트|페스티벌/i;

// Category paths that denote a standing venue (open year-round) rather than a
// programme running inside one.
const PERMANENT_VENUE_RE =
  /museum|galler|aquarium|library|department\s*store|mall|theme\s*park|palace|박물관|미술관|화랑|아쿠아리움|도서관|백화점|쇼핑몰|테마파크|궁/i;

// Titles that announce a dated, limited run: a year ("SKETCH 2026", "2027 S/S…"),
// Korean exhibition markers, or the 《》 brackets Korean venues use for show titles.
const DATED_TITLE_RE = /\b(?:19|20)\d{2}\b|《|》|개인전|기획전|특별전|초대전|展/;

// Listings that are services, not sights. They surface under a generic "what
// should I see" browse because the endpoint answers with its newest content —
// luggage storage counters are not an answer to "must-see sights in Seoul".
const NOT_A_SIGHT_RE =
  /luggage|locker|storage|baggage|짐\s*보관|물품보관|rental office|대여소|parking|주차/i;

/** Rank Seoul results for the query: float a specific noun (museum/palace/gallery)
 *  up (Y3), and demote ephemeral events/exhibitions for general sightseeing intent
 *  (P-V2) — unless the user explicitly asked for events. */
function rankByIntent(items: SeoulContent[], query: string): SeoulContent[] {
  const q = query.toLowerCase();
  const want = /museum|박물관/.test(q)
    ? /museum/i
    : /palace|궁/.test(q)
      ? /palace|궁/i
      : /gallery|미술관/.test(q)
        ? /galler|미술/i
        : null;
  const wantsEvents = /festival|event|exhibition|concert|performance|\bshow\b|축제|행사|전시|공연|콘서트/.test(q);
  if (!want && wantsEvents) return items; // user wants events → keep the live order
  const score = (c: SeoulContent): number => {
    let s = 0;
    if (want) s += (want.test(c.title) ? 2 : 0) + (c.categoryPath && want.test(c.categoryPath) ? 1 : 0);
    if (!wantsEvents && (EPHEMERAL_RE.test(c.title) || (c.categoryPath && EPHEMERAL_RE.test(c.categoryPath)))) s -= 2;
    if (!wantsEvents) {
      // A visitor asking "where can I go" wants somewhere open next week too, so a
      // standing venue outranks this month's exhibition run (live-reported).
      if (PERMANENT_VENUE_RE.test(c.categoryPath ?? "")) s += 2;
      if (DATED_TITLE_RE.test(c.title)) s -= 2;
    }
    return s;
  };
  return items
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

/** Fuzzy-correct a typo'd Seoul area to a known name ("Seongsoo"→"Seongsu") so it
 *  resolves instead of returning "no places" (Y6). Leaves known/unknown as-is. */
function correctArea(area: string): string {
  const a = area.trim();
  if (!a || resolvePlaceCoord(a)) return a;
  let best = "";
  let bestS = 0;
  for (const name of SEOUL_AREAS) {
    const s = similarity(a, name);
    if (s > bestS) {
      bestS = s;
      best = name;
    }
  }
  return bestS >= 0.7 ? best : a;
}

/**
 * VisitSeoul (Seoul, non-dining) — official curated discovery. Returns rendered
 * Markdown when it has picks, else "" so the caller grounds the gap with the
 * national sources (TourAPI/POI). Dining is handled by coordinate POI elsewhere.
 */
async function trySeoul(
  query: string,
  area: string,
  cat: string | undefined,
  language: ReturnType<typeof normalizeLang>,
): Promise<string | undefined> {
  // "It's raining — where can I go indoors?" must actually return sheltered
  // places: target museums/galleries (Cultural Facilities), then drop outdoor ones.
  const indoor = isIndoorIntent([query, cat, area].filter(Boolean).join(" "));
  const vsCat =
    (indoor ? VS_CATEGORY.museum : undefined) ??
    inferSeoulCategory([cat, query, area].filter(Boolean).join(" ")) ??
    (cat === "shopping" ? VS_CATEGORY.shopping : cat === "accommodation" ? VS_CATEGORY.accommodation : undefined);
  const kw = seoulKeyword(area, query);
  try {
    // 1) area-narrowed within category; broaden if thin so we still lead with VS.
    // With neither a category nor an area keyword there is nothing to search on,
    // and the endpoint answers with its newest content — which is how "must-see
    // sights in Seoul" came back as luggage lockers. Anchor generic sightseeing on
    // the culture node instead of asking for "anything".
    const effectiveCat = vsCat ?? (kw ? undefined : VS_CATEGORY.culture);
    let vs = await searchSeoulContent({ category: effectiveCat, keyword: kw, language, limit: 8 });
    if (vs.length < 3) {
      const broaden = effectiveCat ?? VS_CATEGORY.culture; // generic discovery → things to see
      const more = await searchSeoulContent({ category: broaden, keyword: kw, language, limit: 8 });
      vs = dedupeByTitle([...vs, ...more], 8);
    }
    // Drop stale past-dated events (Y1) and float intent-matching picks (Y3).
    const year = currentYearKST();
    vs = rankByIntent(
      vs.filter((c) => !isStalePastEvent(c.title, year) && !NOT_A_SIGHT_RE.test(`${c.title} ${c.categoryPath ?? ""}`)),
      query,
    );
    if (indoor) {
      // Shelter first; if that leaves too little, top up with malls (also indoor).
      let sheltered = vs.filter((c) => !isLikelyOutdoor(c));
      if (sheltered.length < 3) {
        const malls = await searchSeoulContent({ category: VS_CATEGORY.shopping, keyword: kw, language, limit: 8 });
        sheltered = dedupeByTitle([...sheltered, ...malls.filter((c) => !isLikelyOutdoor(c))], 8);
      }
      vs = sheltered;
    }
    vs = vs.slice(0, 6);
    if (!vs.length) return undefined;
    return renderSeoul(query, await enrichForLinks(vs), indoor);
  } catch {
    return undefined; // fall through to national grounding
  }
}

export const searchPlaceForeigner: ToolDef = {
  name: "searchPlaceForeigner",
  description:
    "Recommends places in Korea from a foreign visitor's natural-language intent, weighting " +
    "foreigner-friendliness (English support, walk-in, foreign-card acceptance). " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    query: z
      .string()
      .optional()
      .describe("Natural-language intent, e.g. 'quiet cafe near Hongdae with English menu'. If omitted, give an area."),
    area: z.string().optional().describe("Optional area/neighborhood to focus on."),
    category: z.string().optional().describe("Optional category: food, cafe, attraction, shopping, culture."),
    language: z
      .string()
      .optional()
      .describe("Result language: en (default), ja, zh (Chinese Simplified), ko — full names like 'english' also work. Match the visitor's language."),
  },
  annotations: {
    title: "Search Places for Foreign Visitors",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (args) => {
    const query = String(args.query ?? "");
    const area = correctArea(args.area ? String(args.area) : ""); // typo → known area (Y6)
    const category = args.category ? String(args.category) : undefined;
    const cat = inferCategory(query, category);
    const language = normalizeLang(args.language as string | undefined);
    // A neighbourhood/city label for contextual follow-up chips (D-035): the given
    // area, else a place name extracted from the query ("cafes in Seongsu" → Seongsu).
    const areaLabel = area.trim() || findPlaceInText(query)?.label || undefined;
    // A bare city name has no curated coordinate; its centre anchors both the POI
    // search and the reach filter below.
    const city = cityCenter(`${area} ${query}`);
    // Programs (not places) lead with a curated primer when asked: templestay (P3)
    // and Seoul's free official guided walking tours (D-034). Otherwise the generic
    // city-wide must-see lead (P-V2/D-021). "" for dining/specific. Prepended to
    // whichever result path runs.
    const program = guidedTourLead(query) || templeStayLead(query);
    const mustSee = program || (cat !== "food" ? cityMustSeeLead(query, area) : "");

    // "What's on while I'm here?" is a question about dates, not names, and the
    // keyword search could never answer it — a festival is defined by when it
    // runs. The tourism board's festival service is dated, nationwide and already
    // translated, which makes it the right source and an unambiguously better
    // answer than anything a general search returns.
    // "big mall" was answering with a sneaker shop and a pharmacy — the tourism
    // categories file a 600-store complex and a boutique under the same label, so
    // the dozen places anyone actually means are named directly.
    if (asksAboutMalls(query) || asksAboutMalls(area)) {
      return ok(mallsCard(`${query} ${area}`), searchChoices(areaLabel, false));
    }

    if (asksAboutEvents(query)) {
      const festivals = await searchFestivals({ from: todayKST().replace(/-/g, ""), language, limit: 6 }).catch(
        () => [],
      );
      if (festivals.length) {
        return ok(renderFestivals(festivals, areaLabel), searchChoices(areaLabel, false));
      }
    }

    // No query and no area → ask, instead of letting an empty search run (N3).
    if (!query.trim() && !area.trim()) {
      return ok(
        '🔎 **What are you looking for?**\n\nTell me a place type and/or an area — e.g. _"quiet cafe in Hongdae"_, _"things to see in Seoul"_, or _"vegan food near Itaewon"_.',
        CHOICES,
      );
    }

    // "temple stay" with no city context → route to Seoul's VisitSeoul templestay
    // curation (its best English coverage) instead of generic TourAPI geography
    // (P3). A named non-Seoul city (e.g. "temple stay in Busan") opts out.
    let forceSeoulTemple = false;
    if (/temple\s*stay|templestay|템플스테이/i.test(query) && !area.trim()) {
      const qc = findPlaceInText(query);
      forceSeoulTemple = !qc || isSeoulText(qc.label);
    }

    // Seoul + non-dining → VisitSeoul official curation leads (D-010): pre-translated
    // English summaries/hours/subway for the sightseeing, shopping, culture, nature
    // and experience places visitors ask about. Dining stays on coordinate POI
    // below (stronger for restaurants); any VisitSeoul gap falls through to the
    // national grounding sources (TourAPI/POI).
    if (cat !== "food" && hasKey("VISITSEOUL_API_KEY") && (isSeoulText(area) || isSeoulText(query) || forceSeoulTemple)) {
      const seoul = await trySeoul(query, area, cat, language);
      if (seoul) return ok(mustSee + seoul, searchChoices(areaLabel, cat === "food"));
    }

    // Dining queries → richer comprehensive POI (Naver/Foursquare, converted to
    // English) rather than TourAPI's sparse tourism dining data.
    if (cat === "food" && hasPoiProvider()) {
      try {
        const what = foodKeyword(query); // concrete term (ramen/sushi/vegan…) not just "restaurant"
        // A bare city name has no curated coordinate, so fall back to its centre —
        // otherwise 'vegetarian food in Seoul' had nothing to search around once the
        // out-of-town name matches were filtered out.
        const coord =
          resolvePlaceCoord(area) ?? resolvePlaceCoord(query) ?? findPlaceInText(query) ?? findPlaceInText(area) ?? city;
        const pois = await searchForeignerPois({
          area: area || searchTerms(query) || query,
          query: what,
          nativeQuery: query,
          coord: coord ? { lat: coord.lat, lng: coord.lng } : undefined,
          limit: 6,
        });
        if (pois.length) return ok(renderPois(query, pois, areaLabel ?? area), searchChoices(areaLabel, true));
      } catch {
        /* fall through to TourAPI */
      }
    }

    if (!hasKey("TOUR_API_KEY")) {
      return notConnected(
        "Search Places",
        `Sources: **comprehensive POI (Naver/Foursquare) + Korea Tourism TourAPI**. Query: _"${query.slice(0, 120)}"_.`,
        CHOICES,
      );
    }

    // Try the combined phrase first, then fall back to area-only / query-only so
    // a literal "cafe Hongdae" miss still surfaces useful results.
    // Sentences retrieve badly, so try the compacted terms too — "지금 밤인데 술
    // 말고 실내 갈 데 있어?" returns nothing verbatim but does resolve on its nouns.
    const terms = searchTerms(query);
    const candidates = [
      [query, area].filter(Boolean).join(" "),
      [terms, area].filter(Boolean).join(" "),
      area,
      terms,
      query,
    ].filter((c, i, all) => c && all.indexOf(c) === i);
    try {
      const named = resolvePlaceCoord(area) ?? findPlaceInText(area) ?? findPlaceInText(query);
      const anchorCoord = named ? { lat: named.lat, lng: named.lng } : city;
      // A named neighbourhood means "walkable-ish"; a bare city means the metro area.
      const reachKm = area.trim() && !isSeoulText(area) ? 12 : 35;
      const places = withinReach(
        await searchPlacesAny(candidates, { category: cat, limit: 5, language }),
        anchorCoord,
        reachKm,
        city?.addr,
      );
      // The English TourAPI is sparse (~15k vs ~50k entries). When it's thin and
      // we know the area's coordinates, broaden with the much larger KOREAN
      // dataset by radius (romanized) — far better national/long-tail coverage.
      if (places.length < 5 && language === "en") {
        const coord = resolvePlaceCoord(area) ?? resolvePlaceCoord(query) ?? findPlaceInText(query) ?? findPlaceInText(area);
        if (coord) {
          const ko = await searchPlacesNearby({
            lat: coord.lat,
            lng: coord.lng,
            radius: named ? 2000 : 6000,
            category: cat,
            limit: 8,
            language: "ko",
          });
          const seen = new Set(places.map((p) => p.title.toLowerCase()));
          for (const p of ko) {
            if (places.length >= 6) break;
            const k = p.title.toLowerCase();
            if (!seen.has(k)) {
              seen.add(k);
              places.push(p);
            }
          }
        }
      }
      // The tourism API answers a place *type* in an *area*. It has nothing to
      // say to "somewhere quiet, I am exhausted from shopping" or "a traditional
      // wedding ceremony", and it answered both with "Nothing matched" while a
      // hanok village and a dozen teahouses sat in our own corpus. Search that.
      if (!places.length) {
        const rescued = await rescueBySearch(query, areaLabel);
        if (rescued) return ok(mustSee + rescued, searchChoices(areaLabel, cat === "food"));
      }
      return ok(mustSee + renderPlaces(query, places), searchChoices(areaLabel, cat === "food"));
    } catch {
      // Even when live data is slow, still serve the curated must-see lead so the
      // fallback doesn't vanish exactly when the API fails (P-V2 cold case).
      if (mustSee) {
        return ok(
          mustSee + "_Live results are slow right now — the must-see picks above are a solid start; tap one to check it, or try again._",
          searchChoices(areaLabel, cat === "food"),
        );
      }
      return fail(
        "Couldn't reach the places service",
        "The Korea Tourism data source didn't respond in time. Please try again in a moment.",
        RETRY,
      );
    }
  },
};
