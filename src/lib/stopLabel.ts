/**
 * A bus stop's name, as a visitor can use it.
 *
 * Machine romanization of a whole stop sign gave "Suwonyeok 10 Beonchulgu.
 * Heonhyeoluijip" and "Jejugukjegonghang 1(Pyoseon,Seongsan,Namwon)" — neither
 * readable nor matchable against anything. A stop sign names the place first
 * and a second landmark or the lines it serves after a dot or a bracket, and
 * most of what is on it is a handful of words: station, exit, entrance,
 * terminal, market. So the first name is translated where it is a known word
 * and romanized where it is a name, and the full Korean — the thing to match
 * against the sign and the bus screen — follows in brackets.
 */

import { romanizeHangul } from "./romanize.js";

const WORDS: [RegExp, string][] = [
  [/(\d+)\s*번\s*출구/g, " Exit $1 "],
  [/국제공항/g, " Int'l Airport "],
  [/시외버스터미널/g, " Intercity Bus Terminal "],
  [/고속버스터미널/g, " Express Bus Terminal "],
  [/종합버스터미널|버스터미널|터미널/g, " Bus Terminal "],
  [/공항/g, " Airport "],
  [/환승센터/g, " Transfer Center "],
  [/승강장/g, " Bay "],
  // Only the word station — not the 역 inside 역전시장.
  [/역(?=$|\d|앞|\s|\[)/g, " Station "],
  [/입구/g, " Entrance "],
  [/해수욕장/g, " Beach "],
  [/선착장/g, " Pier "],
  [/시장/g, " Market "],
  [/매표소/g, " Ticket Office "],
  [/주차장/g, " Car Park "],
  [/사거리|삼거리|교차로/g, " Junction "],
  [/앞$/g, ""],
  [/\[동\]/g, " (east side)"],
  [/\[서\]/g, " (west side)"],
  [/\[남\]/g, " (south side)"],
  [/\[북\]/g, " (north side)"],
];

export function busStopLabel(ko: string): string {
  const raw = (ko ?? "").trim();
  if (!/[가-힣]/.test(raw)) return raw;
  let head = raw.split(/[.·(]/)[0] || raw;
  for (const [re, en] of WORDS) head = head.replace(re, en);
  const en = romanizeHangul(head).replace(/\s{2,}/g, " ").trim();
  return en && en !== raw ? `${en} (${raw})` : raw;
}
