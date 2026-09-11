/**
 * Build the subway networks outside the capital — Busan, Daegu, Gwangju,
 * Daejeon — for the phone's route planner (web/client/src/device/networks.ts).
 *
 * The capital's network comes from Seoul Open Data; the other cities publish
 * theirs separately and in different shapes, but the routing service we already
 * use (ODsay) knows every one: each station with its coordinates, its
 * neighbours along the line and its transfers. Walking each line from a seed
 * station gives the whole network.
 *
 * Economical with the daily call allowance: every call returns the station and
 * both its neighbours, so the walk calls every other station — guessing the
 * next-but-one id and checking it really is next-but-one — and falls back to
 * the neighbour itself whenever the guess is wrong. Responses are cached on
 * disk, so a rerun costs nothing.
 *
 *   npx tsx --env-file=.env scripts/build-regional-subway.ts
 *
 * Output: src/lib/data/regionalSubway.json (committed; the phone loads it only
 * when it plans a route).
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const KEY = (process.env.TRANSIT_API_KEY ?? "").trim();
const CACHE = path.resolve("scripts/.cache/odsay");
mkdirSync(CACHE, { recursive: true });

interface Near {
  stationName: string;
  stationNameKor?: string;
  stationID: number;
  laneNameKor?: string;
  laneCityKor?: string;
  x?: number;
  y?: number;
}
interface Info extends Near {
  prevOBJ?: { station?: Near[] };
  nextOBJ?: { station?: Near[] };
  exOBJ?: { station?: Near[] };
}

let calls = 0;
async function info(id: number): Promise<Info | undefined> {
  const file = path.join(CACHE, `${id}.json`);
  if (existsSync(file)) {
    const cached = JSON.parse(readFileSync(file, "utf8")) as { result?: Info };
    return cached.result;
  }
  calls++;
  const r = await fetch(`https://api.odsay.com/v1/api/subwayStationInfo?lang=1&stationID=${id}&apiKey=${encodeURIComponent(KEY)}`);
  const j = (await r.json()) as { result?: Info; error?: unknown };
  if (j.error) {
    const msg = JSON.stringify(j.error);
    // A station id that does not exist is an answer; anything else (the daily
    // allowance, a bad key) stops the build rather than writing half a network.
    if (!/station|존재|invalid|-8|500/i.test(msg) || /limit|초과|quota/i.test(msg)) throw new Error(`ODsay: ${msg}`);
    writeFileSync(file, JSON.stringify({}));
    return undefined;
  }
  writeFileSync(file, JSON.stringify(j));
  await new Promise((res) => setTimeout(res, 120));
  return j.result;
}

async function seed(name: string, cid: number): Promise<number[]> {
  const file = path.join(CACHE, `seed-${cid}-${name}.json`);
  let j: { result?: { station?: { stationID: number; stationClass: number }[] } };
  if (existsSync(file)) j = JSON.parse(readFileSync(file, "utf8"));
  else {
    calls++;
    const r = await fetch(`https://api.odsay.com/v1/api/searchStation?lang=0&stationName=${encodeURIComponent(name)}&CID=${cid}&stationClass=2&apiKey=${encodeURIComponent(KEY)}`);
    j = await r.json();
    writeFileSync(file, JSON.stringify(j));
  }
  return (j.result?.station ?? []).filter((s) => s.stationClass === 2).map((s) => s.stationID);
}

interface Station {
  c: string;
  k: string;
  e: string;
  l: string;
  lat: number;
  lng: number;
}

const CITY_SHORT: Record<string, string> = { 부산광역시: "부산", 대구광역시: "대구", 광주광역시: "광주", 대전광역시: "대전" };

/** "1호선" in Busan is "부산 1호선"; a named line keeps its name. */
function lineKey(n: Near): string {
  const lane = (n.laneNameKor ?? "").trim();
  const city = CITY_SHORT[(n.laneCityKor ?? "").trim()] ?? "";
  return /^\d호선$/.test(lane) && city ? `${city} ${lane}` : lane;
}

async function network(cid: number, seeds: string[]) {
  const stations = new Map<number, Station>();
  const edges = new Set<string>();
  const called = new Set<number>();
  const learn = (n: Near): void => {
    if (!n?.stationID || stations.has(n.stationID) || n.x == null || n.y == null) return;
    stations.set(n.stationID, {
      c: String(n.stationID),
      k: (n.stationNameKor ?? n.stationName).trim(),
      e: n.stationName.trim(),
      l: lineKey(n),
      lat: Number(n.y),
      lng: Number(n.x),
    });
  };
  const link = (a: number, b: number): void => {
    edges.add(a < b ? `${a}|${b}` : `${b}|${a}`);
  };
  const queue: number[] = [];
  for (const s of seeds) queue.push(...(await seed(s, cid)));

  /** Call a station: learn it, its neighbours and its transfers. */
  const visit = async (id: number): Promise<Info | undefined> => {
    if (called.has(id)) return undefined;
    called.add(id);
    const r = await info(id);
    if (!r) return undefined;
    learn(r);
    for (const n of [...(r.prevOBJ?.station ?? []), ...(r.nextOBJ?.station ?? [])]) {
      learn(n);
      link(r.stationID, n.stationID);
    }
    for (const x of r.exOBJ?.station ?? []) if (!called.has(x.stationID)) queue.push(x.stationID);
    return r;
  };

  /**
   * Walk a line outwards from a station in one direction, calling every other
   * station when the ids run in sequence along it.
   */
  const walk = async (from: Info, dir: "prevOBJ" | "nextOBJ"): Promise<void> => {
    let cur: Info | undefined = from;
    while (cur) {
      const step = cur[dir]?.station ?? [];
      if (!step.length) return;
      let next: Info | undefined;
      for (const n of step) {
        if (called.has(n.stationID)) continue;
        // Guess the station after n: the ids along a line usually run in order.
        const guess = n.stationID + (n.stationID - cur.stationID);
        const g = called.has(guess) ? undefined : await visit(guess);
        const back = g && [...(g.prevOBJ?.station ?? []), ...(g.nextOBJ?.station ?? [])].some((m) => m.stationID === n.stationID);
        if (back) {
          next = g;
        } else {
          // Wrong guess (or a branch): visit n itself — and the guessed id, if
          // it was a real station elsewhere, has been learned anyway.
          next = await visit(n.stationID);
        }
      }
      cur = next;
    }
  };

  while (queue.length) {
    const id = queue.shift()!;
    if (called.has(id)) continue;
    const r = await visit(id);
    if (!r) continue;
    await walk(r, "prevOBJ");
    await walk(r, "nextOBJ");
  }
  // Transfers the every-other walk did not call directly: the same name, a few
  // hundred metres apart, on another line.
  const list = [...stations.values()];
  const transfers: [string, string][] = [];
  for (const a of list)
    for (const b of list)
      if (a.c < b.c && a.k === b.k && a.l !== b.l && Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng) < 0.006) transfers.push([a.c, b.c]);
  return {
    stations: list.sort((a, b) => a.c.localeCompare(b.c)),
    edges: [...edges].map((e) => e.split("|")).filter(([a, b]) => stations.has(Number(a)) && stations.has(Number(b))),
    transfers,
  };
}

const CITIES: { id: string; cid: number; seeds: string[] }[] = [
  { id: "busan", cid: 7000, seeds: ["서면", "연산", "미남", "사상", "벡스코"] },
  { id: "daegu", cid: 4000, seeds: ["반월당", "명덕"] },
  { id: "gwangju", cid: 5000, seeds: ["문화전당"] },
  { id: "daejeon", cid: 3000, seeds: ["시청"] },
];

const out: Record<string, unknown> = {};
for (const city of CITIES) {
  const net = await network(city.cid, city.seeds);
  out[city.id] = net;
  const lines = [...new Set(net.stations.map((s) => s.l))];
  console.log(`${city.id}: ${net.stations.length} stations, ${net.edges.length} links, ${net.transfers.length} transfers — ${lines.join(", ")}`);
}
writeFileSync("src/lib/data/regionalSubway.json", JSON.stringify(out));
console.log(`ODsay calls this run: ${calls}`);
