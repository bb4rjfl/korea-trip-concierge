/**
 * Snapshot every Seoul-area subway station's position, for the phone.
 *
 *   npx tsx --env-file=.env scripts/build-station-coords.ts
 *
 * Why this exists
 * ---------------
 * "Where am I" is answered on the device — coordinates never leave it, because
 * sending them to the server is what makes a service a reportable location
 * service under the Location Information Act (docs/27 §4). The device compares
 * its GPS fix against a table it carries and sends only the nearest name.
 *
 * That table was 82 landmarks. Measured against twelve places a visitor would
 * actually be standing — hotels, guesthouses, side streets — the nearest name
 * was a median 1.3 km out and 8.4 km at worst: someone in Nowon was told they
 * were at Cheongnyangni, a hotel in Gongdeok became Ewha Womans University. A
 * route from the wrong station is wrong from its first step.
 *
 * Seoul has a station every few hundred metres, and a station is also exactly
 * what a route needs as an origin. So the table becomes every station, with the
 * names in the four languages we serve joined from the snapshot we already ship.
 *
 * Source: 서울특별시 subwayStationMaster (ⓒ서울특별시, 공공누리). Run again when
 * a line opens; the output is committed so the build never depends on the API.
 */

import { readFileSync, writeFileSync } from "node:fs";

interface MasterRow {
  BLDN_NM: string;
  ROUTE: string;
  LAT: string;
  LOT: string;
}
interface NameRow {
  k: string;
  e: string;
  j?: string;
  z?: string;
  l: string;
}

const key = (process.env.SEOUL_API_KEY ?? "").trim();
if (!key) {
  console.error("SEOUL_API_KEY is required");
  process.exit(2);
}

const res = await fetch(`http://openapi.seoul.go.kr:8088/${key}/json/subwayStationMaster/1/1000/`);
const json = (await res.json()) as { subwayStationMaster?: { row?: MasterRow[] } };
const rows = json.subwayStationMaster?.row ?? [];
if (rows.length < 500) {
  console.error(`only ${rows.length} rows — refusing to overwrite a good snapshot with a partial one`);
  process.exit(1);
}

const names = JSON.parse(readFileSync("src/lib/data/subwayStations.json", "utf8")) as NameRow[];
/** The master writes 서울역 where the name table writes 서울, and so on. */
const bare = (s: string) => s.replace(/\(.*?\)/g, "").replace(/역$/, "").trim();
const byKo = new Map<string, NameRow>();
for (const n of names) if (!byKo.has(bare(n.k))) byKo.set(bare(n.k), n);

/** One entry per station, not per line: a transfer station is one place to stand. */
const out = new Map<string, { k: string; e: string; j?: string; z?: string; lat: number; lng: number }>();
let unnamed = 0;
for (const r of rows) {
  const lat = Number(r.LAT);
  const lng = Number(r.LOT);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lng < 124) continue;
  const ko = bare(r.BLDN_NM);
  if (out.has(ko)) continue;
  const n = byKo.get(ko);
  if (!n) unnamed++;
  out.set(ko, {
    k: ko,
    // A station with no English name in our table still gets one the router can
    // read back: the Korean. Better a correct name in Hangul than a missing station.
    e: n?.e ?? ko,
    ...(n?.j ? { j: n.j } : {}),
    ...(n?.z ? { z: n.z } : {}),
    // Five decimals is about a metre — far finer than anything this is used for.
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
  });
}

const list = [...out.values()].sort((a, b) => a.k.localeCompare(b.k, "ko"));
writeFileSync("src/lib/data/stationCoords.json", `${JSON.stringify(list)}\n`, "utf8");
console.log(`${list.length} stations written (${unnamed} without an English name in our table)`);
