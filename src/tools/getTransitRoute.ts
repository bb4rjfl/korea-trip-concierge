import { z } from "zod";
import { SERVICE_NAME } from "../lib/constants.js";
import { ok, fail, notConnected } from "../lib/responses.js";
import { hasKey } from "../lib/env.js";
import { searchTopPlace } from "../lib/sources/tourapi.js";
import { routesBetween, type TransitRoute } from "../lib/sources/odsay.js";
import { romanizeText } from "../lib/romanize.js";
import { resolvePlaceCoord } from "../lib/places.js";
import { detectIntercity, renderIntercity } from "../lib/intercity.js";
import { normalizeName } from "../lib/fuzzy.js";
import { getGraph, lineLabel, planRoute } from "../lib/sources/subwayGraph.js";
import { getStationArrivals } from "../lib/sources/seoulSubway.js";
import { directionsLinks } from "../lib/maplinks.js";
import type { Choice } from "../lib/footer.js";
import type { ToolDef } from "./types.js";

/** Geocode a place: curated index first (instant + accurate), then TourAPI. */
async function geocode(name: string): Promise<{ lng: number; lat: number } | undefined> {
  const curated = resolvePlaceCoord(name);
  if (curated) return { lng: curated.lng, lat: curated.lat };
  const p = await searchTopPlace(name);
  return p?.mapx != null && p?.mapy != null ? { lng: p.mapx, lat: p.mapy } : undefined;
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

function renderRoute(r: TransitRoute, idx: number): string {
  const fare = r.fare ? ` · 💳 ₩${r.fare.toLocaleString()}` : "";
  const legs = r.legs
    .map((l) => {
      const icon = MODE_ICON[l.mode] ?? "•";
      // Romanize Korean line/station names from ODsay for English-first readers (U1).
      const line = l.line ? ` **${romanizeText(l.line)}**` : "";
      // Flag N-prefixed night buses so they're not mistaken for a daytime option (Y21).
      const night = l.mode === "bus" && /^N\d/i.test(l.line ?? "") ? " 🌙_(night bus, ~23:30–06:00)_" : "";
      const seg = l.from && l.to ? ` ${romanizeText(l.from)} → ${romanizeText(l.to)}` : "";
      return `   ${icon}${line}${seg}${night}`;
    })
    .join("\n");
  return `**Option ${idx + 1} · ${MODE_LABEL[primaryMode(r)]} — ${r.totalMinutes} min${fare}**\n${legs}`;
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

/** Map a free-text endpoint to a station name the graph knows, if we can. */
function toStationName(name: string): string {
  for (const [re, station] of LANDMARK_STATION) if (re.test(name)) return station;
  return name;
}

/**
 * Plan the trip on the subway graph and dress it with a live first-train time.
 * Returns undefined when the rails can't serve this pair, so the caller falls
 * through to the metered routing API.
 */
async function trySubwayGraph(from: string, to: string, dir: string) {
  try {
    const graph = await getGraph();
    const route = planRoute(graph, toStationName(from), toStationName(to));
    if (!route) return undefined;

    const first = route.legs[0];
    // The live board for the boarding station makes this a real-time answer, not a
    // timetable lookup — and it is the thing a waiting passenger actually wants.
    let live = "";
    try {
      const arrivals = await getStationArrivals(first.from);
      const next = arrivals.slice(0, 2);
      if (next.length) {
        const board = next
          .map((a) => `${a.towards || a.destination} — ${a.etaMinutes != null ? `${a.etaMinutes} min` : a.status}`)
          .join(" · ");
        live = `\n\n🟢 **Live at ${first.from} now:** ${board}`;
      }
    } catch {
      /* live board is a bonus, never a blocker */
    }

    const lines = route.legs.map((l, i) => {
      const label = lineLabel(l.line);
      return `${i === 0 ? "🚇" : "🔁"} **${label}** ${l.from} → ${l.to} _(${l.stops} stop${l.stops === 1 ? "" : "s"})_`;
    });

    const head =
      `🚇 **${from} → ${to}** — by subway\n\n` +
      `⏱️ about **${route.minutes} min** · ${route.stops} stops · ` +
      `${route.transfers === 0 ? "no transfers" : `${route.transfers} transfer${route.transfers === 1 ? "" : "s"}`} · ` +
      `💳 around **₩${route.fareWon.toLocaleString()}**`;

    return ok(
      [head, "", ...lines, live, "", dir, "", "_Route from Seoul subway network data (ⓒ서울특별시); times are typical._"]
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
    const from = String(args.from ?? "").trim();
    const to = String(args.to ?? "").trim();

    // U3: a transit route needs a starting point. If the user only gave a
    // destination (common from chips), ask for the origin instead of failing.
    if (!from) {
      const dest = to || "your destination";
      // Offer common origins so the user can tap instead of re-typing (C9).
      return fail(
        "Where are you starting from?",
        `I can route you to **${dest}** — tap a common starting point, or tell me a station/landmark/address.`,
        [
          { emoji: "🚉", cmdEn: `From Seoul Station to ${dest}`, descEn: "route from Seoul Station" },
          { emoji: "✈️", cmdEn: `From Incheon Airport to ${dest}`, descEn: "route from the airport" },
          { emoji: "🏨", cmdEn: `From my area to ${dest}`, descEn: "tell me your neighborhood" },
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
      return ok(renderIntercity(from, to, ic), [
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

    if (!hasKey("TRANSIT_API_KEY") || !hasKey("TOUR_API_KEY")) {
      return notConnected(
        "Get Public Transit Route",
        `Source: **ODsay routing** + TourAPI geocoding. Route requested: **${from} → ${to}**.\n\n${dir}`,
        CHOICES,
      );
    }

    try {
      const [a, b] = await Promise.all([geocode(from), geocode(to)]);
      if (!a || !b) {
        return fail(
          "Couldn't locate one of the places",
          `I couldn't pin coordinates for ${!a ? `**${from}**` : `**${to}**`}. Try a well-known landmark or station name — or open it directly:\n\n${dir}`,
          RETRY,
        );
      }
      const routes = await routesBetween(a, b);
      if (routes.length === 0) {
        return fail("No transit route found", `No public-transit path from **${from}** to **${to}** was returned.\n\n${dir}`, RETRY);
      }
      const top = routes.slice(0, 2).map(renderRoute).join("\n\n");
      // Use the user's own place wording in the header (geocoding may resolve to a
      // nearby shop with an ugly name; the route itself is correct).
      const body = [
        `🚇🚌 **${from} → ${to}** — pick how you want to go`,
        "",
        top,
        "",
        dir,
        `📋 _For the walk to/from the stop, search **${to}** in **Naver Map** — Google Maps walking/driving directions don't work in Korea._`,
      ].join("\n");
      // Dynamic chips: tap a mode to jump into live tracking (journey UX, Phase 1).
      return ok(body, trackChips(routes.slice(0, 2)));
    } catch {
      return fail(
        "Couldn't reach the routing service",
        `The transit routing source didn't respond in time — you can still get there:\n\n${dir}\n\nOr tap Refresh to retry.`,
        RETRY,
      );
    }
  },
};
