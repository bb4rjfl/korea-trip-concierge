/**
 * "Where am I" on the phone — loaded only the first time location is used.
 *
 * The station table is most of this chunk (26 KB compressed), and a visitor on
 * roaming data who never asks "near me" should not pay for it. The phone uses
 * it to say, in words, roughly where the fix is ("near Yangjae Station"); the
 * answer itself is built on the server from the exact coordinates.
 */

import { findPlaceInText } from "../../../src/lib/places.js";
import { nearestPlace, type Located } from "../../../src/lib/nearest.js";
import type { Lang } from "./api.js";

export { findPlaceInText, type Located };

export function locate(lat: number, lng: number, lang: Lang): Located | null {
  return nearestPlace(lat, lng, lang);
}

/** "320 m" or "1.4 km" — how a person says a distance. */
export function formatDistance(metres: number): string {
  return metres < 1000 ? `${Math.max(10, Math.round(metres / 10) * 10)} m` : `${(metres / 1000).toFixed(1)} km`;
}
