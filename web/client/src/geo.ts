/**
 * On-device "near me" snap. Privacy by construction (LBS-compliant): the GPS
 * coordinate is compared against the bundled landmark index RIGHT HERE in the
 * browser and only the matched place NAME is ever sent to the server.
 */

import { PLACES, type GeoPlace } from "../../../src/lib/places.js";

const R = 6371; // km

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface NearestHit {
  label: string;
  km: number;
}

export function nearestPlace(lat: number, lng: number): NearestHit | null {
  let best: { p: GeoPlace; km: number } | null = null;
  for (const p of PLACES) {
    const km = haversineKm(lat, lng, p.lat, p.lng);
    if (!best || km < best.km) best = { p, km };
  }
  if (!best) return null;
  return { label: best.p.label, km: Math.round(best.km * 10) / 10 };
}
