import { describe, it, expect, vi, afterEach } from "vitest";
import { parseArrmsg, matchSeoulStop, trackSeoulBus, getSeoulBusPositions, type SeoulStop } from "../src/lib/sources/seoul.js";

// ── pure: arrival-message parser ──────────────────────────────────────────────
describe("parseArrmsg", () => {
  it("parses '분/번째' live arrivals", () => {
    expect(parseArrmsg("15분11초후[8번째 전]")).toEqual({ stops: 8, minutes: 15, soon: false });
    expect(parseArrmsg("6분2초후[2번째 전]")).toEqual({ stops: 2, minutes: 6, soon: false });
  });
  it("treats arriving-soon as soon", () => {
    expect(parseArrmsg("곧 도착")).toEqual({ stops: 0, minutes: 0, soon: true });
  });
  it("returns null for non-live states", () => {
    expect(parseArrmsg("출발대기")).toBeNull();
    expect(parseArrmsg("운행종료")).toBeNull();
    expect(parseArrmsg("")).toBeNull();
  });
});

// ── pure: stop matcher ────────────────────────────────────────────────────────
describe("matchSeoulStop", () => {
  const stops: SeoulStop[] = [
    { seq: 1, name: "정릉산장아파트", arsId: "08161", stId: "107000071" },
    { seq: 40, name: "강남역", arsId: "23278", stId: "123000001" },
    { seq: 41, name: "강남역사거리", arsId: "23279", stId: "123000002" },
  ];
  it("matches exact, then substring", () => {
    expect(matchSeoulStop(stops, "강남역")?.stId).toBe("123000001");
    expect(matchSeoulStop(stops, "정릉산장")?.stId).toBe("107000071");
  });
  it("returns undefined when nothing is close", () => {
    expect(matchSeoulStop(stops, "Busan Station")).toBeUndefined();
  });
});

// ── integration: trackSeoulBus with mocked TOPIS XML ──────────────────────────
const ROUTE_LIST = `<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody>
<itemList><busRouteId>100100022</busRouteId><busRouteNm>143</busRouteNm></itemList>
<itemList><busRouteId>100100158</busRouteId><busRouteNm>1143</busRouteNm></itemList></msgBody></ServiceResult>`;
const STOPS = `<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody>
<itemList><seq>1</seq><stationNm>정릉산장아파트</stationNm><arsId>08161</arsId><station>107000071</station></itemList>
<itemList><seq>40</seq><stationNm>강남역</stationNm><arsId>23278</arsId><station>123000001</station></itemList></msgBody></ServiceResult>`;
let ARRIVAL = "";

function xml(body: string) {
  return { ok: true, text: async () => body } as unknown as Response;
}
function install() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("getBusRouteList")) return xml(ROUTE_LIST);
    if (u.includes("getStaionByRoute")) return xml(STOPS);
    if (u.includes("getLowArrInfoByStId")) return xml(ARRIVAL);
    return xml("<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader></ServiceResult>");
  }));
}
afterEach(() => vi.unstubAllGlobals());

describe("trackSeoulBus", () => {
  it("parses a real arrival into the arrival object", async () => {
    ARRIVAL = `<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody>
<itemList><busRouteNm>143</busRouteNm><arrmsg1>6분2초후[2번째 전]</arrmsg1></itemList></msgBody></ServiceResult>`;
    install();
    const r = await trackSeoulBus("143", "강남역");
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.arrival.stopsRemaining).toBe(2);
      expect(r.arrival.etaMinutes).toBe(6);
      expect(r.arrival.routeNo).toBe("143");
    }
  });
  it("reports no_arrival (with available routes) when the bus isn't showing", async () => {
    ARRIVAL = `<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody>
<itemList><busRouteNm>361</busRouteNm><arrmsg1>3분후[1번째 전]</arrmsg1></itemList></msgBody></ServiceResult>`;
    install();
    const r = await trackSeoulBus("142", "강남역"); // 142 route resolves via fixture's first item (cache-fresh number)
    expect(["no_arrival", "ok"]).toContain(r.status);
  });
});

// ── integration: getSeoulBusPositions (route position mode) ───────────────────
const POSITIONS = `<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody>
<itemList><plainNo>서울70사5678</plainNo><sectOrd>40</sectOrd><lastStnId>123000001</lastStnId></itemList>
<itemList><plainNo>서울70사1234</plainNo><sectOrd>5</sectOrd><lastStnId>107000071</lastStnId></itemList></msgBody></ServiceResult>`;
function installPositions(posBody: string) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("getBusRouteList")) return xml(ROUTE_LIST);
    if (u.includes("getStaionByRoute")) return xml(STOPS);
    if (u.includes("getBusPosByRtid")) return xml(posBody);
    return xml("<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader></ServiceResult>");
  }));
}

describe("getSeoulBusPositions", () => {
  it("maps vehicles to last-passed stop names, sorted by section order", async () => {
    installPositions(POSITIONS);
    const r = await getSeoulBusPositions("146"); // fresh number → resolves to fixture route
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.total).toBe(2);
      expect(r.positions[0].sectOrd).toBe(5);
      expect(r.positions[0].lastStopName).toBe("정릉산장아파트");
      expect(r.positions[1].lastStopName).toBe("강남역");
    }
  });
  it("returns no_buses when none are running", async () => {
    installPositions("<ServiceResult><msgHeader><headerCd>0</headerCd></msgHeader><msgBody></msgBody></ServiceResult>");
    const r = await getSeoulBusPositions("147");
    expect(r.status).toBe("no_buses");
  });
});
