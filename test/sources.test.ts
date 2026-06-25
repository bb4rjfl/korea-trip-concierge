import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePlaces, searchPlaces, cleanTitle, normalizeLang, rankPlaces } from "../src/lib/sources/tourapi.js";
import { trackBus, resolveCityCode } from "../src/lib/sources/tago.js";
import { parseRoutes } from "../src/lib/sources/odsay.js";
import { parseJeju } from "../src/lib/sources/jeju.js";
import { parseWeather, parseAir, resolveCity } from "../src/lib/sources/weatherair.js";
import { parseArrivals, resolveStationName } from "../src/lib/sources/seoulSubway.js";

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

describe("TourAPI multilingual (U4)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizeLang maps aliases and defaults to en", () => {
    expect(normalizeLang("ja")).toBe("ja");
    expect(normalizeLang("Japanese")).toBe("ja");
    expect(normalizeLang("chinese")).toBe("zh");
    expect(normalizeLang("kr")).toBe("ko");
    expect(normalizeLang(undefined)).toBe("en");
    expect(normalizeLang("klingon")).toBe("en");
  });

  it("picks the JpnService2 base and foreign content-type for ja", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/JpnService2/searchKeyword2");
      expect(url).toContain("contentTypeId=82"); // foreign numbering for food
      return { ok: true, json: async () => ({ response: { body: { items: "" } } }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    await searchPlaces({ keyword: "x lang-ja-uniq", category: "food", language: "ja" });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("picks the KorService2 base and Korean content-type for ko", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("/KorService2/searchKeyword2");
      expect(url).toContain("contentTypeId=39"); // Korean numbering for food
      return { ok: true, json: async () => ({ response: { body: { items: "" } } }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    await searchPlaces({ keyword: "x lang-ko-uniq", category: "food", language: "ko" });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("cleanTitle keeps a Korean parenthetical for ko output, strips it otherwise", () => {
    expect(cleanTitle("서울특별시 (한국)", "ko")).toBe("서울특별시 (한국)"); // ko keeps Hangul paren
    expect(cleanTitle("Gyeongbokgung(경복궁)", "en")).toBe("Gyeongbokgung"); // en strips it
  });
});

describe("rankPlaces (A — relevance ranking)", () => {
  const shop = { title: "Andersson Bell Gyeongbokgung Flagship Store", address: "", contentTypeId: "79" };
  const palace = { title: "Gyeongbokgung Palace", address: "", contentTypeId: "76" };
  const cafe = { title: "Some Cafe", address: "", contentTypeId: "82" };

  it("floats the attraction/prefix match above a flagship store", () => {
    const ranked = rankPlaces([shop, cafe, palace], "Gyeongbokgung");
    expect(ranked[0].title).toBe("Gyeongbokgung Palace");
  });

  it("keeps original order for equal (zero) scores", () => {
    const ranked = rankPlaces([cafe, shop], "nomatch");
    expect(ranked.map((p) => p.title)).toEqual(["Some Cafe", "Andersson Bell Gyeongbokgung Flagship Store"]);
  });
});

describe("cleanTitle (TourAPI title sanitization)", () => {
  it("strips a trailing Korean parenthetical that breaks Markdown", () => {
    expect(cleanTitle("Gyeongbokgung Palace(경복궁)")).toBe("Gyeongbokgung Palace");
    expect(cleanTitle("Andersson Bell Flagship Store [Tax Refund Shop](앤더슨벨 스토어)")).toBe(
      "Andersson Bell Flagship Store",
    );
  });
  it("leaves clean English titles untouched", () => {
    expect(cleanTitle("Gwangjang Market")).toBe("Gwangjang Market");
  });
});

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

  it("resolves a stop (injecting cityCode) then finds the matching route's arrival", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("getSttnNoList")) {
          expect(url).toContain("cityCode=21");
          expect(url).toContain("nodeNm=");
          // Real TAGO stop responses carry no citycode — only nodeid/nodenm/gps.
          return {
            ok: true,
            json: async () => ({
              response: { body: { items: { item: [{ nodeid: "N1", nodenm: "Seomyeon unique-stop", gpslati: 35.1, gpslong: 129.0 }] } } },
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

    const res = await trackBus("143", "Seomyeon unique-stop", "21");
    expect(res).not.toBeNull();
    expect(res!.arrival.routeNo).toBe("143");
    expect(res!.arrival.stopsRemaining).toBe(3);
    expect(res!.arrival.etaMinutes).toBe(6); // 360s -> 6 min
    expect(res!.stop.cityCode).toBe("21"); // injected from the query, not the response
  });

  it("returns null when no stop matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ response: { body: { items: "" } } }) }) as unknown as Response),
    );
    expect(await trackBus("9", "nowhere unique-stop-2", "21")).toBeNull();
  });

  it("resolveCityCode maps an English alias to a TAGO city code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(url).toContain("getCtyCodeList");
        return {
          ok: true,
          json: async () => ({
            response: {
              body: {
                items: {
                  item: [
                    { citycode: 21, cityname: "부산광역시" },
                    { citycode: 25, cityname: "대전광역시/계룡시" },
                  ],
                },
              },
            },
          }),
        } as unknown as Response;
      }),
    );
    expect(await resolveCityCode("Busan")).toBe("21");
    expect(await resolveCityCode("대전")).toBe("25");
    expect(await resolveCityCode("Atlantis")).toBeUndefined();
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

describe("VisitJeju parseJeju", () => {
  it("normalizes items, prefers road address, strips '*' phone, picks thumbnail", () => {
    const places = parseJeju({
      result: "200",
      items: [
        {
          title: "Seongsan Ilchulbong",
          contentscd: { label: "Tourist Destination" },
          address: "Old address",
          roadaddress: "284-12 Ilchul-ro, Seogwipo",
          introduction: "A UNESCO sunrise peak.",
          phoneno: "*",
          latitude: 33.46,
          longitude: 126.93,
          repPhoto: { photoid: { thumbnailpath: "https://img/thumb.gif", imgpath: "https://img/full.gif" } },
        },
      ],
    });
    expect(places).toHaveLength(1);
    expect(places[0].title).toBe("Seongsan Ilchulbong");
    expect(places[0].category).toBe("Tourist Destination");
    expect(places[0].address).toBe("284-12 Ilchul-ro, Seogwipo"); // road preferred
    expect(places[0].tel).toBeUndefined(); // "*" -> empty
    expect(places[0].image).toBe("https://img/thumb.gif");
    expect(places[0].lat).toBeCloseTo(33.46);
  });

  it("handles missing items", () => {
    expect(parseJeju({})).toEqual([]);
  });
});

describe("weather/air parsing", () => {
  it("parseWeather picks the earliest forecast slot and decodes codes", () => {
    const items = [
      { category: "TMP", fcstDate: "20260625", fcstTime: "0900", fcstValue: "24" },
      { category: "SKY", fcstDate: "20260625", fcstTime: "0900", fcstValue: "1" },
      { category: "PTY", fcstDate: "20260625", fcstTime: "0900", fcstValue: "0" },
      { category: "POP", fcstDate: "20260625", fcstTime: "0900", fcstValue: "20" },
      { category: "TMP", fcstDate: "20260625", fcstTime: "1200", fcstValue: "27" }, // later slot ignored
    ];
    const w = parseWeather(items);
    expect(w.tempC).toBe(24);
    expect(w.sky).toBe("Clear");
    expect(w.precip).toBeUndefined(); // PTY 0 -> none
    expect(w.rainProb).toBe(20);
  });

  it("parseAir averages valid stations, ignores '-', grades by worst PM", () => {
    const air = parseAir([
      { pm10Value: "14", pm25Value: "4", dataTime: "2026-06-25 02:00" },
      { pm10Value: "16", pm25Value: "-", dataTime: "2026-06-25 02:00" }, // pm25 sensor down
      { pm10Value: "-", pm25Value: "6", dataTime: "2026-06-25 02:00" },
    ]);
    expect(air.pm10).toBe(15); // (14+16)/2
    expect(air.pm25).toBe(5); // (4+6)/2
    expect(air.grade).toBe("Good"); // both low
    expect(air.stations).toBe(2);
  });

  it("resolveCity maps aliases and defaults to Seoul", () => {
    expect(resolveCity("Busan").sido).toBe("부산");
    expect(resolveCity("제주").label).toBe("Jeju");
    expect(resolveCity(undefined).label).toBe("Seoul");
    expect(resolveCity("Atlantis").label).toBe("Seoul");
  });
});

describe("Seoul subway", () => {
  it("resolveStationName maps EN→KO, passes Korean through, strips '역'", () => {
    expect(resolveStationName("Gangnam")).toBe("강남");
    expect(resolveStationName("Hongik University")).toBe("홍대입구");
    expect(resolveStationName("강남역")).toBe("강남");
    expect(resolveStationName("명동")).toBe("명동");
    expect(resolveStationName("Atlantis")).toBeUndefined();
    expect(resolveStationName("")).toBeUndefined();
  });

  it("parseArrivals maps line, ETA from seconds, status, current location", () => {
    const arrivals = parseArrivals({
      errorMessage: { code: "INFO-000", total: 2 },
      realtimeArrivalList: [
        {
          subwayId: "1002",
          trainLineNm: "성수행 - 신설동방면",
          bstatnNm: "성수",
          barvlDt: "120",
          arvlMsg3: "강남",
          arvlCd: "99",
        },
        {
          subwayId: "1009",
          trainLineNm: "중앙보훈병원행",
          bstatnNm: "중앙보훈병원",
          barvlDt: "0",
          arvlCd: "1",
        },
      ],
    });
    expect(arrivals).toHaveLength(2);
    expect(arrivals[0].line).toBe("Line 2");
    expect(arrivals[0].etaMinutes).toBe(2); // 120s
    expect(arrivals[0].status).toBe("en route");
    expect(arrivals[0].currentLocation).toBe("강남");
    expect(arrivals[1].line).toBe("Line 9");
    expect(arrivals[1].etaMinutes).toBeUndefined(); // 0s
    expect(arrivals[1].status).toBe("arrived");
  });

  it("parseArrivals returns [] when no list", () => {
    expect(parseArrivals({ errorMessage: { code: "INFO-200" } })).toEqual([]);
    expect(parseArrivals({})).toEqual([]);
  });
});
