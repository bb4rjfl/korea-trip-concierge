/**
 * "Is the second one open late?" — after a list the phone drew.
 *
 * The server never saw that list (it says where the traveller is), so "the
 * second one" would mean nothing to it. The phone does know. Where it can
 * answer by itself it does — the way to the second one, or the second sight in
 * full — and otherwise it puts the name into the question, visibly, in the
 * traveller's own bubble, so what is sent is exactly what they can read: a
 * place they chose to ask about.
 */

import type { DeviceTask } from "../../../../src/lib/deviceTask.js";
import type { Listed } from "./card.js";

const WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  "1st": 1, "2nd": 2, "3rd": 3, "4th": 4, "5th": 5, "6th": 6,
  첫: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6,
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6,
  "１": 1, "２": 2, "３": 3, "４": 4, "５": 5, "６": 6,
};

const ORDINAL: RegExp[] = [
  /\b(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th)\b(?:\s+(?:one|place|pharmacy|shop|store|restaurant|cafe|option))?/i,
  /(?:#|no\.?\s?|number\s+)([1-6])\b/i,
  /(첫|두|세|네|다섯|여섯)\s*번째/,
  /([1-6])\s*번(?:째)?(?!\s*(?:출구|버스|국도))/,
  /([1-6１-６一二三四五六])\s*(?:番目|つ目)/,
  /第\s*([1-6一二三四五六])\s*(?:个|家|個|間)?/,
];

/** The way there, rather than something about it. */
const THE_WAY =
  /\b(?:get|go|walk|head)\s+(?:to|there)\b|\bhow\s+(?:do|can)\s+i\s+get\b|\bdirections?\b|\broute\b|\bhow far\b|가는\s*(?:길|법|방법)|어떻게\s*가|길\s*찾|얼마나\s*걸|行き方|どうやって行|どのくらい|怎么(?:走|去)|怎麼(?:走|去)|路线|路線|多远|多遠/i;

/** The place a question points at in the list, if it points at one — 1-based as people count. */
export function pickedIndex(text: string): number | undefined {
  for (const re of ORDINAL) {
    const m = re.exec(text ?? "");
    if (!m) continue;
    const w = m[1].toLowerCase();
    const n = WORDS[w] ?? Number(w);
    if (n >= 1 && n <= 6) return n;
  }
  return undefined;
}

/**
 * Work the phone can do for a question about one place on its list: the way
 * there, from where they are; or, for a sight, its listing in full. Undefined
 * when the question needs the server — then pickedPlace() names it instead.
 */
export function pickedTask(text: string, places: Listed[] | undefined): DeviceTask | undefined {
  const n = places?.length ? pickedIndex(text) : undefined;
  const p = n ? places![n - 1] : undefined;
  if (!p || p.lat == null || p.lng == null) return undefined;
  const name = p.sign ?? p.said;
  if (THE_WAY.test(text)) return { kind: "route", to: name, dest: { lat: p.lat, lng: p.lng } };
  if (p.sight) return { kind: "sight", id: p.sight.id, type: p.sight.type, title: p.said, lat: p.lat, lng: p.lng };
  return undefined;
}

/**
 * The question with the place named, when it points at one on the list and
 * does not name it already. Otherwise the question, unchanged.
 */
export function pickedPlace(text: string, places: Listed[] | undefined): string {
  if (!places?.length) return text;
  const n = pickedIndex(text);
  const p = n ? places[n - 1] : undefined;
  if (!p) return text;
  const name = p.sign ?? p.said;
  if (text.includes(name) || text.includes(p.said)) return text;
  return p.sign ? `${text} (${p.said} · ${p.sign})` : `${text} (${p.said})`;
}
