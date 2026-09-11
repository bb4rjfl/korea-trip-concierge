/**
 * A question about "here", turned into work for the traveller's phone.
 *
 * The server reads the question and never the position (src/lib/deviceTask.ts):
 * it decides that "근처 약국" is a pharmacy search, which Kakao categories and
 * words find one, how far a pharmacy is worth walking to, and what a visitor
 * should know when they get there. The phone runs that from its own fix.
 *
 * Everything here is the same whoever asks and from wherever — which is the
 * test for being allowed to happen on the server at all.
 */

import type { DeviceTask, KakaoQuery, NearbyNeed, NearbyTask } from "../../src/lib/deviceTask.js";
import { essentialFor, type Need } from "../../src/tools/findForeignerFriendlyStore.js";
import { inferCategory, foodKeyword } from "../../src/tools/searchPlaceForeigner.js";
import { geocode, toStationName } from "../../src/tools/getTransitRoute.js";
import { exitLine } from "../../src/lib/exits.js";
import { accessFor } from "../../src/lib/access.js";

type Search = Pick<NearbyTask, "queries" | "radius" | "order" | "pharmacyOnly" | "noFood" | "searchKo">;

/**
 * How each essential is found in Kakao's directory.
 *
 * Category codes where Kakao files the thing reliably (PM9 pharmacy, CS2
 * convenience store, BK9 bank); Korean keywords where it has no category of its
 * own (coin lockers, prayer rooms). Both where each misses some the other finds
 * — measured at Yangjae, the category search for pharmacies missed one 194 m
 * away that a keyword search had.
 */
const ESSENTIAL_SEARCH: Record<Need, Search> = {
  pharmacy: { queries: [{ category: "PM9" }, { keyword: "약국" }], radius: 1500, order: "distance", pharmacyOnly: true, noFood: true, searchKo: "약국" },
  atm: { queries: [{ keyword: "ATM" }, { category: "BK9" }], radius: 1000, order: "distance", noFood: true, searchKo: "ATM" },
  // Licensed booths beat most banks on rate, and Kakao files them under 환전.
  currencyExchange: { queries: [{ keyword: "환전소", categoryHas: "환전" }, { keyword: "환전" }], radius: 2000, order: "distance", noFood: true, searchKo: "환전소" },
  convenience: { queries: [{ category: "CS2" }], radius: 1000, order: "distance", searchKo: "편의점" },
  touristInfo: { queries: [{ keyword: "관광안내소" }], radius: 3000, order: "distance", noFood: true, searchKo: "관광안내소" },
  foreignCardDining: { queries: [{ category: "FD6" }], radius: 1000, order: "popular", searchKo: "맛집" },
  // An emergency room is worth a taxi ride; a clinic round the corner is not one.
  // (Measured at Myeongdong: "종합병원" found an animal hospital and a jeweller.)
  emergency: { queries: [{ keyword: "응급실", categoryHas: "응급" }], radius: 10000, order: "distance", noFood: true, searchKo: "응급실" },
  luggage: { queries: [{ keyword: "물품보관함" }, { keyword: "짐보관" }], radius: 2000, order: "distance", noFood: true, searchKo: "물품보관함" },
  laundry: { queries: [{ keyword: "코인빨래방" }, { keyword: "빨래방" }], radius: 2000, order: "distance", noFood: true, searchKo: "코인빨래방" },
  // By relevance: a keyword search for 비건 nearest-first opens with a barbecue place that mentions it.
  vegan: { queries: [{ keyword: "비건" }, { keyword: "채식" }], radius: 3000, order: "popular", searchKo: "비건" },
  // "기도실" finds nothing in the directory; mosques are filed under 이슬람교.
  prayer: { queries: [{ keyword: "이슬람교", categoryHas: "이슬람" }, { keyword: "기도실" }], radius: 15000, order: "distance", noFood: true, searchKo: "이슬람 사원" },
  post: { queries: [{ keyword: "우체국" }], radius: 3000, order: "distance", noFood: true, searchKo: "우체국" },
};

/** The dish words the food search reads, in the Korean a Korean directory is searched in. */
const FOOD_KO: Record<string, string> = {
  ramen: "라멘",
  sushi: "초밥",
  barbecue: "고기집",
  pizza: "피자",
  burger: "햄버거",
  chicken: "치킨",
  vegan: "비건",
  vegetarian: "채식",
  halal: "할랄",
  kosher: "코셔",
  pho: "쌀국수",
  hotpot: "샤브샤브",
  dumpling: "만두",
  seafood: "해산물",
  dessert: "디저트",
  bakery: "베이커리",
  bar: "술집",
  noodles: "국수",
  tteokbokki: "떡볶이",
  bibimbap: "비빔밥",
  dakgalbi: "닭갈비",
  bulgogi: "불고기",
  galbi: "갈비",
  samgyeopsal: "삼겹살",
  naengmyeon: "냉면",
  gimbap: "김밥",
  jjajangmyeon: "짜장면",
  "pork cutlet": "돈까스",
  jokbal: "족발",
  gopchang: "곱창",
  sundae: "순대",
  samgyetang: "삼계탕",
  gukbap: "국밥",
  jjigae: "찌개",
  "korean restaurant": "한식",
  brunch: "브런치",
};

/** Kakao files these as cafés rather than restaurants, so the restaurant category would hide them. */
const NOT_A_RESTAURANT = new Set(["dessert", "bakery", "brunch"]);

/** Chains asked for by name, as their Korean signs spell them. */
const BRAND_KO: [RegExp, string][] = [
  [/starbucks|스타벅스/i, "스타벅스"],
  [/mcdonald|맥도날드/i, "맥도날드"],
  [/burger king|버거킹/i, "버거킹"],
  [/\bkfc\b/i, "KFC"],
  [/lotteria|롯데리아/i, "롯데리아"],
  [/mom'?s touch|맘스터치/i, "맘스터치"],
  [/twosome|투썸/i, "투썸플레이스"],
  [/ediya|이디야/i, "이디야커피"],
  [/gong ?cha|공차/i, "공차"],
  [/paris ?baguette|파리바게/i, "파리바게뜨"],
  [/tous les jours|뚜레쥬르/i, "뚜레쥬르"],
  [/domino|도미노/i, "도미노피자"],
  [/pizza hut|피자헛/i, "피자헛"],
];

function foodSearch(query: string): { need: NearbyNeed } & Search {
  const kw = foodKeyword(query);
  // Someone who names a chain wants the nearest branch of it.
  const brand = BRAND_KO.find(([re]) => re.test(kw))?.[1];
  if (brand) return { need: "food", queries: [{ keyword: brand }], radius: 2000, order: "distance", searchKo: brand };
  if (kw === "cafe") return { need: "cafe", queries: [{ category: "CE7" }], radius: 800, order: "popular", searchKo: "카페" };
  if (kw === "restaurant") return { need: "food", queries: [{ category: "FD6" }], radius: 800, order: "popular", searchKo: "맛집" };
  // "vegan ramen" is two words the directory knows separately.
  const ko = FOOD_KO[kw] ?? kw.split(" ").map((w) => FOOD_KO[w]).filter(Boolean).join(" ");
  if (!ko) return { need: "food", queries: [{ category: "FD6" }], radius: 800, order: "popular", searchKo: "맛집" };
  const category = NOT_A_RESTAURANT.has(kw) ? undefined : "FD6";
  const q: KakaoQuery = category ? { keyword: ko, category } : { keyword: ko };
  return { need: "food", queries: [q], radius: 1500, order: "popular", searchKo: ko };
}

const SHOPPING: Search = {
  queries: [
    { keyword: "백화점", categoryHas: "백화점" },
    { keyword: "쇼핑몰", categoryHas: "쇼핑" },
    { category: "MT1" },
  ],
  radius: 2500,
  order: "distance",
  noFood: true,
  searchKo: "쇼핑",
};

const STAY: Search = { queries: [{ category: "AD5" }], radius: 1500, order: "popular", searchKo: "숙소" };

/**
 * The one a traveller needs most urgently and asks for least politely. Not an
 * essential the finder ever carried, because it needs no neighbourhood guide —
 * only the nearest one, which only the phone can know.
 */
const TOILET: Search = {
  // "공중화장실" finds nothing in the directory; "개방화장실" is what the signs say.
  queries: [{ keyword: "개방화장실" }, { keyword: "화장실", categoryHas: "화장실" }],
  radius: 800,
  order: "distance",
  noFood: true,
  searchKo: "화장실",
};
const ASKS_FOR_TOILET = /toilet|restroom|bathroom|washroom|\bwc\b|lavatory|화장실|トイレ|お手洗い|厕所|洗手间|廁所|洗手間|卫生间|衛生間/i;
const TOILET_TIP =
  "🚻 Public toilets are free and usually clean. **Every subway station** has them (inside or just outside the gates), and so do department stores, big cafés and tourist sights. A sign reading **개방화장실** means a building open to the public. Toilet paper is often by the entrance rather than in the stall.";

const MEDICAL = /hospital|clinic|doctor|medical|병원|의원|病院|医院|醫院|诊所/i;

/**
 * What to look for around the traveller, for a tool that would otherwise have
 * needed a neighbourhood. The advice comes back in English; the orchestrator
 * translates it with the rest of the answer.
 */
export function nearbyTaskFor(tool: string, args: Record<string, unknown>, said: string): DeviceTask | undefined {
  const str = (k: string): string => (typeof args[k] === "string" ? String(args[k]).trim() : "");
  if (ASKS_FOR_TOILET.test(said) && tool !== "trackSubwayArrival") {
    return { kind: "nearby", need: "toilet", ...TOILET, tip: TOILET_TIP };
  }
  if (tool === "findForeignerFriendlyStore") {
    const e = essentialFor(str("need") || said) ?? essentialFor(said);
    if (!e) return { kind: "sights" };
    return { kind: "nearby", need: e.need, ...ESSENTIAL_SEARCH[e.need], tip: `${e.emoji} ${e.tip}` };
  }
  if (tool === "searchPlaceForeigner") {
    const query = str("query") || said;
    // A need someone would ask the essentials finder about — "a pharmacy near
    // me" routed to place search — is still that need.
    const e = essentialFor(said);
    if (e && e.need !== "foreignCardDining" && e.need !== "vegan") {
      return { kind: "nearby", need: e.need, ...ESSENTIAL_SEARCH[e.need], tip: `${e.emoji} ${e.tip}` };
    }
    const cat = inferCategory(query, str("category") || undefined);
    if (cat === "food") return { kind: "nearby", ...foodSearch(query) };
    if (cat === "shopping") return { kind: "nearby", need: "shopping", ...SHOPPING };
    if (cat === "accommodation") return { kind: "nearby", need: "stay", ...STAY };
    return { kind: "sights", ...(MEDICAL.test(said) ? { medical: true } : {}) };
  }
  if (tool === "getAreaGuide" || tool === "getNowInfo") return { kind: "sights" };
  if (tool === "trackSubwayArrival") return { kind: "trains" };
  return undefined;
}

/**
 * A route that starts wherever the traveller is. The destination is somewhere
 * they named, not somewhere they are, so it is looked up here: the phone gets
 * where it is, the station it is reached by, and which exit to take.
 */
export async function routeTaskFor(to: string): Promise<DeviceTask> {
  const dest = await geocode(to).catch(() => undefined);
  // A place whose last leg is a bus, a climb or a ferry is reached through its
  // gateway station, and the phone is told how the rest goes.
  const access = accessFor(to);
  const station = access?.gateway ?? toStationName(to);
  const exit = exitLine(to);
  return {
    kind: "route",
    to,
    ...(dest ? { dest: { lat: dest.lat, lng: dest.lng } } : {}),
    ...(/[가-힣]/.test(station) ? { destStation: station } : {}),
    ...(exit ? { exit } : {}),
    ...(access ? { access: `🧗 ${access.note}`, ...(access.climb ? { climb: true } : {}) } : {}),
  };
}
