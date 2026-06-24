import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePlaces, searchPlaces } from "../src/lib/sources/tourapi.js";
import { trackBus } from "../src/lib/sources/tago.js";
import { parseRoutes } from "../src/lib/sources/odsay.js";

/** A representative EngService2 response with two items. */
const TWO_ITEMS = {
  response: {
    header: { resultCode: "0000", resultMsg: "OK" },
    body: {
      items: {
        item: [
          {
            title: "Gwangjang Market",
            addr1: "88 Changgyeonggung-ro",
            addr2: "Jongno-gu, Seoul",
            tel: "02-2267-0291",
            firstimage: "https://img/gwangjang.jpg",
            mapx: "126.999",
            mapy: "37.570",
            contentid: "264337",
            contenttypeid: "82",
          },
          {
            title: "Tongin Market",
            addr1: "18 Jahamun-ro 15-gil",
            firstimage2: "https://img/tongin_thumb.jpg",
            contentid: "1000",
            contenttypeid: "82",
          },
        ],
      },
      totalCount: 2,
    },
  },
};

describe("parsePlaces — data.go.kr response quirks", () => {
  it("parses an array of items", () => {
    const places = parsePlaces(TWO_ITEMS);
    expect(places).toHaveLength(2);
    expect(places[0].title).toBe("Gwangjang Market");
    expect(places[0].address).toBe("88 Changgyeonggung-ro Jongno-gu, Seoul");
    expect(places[0].image).toBe("https://img/gwangjang.jpg");
    expect(places[0].mapx).toBeCloseTo(126.999);
  });

  it("falls back to firstimage2 when firstimage is absent", () => {
    const places = parsePlaces(TWO_ITEMS);
    expect(places[1].image).toBe("https://img/tongin_thumb.jpg");
    expect(places[1].tel).toBeUndefined();
  });

  it("handles a SINGLE item object (not array)", () => {
    const single = {
      response: { body: { items: { item: { title: "Solo Spot", addr1: "Somewhere" } } } },
    };
    const places = parsePlaces(single);
    expect(places).toHaveLength(1);
    expect(places[0].title).toBe("Solo Spot");
  });

  it("handles empty results (items is empty string)", () => {
    expect(parsePlaces({ response: { body: { items: "" } } })).toEqual([]);
    expect(parsePlaces({})).toEqual([]);
  });
});

describe("searchPlaces — request + limit (mocked fetch)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calls searchKeyword2 and respects the limit", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/searchKeyword2");
      expect(url).toContain("keyword=");
      expect(url).toContain("_type=json");
      return { ok: true, json: async () => TWO_ITEMS } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    const places = await searchPlaces({ keyword: "market unique-key-1", limit: 1 });
    expect(places).toHaveLength(1);
    expect(places[0].title).toBe("Gwangjang Market");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("maps category to a contentTypeId", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("contentTypeId=82"); // food -> 82
      return { ok: true, json: async () => TWO_ITEMS } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    await searchPlaces({ keyword: "food unique-key-2", category: "food" });
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("TAGO trackBus (mocked fetch)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves a stop then finds the matching route's arrival", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("getSttnNoList")) {
          return {
            ok: true,
            json: async () => ({
              response: { body: { items: { item: [{ nodeid: "N1", nodenm: "Myeongdong Stn unique-stop", citycode: 25 }] } } },
            }),
          } as unknown as Response;
        }
        // arrivals
        return {
          ok: true,
          json: async () => ({
            response: {
              body: {
                items: {
                  item: [
                    { routeno: 100, arrtime: 600, arrprevstationcnt: 5 },
                    { routeno: "143", arrtime: 360, arrprevstationcnt: 3 },
                  ],
                },
              },
            },
          }),
        } as unknown as Response;
      }),
    );

    const res = await trackBus("143", "Myeongdong Stn unique-stop");
    expect(res).not.toBeNull();
    expect(res!.arrival.routeNo).toBe("143");
    expect(res!.arrival.stopsRemaining).toBe(3);
    expect(res!.arrival.etaMinutes).toBe(6); // 360s -> 6 min
    expect(res!.stop.cityCode).toBe("25");
  });

  it("returns null when no stop matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ response: { body: { items: "" } } }) }) as unknown as Response),
    );
    expect(await trackBus("9", "nowhere unique-stop-2")).toBeNull();
  });
});

describe("ODsay parseRoutes", () => {
  it("parses paths into legs with modes, line names, and fare", () => {
    const routes = parseRoutes({
      result: {
        path: [
          {
            info: { totalTime: 34, payment: 1500 },
            subPath: [
              { trafficType: 3, sectionTime: 5, startName: "", endName: "" },
              { trafficType: 1, sectionTime: 20, startName: "Seoul Stn", endName: "Euljiro 1-ga", lane: [{ name: "Line 1" }] },
              { trafficType: 2, sectionTime: 9, startName: "A", endName: "B", lane: [{ busNo: "143" }] },
            ],
          },
        ],
      },
    });
    expect(routes).toHaveLength(1);
    expect(routes[0].totalMinutes).toBe(34);
    expect(routes[0].fare).toBe(1500);
    const modes = routes[0].legs.map((l) => l.mode);
    expect(modes).toContain("subway");
    expect(modes).toContain("bus");
    expect(routes[0].legs.find((l) => l.mode === "bus")?.line).toBe("143");
  });

  it("returns [] when no path", () => {
    expect(parseRoutes({})).toEqual([]);
    expect(parseRoutes({ error: { msg: "x" } })).toEqual([]);
  });
});
