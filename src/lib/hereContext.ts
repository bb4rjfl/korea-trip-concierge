/**
 * Where the traveller is standing, for the length of one request.
 *
 * The web client sends the phone's GPS fix with a question when the traveller
 * has allowed it, and a map app's answers are built from that point: what is
 * nearest to *you*, how far each thing is from *you*, a route that starts with
 * "walk 400 m to…". The tools are MCP tools with fixed schemas, so the position
 * rides in request-scoped storage rather than as an argument — invisible to the
 * MCP server, which never sets it, and gone when the request ends. Nothing here
 * is written anywhere.
 *
 * Server-only (node:async_hooks); the client uses src/lib/here.ts.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { haversineKm } from "./courses.js";

export interface Here {
  lat: number;
  lng: number;
  /** Metres, as the phone reports it. */
  accuracy?: number;
}

const store = new AsyncLocalStorage<Here>();

/**
 * The value a place slot holds when it means "where the traveller is". Plain
 * English on purpose: it is printed in cards ("Pharmacy near your current
 * location") and the translation layer renders it in the reader's language.
 */
export const HERE_AREA = "your current location";

/** Run `fn` with the traveller's position available to every tool it calls. */
export function withHere<T>(here: Here | undefined, fn: () => Promise<T>): Promise<T> {
  return here ? store.run(here, fn) : fn();
}

/** The traveller's position, if this request has one. */
export function getHere(): Here | undefined {
  return store.getStore();
}

/** Does this slot value mean "here" — and do we actually know where that is? */
export function isHere(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === HERE_AREA && Boolean(getHere());
}

/** Metres from the traveller to a point, when we know where they are. */
export function metresFromHere(lat?: number, lng?: number): number | undefined {
  const here = getHere();
  if (!here || lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return Math.round(haversineKm(here, { lat, lng }) * 1000);
}

/** "80 m", "1.2 km" — how a map app says it. */
export function distanceLabel(metres: number): string {
  return metres < 1000 ? `${Math.max(10, Math.round(metres / 10) * 10)} m` : `${(metres / 1000).toFixed(1)} km`;
}

/**
 * A position from a request body, or undefined if it is not one. Bounded to
 * Korea: this service answers there, and a fix outside it is either a VPN, a
 * spoof, or someone planning from home — none of whom "near me" can serve.
 */
export function parseHere(raw: unknown): Here | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  if (lat < 33 || lat > 38.9 || lng < 124.5 || lng > 131.9) return undefined;
  const accuracy = Number(r.accuracy);
  return {
    // Four decimals is about ten metres — as precise as a phone's fix is honest.
    lat: Math.round(lat * 1e4) / 1e4,
    lng: Math.round(lng * 1e4) / 1e4,
    ...(Number.isFinite(accuracy) && accuracy > 0 && accuracy < 20000 ? { accuracy: Math.round(accuracy) } : {}),
  };
}
