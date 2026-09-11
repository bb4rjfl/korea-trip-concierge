/**
 * "What's worth seeing around me", from the tourism board's own listings,
 * measured on the phone.
 *
 * The phone downloads the whole list for its language — the same file for
 * every visitor (src/lib/sources/sightsIndex.ts) — and picks what is near. A
 * search around its position would have told the server the position.
 */

import type { SightsTask } from "../../../../src/lib/deviceTask.js";
import { shownOnDevice } from "../../../../src/lib/deviceTask.js";
import { DEVICE_STRINGS, distance, fill, walkMinutes, type Lang } from "./strings.js";
import { askChip, directionsChip, kakaoDirections, kakaoPin, metres, HERE_LABEL, type DeviceCard, type Fix } from "./card.js";
import type { Chip } from "../api.js";

/** [content id, title, lat × 10⁵, lng × 10⁵, content type, has a photo] — see sightsIndex.ts. */
export type SightRow = [string, string, number, number, number, 0 | 1];

const files = new Map<Lang, Promise<SightRow[]>>();

function listings(lang: Lang): Promise<SightRow[]> {
  let p = files.get(lang);
  if (!p) {
    p = fetch(`/api/sights/${lang}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ rows: SightRow[] }>) : { rows: [] }))
      .then((f) => f.rows ?? [])
      .catch(() => []);
    files.set(lang, p);
    // A failed download is retried next time rather than remembered.
    void p.then((rows) => {
      if (!rows.length) files.delete(lang);
    });
  }
  return p;
}

const HOSPITAL = /병원|의원|치과|hospital|clinic|病院|医院|醫院|診療|诊所/i;
/** Walking distance, then a bus ride's worth when the walk turns up too little. */
const NEAR_M = 1500;
const FAR_M = 4000;
const SHOWN = 6;

export interface Sight {
  id: string;
  title: string;
  lat: number;
  lng: number;
  type: number;
  photo: boolean;
  m: number;
}

/**
 * The sights worth listing from here: within a walk if there are enough,
 * further if not. Listings with a photo are, with few exceptions, the ones
 * worth the walk, so a listing without one has to be much nearer to beat one.
 */
export function pickSights(rows: SightRow[], at: Fix, medical = false): { picked: Sight[]; reach: number } {
  const all: Sight[] = [];
  for (const [id, title, lat5, lng5, type, photo] of rows) {
    if (!medical && HOSPITAL.test(title)) continue;
    const p = { lat: lat5 / 1e5, lng: lng5 / 1e5 };
    const m = metres(at, p);
    if (m > FAR_M) continue;
    all.push({ id, title, ...p, type, photo: photo === 1, m });
  }
  const within = (reach: number) => all.filter((s) => s.m <= reach);
  const reach = within(NEAR_M).length >= 3 ? NEAR_M : FAR_M;
  const score = (s: Sight) => s.m * (s.photo ? 1 : 1.8);
  const picked = within(reach)
    .sort((a, b) => score(a) - score(b))
    .slice(0, SHOWN)
    .sort((a, b) => a.m - b.m);
  return { picked, reach };
}

function kindLabel(type: number, lang: Lang): string {
  const k = DEVICE_STRINGS[lang].kind;
  if (type === 78 || type === 14) return k.culture;
  if (type === 75 || type === 28) return k.leisure;
  return k.attraction;
}

const CREDIT: Record<Lang, string> = {
  en: "_Listings: Korea Tourism Organization (ⓒ한국관광공사)._",
  ko: "_출처: 한국관광공사 관광정보 (ⓒ한국관광공사)._",
  ja: "_出典：韓国観光公社（ⓒ한국관광공사）_",
  zh: "_来源：韩国观光公社（ⓒ한국관광공사）_",
};

export async function runSights(task: SightsTask, at: Fix, lang: Lang): Promise<DeviceCard> {
  const t = DEVICE_STRINGS[lang];
  const rows = await listings(lang);
  const { picked, reach } = pickSights(rows, at, task.medical);
  const lines = picked.map((s, i) => {
    const links = [`[${t.kakaoMap}](${kakaoPin(s.title, s)})`, `[${t.walkThere}](${kakaoDirections(at, HERE_LABEL[lang], s.title, s, "walk")})`];
    return [
      `**${i + 1}. ${s.title}**`,
      `   ${kindLabel(s.type, lang)} · ${fill(t.walk, { m: distance(s.m, lang), min: walkMinutes(s.m) })}`,
      `   ${links.join(" · ")}`,
    ].join("\n");
  });
  const note = !rows.length
    ? t.listingsDown
    : !picked.length
      ? fill(t.noneNear, { m: distance(FAR_M, lang) })
      : reach > NEAR_M
        ? fill(t.widened, { near: distance(NEAR_M, lang), far: distance(reach, lang) })
        : undefined;
  const markdown = [
    `**${t.sights}** · _${t.nearestFirst}_`,
    ...(note ? ["", note] : []),
    "",
    ...lines,
    ...(task.tip ? ["", task.tip] : []),
    "",
    CREDIT[lang],
    t.onDevice,
  ].join("\n");
  const first = picked[0];
  // "Tell me about" the first one by its id — the listing the card showed, not a search for its name.
  const about = (s: Sight): Chip => ({
    emoji: "ℹ️",
    cmdEn: fill(t.chip.about, { name: s.title }),
    locate: { task: { kind: "sight", id: s.id, type: s.type, title: s.title, lat: s.lat, lng: s.lng } },
  });
  const chips = [...(first ? [about(first), directionsChip(first.title, first, lang)] : []), askChip("🍽️", t.chip.food)];
  return {
    markdown,
    chips,
    local: shownOnDevice(task),
    places: picked.map((s) => ({ said: s.title, lat: s.lat, lng: s.lng, sight: { id: s.id, type: s.type } })),
  };
}
