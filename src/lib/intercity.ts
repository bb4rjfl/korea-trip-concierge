/**
 * Intercity (city-to-city) travel grounding. Our live routing (ODsay) covers
 * metro-area subway/bus; it can't sensibly route Seoul→Busan. When a request
 * crosses cities (or targets a far city), we return curated guidance — which
 * mode (KTX/SRT, express bus, or a flight), rough time — plus booking deep links,
 * instead of a misleading "walk 138 min" result. Curated reference data (D-009),
 * not external grounding.
 */

import {
  trainsBetween,
  busesBetween,
  todayYmdKST,
  upcoming,
  type Departure,
} from "./sources/intercityApi.js";

interface City {
  keys: RegExp;
  label: string;
  // Best ways to get there FROM Seoul (most use Seoul as origin/destination).
  options: string[];
}

// Major intercity destinations a foreign visitor asks about (from/to Seoul).
const CITIES: City[] = [
  { keys: /\bbusan\b|부산|haeundae|해운대/i, label: "Busan", options: ["🚄 **KTX / SRT** to Busan Station — ~2h30–2h50 (the usual choice)", "🚌 Express bus — ~4h20", "✈️ Flight Gimpo→Gimhae (PUS) — ~1h"] },
  { keys: /\bdaegu\b|대구/i, label: "Daegu", options: ["🚄 **KTX / SRT** to Dongdaegu — ~1h45", "🚌 Express bus — ~3h30"] },
  { keys: /\bdaejeon\b|대전/i, label: "Daejeon", options: ["🚄 **KTX / SRT** to Daejeon — ~1h", "🚌 Express bus — ~2h"] },
  { keys: /\bgwangju\b|광주/i, label: "Gwangju", options: ["🚄 **KTX** to Gwangju-Songjeong — ~1h45", "🚌 Express bus — ~3h30"] },
  { keys: /\bgyeongju\b|경주/i, label: "Gyeongju", options: ["🚄 **KTX** to Singyeongju — ~2h", "🚌 Express bus — ~4h"] },
  { keys: /\bgangneung\b|강릉/i, label: "Gangneung", options: ["🚄 **KTX** (Gangneung line) — ~2h", "🚌 Express bus — ~2h40"] },
  { keys: /\bsokcho\b|속초/i, label: "Sokcho", options: ["🚌 **Express bus** — ~2h20 (no train to Sokcho)", "🚄 KTX to Gangneung then bus"] },
  { keys: /\bjeonju\b|전주/i, label: "Jeonju", options: ["🚄 **KTX** (via Iksan/Jeonju) — ~1h45", "🚌 Express bus — ~2h40"] },
  { keys: /\byeosu\b|여수/i, label: "Yeosu", options: ["🚄 **KTX** to Yeosu-Expo — ~3h", "🚌 Express bus — ~4h"] },
  { keys: /\bandong\b|안동/i, label: "Andong", options: ["🚄 **KTX** to Andong — ~2h", "🚌 Express bus — ~3h"] },
  { keys: /\bchuncheon\b|춘천/i, label: "Chuncheon", options: ["🚆 **ITX-Cheongchun** (Gyeongchun line) — ~1h20 from Yongsan/Cheongnyangni", "🚇 Subway Line (Gyeongchun) — ~1h50"] },
  { keys: /\bjeju\b|제주/i, label: "Jeju", options: ["✈️ **Flight only** — Gimpo (GMP) or Incheon (ICN) → Jeju (CJU), ~1h. There is **no train, bridge, or bus** to Jeju."] },
];

const SEOUL = /\bseoul\b|서울|incheon|인천|gimpo|김포|hongdae|gangnam|myeongdong|itaewon|강남|명동|홍대|이태원/i;

export interface IntercityHit {
  origin?: City;
  dest?: City;
}

/** Detect a cross-city trip. Returns the involved cities, or undefined for an
 *  intra-metro request our normal routing should handle. */
export function detectIntercity(from: string, to: string): IntercityHit | undefined {
  const origin = CITIES.find((c) => c.keys.test(from));
  const dest = CITIES.find((c) => c.keys.test(to));
  // A far city on either end, AND the two ends aren't the same city.
  if (dest && origin?.label !== dest.label) return { origin, dest };
  if (origin && origin.label !== dest?.label && SEOUL.test(to)) return { origin, dest };
  return undefined;
}

const BOOK_LINKS = [
  "**Book it:**",
  "- 🚄 KTX / SRT: [Korail (English)](https://www.letskorail.com/ebizbf/EbizbfForeign_pr16100.do) · [SRT](https://etk.srail.kr)",
  "- 🚌 Express bus: [Kobus (English)](https://www.kobus.co.kr/eng/main.do) · [Bustago](https://www.bustago.or.kr)",
  "- ✈️ Domestic flights: search **Gimpo (GMP)** or **Incheon (ICN)** → your destination",
];

/**
 * Render the intercity answer, with real departures when the national services
 * have them.
 *
 * "KTX, about 2 hours" is true and useless — someone deciding whether to go
 * needs the next train, what it costs, and whether the bus is worth the extra
 * two hours. The curated options stay as the fallback for a route the feeds
 * don't cover (and for Jeju, where the answer is "fly").
 */
export async function renderIntercity(from: string, to: string, hit: IntercityHit): Promise<string> {
  const far = hit.dest ?? hit.origin!;
  const dirNote = hit.dest
    ? `**${from} → ${to}** is an intercity trip — beyond city subway/bus.`
    : `**${from} → ${to}** is an intercity trip from ${hit.origin!.label} — beyond city subway/bus.`;

  const date = todayYmdKST();
  // No rail or road reaches Jeju; asking the feeds can only produce a wrong answer.
  const island = far.label === "Jeju";
  const [trains, buses] = island
    ? [[] as Departure[], [] as Departure[]]
    : await Promise.all([
        trainsBetween(from, to, date).catch(() => []),
        busesBetween(from, to, date).catch(() => []),
      ]);

  const line = (d: Departure): string =>
    `- **${d.grade}** ${d.depart} → ${d.arrive} _(${Math.floor(d.minutes / 60)}h${String(d.minutes % 60).padStart(2, "0")})_` +
    (d.fareWon ? ` · 💳 ₩${d.fareWon.toLocaleString()}` : "");

  const live: string[] = [];
  if (trains.length) {
    live.push("", `🚄 **Next trains today** (${trains.length} more running):`, ...upcoming(trains, 3).map(line));
  }
  if (buses.length) {
    live.push("", `🚌 **Next buses today** (${buses.length} more running):`, ...upcoming(buses, 2).map(line));
  }
  if (live.length) {
    // The feeds cover intercity rail and coach, not commuter rail or flights — so
    // the curated list stays underneath, or Chuncheon loses the ITX-Cheongchun
    // that is actually the best way to get there.
    live.push(
      "",
      `**Other ways to ${far.label}:**`,
      ...far.options.map((o) => `- ${o}`),
      "",
      "_Times and fares from national transport open data (ⓒ국토교통부); seats are not held until you book._",
    );
  }

  return [
    `🚄 ${dirNote}`,
    ...(live.length ? live : ["", `**Getting to ${far.label}:**`, ...far.options.map((o) => `- ${o}`)]),
    "",
    ...BOOK_LINKS,
    "",
    "_Once you arrive, ask me for the local subway/bus or a route within that city._",
  ].join("\n");
}
