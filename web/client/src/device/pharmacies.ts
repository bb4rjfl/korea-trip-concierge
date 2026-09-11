/**
 * "Where's a pharmacy that's open?" — answered on the phone from every
 * pharmacy's opening hours.
 *
 * The phone downloads the National Medical Center's list — every pharmacy in
 * Korea with its hours, the same file for everyone (src/lib/sources/
 * pharmacyIndex.ts) — and works out which near it is open now. At night that
 * is the whole question: the nearest pharmacy is no use if it shut at seven.
 */

import type { NearbyTask } from "../../../../src/lib/deviceTask.js";
import { shownOnDevice } from "../../../../src/lib/deviceTask.js";
import { koreaNow, openState, type OpenState } from "../../../../src/lib/pharmacyHours.js";
import type { Chip } from "../api.js";
import { sayName } from "./names.js";
import { DEVICE_STRINGS, distance, fill, walkMinutes, type Lang } from "./strings.js";
import { askChip, directionsChip, kakaoDirections, kakaoPin, metres, HERE_LABEL, type DeviceCard, type Fix } from "./card.js";

interface PharmacyFile {
  weeks: string[];
  holidays: string[];
  rows: [number, number, string, string, number][];
}

let file: Promise<PharmacyFile | undefined> | undefined;

function pharmacies(): Promise<PharmacyFile | undefined> {
  file ??= fetch("/api/pharmacies")
    .then((r) => (r.ok ? (r.json() as Promise<PharmacyFile>) : undefined))
    .catch(() => undefined)
    .then((f) => {
      if (!f?.rows?.length) file = undefined; // try again next time
      return f?.rows?.length ? f : undefined;
    });
  return file;
}

export interface NearPharmacy {
  name: string;
  tel: string;
  lat: number;
  lng: number;
  m: number;
  state: OpenState;
}

/**
 * The ones to show: open ones first, nearest first — reaching further at night
 * when nothing within a walk is open — then the nearest closed ones, with when
 * they open, so the list is never empty of something to do.
 */
export function pickPharmacies(f: PharmacyFile, at: Fix, now = Date.now()): { list: NearPharmacy[]; reach: number; anyOpen: boolean } {
  const k = koreaNow(now);
  const today = f.holidays.includes(k.ymd);
  const yesterday = f.holidays.includes(k.yesterdayYmd);
  const all: NearPharmacy[] = [];
  for (const [la, ln, name, tel, w] of f.rows) {
    const p = { lat: la / 1e5, lng: ln / 1e5 };
    // A cheap box first: a degree of latitude is 111 km.
    if (Math.abs(p.lat - at.lat) > 0.05 || Math.abs(p.lng - at.lng) > 0.06) continue;
    const m = metres(at, p);
    if (m > 5000) continue;
    all.push({ name, tel, ...p, m, state: openState(f.weeks[w] ?? "", k.day, k.minute, today, yesterday) });
  }
  all.sort((a, b) => a.m - b.m);
  const openWithin = (r: number) => all.filter((p) => p.state.open && p.m <= r);
  const reach = openWithin(1500).length >= 2 ? 1500 : 5000;
  const open = openWithin(reach).slice(0, 5);
  const closed = all.filter((p) => !p.state.open && p.m <= 1500).slice(0, open.length ? 2 : 4);
  return { list: [...open, ...closed].slice(0, 6), reach, anyOpen: open.length > 0 };
}

function statusLine(s: OpenState, lang: Lang): string {
  const rx = DEVICE_STRINGS[lang].rx;
  if (s.open) return s.allDay ? rx.allDay : `${rx.open} · ${fill(rx.until, { t: s.until ?? "" })}`;
  if (s.opens) return fill(s.opensLater ? rx.closedLater : rx.closedOpens, { t: s.opens });
  return rx.closed;
}

/** The card, or undefined when the hours are not available — then Kakao's directory answers instead. */
export async function runPharmacies(task: NearbyTask, at: Fix, lang: Lang): Promise<DeviceCard | undefined> {
  const f = await pharmacies();
  if (!f) return undefined;
  const t = DEVICE_STRINGS[lang];
  const { list, reach, anyOpen } = pickPharmacies(f, at);
  if (!list.length) return undefined;
  const places = list.map((p) => sayName(p.name, lang));
  const lines = list.map((p, i) => {
    const name = places[i];
    const links = [
      `[${t.kakaoMap}](${kakaoPin(p.name, p)})`,
      `[${t.walkThere}](${kakaoDirections(at, HERE_LABEL[lang], p.name, p, "walk")})`,
      p.tel ? `☎ [${p.tel}](tel:${p.tel.replace(/[^\d+]/g, "")})` : "",
    ].filter(Boolean);
    return [
      `**${i + 1}. ${name.said}**${name.sign ? ` · ${name.sign}` : ""}`,
      `   ${statusLine(p.state, lang)} · ${fill(t.walk, { m: distance(p.m, lang), min: walkMinutes(p.m) })}`,
      `   ${links.join(" · ")}`,
    ].join("\n");
  });
  const markdown = [
    `**${t.near.pharmacy}** · _${t.rx.openFirst}_`,
    ...(anyOpen ? [] : ["", fill(t.rx.noneOpen, { m: distance(reach, lang) })]),
    "",
    ...lines,
    ...(task.tip ? ["", task.tip] : []),
    "",
    t.rx.credit,
    t.onDevice,
  ].join("\n");
  const firstOpen = list.find((p) => p.state.open) ?? list[0];
  const chips: Chip[] = [
    directionsChip(sayName(firstOpen.name, lang).sign ?? firstOpen.name, firstOpen, lang),
    askChip("🏪", t.chip.convenience),
  ];
  return {
    markdown,
    chips,
    local: shownOnDevice(task),
    places: list.map((p, i) => ({ ...places[i], lat: p.lat, lng: p.lng })),
  };
}
