import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchTopPlace, type Lang } from "../lib/sources/tourapi.js";
import { geocodePoiName } from "../lib/sources/poi.js";
import { routesBetween, type TransitRoute } from "../lib/sources/odsay.js";
import { romanizeText, resolveStationKo, stationLabel, formatSubwayDirection } from "../lib/romanize.js";
import { resolvePlaceCoord } from "../lib/places.js";
import { detectIntercity, renderIntercity } from "../lib/intercity.js";
import { cjkToKorean, normalizeName } from "../lib/fuzzy.js";
import { exitLine } from "../lib/exits.js";
import { accessFor } from "../lib/access.js";
import { planRegional, planRegionalNear, regionalStationsNear } from "../lib/regionalSubway.js";
import { getGraph, lineLabel, planRoute, findStationCodes } from "../lib/sources/subwayGraph.js";
import { getStationArrivals } from "../lib/sources/seoulSubway.js";
import { planDirectBus } from "../lib/sources/busRoute.js";
import {
  doorToDoor,
  planDirectBusNear,
  planTransferBusNear,
  busDataNear,
  type NationalBusAttempt,
  type NationalBusPlan,
} from "../lib/sources/busNational.js";
import { kakaoKeyword } from "../lib/sources/kakaoLocal.js";
import { TtlCache } from "../lib/cache.js";
import { busStopLabel } from "../lib/stopLabel.js";
import { STATION_WALK_M, metresBetween, planCapitalNear, walkMinutes } from "../lib/stationPlan.js";
import { stationsNear } from "../lib/nearest.js";
import type { SubwayRoute } from "../lib/subwayPlan.js";
import { directionsLinks } from "../lib/maplinks.js";
import { WHERE_I_AM } from "../lib/here.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

// An origin that means "wherever I am" — shared with the web client, which
// answers it on the device (src/lib/here.ts).
export { WHERE_I_AM };

export interface Located {
  lat: number;
  lng: number;
  /** The place's Korean name, when a source gave one — bus stops are named after it. */
  ko?: string;
}

// Only places that were found are kept; a miss is asked again next time.
const geocodeCache = new TtlCache<Located>(30 * 60_000);

/**
 * Geocode a place: the curated index first (instant, and checked by hand), then
 * the sources in the order that suits how the name was written. A Korean name
 * goes to Kakao Local first — it knows every lane and terminal by the name
 * Koreans use; a romanized one to the tourism database, which is indexed in
 * English — and each falls through to the other, then to Naver's local search:
 * the long tail of cafés and shops someone just read off our own list.
 */
export async function geocode(name: string): Promise<Located | undefined> {
  const q = (name ?? "").trim();
  if (!q) return undefined;
  const curated = resolvePlaceCoord(q);
  if (curated) {
    const ko = curated.aliases.filter((a) => /[가-힣]/.test(a)).sort((x, y) => y.length - x.length)[0];
    return { lng: curated.lng, lat: curated.lat, ko };
  }
  const hit = geocodeCache.get(q);
  if (hit) return hit;
  const kakao = (text: string) => async (): Promise<Located | undefined> => {
    if (!text) return undefined;
    const k = await kakaoKeyword(text);
    return k ? { lat: k.lat, lng: k.lng, ko: k.name } : undefined;
  };
  // The tourism database has a service per language; a Chinese name asked of
  // the English one finds nothing — "星空图书馆" could not be placed at all.
  const tour = (lang: Lang) => async (): Promise<Located | undefined> => {
    const p = await searchTopPlace(q, lang);
    return p?.mapx != null && p?.mapy != null ? { lng: p.mapx, lat: p.mapy } : undefined;
  };
  const naver = async (): Promise<Located | undefined> => {
    const poi = await geocodePoiName(q);
    return poi ? { lng: poi.lng, lat: poi.lat, ko: /[가-힣]/.test(poi.name) ? poi.name : undefined } : undefined;
  };
  // Japanese and Chinese names we already know in Korean go to Kakao in Korean.
  const known = cjkToKorean(q);
  const inKorean = known !== q ? known : "";
  const order = /[가-힣]/.test(q)
    ? [kakao(q), tour("ko"), naver]
    : /[぀-ヿ]/.test(q)
      ? [tour("ja"), kakao(inKorean), naver]
      : /[一-鿿]/.test(q)
        ? [tour("zh"), tour("ja"), kakao(inKorean), naver]
        : [tour("en"), kakao(q), naver];
  for (const source of order) {
    const found = await source().catch(() => undefined);
    if (found) {
      geocodeCache.set(q, found);
      return found;
    }
  }
  return undefined;
}

/**
 * getTransitRoute — subway/bus directions with fares, transfers, and time,
 * explained in English. Resolves place names to coordinates via TourAPI, then
 * routes via ODsay (src/lib/sources/odsay.ts). Needs TRANSIT + TOUR keys.
 */

const CHOICES: Choice[] = [
  { emoji: "🔄", cmdEn: "Refresh for leaving now", cmdKo: "지금 출발 새로고침", descEn: "recompute" },
  { emoji: "🚇", cmdEn: "Next subway train at a station", descEn: "real-time Seoul subway" },
  { emoji: "💳", cmdEn: "How do I pay for this?", descEn: "transit payment guide" },
  { emoji: "🗺️", cmdEn: "Tell me about the destination area", descEn: "neighborhood guide" },
];

const RETRY: Choice[] = [
  { emoji: "🔄", cmdEn: "Try again", cmdKo: "다시 시도", descEn: "retry routing" },
  { emoji: "💳", cmdEn: "How do I pay for transit?", descEn: "payment options" },
];

const MODE_ICON: Record<string, string> = { subway: "🚇", bus: "🚌", walk: "🚶" };

/** Primary mode of a route — used to label the option (🚇 / 🚌 / both). */
function primaryMode(r: TransitRoute): "subway" | "bus" | "mixed" {
  const transit = r.legs.filter((l) => l.mode !== "walk");
  const hasSub = transit.some((l) => l.mode === "subway");
  const hasBus = transit.some((l) => l.mode === "bus");
  if (hasSub && hasBus) return "mixed";
  if (hasSub) return "subway";
  if (hasBus) return "bus";
  return "mixed";
}

const MODE_LABEL: Record<string, string> = {
  subway: "🚇 Subway",
  bus: "🚌 Bus",
  mixed: "🚇🚌 Subway + Bus",
};

/**
 * Choose which routes to show, and say what each one is for.
 *
 * The routing API sorts by journey time, and outside Seoul that buried the subway:
 * "Busan Station → Haeundae" came back as two city buses whose stops are signed
 * only in Korean, while the obvious answer — Line 1, change at Seomyeon, Line 2 —
 * sat further down, a few minutes slower. For someone who cannot read a bus stop
 * sign the subway is not the slower option, it is the only usable one. So we show
 * the fastest and the easiest separately, and say which is which.
 */
function pickOptions(routes: TransitRoute[]): { route: TransitRoute; label: string }[] {
  if (!routes.length) return [];
  const picks: { route: TransitRoute; label: string }[] = [{ route: routes[0], label: "Fastest" }];

  const legCount = (r: TransitRoute): number => r.legs.filter((l) => l.mode !== "walk").length;
  const easiest = routes
    .filter((r) => primaryMode(r) === "subway")
    .sort((x, y) => legCount(x) - legCount(y) || x.totalMinutes - y.totalMinutes)[0];
  if (easiest && easiest !== routes[0]) {
    picks.push({ route: easiest, label: "Easiest — subway all the way, station names in English" });
  }

  // A materially cheaper option earns a line; a ₩100 difference does not.
  const cheapest = [...routes].sort((x, y) => (x.fare ?? 1e9) - (y.fare ?? 1e9))[0];
  const shown = Math.max(...picks.map((p) => p.route.fare ?? 0));
  if (cheapest && !picks.some((p) => p.route === cheapest) && (cheapest.fare ?? 0) + 500 < shown) {
    picks.push({ route: cheapest, label: "Cheapest" });
  }
  return picks.slice(0, 3);
}

function renderRoute(r: TransitRoute, label: string): string {
  const fare = r.fare ? ` · 💳 ₩${r.fare.toLocaleString()}` : "";
  const legs = r.legs
    // A walk the routing service gives without its two ends printed as a bare
    // "🚶" line between the rides — noise that reads like a missing instruction.
    .filter((l) => l.mode !== "walk" || (l.from && l.to))
    .map((l) => {
      const icon = MODE_ICON[l.mode] ?? "•";
      // Romanize Korean line/station names from ODsay for English-first readers (U1).
      const line = l.line ? ` **${romanizeText(l.line)}**` : "";
      // Flag N-prefixed night buses so they're not mistaken for a daytime option (Y21).
      const night = l.mode === "bus" && /^N\d/i.test(l.line ?? "") ? " 🌙_(night bus, ~23:30–06:00)_" : "";
      // Both scripts: the romanization to say and type, the Hangul to match the sign.
      const seg = l.from && l.to ? ` ${stationLabel(l.from)} → ${stationLabel(l.to)}` : "";
      return `   ${icon}${line}${seg}${night}`;
    })
    .join("\n");
  return `**${label} · ${MODE_LABEL[primaryMode(r)]} — ${r.totalMinutes} min${fare}**\n${legs}`;
}

/**
 * Build dynamic "track this" chips from the actual routes so the user can pick a
 * mode and jump straight into live tracking (journey UX). A subway option →
 * "Track subway at {boarding}", a bus option → "Track bus {no}".
 */
function trackChips(routes: TransitRoute[]): Choice[] {
  const legs = routes.flatMap((r) => r.legs);
  const subLegs = legs.filter((l) => l.mode === "subway" && l.from);
  const busLeg = legs.find((l) => l.mode === "bus" && l.line);
  const board = subLegs[0];
  // The transfer station (a later subway boarding point) is where timing matters most —
  // offer it alongside the origin so riders can track the connection (Y15).
  const transfer = subLegs.slice(1).find((l) => l.from && l.from !== board?.from);
  const chips: Choice[] = [];
  if (board?.from) {
    chips.push({ emoji: "🚇", cmdEn: `Track the subway at ${romanizeText(board.from)}`, descEn: "live arrivals + train position" });
  }
  // Bus tracking is the headline now that Seoul real-time bus is live — carry the
  // bus number AND the alight stop so the chip lands straight in trackBusArrival
  // (no follow-up "which stop?"). Prefer it over the transfer chip when a bus exists.
  if (busLeg?.line) {
    const alight = busLeg.to ? ` to ${romanizeText(busLeg.to)}` : "";
    chips.push({ emoji: "🚌", cmdEn: `Track bus ${romanizeText(busLeg.line)}${alight}`, descEn: "live position + stops to your stop" });
  } else if (transfer?.from) {
    chips.push({ emoji: "🔀", cmdEn: `Track the subway at ${romanizeText(transfer.from)}`, descEn: "your transfer station" });
  }
  chips.push({ emoji: "💳", cmdEn: "How do I pay for this?", descEn: "transit payment guide" });
  // Always offer a recompute; add destination-area only if there's still room.
  if (chips.length < 3) chips.push({ emoji: "🗺️", cmdEn: "Tell me about the destination area", descEn: "neighborhood guide" });
  chips.push({ emoji: "🔄", cmdEn: "Refresh for leaving now", cmdKo: "지금 출발 새로고침", descEn: "recompute" });
  return chips.slice(0, 4);
}

/**
 * Landmarks visitors name that are not themselves stations, mapped to the station
 * they arrive at. Keeps the rail planner useful for "Gyeongbokgung" or "COEX",
 * not just for names that happen to match a station.
 */
const LANDMARK_STATION: [RegExp, string][] = [
  [/gyeongbokgung|경복궁|景福宮|景福宫/i, "경복궁"],
  [/changdeokgung|창덕궁|昌徳宮|昌德宫/i, "안국"],
  [/bukchon|북촌|北村/i, "안국"],
  [/insadong|인사동|仁寺洞/i, "안국"],
  [/gwangjang|광장시장|広蔵市場|广藏市场/i, "종로5가"],
  [/coex|코엑스/i, "삼성"],
  [/lotte world|롯데월드|ロッテワールド|乐天世界/i, "잠실"],
  [/n seoul tower|namsan|남산|南山/i, "명동"],
  [/ddp|동대문디자인|dongdaemun design/i, "동대문역사문화공원"],
  [/garosu|가로수길|カロスキル|林荫道/i, "신사"],
  [/ikseon|익선동/i, "종로3가"],
  [/myeongdong|명동|明洞|ミョンドン/i, "명동"],
  [/hongdae|홍대|弘大|ホンデ/i, "홍대입구"],
  [/itaewon|이태원|梨泰院/i, "이태원"],
  [/seongsu|성수|聖水|圣水/i, "성수"],
  [/gangnam|강남|江南/i, "강남"],
  [/jamsil|잠실|蚕室/i, "잠실"],
  [/yeouido|여의도|汝矣島|汝矣岛/i, "여의도"],
  [/namdaemun|남대문|南大門|南大门/i, "회현"],
  [/express bus terminal|고속터미널/i, "고속터미널"],
  [/seoul forest|서울숲/i, "서울숲"],
  [/incheon (?:int|international)?\s*airport|인천공항|仁川空港|仁川机场/i, "인천공항1터미널"],
  [/gimpo (?:int|international)?\s*airport|김포공항|金浦空港|金浦机场/i, "김포공항"],
  [/seoul station|서울역|ソウル駅|首尔站|首爾站/i, "서울역"],
];

/**
 * The same, for the cities outside the capital: where visitors actually say
 * they are going, and the station that gets them there.
 */
const REGIONAL_LANDMARK_STATION: [RegExp, string][] = [
  [/haeundae|해운대|海雲台|海云台/i, "해운대"],
  [/gwangalli|gwangan|광안리|広安里|广安里/i, "광안"],
  [/jagalchi|자갈치|チャガルチ|札嘎其/i, "자갈치"],
  [/nampo|남포동|南浦洞|biff/i, "남포"],
  [/seomyeon|서면|西面/i, "서면"],
  [/centum|센텀|shinsegae centum|신세계 센텀/i, "센텀시티"],
  [/busan station|부산역|釜山駅|釜山站/i, "부산역"],
  [/gimhae\s*(?:int'?l\s*|international\s*)?airport|김해\s*(?:국제)?공항|金海(?:国际|國際)?(?:机场|機場|空港)/i, "공항"],
  [/gukje market|국제시장|国際市場|国际市场|busan tower|용두산|yongdusan/i, "남포"],
  // Before Busan's Songjeong Beach, which would otherwise take the station name.
  [/gwangju\s*songjeong|광주\s*송정/i, "광주송정"],
  [/songjeong\s*beach|송정\s*해수욕장|송정\s*해변/i, "송정"],
  [/osiria|오시리아|lotte world busan|롯데월드\s*부산/i, "오시리아"],
  [/oncheonjang|온천장|허심청/i, "온천장"],
  [/beomeosa|범어사/i, "범어사"],
  [/busan cinema center|영화의전당|shinsegae centum|신세계\s*센텀/i, "센텀시티"],
  [/bexco|벡스코/i, "벡스코"],
  [/kyungsung|pukyong|경성대|부경대/i, "경성대·부경대"],
  [/dongseongro|동성로|東城路|东城路/i, "중앙로"],
  [/seomun market|서문시장|西門市場|西门市场/i, "서문시장"],
  [/suseong\s*(?:lake|mot)|수성못/i, "수성못"],
  [/dongdaegu|동대구/i, "동대구역"],
  [/asia culture center|국립아시아문화전당|문화전당|\bacc\b/i, "문화전당"],
  [/yangdong market|양동시장/i, "양동시장"],
  [/daejeon station|대전역|大田駅|大田站/i, "대전역"],
  [/yuseong|유성\s*온천|儒城/i, "유성온천"],
  [/sungsimdang|성심당/i, "중앙로"],
];

/** Map a free-text endpoint to a station name the graph knows, if we can. */
export function toStationName(name: string): string {
  // A place whose last leg is a bus or a climb is reached through its gateway.
  const gateway = accessFor(name)?.gateway;
  if (gateway) return gateway;
  for (const [re, station] of LANDMARK_STATION) if (re.test(name)) return station;
  for (const [re, station] of REGIONAL_LANDMARK_STATION) if (re.test(name)) return station;
  return name;
}

/** How the last leg goes, for a destination where it is a bus, a climb or a ferry. */
function accessLine(to: string): string {
  const a = accessFor(to);
  // A climb is worth flagging as one; a train to the coast is not a climb.
  return a ? `${a.climb ? "🧗" : "🚏"} ${a.note}` : "";
}

/**
 * The bus API indexes stops by their Korean names only, so an English or Japanese
 * endpoint has to be turned into Korean before we can look it up. Landmarks come
 * from the map above; anything else we try to match against the station index,
 * which already knows how each name romanizes.
 */
async function koreanEndpoint(name: string): Promise<string | undefined> {
  if (/[가-힣]/.test(name)) return name;
  const mapped = toStationName(name);
  if (/[가-힣]/.test(mapped)) return mapped;
  // "Hannam-dong" is not a station, but "Hannam" is a name we know how to write —
  // and the neighbourhood suffix comes straight back on the Korean side.
  const suffix = /[-\s](dong|ro|gil|gu)\b/i.exec(name);
  const SUFFIX_KO: Record<string, string> = { dong: "동", ro: "로", gil: "길", gu: "구" };
  const bare = suffix ? name.slice(0, suffix.index).trim() : name;
  const romanized = resolveStationKo(bare);
  if (romanized) return suffix ? romanized + SUFFIX_KO[suffix[1].toLowerCase()] : romanized;
  try {
    const graph = await getGraph();
    const codes = findStationCodes(graph, name);
    const ko = codes.length ? graph.byCode.get(codes[0])?.ko : undefined;
    return ko && /[가-힣]/.test(ko) ? ko : undefined;
  } catch {
    return undefined;
  }
}

/** Plan a direct bus between two free-text endpoints, in whatever language. */
async function busBetween(from: string, to: string) {
  const [a, b] = await Promise.all([koreanEndpoint(from), koreanEndpoint(to)]);
  if (!a || !b || a === b) return undefined;
  return planDirectBus(a, b).catch(() => undefined);
}

/**
 * The same question outside Seoul, on the national bus feed: Jeju's airport bus
 * to Seongsan, Suwon station to the palace, Jeonju station to the hanok village.
 * Both ends are geocoded first, because outside the capital a trip is usually
 * named by its landmark and not by a stop.
 */
async function nationalBusBetween(from: string, to: string): Promise<NationalBusAttempt> {
  const [a, b] = await Promise.all([geocode(from), geocode(to)]);
  if (!a || !b) return { timedOut: false };
  return planDirectBusNear(a, b, { toName: koName(to, b) }).catch((): NationalBusAttempt => ({ timedOut: false }));
}

/** The destination's Korean name: as written, or as a geocoder gave it. */
function koName(written: string, at?: Located): string | undefined {
  return /[가-힣]/.test(written) ? written : at?.ko;
}

/**
 * Plan the trip on the subway graph and dress it with a live first-train time.
 * Returns undefined when the rails can't serve this pair, so the caller falls
 * through to the metered routing API.
 */
async function trySubwayGraph(from: string, to: string, dir: string, ends?: [Located | undefined, Located | undefined]) {
  try {
    const graph = await getGraph();
    // By name first — a station, or a landmark mapped to one — in the capital's
    // network, then Busan, Daegu, Gwangju and Daejeon.
    type RailChoice = { route: SubwayRoute; label?: (ko: string) => string; walkToM?: number; walkFromM?: number };
    let choice: RailChoice | undefined;
    const seoul = planRoute(graph, toStationName(from), toStationName(to));
    if (seoul) choice = { route: seoul };
    else {
      const elsewhere = planRegional(toStationName(from), toStationName(to));
      if (elsewhere) choice = { route: elsewhere, label: elsewhere.label };
    }
    // Then by where the places are, when the caller knows: the stations within a
    // walk of each end (src/lib/stationPlan.ts). Not for a climb, which is
    // reached through its gateway rather than whichever station is nearest.
    const [a, b] = ends ?? [];
    if (!choice && a && b && !accessFor(to)?.climb) {
      const capital = planCapitalNear(graph, a, b);
      const elsewhere = planRegionalNear(a, b);
      if (capital && (!elsewhere || capital.minutes <= elsewhere.minutes)) {
        choice = { route: capital.route, walkToM: capital.walkToM, walkFromM: capital.walkFromM };
      } else if (elsewhere) {
        choice = { route: elsewhere.route, label: elsewhere.label, walkToM: elsewhere.walkToM, walkFromM: elsewhere.walkFromM };
      }
    }
    if (!choice) return undefined;
    const picked = choice;
    const route = picked.route;
    const regional = Boolean(picked.label);
    // A city's stations by that city's own names.
    const station = (ko: string): string => (picked.label ? picked.label(ko) : stationLabel(ko));

    const first = route.legs[0];
    // The live board for the boarding station makes this a real-time answer, not a
    // timetable lookup — and it is the thing a waiting passenger actually wants.
    // Seoul publishes one; the other cities do not.
    let live = "";
    try {
      if (regional) throw new Error("no live board outside Seoul");
      const arrivals = await getStationArrivals(first.from);
      const next = arrivals.slice(0, 2);
      if (next.length) {
        const board = next
          .map(
            (a) =>
              `${formatSubwayDirection(a.towards || a.destination)} — ${a.etaMinutes != null ? `${a.etaMinutes} min` : a.status}`,
          )
          .join(" · ");
        live = `\n\n🟢 **Live at ${stationLabel(first.from)} now:** ${board}`;
      }
    } catch {
      /* live board is a bonus, never a blocker */
    }

    // A direct bus, when one exists, is often the nicer ride — no stairs, no
    // transfer — so offer it alongside the rails rather than instead of them.
    const lastLeg = route.legs[route.legs.length - 1];
    // Seoul's bus data only — a Busan station pair would find nothing, slowly.
    const bus = regional ? undefined : await busBetween(first.from, lastLeg.to);
    // Only worth offering if it is in the same league as the train; a bus that
    // takes twice as long is not an alternative, it is a wrong turn.
    const busWorthIt = bus && bus.minutes <= route.minutes * 1.6 + 5;
    const busLine = busWorthIt && bus
      ? `\n🚌 **Or one bus, no transfer —** **${bus.routeName}** from ${stationLabel(bus.boardAt)} to ${stationLabel(bus.alightAt)} _(${bus.stops} stops, about ${bus.minutes} min)_`
      : "";

    // Arriving at the station is only half of it; the exit is what saves the walk
    // — and for a place up a hill or out along a coast, the bus or cable car from
    // the station is the rest of the trip.
    const exit = exitLine(to, lastLeg.to);
    const access = accessLine(to);

    const onFoot = (m: number) => `about **${walkMinutes(m)} min on foot** (${m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`})`;
    const lines = [
      // When the places are not the stations, the walks are part of the answer.
      ...(picked.walkToM != null && picked.walkToM >= 300 ? [`🚶 Walk ${onFoot(picked.walkToM)} to ${station(first.from)}`] : []),
      ...route.legs.map((l, i) => {
        const label = lineLabel(l.line);
        return `${i === 0 ? "🚇" : "🔁"} **${label}** ${station(l.from)} → ${station(l.to)} _(${l.stops} stop${l.stops === 1 ? "" : "s"})_`;
      }),
      ...(picked.walkFromM != null && picked.walkFromM >= 300 ? [`🚶 From ${station(lastLeg.to)}, ${onFoot(picked.walkFromM)} to ${to}`] : []),
    ];

    // Quoting a 7-minute ride at 3am would be a lie: the trains are in the depot.
    const kstHour = new Date(Date.now() + 9 * 3600_000).getUTCHours();
    const closed = kstHour < 5;
    const closedNote = closed
      ? `⛔ **The subway isn't running right now** (roughly 05:30–24:00). Until first train, take a night bus (N-routes) or a taxi — Kakao T works with a foreign card.`
      : "";

    // The airport line charges its own fare, well above the metro base — quoting
    // ₩1,400 for a ride to Incheon is the kind of number someone budgets on.
    const airportLeg = route.legs.find((l) => /공항철도/.test(l.line) && /인천공항/.test(`${l.to}${l.from}`));
    const AREX_FARE: [RegExp, number][] = [
      [/김포공항/, 3750],
      [/마곡나루|계양|검암/, 4050],
      [/홍대입구|디지털미디어시티|공덕/, 4450],
    ];
    const fareWon = airportLeg
      ? (AREX_FARE.find(([re]) => re.test(/인천공항/.test(airportLeg.to) ? airportLeg.from : airportLeg.to))?.[1] ?? 4750)
      : route.fareWon;
    // The Sinbundang Line bills its own surcharge on top of the metro fare — ₩700
    // more between Gangnam and Sinsa — and the gate is where people find out.
    const premiumNote = route.legs.some((l) => /신분당/.test(l.line))
      ? "\n💡 _This route uses the **Sinbundang Line**, which charges a separate surcharge — lines 2 and 3 reach the same place for about ₩700 less if you are not in a hurry._"
      : "";

    const arexNote = airportLeg
      ? "\n✈️ _That fare is the all-stop AREX train. The non-stop Express (Seoul Station → T1, 43 min) is about ₩11,000 and needs a seat reservation._"
      : "";

    const head =
      `🚇 **${from} → ${to}** — by subway\n\n` +
      `⏱️ about **${route.minutes + walkMinutes(picked.walkToM ?? 0) + walkMinutes(picked.walkFromM ?? 0)} min** · ${route.stops} stops · ` +
      `${route.transfers === 0 ? "no transfers" : `${route.transfers} transfer${route.transfers === 1 ? "" : "s"}`} · ` +
      `💳 around **₩${fareWon.toLocaleString()}**${arexNote}${premiumNote}`;

    return ok(
      [
        head,
        closedNote,
        "",
        ...lines,
        exit ?? "",
        access,
        busLine,
        live,
        "",
        dir,
        "",
        regional
          ? "_Routes from city subway open data; times are typical, fares are the card fare._"
          : "_Routes from Seoul subway & bus open data (ⓒ서울특별시); times are typical._",
      ]
        .filter(Boolean)
        .join("\n"),
      CHOICES,
    );
  } catch {
    return undefined;
  }
}

/**
 * When nothing we hold can plan the trip: say why, and what does work.
 *
 * Some cities' buses are not in the national open data at all — Gangneung,
 * Sokcho, Boseong — and there "no single bus" read as if there were no buses.
 * Either way the traveller gets the distance, a taxi time and the map links.
 */
async function noRoute(from: string, to: string, dir: string, ends: [Located | undefined, Located | undefined]) {
  const [a, b] = ends;
  const km = a && b ? metresBetween(a, b) / 1000 : undefined;
  const taxi =
    km !== undefined
      ? `\n\n🚕 It is about **${km < 10 ? km.toFixed(1) : Math.round(km)} km** as the crow flies — roughly **${Math.round(km * 2 + 4)} min by taxi**. Kakao T works with a foreign card.`
      : "";
  const [dataFrom, dataTo] = await Promise.all([a ? busDataNear(a) : undefined, b ? busDataNear(b) : undefined]);
  if (dataFrom === false || dataTo === false) {
    return fail(
      "This area's buses aren't in our data",
      `The local buses around **${dataTo === false ? to : from}** are not in the national bus open data, so I can't plan the bus there.${taxi}\n\nThe map apps carry the local routes:\n\n${dir}`,
      RETRY,
    );
  }
  return fail(
    "No direct route found",
    `I couldn't find a subway, a single bus, or two buses with one change that do **${from} → ${to}**.${taxi}\n\nYou can still get there:\n\n${dir}`,
    RETRY,
  );
}

/**
 * Two vehicles, when one will not do.
 *
 * In the country-wide sweep, the trips nothing above could answer mostly needed
 * a change: Seoul Station to the Suwon fortress is Line 1 and then a bus,
 * Pohang Station to Homigot a city bus and then the coast bus. Both kinds are
 * tried together, and the one that gets there sooner, door to door, is kept.
 */
async function tryTwoLegs(
  from: string,
  to: string,
  dir: string,
  ends: [Located | undefined, Located | undefined],
): Promise<ReturnType<typeof ok> | undefined> {
  const [a, b] = ends;
  if (!a || !b) return undefined;
  const toName = koName(to, b);
  const graph = await getGraph();

  // Subway, then a bus from one of the two stations nearest the destination
  // that are not already within a walk of it.
  const railThenBus = async () => {
    const candidates = [
      ...stationsNear(b.lat, b.lng, 15000, 3).map((s) => ({
        k: s.station.k,
        lat: s.station.lat,
        lng: s.station.lng,
        network: undefined as string | undefined,
        metres: s.metres,
      })),
      ...regionalStationsNear(b, 15000, 3),
    ]
      .filter((c) => c.metres > STATION_WALK_M)
      .sort((x, y) => x.metres - y.metres)
      .slice(0, 2);
    const tries = await Promise.all(
      candidates.map(async (c) => {
        const rail = c.network ? planRegionalNear(a, c, STATION_WALK_M, 50) : planCapitalNear(graph, a, c, STATION_WALK_M, 50);
        if (!rail) return undefined;
        const bus = await planDirectBusNear(c, b, { toName });
        if (!bus.plan) return undefined;
        const label: ((ko: string) => string) | undefined = c.network ? (rail as unknown as { label: (ko: string) => string }).label : undefined;
        return { rail, label, bus: bus.plan, minutes: Math.round(rail.minutes + 5 + doorToDoor(bus.plan)) };
      }),
    );
    return tries.filter((t): t is NonNullable<typeof t> => Boolean(t)).sort((x, y) => x.minutes - y.minutes)[0];
  };

  const busThenBus = async () => {
    const t = await planTransferBusNear(a, b, { toName });
    return t.plan ? { plan: t.plan, minutes: Math.round(doorToDoor(t.plan)) } : undefined;
  };

  const [rb, bb] = await Promise.all([railThenBus().catch(() => undefined), busThenBus().catch(() => undefined)]);
  const onFoot = (m: number) => `about **${walkMinutes(m)} min on foot** (${m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`})`;
  const source = "_Routes from subway and national bus open data (ⓒ국토교통부); times are typical, not live._";

  if (rb && (!bb || rb.minutes <= bb.minutes)) {
    const { rail, bus } = rb;
    const station = (ko: string) => (rb.label ? rb.label(ko) : stationLabel(ko));
    const first = rail.route.legs[0];
    const last = rail.route.legs[rail.route.legs.length - 1];
    return ok(
      [
        `🚇🚌 **${from} → ${to}** — subway, then one bus`,
        "",
        `⏱️ about **${rb.minutes} min** door to door`,
        "",
        ...(rail.walkToM >= 300 ? [`🚶 Walk ${onFoot(rail.walkToM)} to ${station(first.from)}`] : []),
        ...rail.route.legs.map(
          (l, i) => `${i === 0 ? "🚇" : "🔁"} **${lineLabel(l.line)}** ${station(l.from)} → ${station(l.to)} _(${l.stops} stop${l.stops === 1 ? "" : "s"})_`,
        ),
        `🚌 Then bus **${bus.routeName}** from **${busStopLabel(bus.boardAt)}**${bus.walkToStopM >= 300 ? ` (${onFoot(bus.walkToStopM)} from ${station(last.to)})` : ""} to **${busStopLabel(bus.alightAt)}** _(${bus.stops} stops, about ${bus.minutes} min)_`,
        ...(bus.walkFromStopM >= 300 ? [`🚶 From the stop, ${onFoot(bus.walkFromStopM)} to ${to}`] : []),
        `💳 About **₩${rail.route.fareWon.toLocaleString()}** for the subway, then the bus fare — the same transit card works for both. On the bus, tap when you board **and again when you get off**.`,
        ...(accessLine(to) ? [accessLine(to)] : []),
        "",
        dir,
        "",
        source,
      ].join("\n"),
      CHOICES,
    );
  }
  if (bb) {
    const p = bb.plan;
    return ok(
      [
        `🚌🚌 **${from} → ${to}** — two buses, one change`,
        "",
        `⏱️ about **${bb.minutes} min** door to door`,
        "",
        ...(p.walkToStopM >= 300 ? [`🚶 The first stop is ${onFoot(p.walkToStopM)} from ${from}`] : []),
        `🚌 Bus **${p.first.routeName}** from **${busStopLabel(p.first.boardAt)}** to **${busStopLabel(p.first.alightAt)}** _(${p.first.stops} stops, about ${p.first.minutes} min)_`,
        `🔁 Change to bus **${p.second.routeName}**${p.changeWalkM > 0 ? ` at **${busStopLabel(p.second.boardAt)}** (${p.changeWalkM} m walk)` : " at the same stop"} and ride to **${busStopLabel(p.second.alightAt)}** _(${p.second.stops} stops, about ${p.second.minutes} min)_`,
        ...(p.walkFromStopM >= 300 ? [`🚶 From the stop, ${onFoot(p.walkFromStopM)} to ${to}`] : []),
        "Tap your card when you board **and again when you get off** each bus — outside Seoul the fare is by distance, and missing the second tap costs extra.",
        ...(accessLine(to) ? [accessLine(to)] : []),
        "",
        dir,
        "",
        source,
      ].join("\n"),
      CHOICES,
    );
  }
  return undefined;
}

export const getTransitRoute: ToolDef = {
  name: "getTransitRoute",
  description:
    "Returns public-transit routes (subway/bus) between two points in Korea with fares, transfers, and time, " +
    "explained in English for foreign visitors. " +
    `Part of ${SERVICE_NAME}.`,
  inputSchema: {
    to: z
      .string()
      .optional()
      .describe("Destination: place name, station, or address. If the user hasn't said where to, ask first."),
    from: z
      .string()
      .optional()
      .describe("Origin: place name, station, or address. If the user hasn't said where they are, ask first."),
    departAt: z.string().optional().describe("Optional departure time (ISO 8601); defaults to now."),
  },
  annotations: {
    title: "Get Public Transit Route",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: async (args) => {
    // "From here", "from my area", "여기서" — the traveller's position, which
    // this server is never told. Treated as no origin at all: on the web the
    // phone plans that route itself (src/lib/deviceTask.ts), and anywhere else
    // the answer is the question that gets an origin, rather than an attempt to
    // geocode the words "my area" into somewhere.
    const said = String(args.from ?? "").trim();
    const from = WHERE_I_AM.test(said) ? "" : said;
    const to = String(args.to ?? "").trim();

    // U3: a transit route needs a starting point. If the user only gave a
    // destination (common from chips), ask for the origin instead of failing.
    // A bare city is not a destination when the traveller is standing in it.
    // "Plan a route" with nothing named came back as "I can route you to Seoul",
    // and then offered "From Seoul Station to Seoul" — three suggestions, none
    // of which could go anywhere. Ask what they want to reach.
    const BARE_CITY = /^(?:seoul|busan|jeju|incheon|daegu|daejeon|gwangju|ulsan|gyeongju|korea|서울|부산|제주|인천|대구|대전|광주|울산|경주|한국)$/i;
    if (!from && (!to || BARE_CITY.test(to))) {
      return fail(
        "Where do you want to go?",
        "Tell me the place, station or address you're heading to and I'll route you there.",
        [
          { emoji: "🏛️", cmdEn: "Route to Gyeongbokgung Palace", descEn: "to the main palace" },
          { emoji: "🛍️", cmdEn: "Route to Myeongdong", descEn: "to Myeongdong" },
          { emoji: "🗼", cmdEn: "Route to N Seoul Tower", descEn: "to the tower" },
        ],
      );
    }

    if (!from) {
      const dest = to || "your destination";
      // Offer common origins so the user can tap instead of re-typing (C9).
      return fail(
        "Where are you starting from?",
        `I can route you to **${dest}** — tap a common starting point, or tell me a station/landmark/address.`,
        [
          // 📍 first: it is the one most people standing somewhere actually want.
          // In the web client this button finds the nearest area on the phone
          // and asks from there; the emoji is what marks it, because it is the
          // same glyph as the location button and nothing else uses it.
          { emoji: "📍", cmdEn: `From where I am to ${dest}`, cmdKo: `지금 내 위치에서 ${dest}까지`, descEn: "use your location" },
          { emoji: "🚉", cmdEn: `From Seoul Station to ${dest}`, descEn: "route from Seoul Station" },
          { emoji: "✈️", cmdEn: `From Incheon Airport to ${dest}`, descEn: "route from the airport" },
        ],
      );
    }

    // Symmetric to the above: a chip like "Plan a route from here" carries only an
    // origin. Ask where to instead of throwing a raw schema error (R5).
    if (!to) {
      const origin = from || "your starting point";
      return fail(
        "Where do you want to go?",
        `I can route you from **${origin}** — tap a popular destination, or tell me a station/landmark/address.`,
        [
          { emoji: "🛍️", cmdEn: `Route from ${origin} to Myeongdong`, descEn: "to Myeongdong" },
          { emoji: "🏛️", cmdEn: `Route from ${origin} to Gyeongbokgung`, descEn: "to Gyeongbokgung Palace" },
          { emoji: "🗼", cmdEn: `Route from ${origin} to N Seoul Tower`, descEn: "to N Seoul Tower" },
        ],
      );
    }

    // Same origin & destination → no route needed; avoid a misleading "timeout" (Y9).
    // Compared as written: the normalized name drops words like "bus terminal"
    // and "market", which told someone at Sokcho Bus Terminal they were already
    // at Sokcho Market.
    if (normalizeName(from) && from.trim().toLowerCase() === to.trim().toLowerCase()) {
      return ok(`📍 You're already at **${to}** — no transit route needed.`, [
        { emoji: "🗺️", cmdEn: `Guide me around ${to}`, descEn: "neighborhood overview" },
        { emoji: "🕒", cmdEn: `Is ${to} good to go now?`, descEn: "live hours + weather" },
        { emoji: "🔎", cmdEn: `Find places in ${to}`, descEn: "things to do nearby" },
      ]);
    }

    // Intercity (e.g. Seoul→Busan) is beyond city subway/bus — ground it with
    // KTX/SRT/express-bus/flight guidance + booking links instead of a bogus walk.
    const ic = detectIntercity(from, to);
    if (ic) {
      const far = (ic.dest ?? ic.origin)!.label;
      return ok(await renderIntercity(from, to, ic), [
        { emoji: "💳", cmdEn: "How do I pay for KTX or the bus?", descEn: "intercity ticket payment" },
        { emoji: "🌤️", cmdEn: `Weather in ${far}`, descEn: "forecast + air quality" },
        { emoji: "🗺️", cmdEn: `What's worth seeing in ${far}?`, descEn: "things to do there" },
      ]);
    }

    // Resilient fallback: a Kakao/Naver Map directions link (routes by place name) so
    // the visitor can still navigate even if our live routing source is unavailable.
    const dir = directionsLinks(from, to);

    // A place inside the DMZ is a tour booking, not a bus ride.
    const tour = accessFor(to);
    if (tour?.tourOnly) return ok([`🎫 **${from} → ${to}**`, "", `🚏 ${tour.note}`, "", dir].join("\n"), CHOICES);

    // Subway first, from our own graphs. By name it costs nothing and answers at once.
    const rail = await trySubwayGraph(from, to, dir);
    if (rail) return rail;

    // Everything below needs to know where the two places are.
    const ends: [Located | undefined, Located | undefined] = await Promise.all([geocode(from), geocode(to)]);
    const [atFrom, atTo] = ends;

    // Two places a few streets apart are a walk. "1913 Songjeong Market", 120 m
    // from Gwangju Songjeong Station, came back as "no route" because no bus goes
    // that short a way. (Two names landing on the very same point are more likely
    // a geocoding mix-up than a walk, so those fall through.)
    if (atFrom && atTo && !accessFor(to)?.climb) {
      const metres = Math.round(metresBetween(atFrom, atTo));
      if (metres >= 60 && metres < 900) {
        return ok(
          [`🚶 **${from} → ${to}** — it's a walk`, "", `⏱️ about **${walkMinutes(metres)} min** on foot (${metres} m)`, "", dir].join("\n"),
          CHOICES,
        );
      }
    }

    // On the rails by position: the stations within a walk of each end.
    const railNear = await trySubwayGraph(from, to, dir, ends);
    if (railNear) return railNear;

    // Not on the rails — but a single bus may still do it. Bus stops sit at street
    // corners the subway never reaches, so this catches neighbourhood hops
    // (markets, hanok lanes, riverside parks) that station names can't express.
    const onlyBus = await busBetween(from, to);
    if (onlyBus) {
      return ok(
        [
          `🚌 **${from} → ${to}** — one bus, no transfer`,
          "",
          `⏱️ about **${onlyBus.minutes} min** · ${onlyBus.stops} stops · 💳 around **₩1,500**`,
          "",
          `🚌 Take bus **${onlyBus.routeName}** at **${busStopLabel(onlyBus.boardAt)}**, get off at **${busStopLabel(onlyBus.alightAt)}**.`,
          `Tap the stop name on the bus screen or count the stops — announcements are in English too.`,
          accessLine(to),
          "",
          dir,
          "",
          "_Route from Seoul bus open data (ⓒ서울특별시); times are typical._",
        ].join("\n"),
        CHOICES,
      );
    }

    // Outside Seoul the same one-bus question is answered from the national feed
    // — the airport bus across Jeju, the kerbside stop at Suwon station. This
    // used to be the one thing only the metered service could do.
    const country = await nationalBusBetween(from, to).catch((): NationalBusAttempt => ({ timedOut: false }));
    const countryCard = (country: NationalBusPlan) => {
      // A walk worth mentioning is worth putting in minutes: "1,245 m" is a
      // number, "about 17 min on foot" is a decision. Odongdo really is a walk
      // across the causeway from its stop, and saying so is the answer.
      const walk = (m: number) => `**${Math.round((m / 1000) * 14)} min on foot** (${m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`})`;
      return ok(
        [
          `🚌 **${from} → ${to}** — one bus, no transfer`,
          "",
          `⏱️ about **${country.minutes} min** on the bus · ${country.stops} stops`,
          "",
          `🚌 Take bus **${country.routeName}** at **${busStopLabel(country.boardAt)}**, get off at **${busStopLabel(country.alightAt)}**.`,
          ...(country.walkToStopM >= 300 ? [`🚶 The stop is about ${walk(country.walkToStopM)} from ${from}.`] : []),
          ...(country.walkFromStopM >= 300 ? [`🚶 From the stop it is about ${walk(country.walkFromStopM)} to ${to}.`] : []),
          `Tap your card when you board **and again when you get off** — outside Seoul the fare is by distance, and missing the second tap costs extra.`,
          ...(accessLine(to) ? [accessLine(to)] : []),
          "",
          dir,
          "",
          "_Route from national bus open data (ⓒ국토교통부); times are typical, not live._",
        ].join("\n"),
        CHOICES,
      );
    };
    if (country.plan) return countryCard(country.plan);

    // Out of time is not out of buses: the lookups kept running, and are usually
    // in hand a moment later. Settling for two buses instead gave Jeju Airport →
    // Seongsan a 104-minute change while express bus 111 does it in one.
    if (country.timedOut) {
      const again = (await nationalBusBetween(from, to).catch((): NationalBusAttempt => ({ timedOut: false }))).plan;
      if (again) return countryCard(again);
    }

    // No single vehicle does it: a subway ride and then a bus, or two buses with
    // a change — whichever gets there sooner, door to door.
    const twoLegs = await tryTwoLegs(from, to, dir, ends);
    if (twoLegs) return twoLegs;

    // Where we know how the trip ends — the express bus to Seongsan, the circular
    // bus up Namsan — that is an answer in itself when the routing service has
    // none: its daily allowance ran out one evening mid-question.
    const known = accessLine(to);
    const fromKnowledge = (): ReturnType<typeof ok> =>
      ok([`🚌 **${from} → ${to}**`, "", known, "", dir].join("\n"), CHOICES);

    /**
     * The bus planner above gives up after a few seconds but leaves its lookups
     * running, so by the time the routing service has also failed the stops and
     * routes are usually in hand. Ask it once more before saying we have nothing:
     * on a freshly started server this is the difference between an answer and
     * a map link.
     */
    const secondLook = async () => {
      const again = country.plan ? undefined : (await nationalBusBetween(from, to).catch((): NationalBusAttempt => ({ timedOut: false }))).plan;
      return again ? countryCard(again) : undefined;
    };

    // The metered routing service is now the last resort, not a requirement:
    // everything above answers without it. Without it and without an answer, say
    // plainly that we have no route for this pair — calling that a data outage
    // would be a story about a service the traveller never asked for.
    if (!hasKey("TRANSIT_API_KEY") || !hasKey("TOUR_API_KEY")) {
      if (known) return fromKnowledge();
      return noRoute(from, to, dir, ends);
    }

    try {
      const [a, b] = await Promise.all([geocode(from), geocode(to)]);
      if (!a || !b) {
        if (known) return fromKnowledge();
        return fail(
          "Couldn't locate one of the places",
          `I couldn't pin coordinates for ${!a ? `**${from}**` : `**${to}**`}. Try a well-known landmark or station name — or open it directly:\n\n${dir}`,
          RETRY,
        );
      }
      const routes = await routesBetween(a, b);
      if (routes.length === 0) {
        const again = await secondLook();
        if (again) return again;
        if (known) return fromKnowledge();
        return noRoute(from, to, dir, ends);
      }
      const options = pickOptions(routes);
      const top = options.map((o) => renderRoute(o.route, o.label)).join("\n\n");
      // Use the user's own place wording in the header (geocoding may resolve to a
      // nearby shop with an ugly name; the route itself is correct).
      const body = [
        `🚇🚌 **${from} → ${to}** — pick how you want to go`,
        "",
        top,
        ...(accessLine(to) ? ["", accessLine(to)] : []),
        "",
        dir,
        `📋 _For the walk to/from the stop, search **${to}** in **Naver Map** — Google Maps walking/driving directions don't work in Korea._`,
      ].join("\n");
      // Dynamic chips: tap a mode to jump into live tracking (journey UX, Phase 1).
      return ok(body, trackChips(options.map((o) => o.route)));
    } catch {
      const again = await secondLook();
      if (again) return again;
      if (known) return fromKnowledge();
      // Say what is true of the trip, not of a service the traveller never asked
      // about: we found no single train or bus, and the transfer lookup was no
      // help either. "Couldn't reach the routing service" told them nothing they
      // could act on.
      return noRoute(from, to, dir, ends);
    }
  },
};
