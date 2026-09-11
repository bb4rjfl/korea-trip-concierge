/**
 * What every card the phone draws has in common: how far, how to get there,
 * and a line saying where the work was done.
 */

import type { DeviceTask } from "../../../../src/lib/deviceTask.js";
import type { Chip } from "../api.js";
import { DEVICE_STRINGS, fill, type Lang } from "./strings.js";

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface Point {
  lat: number;
  lng: number;
}

/** A place on a list the phone drew: how to say it, where it is, and its tourism-board id if it has one. */
export interface Listed {
  said: string;
  sign?: string;
  lat?: number;
  lng?: number;
  sight?: { id: string; type: number };
}

/** A card drawn on the phone — shown there and never sent anywhere. */
export interface DeviceCard {
  markdown: string;
  chips: Chip[];
  /** What the server's copy of the conversation reads in its place (src/lib/deviceTask.ts shownOnDevice). */
  local: string;
  /** The places listed, in order, so "the second one" can be read back on the phone. */
  places?: Listed[];
  /** A photo of the place, from the tourism board (ⓒ한국관광공사). */
  images?: { title: string; image: string }[];
}

/** Straight-line metres between two points. */
export function metres(a: Point, b: Point): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

const enc = encodeURIComponent;

/** A name safe inside a Kakao Map URL path, where commas and slashes are separators. */
const pathName = (s: string): string => enc(s.replace(/[,/]/g, " ").trim() || "📍");

/** Kakao Map, pinned at the place. */
export function kakaoPin(name: string, p: Point): string {
  return `https://map.kakao.com/link/map/${pathName(name)},${p.lat},${p.lng}`;
}

/** Kakao Map directions from the traveller's exact spot — on foot or by public transport. */
export function kakaoDirections(from: Point, fromName: string, name: string, to: Point, mode: "walk" | "traffic"): string {
  return `https://map.kakao.com/link/by/${mode}/${pathName(fromName)},${from.lat},${from.lng}/${pathName(name)},${to.lat},${to.lng}`;
}

/** Naver Map's app, with the route already planned from their spot. */
export function naverDirections(from: Point, fromName: string, name: string, to: Point, mode: "walk" | "public"): string {
  return (
    `nmap://route/${mode}?slat=${from.lat}&slng=${from.lng}&sname=${enc(fromName)}` +
    `&dlat=${to.lat}&dlng=${to.lng}&dname=${enc(name)}&appname=ktc.tacita.cloud`
  );
}

/** A search, centred on the traveller, in each map app — for when Kakao's directory cannot be reached. */
export function searchLinks(ko: string, at: Point, lang: Lang): string {
  const t = DEVICE_STRINGS[lang];
  return [
    `[${t.kakaoMap}](kakaomap://search?q=${enc(ko)}&p=${at.lat},${at.lng})`,
    `[${t.naverMap}](nmap://search?query=${enc(ko)}&appname=ktc.tacita.cloud)`,
    `[${t.googleMaps}](https://www.google.com/maps/search/${enc(ko)}/@${at.lat},${at.lng},16z)`,
  ].join(" · ");
}

/** "My location", as each map app will label the start. */
export const HERE_LABEL: Record<Lang, string> = { en: "My location", ko: "내 위치", ja: "現在地", zh: "我的位置" };

/** A button that plans a walk or ride to a place from where they are — on the phone. */
export function directionsChip(name: string, to: Point, lang: Lang): Chip {
  const task: DeviceTask = { kind: "route", to: name, dest: { lat: to.lat, lng: to.lng } };
  return { emoji: "🧭", cmdEn: fill(DEVICE_STRINGS[lang].chip.walkTo, { name }), locate: { task } };
}

/** A question to send, as an ordinary button. */
export function askChip(emoji: string, text: string): Chip {
  return { emoji, cmdEn: text };
}
