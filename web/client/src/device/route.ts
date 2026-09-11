/**
 * A route from exactly where the traveller is standing — planned on the phone.
 *
 * The server knows the destination (they named it) and hands over where it is,
 * the station it is reached by, the exit to take, and how the last leg goes
 * when it is not a walk (src/lib/access.ts). Everything that starts from the
 * traveller happens here: the walk to a station, which of the nearby stations
 * to board at, the ride — on the same subway planner the server uses
 * (src/lib/subwayPlan.ts) — and the live board at the platform.
 *
 * Better than boarding at the nearest station, which is what the server used
 * to do: the station 300 m further on is often on the line that goes there
 * without a change, so every nearby pair is tried and the quickest door to
 * door wins.
 */

import type { RouteTask } from "../../../../src/lib/deviceTask.js";
import { shownOnDevice } from "../../../../src/lib/deviceTask.js";
import type { SubwayRoute } from "../../../../src/lib/subwayPlan.js";
import type { Chip } from "../api.js";
import { DEVICE_STRINGS, distance, fill, walkMinutes, type Lang } from "./strings.js";
import { lineName, stationLabel } from "./lines.js";
import { askChip, kakaoDirections, metres, naverDirections, HERE_LABEL, type DeviceCard, type Fix, type Point } from "./card.js";
import { boardLines, readBoard, subwayClosed } from "./trains.js";
import { networks, type Network, type Stop } from "./networks.js";

/** Under about fifteen minutes on foot, walking beats any train you would have to go down to. */
const WALKABLE_M = 1200;
/** How far someone will walk to a station, at either end. */
const TO_STATION_M = 1500;
const FROM_STATION_M = 1200;
/** Beyond this the trip is between cities: a train or a coach, not a subway. */
const INTERCITY_M = 40_000;

/** The cities a visitor is likely to be in, by their centres. */
const CITIES: { lat: number; lng: number; name: Record<Lang, string> }[] = [
  { lat: 37.5665, lng: 126.978, name: { en: "Seoul", ko: "서울", ja: "ソウル", zh: "首尔" } },
  { lat: 37.4563, lng: 126.7052, name: { en: "Incheon", ko: "인천", ja: "仁川", zh: "仁川" } },
  { lat: 37.2636, lng: 127.0286, name: { en: "Suwon", ko: "수원", ja: "水原", zh: "水原" } },
  { lat: 35.1796, lng: 129.0756, name: { en: "Busan", ko: "부산", ja: "釜山", zh: "釜山" } },
  { lat: 35.8714, lng: 128.6014, name: { en: "Daegu", ko: "대구", ja: "大邱", zh: "大邱" } },
  { lat: 35.1595, lng: 126.8526, name: { en: "Gwangju", ko: "광주", ja: "光州", zh: "光州" } },
  { lat: 36.3504, lng: 127.3845, name: { en: "Daejeon", ko: "대전", ja: "大田", zh: "大田" } },
  { lat: 35.8562, lng: 129.2247, name: { en: "Gyeongju", ko: "경주", ja: "慶州", zh: "庆州" } },
  { lat: 35.8242, lng: 127.148, name: { en: "Jeonju", ko: "전주", ja: "全州", zh: "全州" } },
  { lat: 37.7519, lng: 128.8761, name: { en: "Gangneung", ko: "강릉", ja: "江陵", zh: "江陵" } },
  { lat: 38.207, lng: 128.5918, name: { en: "Sokcho", ko: "속초", ja: "束草", zh: "束草" } },
  { lat: 33.4996, lng: 126.5312, name: { en: "Jeju", ko: "제주", ja: "済州", zh: "济州" } },
];

/** The city the traveller is in, if they are within one — for a button they choose to tap. */
function cityOf(at: Point, lang: Lang): string | undefined {
  const best = CITIES.map((c) => ({ c, m: metres(at, c) })).sort((a, b) => a.m - b.m)[0];
  return best && best.m < 30_000 ? best.c.name[lang] : undefined;
}

export interface Plan {
  board: Stop;
  alight: Stop;
  ride: SubwayRoute;
  minutes: number;
}

/** Every nearby start against every station near the destination; the quickest door to door. */
export function bestPlan(starts: Stop[], ends: Stop[], ride: (from: Stop, to: Stop) => SubwayRoute | undefined): Plan | undefined {
  let best: Plan | undefined;
  for (const board of starts) {
    for (const alight of ends) {
      if (board.station.k === alight.station.k) continue;
      const r = ride(board, alight);
      if (!r) continue;
      const minutes = walkMinutes(board.metres) + r.minutes + walkMinutes(alight.metres);
      if (!best || minutes < best.minutes) best = { board, alight, ride: r, minutes };
    }
  }
  return best;
}

function footer(at: Fix, to: string, dest: Point, lang: Lang, mode: "walk" | "public"): string {
  const t = DEVICE_STRINGS[lang];
  const kakao = kakaoDirections(at, HERE_LABEL[lang], to, dest, mode === "walk" ? "walk" : "traffic");
  const naver = naverDirections(at, HERE_LABEL[lang], to, dest, mode);
  return `${t.fromYourSpot} [${t.kakaoMap}](${kakao}) · [${t.naverMap}](${naver})`;
}

/** The stations at the destination end: its gateway alone when the last leg is a climb, else the nearest few. */
function destinationStops(net: Network, task: RouteTask, dest: Point): Stop[] {
  const gateway = task.destStation ? net.byKo(task.destStation) : undefined;
  const gatewayStop = gateway ? { ...gateway, metres: metres(gateway.station, dest) } : undefined;
  // The note says how to get up from the gateway; ending anywhere else would
  // leave the traveller at a station the note does not start from.
  if (task.climb && gatewayStop) return [gatewayStop];
  const near = net.near(dest, FROM_STATION_M, 3);
  return gatewayStop && !near.some((s) => s.station.k === gatewayStop.station.k) ? [gatewayStop, ...near] : near;
}

export async function runRoute(task: RouteTask, at: Fix, lang: Lang): Promise<DeviceCard> {
  const t = DEVICE_STRINGS[lang];
  const local = shownOnDevice(task);
  const lead = task.tip ? [task.tip, ""] : [];
  const chips: Chip[] = [askChip("🗺️", fill(t.chip.about, { name: task.to })), askChip("💳", t.chip.paySubway)];
  const nets = await networks();

  const gateway = task.destStation ? nets.map((n) => n.byKo(task.destStation!)).find(Boolean) : undefined;
  const dest: Point | undefined = task.dest ?? gateway?.station;
  if (!dest) {
    const search = `https://map.kakao.com/link/search/${encodeURIComponent(task.to)}`;
    return { markdown: [...lead, fill(t.cantPlace, { to: task.to }), `[${t.kakaoMap}](${search})`, "", t.onDevice].join("\n"), chips, local };
  }

  // A short straight line is a walk — unless it goes up a mountain.
  const direct = metres(at, dest);

  // Another city is not a subway trip. Say so, and offer the intercity answer —
  // the button names the city they are in, which they choose to send by tapping.
  if (direct > INTERCITY_M) {
    const city = cityOf(at, lang);
    const ask = city ? fill(t.chip.intercityFrom, { city, to: task.to }) : fill(t.chip.intercityTo, { to: task.to });
    const markdown = [...lead, fill(t.intercityHead, { to: task.to, km: distance(direct, lang) }), "", t.onDevice].join("\n");
    return { markdown, chips: [askChip("🚄", ask), ...chips.slice(0, 1)], local };
  }
  if (direct <= WALKABLE_M && !task.climb) {
    const markdown = [
      ...lead,
      fill(t.walkHead, { to: task.to, m: distance(direct, lang), min: walkMinutes(direct) }),
      "",
      t.walkBody,
      ...(task.exit ? ["", task.exit] : []),
      "",
      footer(at, task.to, dest, lang, "walk"),
      t.onDevice,
    ].join("\n");
    return { markdown, chips, local };
  }

  for (const net of nets) {
    const starts = net.near(at, TO_STATION_M, 3);
    if (!starts.length) continue;
    const ends = destinationStops(net, task, dest);
    if (!ends.length) continue;

    // Already within a walk of the station the last leg starts from: no train.
    const atGateway = task.access ? starts.find((s) => ends.some((e) => e.station.k === s.station.k)) : undefined;
    if (atGateway) {
      const markdown = [
        ...lead,
        fill(t.routeHead, { to: task.to }),
        "",
        fill(t.walkToStation, { m: distance(atGateway.metres, lang), min: walkMinutes(atGateway.metres), station: stationLabel(atGateway.station, lang) }),
        task.access!,
        ...(task.exit ? [task.exit] : []),
        "",
        footer(at, task.to, dest, lang, "public"),
        t.onDevice,
      ].join("\n");
      return { markdown, chips, local };
    }

    const best = bestPlan(starts, ends, (a, b) => net.plan(a.codes, b.codes));
    if (!best) continue;
    return rideCard(task, at, lang, net, best, dest, lead, chips, local);
  }

  // No subway within reach at one end or the other — Jeju, the countryside, a
  // mountain. The map apps plan buses from their exact spot; we say how the
  // last leg goes when we know.
  const markdown = [
    ...lead,
    fill(t.routeHead, { to: task.to }),
    "",
    ...(task.access ? [task.access, ""] : []),
    t.noStationNear,
    footer(at, task.to, dest, lang, "public"),
    "",
    t.onDevice,
  ].join("\n");
  return { markdown, chips, local };
}

async function rideCard(
  task: RouteTask,
  at: Fix,
  lang: Lang,
  net: Network,
  best: Plan,
  dest: Point,
  lead: string[],
  chips: Chip[],
  local: string,
): Promise<DeviceCard> {
  const t = DEVICE_STRINGS[lang];
  const { board, alight, ride } = best;
  const transfers = ride.transfers === 0 ? t.noTransfer : ride.transfers === 1 ? t.transfer : fill(t.transfers, { n: ride.transfers });
  // The last leg: how to get up there when it is a climb or a bus; otherwise
  // the walk — unless the exit line already says it better ("comes out inside
  // the ticket plaza" beats "530 m").
  const lastLeg = task.access
    ? [task.access]
    : alight.metres >= 60 && !(task.exit && task.destStation === alight.station.k)
      ? [fill(t.walkFromStation, { station: stationLabel(alight.station, lang), m: distance(alight.metres, lang), min: walkMinutes(alight.metres), to: task.to })]
      : [];
  const steps = [
    fill(t.walkToStation, { m: distance(board.metres, lang), min: walkMinutes(board.metres), station: stationLabel(board.station, lang) }),
    ...ride.legs.map((leg, i) =>
      fill(t.rideLine, {
        icon: i === 0 ? "🚇" : "🔁",
        line: lineName(leg.line, lang),
        from: stationLabel(net.names(leg.from), lang),
        to: stationLabel(net.names(leg.to), lang),
        n: leg.stops,
        stops: leg.stops === 1 ? t.stop : t.stops,
      }),
    ),
    ...lastLeg,
  ];

  // The board at the platform they are walking to — Seoul publishes one.
  const liveBoard = net.live ? await readBoard() : undefined;
  const { stationByKo } = await import("../../../../src/lib/nearest.js");
  const live = liveBoard ? boardLines(liveBoard, board.station.k, lang, stationByKo, Date.now(), ride.legs[0].line).slice(0, 2) : [];

  const notes = [
    ride.legs.some((l) => /신분당/.test(l.line)) ? t.sinbundang : "",
    ride.legs.some((l) => /공항철도/.test(l.line)) ? t.airport : "",
  ].filter(Boolean);
  const minutes = task.access ? best.minutes - walkMinutes(alight.metres) : best.minutes;

  const markdown = [
    ...lead,
    fill(t.routeHead, { to: task.to }),
    fill(task.access ? t.summaryToGateway : t.summary, {
      min: minutes,
      transfers,
      fare: net.fare(ride).toLocaleString(),
      station: stationLabel(alight.station, lang),
    }),
    ...(subwayClosed() ? ["", t.subwayClosed] : []),
    "",
    ...steps,
    ...(task.exit ? [task.exit] : []),
    ...(live.length ? ["", fill(t.liveAt, { station: stationLabel(board.station, lang), board: "" }).trim(), ...live] : []),
    ...(notes.length ? ["", ...notes] : []),
    "",
    footer(at, task.to, dest, lang, "public"),
    t.onDevice,
  ].join("\n");

  if (net.live) {
    chips.unshift({
      emoji: "🚇",
      cmdEn: fill(t.chip.trainsAt, { station: stationLabel(board.station, lang) }),
      locate: { task: { kind: "trains", station: board.station.k } },
    });
  }
  return { markdown, chips: chips.slice(0, 3), local };
}
