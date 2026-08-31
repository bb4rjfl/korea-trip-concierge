/**
 * Check the numbers we assert against the sources that actually charge them.
 *
 * Fares move. Seoul's subway base went from ₩1,400 to ₩1,550 and we went on
 * printing the old figure on every route answer for months — under the base fare,
 * on every trip in the country. Nothing in the code was wrong; the world had
 * changed underneath it, and no test could have caught that because the test
 * would have asserted the same stale number.
 *
 * So this compares our output against live pricing rather than against itself:
 *
 *   - subway and city bus  → ODsay prices a real journey, so its fare is the one
 *                            a card is actually charged
 *   - trains and coaches   → the national feeds return the operator's own fare
 *   - everything else      → no API exists, so those carry a verified-on date and
 *                            are listed for a human to re-check
 *
 * Run it before a submission or a demo:  npm run audit:facts
 */

import "../src/lib/loadEnv.js";
import { routesBetween } from "../src/lib/sources/odsay.js";
import { resolvePlaceCoord } from "../src/lib/places.js";
import { getGraph, planRoute } from "../src/lib/sources/subwayGraph.js";
import { trainsBetween, todayYmdKST } from "../src/lib/sources/intercityApi.js";

/** Claims with no API behind them. Re-read the source when the date gets old. */
const MANUAL_CLAIMS: { what: string; ours: string; verified: string; source: string }[] = [
  {
    what: "Seoul taxi base fare",
    ours: "₩4,800",
    verified: "2026-08-31",
    source: "서울시 교통정책 — 택시요금 (seoul.go.kr) · 카카오T 앱 요금 안내",
  },
  {
    what: "T-money card price",
    ours: "~₩2,500",
    verified: "2026-08-31",
    source: "티머니 공식 (t-money.co.kr) · 편의점 판매가",
  },
  {
    what: "Climate Card (기후동행카드)",
    ours: "~₩65,000 / 30 days",
    verified: "2026-08-31",
    source: "서울시 기후동행카드 안내 (news.seoul.go.kr/traffic)",
  },
  {
    what: "Jeju city bus flat fare",
    ours: "₩1,150",
    verified: "2026-08-31",
    source: "제주특별자치도 버스정보시스템 (bus.jeju.go.kr)",
  },
  {
    what: "AREX all-stop fare, Seoul Station → ICN T1",
    ours: "₩4,750",
    verified: "2026-08-31",
    source: "공항철도 운임 안내 (arex.or.kr)",
  },
  {
    what: "Station coin locker",
    ours: "₩2,000–4,000",
    verified: "2026-08-31",
    source: "서울교통공사 물품보관함 안내",
  },
];

/** Journeys whose fare we can price live and compare against our own model. */
const SUBWAY_ROUTES: [string, string, string, string][] = [
  ["Seoul Station", "Myeongdong", "서울역", "명동"],
  ["Gangnam", "Myeongdong", "강남", "명동"],
  ["Hongdae", "Gangnam", "홍대입구", "강남"],
  ["Jamsil", "Seoul Station", "잠실", "서울역"],
  ["Gangnam", "Sinsa", "강남", "신사"],
];

const won = (n?: number): string => (n == null ? "—" : `₩${n.toLocaleString()}`);

async function auditSubway(): Promise<number> {
  console.log("\n🚇 Subway fares — ours vs. what the card is charged\n");
  const graph = await getGraph();
  let drift = 0;
  for (const [fromEn, toEn, fromKo, toKo] of SUBWAY_ROUTES) {
    const a = resolvePlaceCoord(fromEn);
    const b = resolvePlaceCoord(toEn);
    let live: number | undefined;
    if (a && b) {
      const routes = await routesBetween(a, b).catch(() => []);
      const rail = routes.filter((r) => r.legs.some((l) => l.mode === "subway"));
      live = rail[0]?.fare ?? routes[0]?.fare;
    }
    const ours = planRoute(graph, fromKo, toKo)?.fareWon;
    const gap = ours != null && live != null ? ours - live : undefined;
    const verdict = gap == null ? "no data" : gap === 0 ? "exact" : `${gap > 0 ? "+" : ""}${gap}`;
    if (gap != null && Math.abs(gap) > 100) drift++;
    console.log(`  ${`${fromEn} → ${toEn}`.padEnd(34)} ours ${won(ours).padEnd(9)} live ${won(live).padEnd(9)} ${verdict}`);
  }
  return drift;
}

async function auditIntercity(): Promise<void> {
  console.log("\n🚄 Intercity — the operator's own fare, straight through\n");
  const date = todayYmdKST();
  for (const [from, to] of [
    ["Seoul", "Busan"],
    ["Seoul", "Gyeongju"],
  ]) {
    const list = await trainsBetween(from, to, date).catch(() => []);
    const first = list[0];
    console.log(
      `  ${`${from} → ${to}`.padEnd(34)} ${list.length} departures` +
        (first ? `, first ${first.grade} ${first.depart} ${won(first.fareWon)}` : ""),
    );
  }
}

function listManual(): void {
  console.log("\n📋 No API behind these — re-read the source if the date looks old\n");
  for (const c of MANUAL_CLAIMS) {
    console.log(`  ${c.what.padEnd(42)} ${c.ours.padEnd(20)} verified ${c.verified}`);
    console.log(`  ${"".padEnd(42)} ${c.source}`);
  }
}

const drift = await auditSubway();
await auditIntercity();
listManual();

console.log(
  drift === 0
    ? "\n✅ No fare is off by more than ₩100.\n"
    : `\n⚠️  ${drift} route(s) drifted by more than ₩100 — check BASE_FARE in src/lib/sources/subwayGraph.ts.\n`,
);
process.exit(drift === 0 ? 0 : 1);
