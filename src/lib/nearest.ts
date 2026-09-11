/**
 * The nearest named place to a coordinate — station first, landmark otherwise.
 *
 * Shared by the phone (to say where it is) and the server (a text search engine
 * needs a name to anchor on, and a route needs a station to board at). Pure and
 * synchronous; the tables live in places.ts.
 */

import { PLACES, STATIONS, type StationEntry } from "./places.js";

export type Lang = "en" | "ko" | "ja" | "zh";

function km(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** A station's name the way a reader of that language writes it — and the router reads back. */
export function stationName(s: StationEntry, lang: Lang): string {
  const add = (name: string, suffix: RegExp, word: string) => (suffix.test(name) ? name : `${name}${word}`);
  if (lang === "ko") return add(s.k, /역$/, "역");
  if (lang === "ja") return add(s.j ?? s.e, /駅$/, "駅");
  if (lang === "zh") return add(s.z ?? s.e, /[站驛]$/, "站");
  return add(s.e, /station$/i, " Station");
}

export interface Located {
  /** A name the router understands, in the reader's language. */
  name: string;
  /** Straight-line distance from the point to it, in metres. */
  metres: number;
  /** Close enough to stand in for "here". */
  precise: boolean;
}

/** How far "near" can stretch before it stops meaning here. */
const PRECISE_M = 1500;

/** The nearest station or landmark to a point. */
export function nearestPlace(lat: number, lng: number, lang: Lang): Located | null {
  let best: { name: string; km: number } | null = null;
  for (const s of STATIONS) {
    const d = km(lat, lng, s.lat, s.lng);
    if (!best || d < best.km) best = { name: stationName(s, lang), km: d };
  }
  for (const p of PLACES) {
    const d = km(lat, lng, p.lat, p.lng);
    if (!best || d < best.km) best = { name: p.label, km: d };
  }
  if (!best) return null;
  const metres = Math.round(best.km * 1000);
  return { name: best.name, metres, precise: metres <= PRECISE_M };
}

/**
 * The nearest landmark or neighbourhood — not a station. For a guide to the
 * area, "Yangjae Station" is not a neighbourhood anyone writes a guide to.
 */
export function nearestLandmark(lat: number, lng: number): { label: string; metres: number } | null {
  let best: { label: string; km: number } | null = null;
  for (const p of PLACES) {
    if (/station$/i.test(p.label)) continue;
    const d = km(lat, lng, p.lat, p.lng);
    if (!best || d < best.km) best = { label: p.label, km: d };
  }
  return best ? { label: best.label, metres: Math.round(best.km * 1000) } : null;
}

/** The nearest subway station to a point, with the walk to it. */
export function nearestStation(lat: number, lng: number): { station: StationEntry; metres: number } | null {
  let best: { station: StationEntry; km: number } | null = null;
  for (const s of STATIONS) {
    const d = km(lat, lng, s.lat, s.lng);
    if (!best || d < best.km) best = { station: s, km: d };
  }
  return best ? { station: best.station, metres: Math.round(best.km * 1000) } : null;
}
