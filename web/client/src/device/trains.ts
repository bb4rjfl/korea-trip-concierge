/**
 * "When's the next train?", from the station nearest the traveller.
 *
 * The phone knows which station that is; asking us for that station's board
 * would tell us. So the phone reads it off the board for every station in
 * Seoul — one copy, the same for everyone (src/lib/sources/trainBoard.ts).
 */

import type { TrainsTask } from "../../../../src/lib/deviceTask.js";
import { shownOnDevice } from "../../../../src/lib/deviceTask.js";
import type { BoardRow, TrainBoard } from "../../../../src/lib/sources/trainBoard.js";
import type { Chip } from "../api.js";
import { DEVICE_STRINGS, distance, fill, walkMinutes, type Lang } from "./strings.js";
import { boardLine, lineName, stationLabel, type StationNames } from "./lines.js";
import { askChip, metres, type DeviceCard, type Fix } from "./card.js";

let cached: { at: number; board: TrainBoard } | undefined;

/** The city's board, read at most every fifteen seconds, never waited on for more than a few. */
export async function readBoard(): Promise<TrainBoard | undefined> {
  if (cached && Date.now() - cached.at < 15_000) return cached.board;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch("/api/trains", { signal: ctl.signal });
    if (!r.ok) return cached?.board;
    const board = (await r.json()) as TrainBoard;
    cached = { at: Date.now(), board };
    return board;
  } catch {
    return cached?.board;
  } finally {
    clearTimeout(timer);
  }
}

const bare = (s: string): string => s.replace(/역$/, "").replace(/\s*\(.*\)\s*$/, "").trim();

/** Roughly 00:30–05:30 in Seoul, whatever time zone the phone is set to. */
export function subwayClosed(now = Date.now()): boolean {
  const kst = new Date(now + 9 * 3600_000);
  const minutes = kst.getUTCHours() * 60 + kst.getUTCMinutes();
  return minutes >= 30 && minutes < 5 * 60 + 30;
}

/** How soon, as a number to sort by (seconds), and as words. */
export function eta(row: BoardRow, elapsedS: number, lang: Lang): { s: number; said: string } | undefined {
  const t = DEVICE_STRINGS[lang];
  const [, , , , code, secs, stops] = row;
  if (code === 0) return { s: 0, said: t.arriving };
  if (code === 1) return { s: 0, said: t.atPlatform };
  if (code === 3 || code === 4 || code === 5) return { s: 90, said: t.prevStation };
  if (secs > 0) {
    const left = secs - elapsedS;
    return left <= 30 ? { s: 0, said: t.arriving } : { s: left, said: fill(t.minutes, { n: Math.round(left / 60) }) };
  }
  if (stops > 0) return { s: stops * 120, said: fill(t.stopsAway, { n: stops }) };
  return undefined;
}

/**
 * The board for one station, a line per direction: "Line 3 · toward Ogeum:
 * 2 min · 9 min". Station names and termini in the reader's script, from the
 * phone's own table.
 */
export function boardLines(
  board: TrainBoard,
  stationKo: string,
  lang: Lang,
  names: (ko: string) => StationNames | undefined,
  now = Date.now(),
  onlyLine?: string,
): string[] {
  const t = DEVICE_STRINGS[lang];
  const elapsed = Math.max(0, Math.round((now - board.at) / 1000));
  // One line per platform, as the platform's own display has it: a train that
  // turns back at Suseo and one running through to Ogeum leave from the same
  // side, so they are the same "next train" to someone waiting there.
  type Group = { line: string; termini: string[]; flags: number; times: { s: number; said: string; to: string }[] };
  const groups = new Map<string, Group>();
  for (const row of board.rows) {
    if (bare(row[0]) !== bare(stationKo)) continue;
    const line = boardLine(row[1]);
    if (!line || (onlyLine && line !== onlyLine)) continue;
    const when = eta(row, elapsed, lang);
    if (!when) continue;
    const key = `${line}|${row[2] || row[3]}`;
    const g = groups.get(key) ?? { line, termini: [], flags: 0, times: [] };
    g.flags |= row[7];
    g.times.push({ ...when, to: row[3] });
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => {
      const times = g.times.sort((a, b) => a.s - b.s).slice(0, 2);
      return { ...g, times, termini: [...new Set(times.map((x) => x.to))] };
    })
    .sort((a, b) => a.line.localeCompare(b.line) || a.times[0].s - b.times[0].s)
    .map((g) => {
      const to = g.termini.map((k) => stationLabel(names(k) ?? { k }, lang)).join(" / ");
      const toward = fill(t.toward, { to });
      const extra = [g.flags & 1 ? t.express : "", g.flags & 2 ? t.lastTrain : ""].filter(Boolean).join(", ");
      const times = g.times.map((x, i) => (i === 0 ? `**${x.said}**` : x.said)).join(" · ");
      return `**${lineName(g.line, lang)}** · ${toward}${extra ? ` _(${extra})_` : ""}: ${times}`;
    });
}

export async function runTrains(task: TrainsTask, at: Fix, lang: Lang): Promise<DeviceCard> {
  const t = DEVICE_STRINGS[lang];
  const { stationsNear, stationByKo } = await import("../../../../src/lib/nearest.js");
  const named = task.station ? stationByKo(task.station) : undefined;
  const near = named ? [{ station: named, metres: metres(at, named) }] : stationsNear(at.lat, at.lng, 1200, 2);
  const chips: Chip[] = [askChip("💳", t.chip.paySubway), askChip("🍽️", t.chip.food)];
  if (!near.length) {
    return { markdown: [t.noStationForTrains, "", t.onDevice].join("\n"), chips, local: shownOnDevice(task) };
  }
  const here = near[0];
  const board = await readBoard();
  const lines = board ? boardLines(board, here.station.k, lang, stationByKo) : [];
  const head = fill(t.trainsHead, {
    station: stationLabel(here.station, lang),
    m: distance(here.metres, lang),
    min: walkMinutes(here.metres),
  });
  const other = near[1];
  if (other) {
    const name = stationLabel(other.station, lang);
    chips.unshift({ emoji: "🚇", cmdEn: fill(t.chip.trainsAt, { station: name }), locate: { task: { kind: "trains", station: other.station.k } } });
  }
  // An empty board at 3am is the subway being shut, not the board being down.
  const empty = !board ? t.boardDown : subwayClosed() ? t.subwayClosed : t.noTrainsNow;
  const markdown = [head, "", ...(lines.length ? lines : [empty]), ...(task.tip ? ["", task.tip] : []), "", t.onDevice].join("\n");
  return { markdown, chips: chips.slice(0, 3), local: shownOnDevice(task) };
}
