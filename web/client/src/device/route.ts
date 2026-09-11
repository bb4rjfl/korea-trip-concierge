/**
 * A route from exactly where the traveller is standing — planned on the phone.
 *
 * The server knows the destination (they named it) and hands over where it is,
 * the station it is reached by and the exit to take. Everything that starts
 * from the traveller happens here: the walk to a station, which of the nearby
 * stations to board at, the ride — on the same subway graph and planner the
 * server uses (src/lib/subwayPlan.ts) — and the live board at the platform.
 *
 * Better than boarding at the nearest station, which is what the server used
 * to do: the station 300 m further on is often on the line that goes there
 * without a change, so every nearby pair is tried and the quickest door to
 * door wins.
 */

import type { RouteTask } from "../../../../src/lib/deviceTask.js";
import { shownOnDevice } from "../../../../src/lib/deviceTask.js";
import type { SubwayGraph, SubwayRoute } from "../../../../src/lib/subwayPlan.js";
import type { Chip } from "../api.js";
import { DEVICE_STRINGS, distance, fill, walkMinutes, type Lang } from "./strings.js";
import { lineName, stationLabel, type StationNames } from "./lines.js";
import { askChip, kakaoDirections, metres, naverDirections, HERE_LABEL, type DeviceCard, type Fix, type Point } from "./card.js";
import { boardLines, readBoard, subwayClosed } from "./trains.js";

/** Under about fifteen minutes on foot, walking beats any train you would have to go down to. */
const WALKABLE_M = 1200;
/** How far someone will walk to a station, at either end. */
const TO_STATION_M = 1500;
const FROM_STATION_M = 1200;

let graph: SubwayGraph | undefined;

async function planner() {
  const plan = await import("../../../../src/lib/subwayPlan.js");
  graph ??= plan.fromSnapshot();
  return { plan, graph };
}

export interface Plan {
  board: { station: StationNames & Point; metres: number };
  alight: { station: StationNames & Point; metres: number };
  ride: SubwayRoute;
  minutes: number;
}

/** Every nearby start against every station near the destination; the quickest door to door. */
export function bestPlan(
  starts: { station: StationNames & Point; metres: number }[],
  ends: { station: StationNames & Point; metres: number }[],
  ride: (from: string, to: string) => SubwayRoute | undefined,
): Plan | undefined {
  let best: Plan | undefined;
  for (const board of starts) {
    for (const alight of ends) {
      if (board.station.k === alight.station.k) continue;
      const r = ride(board.station.k, alight.station.k);
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

export async function runRoute(task: RouteTask, at: Fix, lang: Lang): Promise<DeviceCard> {
  const t = DEVICE_STRINGS[lang];
  const { stationsNear, stationByKo } = await import("../../../../src/lib/nearest.js");
  const local = shownOnDevice(task);
  const lead = task.tip ? [task.tip, ""] : [];
  const chips: Chip[] = [askChip("🗺️", fill(t.chip.about, { name: task.to })), askChip("💳", t.chip.paySubway)];

  const byStation = task.destStation ? stationByKo(task.destStation) : undefined;
  const dest: Point | undefined = task.dest ?? byStation;
  if (!dest) {
    const search = `https://map.kakao.com/link/search/${encodeURIComponent(task.to)}`;
    return { markdown: [...lead, fill(t.cantPlace, { to: task.to }), `[${t.kakaoMap}](${search})`, "", t.onDevice].join("\n"), chips, local };
  }

  const direct = metres(at, dest);
  if (direct <= WALKABLE_M) {
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

  const starts = stationsNear(at.lat, at.lng, TO_STATION_M, 3);
  const ends = stationsNear(dest.lat, dest.lng, FROM_STATION_M, 3);
  // The station a landmark is known to be reached by, even if another is a few metres nearer.
  if (byStation && !ends.some((e) => e.station.k === byStation.k)) ends.unshift({ station: byStation, metres: metres(byStation, dest) });

  const { plan, graph: g } = await planner();
  const best = bestPlan(starts, ends, (a, b) => plan.planBetween(g, plan.stationCodes(g, a), plan.stationCodes(g, b)));
  if (!best) {
    const markdown = [...lead, fill(t.routeHead, { to: task.to }), "", t.noStationNear, footer(at, task.to, dest, lang, "public"), "", t.onDevice].join("\n");
    return { markdown, chips, local };
  }

  const names = (ko: string): StationNames => {
    const code = plan.stationCodes(g, ko)[0];
    const s = code ? g.byCode.get(code) : undefined;
    return s ? { k: s.ko, e: s.en, j: s.ja, z: s.zh } : stationByKo(ko) ?? { k: ko };
  };
  const { board, alight, ride } = best;
  const transfers = ride.transfers === 0 ? t.noTransfer : ride.transfers === 1 ? t.transfer : fill(t.transfers, { n: ride.transfers });
  const steps = [
    fill(t.walkToStation, { m: distance(board.metres, lang), min: walkMinutes(board.metres), station: stationLabel(board.station, lang) }),
    ...ride.legs.map((leg, i) =>
      fill(t.rideLine, {
        icon: i === 0 ? "🚇" : "🔁",
        line: lineName(leg.line, lang),
        from: stationLabel(names(leg.from), lang),
        to: stationLabel(names(leg.to), lang),
        n: leg.stops,
        stops: leg.stops === 1 ? t.stop : t.stops,
      }),
    ),
    // The exit line says the last bit better than a straight line to a map pin
    // does — "comes out inside the ticket plaza" beats "530 m".
    ...(alight.metres >= 60 && !(task.exit && task.destStation === alight.station.k)
      ? [fill(t.walkFromStation, { station: stationLabel(alight.station, lang), m: distance(alight.metres, lang), min: walkMinutes(alight.metres), to: task.to })]
      : []),
  ];

  // The board at the platform they are walking to: the part a waiting passenger wants.
  const liveBoard = await readBoard();
  const live = liveBoard ? boardLines(liveBoard, board.station.k, lang, stationByKo, Date.now(), ride.legs[0].line).slice(0, 2) : [];

  const notes = [
    ride.legs.some((l) => /신분당/.test(l.line)) ? t.sinbundang : "",
    ride.legs.some((l) => /공항철도/.test(l.line)) ? t.airport : "",
  ].filter(Boolean);

  const markdown = [
    ...lead,
    fill(t.routeHead, { to: task.to }),
    fill(t.summary, { min: best.minutes, transfers, fare: ride.fareWon.toLocaleString() }),
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

  chips.unshift({
    emoji: "🚇",
    cmdEn: fill(t.chip.trainsAt, { station: stationLabel(board.station, lang) }),
    locate: { task: { kind: "trains", station: board.station.k } },
  });
  return { markdown, chips: chips.slice(0, 3), local };
}
