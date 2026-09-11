/**
 * "Where am I" on the phone, in words — the nearest station or landmark.
 *
 * The phone's answers to "near me" are worked out on the phone itself
 * (device/), from the same station table; this names the nearest place for
 * anything that wants to say roughly where the fix is.
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
