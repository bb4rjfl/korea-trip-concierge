/**
 * "Where am I", answered on the phone.
 *
 * Privacy by construction, and the law is why: sending a person's position to
 * the server is what makes a service a reportable location service under the
 * Location Information Act (docs/27 §4). So the GPS fix is compared here, in the
 * browser, against a table the app carries, and only the nearest NAME is ever
 * sent — the same thing a traveller would type if they knew where they were.
 *
 * The table used to be 82 landmarks. Measured at twelve places a visitor would
 * actually be standing — hotels, guesthouses, side streets — the nearest of them
 * was a median 1.3 km away and 8.4 km at worst: someone in Nowon was told they
 * were at Cheongnyangni, and a route from the wrong station is wrong from its
 * first step. It is now every subway station in the Seoul area (653, from the
 * city's station register) plus those landmarks, which still cover Busan and
 * Jeju where the station table does not reach.
 */

import { PLACES, STATIONS, findPlaceInText, type StationEntry as Station } from "../../../src/lib/places.js";
import type { Lang } from "./api.js";

// Loaded with the table, so asking "does this sentence name a place" costs the
// first download nothing — see loadGeo in app.tsx.
export { findPlaceInText };

const R = 6371; // km

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** A station's name the way someone reading that language would write it — and the router reads back. */
function stationName(s: Station, lang: Lang): string {
  const add = (name: string, suffix: RegExp, word: string) => (suffix.test(name) ? name : `${name}${word}`);
  if (lang === "ko") return add(s.k, /역$/, "역");
  if (lang === "ja") return add(s.j ?? s.e, /駅$/, "駅");
  if (lang === "zh") return add(s.z ?? s.e, /[站驛]$/, "站");
  return add(s.e, /station$/i, " Station");
}

export interface Located {
  /** What to send: a name the router understands, in the reader's language. */
  name: string;
  /** Straight-line distance from the fix to it, in metres. */
  metres: number;
  /**
   * Close enough to stand in for "here". Beyond this the nearest thing we know
   * is somewhere else, and saying "you're at X" would be the old failure again —
   * so the caller asks the traveller to type where they are instead.
   */
  precise: boolean;
}

/** How far "near" can stretch before it stops meaning here. */
const PRECISE_M = 1500;

export function locate(lat: number, lng: number, lang: Lang): Located | null {
  let best: { name: string; km: number } | null = null;
  for (const s of STATIONS as readonly Station[]) {
    const km = haversineKm(lat, lng, s.lat, s.lng);
    if (!best || km < best.km) best = { name: stationName(s, lang), km };
  }
  for (const p of PLACES) {
    const km = haversineKm(lat, lng, p.lat, p.lng);
    if (!best || km < best.km) best = { name: p.label, km };
  }
  if (!best) return null;
  const metres = Math.round(best.km * 1000);
  return { name: best.name, metres, precise: metres <= PRECISE_M };
}

/** "320 m" or "1.4 km" — how a person says a distance. */
export function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.max(10, Math.round(metres / 10) * 10)} m` : `${(metres / 1000).toFixed(1)} km`;
}
