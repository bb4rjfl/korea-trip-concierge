/**
 * "The nearest pharmacy", answered on the phone from Kakao's own directory.
 *
 * Measured against what the server used to do (search two other directories
 * around the position the phone sent): at twelve spot-and-need pairs, Kakao
 * found a closer place nine times and the same place the other three, in a
 * quarter of the time — its category codes know a 약국 from an Olive Young, and
 * its distances are its own. Now it is also the only way that works, because
 * the position stays here.
 */

import type { NearbyNeed, NearbyTask } from "../../../../src/lib/deviceTask.js";
import { shownOnDevice } from "../../../../src/lib/deviceTask.js";
import type { Chip } from "../api.js";
import { kakaoSdk, searchAround, type KakaoPlace } from "./kakao.js";
import { sayName } from "./names.js";
import { DEVICE_STRINGS, categoryLabel, distance, fill, walkMinutes, type Lang } from "./strings.js";
import { askChip, directionsChip, kakaoDirections, metres, searchLinks, HERE_LABEL, type DeviceCard, type Fix } from "./card.js";

/** Only a 약국 sells medicine; these are the lookalikes a traveller with a fever walks into. */
const IS_A_PHARMACY = /약국/;
const HEALTH_AND_BEAUTY = /올리브영|랄라블라|롭스|시코르|부츠/;
/** Never on a family surface. */
const ADULT = /룸\s?싸롱|룸\s?살롱|풀\s?싸롱|단란|안마|유흥|텐프로|레깅스룸|성인|키스방|노래클럽/;
/** For a utility, the cafés and restaurants a keyword drags in. */
const FOOD_CODES = new Set(["FD6", "CE7"]);

const SHOWN = 6;

export interface Found {
  place: KakaoPlace;
  m: number;
}

/**
 * Merge what each query found into one list: one row per place, only what the
 * need asks for, within reach, in the order the need wants.
 */
export function shortlist(task: NearbyTask, runs: KakaoPlace[][], at: Fix, radius = task.radius): Found[] {
  const seen = new Set<string>();
  const out: Found[] = [];
  // Popular order is Kakao's own ranking, so take the runs in turn rather than
  // letting the first query's list crowd out the second's best.
  const longest = Math.max(0, ...runs.map((r) => r.length));
  for (let i = 0; i < longest; i++) {
    for (const run of runs) {
      const p = run[i];
      if (!p || seen.has(p.id)) continue;
      seen.add(p.id);
      const hay = `${p.place_name} ${p.category_name}`;
      if (ADULT.test(hay)) continue;
      if (task.pharmacyOnly && (!IS_A_PHARMACY.test(p.place_name) || HEALTH_AND_BEAUTY.test(p.place_name))) continue;
      if (task.noFood && (FOOD_CODES.has(p.category_group_code) || /음식점|카페/.test(p.category_name))) continue;
      const m = Number(p.distance) || metres(at, { lat: Number(p.y), lng: Number(p.x) });
      if (!(m <= radius)) continue;
      out.push({ place: p, m });
    }
  }
  return task.order === "distance" ? out.sort((a, b) => a.m - b.m).slice(0, SHOWN) : out.slice(0, SHOWN);
}

/** A second thing a traveller in the same spot tends to need next. */
const NEXT_NEED: Partial<Record<NearbyNeed, keyof (typeof DEVICE_STRINGS)["en"]["chip"]>> = {
  pharmacy: "convenience",
  emergency: "pharmacy",
  convenience: "pharmacy",
  toilet: "convenience",
  food: "sightsNear",
  cafe: "sightsNear",
  foreignCardDining: "sightsNear",
  vegan: "sightsNear",
};

function render(task: NearbyTask, found: Found[], at: Fix, lang: Lang, note?: string): DeviceCard {
  const t = DEVICE_STRINGS[lang];
  const places = found.map(({ place }) => sayName(place.place_name, lang));
  const lines = found.map(({ place, m }, i) => {
    const name = places[i];
    const sign = name.sign ? ` · ${name.sign}` : "";
    const kind = categoryLabel(place.category_name, lang);
    const to = { lat: Number(place.y), lng: Number(place.x) };
    const links = [
      `[${t.kakaoMap}](${place.place_url.replace(/^http:/, "https:")})`,
      `[${t.walkThere}](${kakaoDirections(at, HERE_LABEL[lang], name.sign ?? name.said, to, "walk")})`,
      place.phone ? `☎ [${place.phone}](tel:${place.phone.replace(/[^\d+]/g, "")})` : "",
    ].filter(Boolean);
    return [
      `**${i + 1}. ${name.said}**${sign}`,
      `   ${kind ? `${kind} · ` : ""}${fill(t.walk, { m: distance(m, lang), min: walkMinutes(m) })}`,
      `   ${links.join(" · ")}`,
    ].join("\n");
  });
  const order = task.order === "distance" ? t.nearestFirst : t.popularFirst;
  const markdown = [
    `**${t.near[task.need]}** · _${order}_`,
    ...(note ? ["", note] : []),
    "",
    ...lines,
    ...(task.tip ? ["", task.tip] : []),
    "",
    t.onDevice,
  ].join("\n");

  const chips: Chip[] = [];
  const first = found[0];
  if (first) chips.push(directionsChip(places[0].sign ?? places[0].said, { lat: Number(first.place.y), lng: Number(first.place.x) }, lang));
  const next = NEXT_NEED[task.need];
  if (next) chips.push(askChip(next === "sightsNear" ? "🏛️" : next === "pharmacy" ? "💊" : "🏪", t.chip[next]));
  if (task.need !== "food" && task.need !== "foreignCardDining") chips.push(askChip("🍽️", t.chip.food));
  const listed = found.map(({ place }, i) => ({ ...places[i], lat: Number(place.y), lng: Number(place.x) }));
  return { markdown, chips: chips.slice(0, 3), local: shownOnDevice(task), places: listed };
}

/** Kakao unreachable, or no key yet: the same search, centred on them, in the map apps. */
function fallback(task: NearbyTask, at: Fix, lang: Lang): DeviceCard {
  const t = DEVICE_STRINGS[lang];
  const markdown = [
    `**${t.near[task.need]}**`,
    "",
    t.mapsFallback,
    searchLinks(task.searchKo, at, lang),
    ...(task.tip ? ["", task.tip] : []),
    "",
    t.onDevice,
  ].join("\n");
  return { markdown, chips: [askChip("🍽️", t.chip.food)], local: shownOnDevice(task) };
}

export async function runNearby(task: NearbyTask, at: Fix, lang: Lang): Promise<DeviceCard> {
  const k = await kakaoSdk();
  if (!k) return fallback(task, at, lang);
  const search = (radius: number) =>
    Promise.all(task.queries.map((q) => searchAround(k, q, at, radius, task.order))).then((runs) =>
      shortlist(task, runs, at, radius),
    );
  let found = await search(task.radius);
  let note: string | undefined;
  // Nothing within the usual reach is not "nothing": say so, and look further.
  if (!found.length) {
    const far = Math.min(20_000, task.radius * 3);
    found = await search(far);
    const t = DEVICE_STRINGS[lang];
    note = found.length
      ? fill(t.widened, { near: distance(task.radius, lang), far: distance(far, lang) })
      : `${fill(t.noneNear, { m: distance(far, lang) })} ${t.mapsFallback}\n${searchLinks(task.searchKo, at, lang)}`;
  }
  return render(task, found, at, lang, note);
}
