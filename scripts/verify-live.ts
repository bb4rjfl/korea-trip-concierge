/**
 * One-off live verification (NOT a build gate). Loads .env, hits each external
 * source with real inputs, and prints BOTH the raw upstream item keys and the
 * parsed output so we can confirm the NOTE(verify-live) field assumptions.
 *
 * Run: npx tsx scripts/verify-live.ts
 */
import "../src/lib/loadEnv.js";
import { ENV, hasKey } from "../src/lib/env.js";
import * as tour from "../src/lib/sources/tourapi.js";
import * as tago from "../src/lib/sources/tago.js";
import * as odsay from "../src/lib/sources/odsay.js";

const line = (s = "") => console.log(s);
const hr = (t: string) => line(`\n========== ${t} ==========`);

async function rawGet(u: string): Promise<any> {
  const res = await fetch(u);
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, text: text.slice(0, 600) };
  }
}

function keysOfFirstItem(json: any): string[] {
  const items = json?.response?.body?.items;
  if (!items || !items.item) return [];
  const it = Array.isArray(items.item) ? items.item[0] : items.item;
  return it ? Object.keys(it) : [];
}

async function verifyTour() {
  hr("TourAPI (EngService2)  — TOUR_API_KEY");
  if (!hasKey("TOUR_API_KEY")) return line("SKIP: no TOUR_API_KEY");

  // raw searchKeyword2
  const sp = new URLSearchParams({
    serviceKey: ENV.TOUR_API_KEY,
    MobileOS: "ETC",
    MobileApp: "KoreaTripConcierge",
    _type: "json",
    numOfRows: "3",
    pageNo: "1",
    listYN: "Y",
    arrange: "O",
    keyword: "Gyeongbokgung",
  });
  const raw = await rawGet(`http://apis.data.go.kr/B551011/EngService2/searchKeyword2?${sp}`);
  line(`HTTP ${raw.status}`);
  line(`header: ${JSON.stringify(raw.json?.response?.header)}`);
  line(`first-item keys: ${JSON.stringify(keysOfFirstItem(raw.json))}`);

  // parsed
  const places = await tour.searchPlaces({ keyword: "Gyeongbokgung", limit: 3 });
  line(`parsed ${places.length} places:`);
  places.forEach((p) => line(`  - ${p.title} | ${p.address} | ctId=${p.contentId} type=${p.contentTypeId}`));

  // detailIntro2 on first result
  if (places[0]?.contentId && places[0]?.contentTypeId) {
    const ip = new URLSearchParams({
      serviceKey: ENV.TOUR_API_KEY,
      MobileOS: "ETC",
      MobileApp: "KoreaTripConcierge",
      _type: "json",
      contentId: places[0].contentId,
      contentTypeId: places[0].contentTypeId,
    });
    const iraw = await rawGet(`http://apis.data.go.kr/B551011/EngService2/detailIntro2?${ip}`);
    line(`detailIntro2 first-item keys: ${JSON.stringify(keysOfFirstItem(iraw.json))}`);
    const intro = await tour.getPlaceIntro(places[0].contentId, places[0].contentTypeId);
    line(`parsed intro: ${JSON.stringify(intro)}`);
  }
}

async function verifyTago() {
  hr("TAGO bus  — BUS_API_KEY");
  if (!hasKey("BUS_API_KEY")) return line("SKIP: no BUS_API_KEY");

  // raw stop search (Korean stop name)
  const stopName = "서울역";
  const sp = new URLSearchParams({
    serviceKey: ENV.BUS_API_KEY,
    _type: "json",
    numOfRows: "5",
    pageNo: "1",
    stSrch: stopName,
  });
  const raw = await rawGet(`http://apis.data.go.kr/1613000/BusSttnInfoInquireService/getSttnNoList?${sp}`);
  line(`HTTP ${raw.status}`);
  line(`header: ${JSON.stringify(raw.json?.response?.header)}`);
  line(`stop first-item keys: ${JSON.stringify(keysOfFirstItem(raw.json))}`);

  const stops = await tago.resolveStop(stopName);
  line(`parsed ${stops.length} stops:`);
  stops.slice(0, 3).forEach((s) => line(`  - ${s.nodeName} | nodeId=${s.nodeId} city=${s.cityCode}`));

  if (stops[0]) {
    const ap = new URLSearchParams({
      serviceKey: ENV.BUS_API_KEY,
      _type: "json",
      numOfRows: "5",
      pageNo: "1",
      cityCode: stops[0].cityCode,
      nodeId: stops[0].nodeId,
    });
    const araw = await rawGet(
      `http://apis.data.go.kr/1613000/ArvlInfoInquireService/getSttnAcctoArvlPrearngeInfoList?${ap}`,
    );
    line(`arrival header: ${JSON.stringify(araw.json?.response?.header)}`);
    line(`arrival first-item keys: ${JSON.stringify(keysOfFirstItem(araw.json))}`);
    const arr = await tago.getArrivals(stops[0].cityCode, stops[0].nodeId);
    line(`parsed ${arr.length} arrivals:`);
    arr.slice(0, 3).forEach((a) => line(`  - route ${a.routeNo} | ${a.stopsRemaining} stops | ${a.etaMinutes} min`));
  }
}

async function verifyOdsay() {
  hr("ODsay routing  — TRANSIT_API_KEY");
  if (!hasKey("TRANSIT_API_KEY")) return line("SKIP: no TRANSIT_API_KEY");

  // Seoul Station (126.9707, 37.5547) -> Gangnam Station (127.0276, 37.4979)
  const sp = new URLSearchParams({
    apiKey: ENV.TRANSIT_API_KEY,
    SX: "126.9707",
    SY: "37.5547",
    EX: "127.0276",
    EY: "37.4979",
    lang: "0",
  });
  const raw = await rawGet(`https://api.odsay.com/v1/api/searchPubTransPathT?${sp}`);
  line(`HTTP ${raw.status}`);
  if (raw.json?.error) line(`ERROR: ${JSON.stringify(raw.json.error)}`);
  const pathCount = raw.json?.result?.path?.length;
  line(`result.path count: ${pathCount}`);
  if (raw.json?.result?.path?.[0]) {
    line(`first path info: ${JSON.stringify(raw.json.result.path[0].info)}`);
    line(`first subPath sample: ${JSON.stringify(raw.json.result.path[0].subPath?.[0])}`);
  }

  const routes = await odsay.routesBetween({ lng: 126.9707, lat: 37.5547 }, { lng: 127.0276, lat: 37.4979 });
  line(`parsed ${routes.length} routes:`);
  routes.slice(0, 2).forEach((r, i) => {
    line(`  route ${i + 1}: ${r.totalMinutes} min, fare ${r.fare}, ${r.legs.length} legs`);
    r.legs.forEach((l) => line(`     ${l.mode} ${l.line ?? ""} ${l.from ?? ""}→${l.to ?? ""} (${l.minutes ?? "?"}m)`));
  });
}

(async () => {
  for (const [name, fn] of [
    ["tour", verifyTour],
    ["tago", verifyTago],
    ["odsay", verifyOdsay],
  ] as const) {
    try {
      await fn();
    } catch (e) {
      line(`\n!! ${name} threw: ${(e as Error).message}`);
    }
  }
  line("\n(done)");
})();
