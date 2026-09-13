import { describe, it, expect } from "vitest";
import { portalError } from "../src/lib/sources/dataGoKr.js";
import { busStopLabel } from "../src/lib/stopLabel.js";
import { changeBetween, sharesName, type RawRouteStop } from "../src/lib/sources/busNational.js";
import { planCapitalNear, walkMinutes } from "../src/lib/stationPlan.js";
import { planRegionalNear } from "../src/lib/regionalSubway.js";
import { fromSnapshot } from "../src/lib/subwayPlan.js";

describe("the public-data portal's refusals", () => {
  /**
   * "No session available (30/30)" arrives as HTTP 200 with an empty body, and
   * was read as "no bus stops here" — then cached for six hours.
   */
  it("treats a session refusal as an error, not as an empty list", () => {
    expect(portalError({ response: { header: { resultCode: 99, resultMsg: "가용한 세션이 존재하지 않습니다. (30/30)" }, body: { items: "" } } })).toMatch(/99/);
    expect(portalError({ OpenAPI_ServiceResponse: { cmmMsgHeader: { errMsg: "SERVICE ERROR", returnAuthMsg: "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR" } } })).toMatch(/LIMITED/);
  });

  it("accepts a normal answer, and 'no data' as an answer", () => {
    expect(portalError({ response: { header: { resultCode: "00", resultMsg: "NORMAL SERVICE." } } })).toBeUndefined();
    expect(portalError({ response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" } } })).toBeUndefined();
  });
});

describe("bus stop names", () => {
  it("reads a station exit as one, and keeps the sign's Korean", () => {
    expect(busStopLabel("수원역10번출구.헌혈의집")).toMatch(/Station Exit 10 \(수원역10번출구\.헌혈의집\)$/);
    expect(busStopLabel("수원역10번출구.헌혈의집")).not.toMatch(/Beonchulgu|Heonhyeol/);
  });

  it("drops the lines a stop serves from the English, not from the Korean", () => {
    const s = busStopLabel("제주국제공항1(표선,성산,남원)");
    expect(s).toMatch(/Int'l Airport 1 \(제주국제공항1\(표선,성산,남원\)\)$/);
  });

  it("says which side of the road", () => {
    expect(busStopLabel("성산일출봉입구[동]")).toMatch(/Entrance \(east side\)/);
  });

  it("does not find a station inside a market's name", () => {
    expect(busStopLabel("역전시장")).not.toMatch(/Station/);
  });

  it("leaves a name with no Korean alone", () => {
    expect(busStopLabel("BEXCO")).toBe("BEXCO");
  });
});

describe("choosing the stop named after the place", () => {
  it("prefers 전동성당.한옥마을 for Jeonju Hanok Village", () => {
    expect(sharesName("전동성당.한옥마을", "전주한옥마을")).toBe(true);
    expect(sharesName("기린대로 병무청", "전주한옥마을")).toBe(false);
  });

  it("matches a short name, and not a neighbour that shares one syllable", () => {
    expect(sharesName("오동도 입구", "오동도")).toBe(true);
    expect(sharesName("성산리[동]", "성산일출봉")).toBe(false);
  });
});

const stop = (id: string, ord: number, lat: number, lng: number, dir = 0): RawRouteStop => ({
  nodeid: id,
  nodenm: id,
  nodeord: ord,
  updowncd: dir,
  gpslati: lat,
  gpslong: lng,
});

describe("changing buses", () => {
  const first = [stop("board", 1, 36.07, 129.34), stop("mid", 2, 36.071, 129.35), stop("terminal", 3, 36.072, 129.36)];

  it("changes where both buses call at the same stop", () => {
    const second = [stop("terminal", 1, 36.072, 129.36), stop("coast", 2, 36.08, 129.45), stop("cape", 3, 36.078, 129.57)];
    const c = changeBetween(first, new Set(["board"]), second, new Set(["cape"]))!;
    expect(c.changeFrom.nodeid).toBe("terminal");
    expect(c.firstStops).toBe(2);
    expect(c.secondStops).toBe(2);
    expect(c.changeWalkM).toBe(0);
  });

  /** The two sides of a road — or two bays of a terminal — are different stop ids. */
  it("changes across the road, where the stop ids differ", () => {
    const second = [stop("terminal-bay-3", 1, 36.0722, 129.3602), stop("cape", 2, 36.078, 129.57)];
    const c = changeBetween(first, new Set(["board"]), second, new Set(["cape"]))!;
    expect(c.changeTo.nodeid).toBe("terminal-bay-3");
    expect(c.changeWalkM).toBeGreaterThan(0);
    expect(c.changeWalkM).toBeLessThan(200);
  });

  it("does not send anyone a kilometre across town to change", () => {
    const second = [stop("elsewhere", 1, 36.08, 129.36), stop("cape", 2, 36.078, 129.57)];
    expect(changeBetween(first, new Set(["board"]), second, new Set(["cape"]))).toBeUndefined();
  });

  it("does not change onto a bus that has already passed the destination", () => {
    const second = [stop("cape", 1, 36.078, 129.57), stop("terminal", 2, 36.072, 129.36)];
    expect(changeBetween(first, new Set(["board"]), second, new Set(["cape"]))).toBeUndefined();
  });
});

describe("a near match must not drop words", () => {
  /** Each of these became a route from a place to itself, or 20 km out of town. */
  it("does not read a bus terminal as the sight the town is known for", async () => {
    const { resolvePlaceCoord } = await import("../src/lib/places.js");
    expect(resolvePlaceCoord("Boseong Bus Terminal")?.label ?? "").not.toMatch(/Tea/);
    expect(resolvePlaceCoord("Gongju Bus Terminal")?.label ?? "").not.toMatch(/Gongju Station/);
    expect(resolvePlaceCoord("Space Walk Pohang")?.label ?? "").not.toMatch(/Pohang Station/);
  });

  it("still forgives a misspelling", async () => {
    const { resolvePlaceCoord } = await import("../src/lib/places.js");
    expect(resolvePlaceCoord("Gyeongbokgoong")?.label).toBe("Gyeongbokgung Palace");
  });

  it("knows the places no geocoder could find by their English names", async () => {
    const { resolvePlaceCoord } = await import("../src/lib/places.js");
    for (const n of ["Hwangnidan-gil", "Soyang River Skywalk", "Iho Taewoo Beach", "Wahyeon Port"]) {
      expect(resolvePlaceCoord(n), n).toBeDefined();
    }
  });
});

describe("exit hints only for the station the route ends at", () => {
  it("withholds Samseong's exit from a route that ends at Bongeunsa", async () => {
    const { exitLine } = await import("../src/lib/exits.js");
    const any = exitLine("Starfield Library");
    expect(any).toMatch(/Exit/);
    expect(exitLine("Starfield Library", "봉은사")).toBeUndefined();
    expect(exitLine("Starfield Library", "삼성")).toBe(any);
  });

  it("names the Everline's stations as they are signed", async () => {
    const { stationLabel } = await import("../src/lib/romanize.js");
    expect(stationLabel("전대.에버랜드")).toMatch(/Everland/);
    expect(stationLabel("전대.에버랜드")).not.toMatch(/Ebeoraendeu/);
  });
});

describe("places that are a tour, not a trip", () => {
  it("answers the DMZ's Third Tunnel with the tour, not a bus", async () => {
    const { accessFor } = await import("../src/lib/access.js");
    const a = accessFor("Third Tunnel")!;
    expect(a.tourOnly).toBe(true);
    expect(a.note).toMatch(/tour/i);
    expect(a.note).toMatch(/passport/i);
  });

  it("answers Haneul Park as a climb from its gateway", async () => {
    const { accessFor } = await import("../src/lib/access.js");
    const a = accessFor("Haneul Park")!;
    expect(a.climb).toBe(true);
    expect(a.gateway).toBe("월드컵경기장");
  });
});

describe("the subway by where places are, not what they are called", () => {
  const graph = fromSnapshot();

  /** No name table had the museum; Ichon Station is 526 m from it. */
  it("routes Itaewon to the National Museum of Korea through Ichon", () => {
    const p = planCapitalNear(graph, { lat: 37.5345, lng: 126.9947 }, { lat: 37.524, lng: 126.9803 })!;
    expect(p).toBeDefined();
    expect(p.alightKo).toBe("이촌");
    expect(p.walkFromM).toBeGreaterThan(300);
    expect(p.minutes).toBeGreaterThan(p.route.minutes);
  });

  it("routes Myeongdong to Starfield Library to a station beside COEX", () => {
    const p = planCapitalNear(graph, { lat: 37.5609, lng: 126.9863 }, { lat: 37.5118, lng: 127.0591 })!;
    expect(["봉은사", "삼성"]).toContain(p.alightKo);
  });

  it("finds nothing for a place no station is within a walk of", () => {
    expect(planCapitalNear(graph, { lat: 37.5609, lng: 126.9863 }, { lat: 37.2873, lng: 127.0121 })).toBeUndefined();
  });

  it("routes Dongdaegu Station to E-World on Daegu's own network", () => {
    const p = planRegionalNear({ lat: 35.8793, lng: 128.6284 }, { lat: 35.8549, lng: 128.5648 })!;
    expect(p.network).toBe("daegu");
    // E-World sits between Duryu and Naedang on Line 2; either is a short walk.
    expect(["두류", "내당"]).toContain(p.alightKo);
    expect(p.walkFromM).toBeLessThan(1200);
  });

  it("counts a walk the way the streets run", () => {
    expect(walkMinutes(900)).toBe(15);
    expect(walkMinutes(0)).toBe(0);
  });
});
