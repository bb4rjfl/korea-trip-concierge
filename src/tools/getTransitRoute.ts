import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchTopPlace } from "../lib/sources/tourapi.js";
import { geocodePoiName } from "../lib/sources/poi.js";
import { routesBetween, type TransitRoute } from "../lib/sources/odsay.js";
import { romanizeText, resolveStationKo, stationLabel, formatSubwayDirection } from "../lib/romanize.js";
import { resolvePlaceCoord } from "../lib/places.js";
import { detectIntercity, renderIntercity } from "../lib/intercity.js";
import { normalizeName } from "../lib/fuzzy.js";
import { exitLine } from "../lib/exits.js";
import { accessFor } from "../lib/access.js";
import { planRegional } from "../lib/regionalSubway.js";
import { getGraph, lineLabel, planRoute, findStationCodes } from "../lib/sources/subwayGraph.js";
import { getStationArrivals } from "../lib/sources/seoulSubway.js";
import { planDirectBus } from "../lib/sources/busRoute.js";
import { planDirectBusNear } from "../lib/sources/busNational.js";
import { directionsLinks } from "../lib/maplinks.js";
import { WHERE_I_AM } from "../lib/here.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

// An origin that means "wherever I am" — shared with the web client, which
// answers it on the device (src/lib/here.ts).
export { WHERE_I_AM };

/** Geocode a place: curated index first (instant + accurate), then TourAPI. */
export async function geocode(name: string): Promise<{ lng: number; lat: number } | undefined> {
  const curated = resolvePlaceCoord(name);
  if (curated) return { lng: curated.lng, lat: curated.lat };
  const p = await searchTopPlace(name);
  if (p?.mapx != null && p?.mapy != null) return { lng: p.mapx, lat: p.mapy };
  // The long tail — a café, a gallery, a shop someone just read off our own list.
  // The tourism database only holds attractions; local search holds everything.
  const poi = await geocodePoiName(name);
  return poi ? { lng: poi.lng, lat: poi.lat } : undefined;
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
async function nationalBusBetween(from: string, to: string) {
  const [a, b] = await Promise.all([geocode(from), geocode(to)]);
  if (!a || !b) return undefined;
  return planDirectBusNear({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }).catch(() => undefined);
}

/**
 * Plan the trip on the subway graph and dress it with a live first-train time.
 * Returns undefined when the rails can't serve this pair, so the caller falls
 * through to the metered routing API.
 */
async function trySubwayGraph(from: string, to: string, dir: string) {
  try {
    const graph = await getGraph();
    // The capital's network first, then Busan, Daegu, Gwangju and Daejeon —
    // our own graphs, before the metered service whose daily allowance runs out.
    const seoul = planRoute(graph, toStationName(from), toStationName(to));
    const elsewhere = seoul ? undefined : planRegional(toStationName(from), toStationName(to));
    const route = seoul ?? elsewhere;
    if (!route) return undefined;
    const regional = !seoul;
    // A city's stations by that city's own names.
    const station = (ko: string): string => (elsewhere ? elsewhere.label(ko) : stationLabel(ko));

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
    const exit = exitLine(to);
    const access = accessLine(to);

    const lines = route.legs.map((l, i) => {
      const label = lineLabel(l.line);
      return `${i === 0 ? "🚇" : "🔁"} **${label}** ${station(l.from)} → ${station(l.to)} _(${l.stops} stop${l.stops === 1 ? "" : "s"})_`;
    });

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
      `⏱️ about **${route.minutes} min** · ${route.stops} stops · ` +
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
    if (normalizeName(from) && normalizeName(from) === normalizeName(to)) {
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

    // Subway first, from our own graph of Seoul Open Data. It has no quota, answers
    // instantly, and covers the majority of visitor journeys — the metered routing
    // API below is now only the fallback for anything the rails can't serve.
    const rail = await trySubwayGraph(from, to, dir);
    if (rail) return rail;

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
          `🚌 Take bus **${onlyBus.routeName}** at **${stationLabel(onlyBus.boardAt)}**, get off at **${stationLabel(onlyBus.alightAt)}**.`,
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
    const country = await nationalBusBetween(from, to).catch(() => undefined);
    if (country) {
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
          `🚌 Take bus **${country.routeName}** at **${stationLabel(country.boardAt)}**, get off at **${stationLabel(country.alightAt)}**.`,
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
    }

    // Where we know how the trip ends — the express bus to Seongsan, the circular
    // bus up Namsan — that is an answer in itself when the routing service has
    // none: its daily allowance ran out one evening mid-question.
    const known = accessLine(to);
    const fromKnowledge = (): ReturnType<typeof ok> =>
      ok([`🚌 **${from} → ${to}**`, "", known, "", dir].join("\n"), CHOICES);

    // The metered routing service is now the last resort, not a requirement:
    // everything above answers without it. Without it and without an answer, say
    // plainly that we have no route for this pair — calling that a data outage
    // would be a story about a service the traveller never asked for.
    if (!hasKey("TRANSIT_API_KEY") || !hasKey("TOUR_API_KEY")) {
      if (known) return fromKnowledge();
      return fail(
        "No single subway or bus for this trip",
        `I couldn't find one train or one bus that does **${from} → ${to}** — it may need a change, or one of the two places may be spelled differently here. You can still get there:\n\n${dir}`,
        RETRY,
      );
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
        if (known) return fromKnowledge();
        return fail("No transit route found", `No public-transit path from **${from}** to **${to}** was returned.\n\n${dir}`, RETRY);
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
      if (known) return fromKnowledge();
      return fail(
        "Couldn't reach the routing service",
        `The transit routing source didn't respond in time — you can still get there:\n\n${dir}\n\nOr tap Refresh to retry.`,
        RETRY,
      );
    }
  },
};
