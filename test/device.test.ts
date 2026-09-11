/**
 * The phone's half of "near me" — everything that happens after the GPS fix,
 * none of which the server ever sees (src/lib/deviceTask.ts).
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { sayName } from "../web/client/src/device/names.js";
import { pickedIndex, pickedPlace, pickedTask } from "../web/client/src/device/followup.js";
import { runSight } from "../web/client/src/device/sight.js";
import { shortlist } from "../web/client/src/device/nearby.js";
import { pickSights, runSights, type SightRow } from "../web/client/src/device/sights.js";
import { boardLines, eta, runTrains } from "../web/client/src/device/trains.js";
import { runRoute } from "../web/client/src/device/route.js";
import { runNearby } from "../web/client/src/device/nearby.js";
import { lineName, stationLabel } from "../web/client/src/device/lines.js";
import { compactBoard, type TrainBoard } from "../src/lib/sources/trainBoard.js";
import { stationByKo } from "../src/lib/nearest.js";
import type { KakaoPlace } from "../web/client/src/device/kakao.js";
import type { NearbyTask } from "../src/lib/deviceTask.js";

/** The spot a traveller tested from: a side street ~690 m from Yangjae Station. */
const YANGJAE_SIDE_STREET = { lat: 37.479, lng: 127.0405, accuracy: 15 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a Korean shop name, as a visitor can say it", () => {
  const cases: [string, string][] = [
    ["푸른온누리약국", "Pureun Onnuri Pharmacy"],
    ["GS25 양재삼익점", "GS25 Yangjaesamik"],
    ["세븐일레븐 명동역점", "7-Eleven Myeongdong Stn."],
    ["Sh수협은행 양재동지점", "Suhyup Bank Yangjae-dong"],
    ["우체국365코너", "Post Office 24h ATM"],
    ["망원동약국", "Mangwon-dong Pharmacy"],
    ["명동역 개방화장실", "Myeongdong Stn. Public Restroom"],
    ["우리은행 지하1층", "Woori Bank B1F"],
  ];
  for (const [ko, said] of cases) {
    it(`says "${ko}" as "${said}", keeping the sign`, () => {
      expect(sayName(ko, "en")).toEqual({ said, sign: ko });
    });
  }

  it("gives a Korean reader Kakao's name exactly", () => {
    expect(sayName("푸른온누리약국", "ko")).toEqual({ said: "푸른온누리약국" });
  });
});

describe("'the second one', read back on the phone", () => {
  const places = [{ said: "Pureun Onnuri Pharmacy", sign: "푸른온누리약국" }, { said: "Medipamsup Pharmacy", sign: "메디팜숲약국" }];

  it("in all four languages", () => {
    expect(pickedIndex("is the second one open late?")).toBe(2);
    expect(pickedIndex("두 번째 약국 몇 시까지 해?")).toBe(2);
    expect(pickedIndex("2番目の薬局は何時まで？")).toBe(2);
    expect(pickedIndex("第二家药店几点关门？")).toBe(2);
  });

  it("names the place, visibly, in the traveller's own question", () => {
    expect(pickedPlace("is the second one open late?", places)).toBe("is the second one open late? (Medipamsup Pharmacy · 메디팜숲약국)");
  });

  it("leaves an exit number alone, and a question that names nothing on the list", () => {
    expect(pickedPlace("2번 출구가 어디야?", places)).toBe("2번 출구가 어디야?");
    expect(pickedPlace("how do I pay?", places)).toBe("how do I pay?");
    expect(pickedPlace("the third one", places)).toBe("the third one");
  });

  it("answers on the phone what the phone can: the way there, or a sight in full", () => {
    const shops = places.map((p, i) => ({ ...p, lat: 37.48 + i / 1000, lng: 127.04 }));
    const way = pickedTask("how do I get to the second one?", shops);
    expect(way).toMatchObject({ kind: "route", to: "메디팜숲약국" });
    expect(way?.kind === "route" && way.dest?.lat).toBeCloseTo(37.481, 5);
    // A shop has no listing to show, so that question goes to the server, named.
    expect(pickedTask("is the second one open late?", shops)).toBeUndefined();
    const sights = [{ said: "Maeheon Citizen's Forest (매헌시민의 숲)", lat: 37.473, lng: 127.037, sight: { id: "1234", type: 76 } }];
    expect(pickedTask("tell me more about the first one", sights)).toMatchObject({ kind: "sight", id: "1234", type: 76 });
    expect(pickedTask("첫 번째 어떻게 가?", sights)).toMatchObject({ kind: "route" });
  });
});

describe("one sight from the phone's list, in detail", () => {
  it("fetches exactly that listing and shows when it is open and how far it is", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      asked.push(url);
      return new Response(
        JSON.stringify({
          title: "Maeheon Citizen's Forest (매헌시민의 숲)",
          overview: "A large forest park in Seocho with walking trails.",
          hours: "Open all year",
          address: "99 Maeheon-ro, Seocho-gu, Seoul",
          image: "https://tong.visitkorea.or.kr/x.jpg",
        }),
      );
    });
    const card = await runSight(
      { kind: "sight", id: "1234", type: 76, title: "Maeheon Citizen's Forest (매헌시민의 숲)", lat: 37.473, lng: 127.037 },
      YANGJAE_SIDE_STREET,
      "en",
    );
    // Only the listing's id and type go out — never where the traveller is.
    expect(asked).toEqual(["/api/sight/en/1234?type=76"]);
    expect(card.markdown).toMatch(/walking trails/);
    expect(card.markdown).toMatch(/Hours:\*\* Open all year/);
    expect(card.markdown).toMatch(/🚶 \*\*7\d0 m\*\*/);
    expect(card.images?.[0].image).toMatch(/visitkorea/);
    expect(card.chips[0].locate?.task.kind).toBe("route");
  });
});

const kakao = (id: string, name: string, category: string, code: string, m: number): KakaoPlace => ({
  id,
  place_name: name,
  category_name: category,
  category_group_code: code,
  phone: "",
  address_name: "",
  road_address_name: "",
  x: "127.04",
  y: "37.48",
  place_url: `http://place.map.kakao.com/${id}`,
  distance: String(m),
});

describe("what Kakao found, shortlisted on the phone", () => {
  const pharmacy: NearbyTask = {
    kind: "nearby",
    need: "pharmacy",
    queries: [{ category: "PM9" }, { keyword: "약국" }],
    radius: 1500,
    order: "distance",
    pharmacyOnly: true,
    noFood: true,
    searchKo: "약국",
  };

  it("keeps only real pharmacies, once each, nearest first, within reach", () => {
    const byCategory = [
      kakao("1", "올리브영 양재점", "가정,생활 > 화장품 > 올리브영", "PM9", 90),
      kakao("2", "메디팜숲약국", "의료,건강 > 약국", "PM9", 168),
      kakao("3", "푸른온누리약국", "의료,건강 > 약국", "PM9", 150),
    ];
    const byKeyword = [
      kakao("3", "푸른온누리약국", "의료,건강 > 약국", "PM9", 150),
      kakao("4", "약국옆카페", "음식점 > 카페", "CE7", 40),
      kakao("5", "구룡수약국", "의료,건강 > 약국", "PM9", 194),
      kakao("6", "먼약국", "의료,건강 > 약국", "PM9", 2100),
    ];
    const got = shortlist(pharmacy, [byCategory, byKeyword], YANGJAE_SIDE_STREET).map((f) => f.place.place_name);
    expect(got).toEqual(["푸른온누리약국", "메디팜숲약국", "구룡수약국"]);
  });

  it("keeps Kakao's own order when the need is popularity, taking each search in turn", () => {
    const food: NearbyTask = { ...pharmacy, need: "food", order: "popular", pharmacyOnly: false, noFood: false };
    const a = [kakao("a1", "A1", "음식점 > 한식", "FD6", 500), kakao("a2", "A2", "음식점 > 한식", "FD6", 100)];
    const b = [kakao("b1", "B1", "음식점 > 한식", "FD6", 300)];
    expect(shortlist(food, [a, b], YANGJAE_SIDE_STREET).map((f) => f.place.id)).toEqual(["a1", "b1", "a2"]);
  });
});

describe("the tourism board's sights, measured on the phone", () => {
  const at = { lat: 37.5796, lng: 126.977 }; // Gyeongbokgung
  const row = (id: string, title: string, dLat: number, photo: 0 | 1, type = 76): SightRow => [
    id,
    title,
    Math.round((at.lat + dLat) * 1e5),
    Math.round(at.lng * 1e5),
    type,
    photo,
  ];

  it("prefers a listing with a photo unless one without is much nearer, and drops hospitals", () => {
    const rows = [
      row("1", "Gyeongbokgung Palace (경복궁)", 0.001, 1),
      row("2", "Some Small Park", 0.0005, 0),
      row("3", "National Folk Museum", 0.004, 1, 78),
      row("4", "Seoul Hospital (서울병원)", 0.0002, 1),
      row("5", "Bukchon Hanok Village", 0.006, 1),
      row("6", "Far Away Temple", 0.2, 1),
    ];
    const { picked } = pickSights(rows, at);
    const titles = picked.map((s) => s.title);
    expect(titles).not.toContain("Seoul Hospital (서울병원)");
    expect(titles).not.toContain("Far Away Temple");
    expect(titles[0]).toBe("Some Small Park"); // nearest first once chosen
    expect(titles).toContain("Gyeongbokgung Palace (경복궁)");
  });

  it("reaches further when a walk turns up too little", () => {
    const { reach } = pickSights([row("1", "Lonely Sight", 0.02, 1)], at);
    expect(reach).toBeGreaterThan(1500);
  });

  it("draws the card from the downloaded list, crediting the tourism board", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ rows: [row("1", "Gyeongbokgung Palace (경복궁)", 0.001, 1)] })));
    const card = await runSights({ kind: "sights" }, at, "en");
    expect(card.markdown).toMatch(/Gyeongbokgung Palace/);
    expect(card.markdown).toMatch(/한국관광공사/);
    expect(card.markdown).toMatch(/never sent to us/);
    expect(card.local).toMatch(/Shown on the traveller's phone/);
    expect(card.local).not.toMatch(/Gyeongbokgung/);
  });
});

describe("the city's train board, read for one station", () => {
  const now = Date.UTC(2026, 8, 11, 12, 0, 0); // 21:00 KST
  const recptn = "2026-09-11 21:00:00";
  const raw = {
    realtimeArrivalList: [
      { statnNm: "양재", subwayId: "1003", updnLine: "하행", bstatnNm: "오금", barvlDt: "120", arvlCd: "99", arvlMsg2: "2분 후 (매봉)", recptnDt: recptn },
      { statnNm: "양재", subwayId: "1003", updnLine: "하행", bstatnNm: "오금", barvlDt: "0", arvlCd: "99", arvlMsg2: "[4]번째 전역 (교대)", recptnDt: recptn },
      { statnNm: "양재", subwayId: "1003", updnLine: "상행", bstatnNm: "대화", barvlDt: "0", arvlCd: "0", arvlMsg2: "양재 진입", recptnDt: recptn },
      { statnNm: "양재", subwayId: "1003", updnLine: "상행", bstatnNm: "대화", arvlCd: "2", arvlMsg2: "양재 출발", recptnDt: recptn },
      { statnNm: "강남", subwayId: "1002", updnLine: "내선", bstatnNm: "성수", barvlDt: "60", arvlCd: "99", recptnDt: recptn },
    ],
  };

  it("keeps what a waiting passenger can use, counted from when each train reported", () => {
    const board = compactBoard(raw, now + 20_000);
    // The departed train is gone; the two-minute one is now 100 s away.
    expect(board.rows.filter((r) => r[0] === "양재")).toHaveLength(3);
    expect(board.rows.find((r) => r[3] === "오금" && r[5] > 0)?.[5]).toBe(100);
    expect(board.rows.find((r) => r[6] === 4)?.[6]).toBe(4);
  });

  it("reads one station off it, a line per direction, in the reader's script", () => {
    const board = compactBoard(raw, now);
    const lines = boardLines(board, "양재", "en", stationByKo, now);
    expect(lines).toHaveLength(2);
    expect(lines.join("\n")).toMatch(/Line 3/);
    expect(lines.join("\n")).toMatch(/toward Ogeum \(오금\): \*\*2 min\*\* · 4 stops away/);
    expect(lines.join("\n")).toMatch(/toward Daehwa \(대화\): \*\*arriving\*\*/);
    expect(boardLines(board, "양재", "ko", stationByKo, now).join("\n")).toMatch(/\*\*3호선\*\* · 오금행/);
  });

  it("says when a train is too close to run for", () => {
    const row: TrainBoard["rows"][number] = ["양재", "1003", "하행", "오금", 99, 20, 0, 0];
    expect(eta(row, 0, "en")?.said).toBe("arriving");
  });

  it("finds the station nearest the traveller and draws its board", async () => {
    const board = compactBoard(raw, now);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ...board, at: Date.now() })));
    const card = await runTrains({ kind: "trains" }, YANGJAE_SIDE_STREET, "en");
    expect(card.markdown).toMatch(/Next trains at \*\*Yangjae \(양재\)\*\*/);
    expect(card.markdown).toMatch(/Line 3/);
    expect(card.local).not.toMatch(/양재|Yangjae/);
  });
});

describe("a route from exactly where the traveller is standing", () => {
  it("walks to a station, rides, and walks the last bit — planned on the phone", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    const card = await runRoute(
      { kind: "route", to: "Gyeongbokgung Palace", dest: { lat: 37.5796, lng: 126.977 }, destStation: "경복궁" },
      YANGJAE_SIDE_STREET,
      "en",
    );
    expect(card.markdown).toMatch(/Walk \*\*\d{3} m\*\*/);
    expect(card.markdown).toMatch(/Line 3/);
    expect(card.markdown).toMatch(/Gyeongbokgung \(경복궁\)/);
    // Straight to the maps apps too, from the exact spot, for the bus options.
    expect(card.markdown).toMatch(/map\.kakao\.com\/link\/by\/traffic\//);
    expect(card.chips[0].locate?.task).toMatchObject({ kind: "trains" });
    // Nothing about where they are goes into the server's copy.
    expect(card.local).not.toMatch(/양재|Yangjae|37\.4/);
  });

  it("says to walk when the destination is a short walk away", async () => {
    const card = await runRoute(
      { kind: "route", to: "Yangjae Station", dest: { lat: 37.4841, lng: 127.0346 } },
      YANGJAE_SIDE_STREET,
      "en",
    );
    expect(card.markdown).toMatch(/Walk to Yangjae Station/);
    expect(card.markdown).toMatch(/link\/by\/walk\//);
  });

  it("writes the route in the reader's language", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    const card = await runRoute({ kind: "route", to: "경복궁", destStation: "경복궁" }, YANGJAE_SIDE_STREET, "ko");
    expect(card.markdown).toMatch(/3호선/);
    expect(card.markdown).toMatch(/\*\*양재\*\*역까지/);
  });
});

describe("the nearby card when Kakao cannot be reached", () => {
  it("opens the same search, centred on the traveller, in the map apps", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ kakaoJsKey: "" })));
    const card = await runNearby(
      { kind: "nearby", need: "pharmacy", queries: [{ category: "PM9" }], radius: 1500, order: "distance", searchKo: "약국", tip: "💊 A pharmacy is **약국**." },
      YANGJAE_SIDE_STREET,
      "en",
    );
    expect(card.markdown).toMatch(/Pharmacies near you/);
    expect(card.markdown).toMatch(/kakaomap:\/\/search\?q=%EC%95%BD%EA%B5%AD&p=37\.479,127\.0405/);
    expect(card.markdown).toMatch(/google\.com\/maps\/search\/%EC%95%BD%EA%B5%AD\/@37\.479,127\.0405/);
    expect(card.markdown).toMatch(/약국\*\*\./);
  });
});

describe("lines and stations, named for the reader", () => {
  it("names lines in four languages", () => {
    expect(lineName("03호선", "en")).toBe("Line 3");
    expect(lineName("03호선", "ja")).toBe("3号線");
    expect(lineName("신분당선", "zh")).toBe("新盆唐线");
    expect(lineName("경의선", "ko")).toBe("경의중앙선");
  });

  it("puts the Hangul on the sign next to the reader's own script", () => {
    const s = stationByKo("양재")!;
    expect(stationLabel(s, "en")).toBe("Yangjae (양재)");
    expect(stationLabel(s, "zh")).toBe("良才 (양재)");
    expect(stationLabel(s, "ko")).toBe("양재");
  });
});

describe("a destination up a hill", () => {
  const NAMSAN = {
    kind: "route" as const,
    to: "N Seoul Tower",
    dest: { lat: 37.5512, lng: 126.9882 },
    destStation: "명동",
    climb: true,
    access: "🧗 **N Seoul Tower sits on top of Namsan.** From **Myeongdong Station**, ride the **Namsan circular bus 01A or 01B** up to the tower.",
  };

  it("is never 'a short walk' from a hotel at its foot", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    const card = await runRoute(NAMSAN, { lat: 37.5609, lng: 126.9847 }, "en");
    // It used to say: "Walk to N Seoul Tower — 1.1 km, about 15 min".
    expect(card.markdown).not.toMatch(/Walk to N Seoul Tower/);
    expect(card.markdown).toMatch(/to \*\*Myeong-?dong \(명동\)\*\* station/);
    expect(card.markdown).toMatch(/01A or 01B/);
  });

  it("rides to the station the climb starts from, then says how to go up", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    const card = await runRoute(NAMSAN, YANGJAE_SIDE_STREET, "en");
    expect(card.markdown).toMatch(/→ Myeong-?dong \(명동\)/);
    expect(card.markdown).toMatch(/to Myeong-?dong \(명동\) station/);
    expect(card.markdown).toMatch(/01A or 01B/);
    expect(card.markdown).not.toMatch(/From Myeong-?dong \(명동\), \*\*\d/);
  });
});

describe("a subway network outside the capital", () => {
  it("plans a ride with a transfer on the same planner, and prices it by the city's fare", async () => {
    const { graphFromNetwork, planBetween, regionalFare, lineLabel } = await import("../src/lib/subwayPlan.js");
    // A tiny Busan: Line 1 A–B–C, Line 2 D–B–E (B is the transfer).
    const net = {
      stations: [
        { c: "70101", k: "가역", e: "Ga", l: "부산 1호선", lat: 35.1, lng: 129.0 },
        { c: "70102", k: "서면", e: "Seomyeon", l: "부산 1호선", lat: 35.11, lng: 129.0 },
        { c: "70103", k: "다역", e: "Da", l: "부산 1호선", lat: 35.12, lng: 129.0 },
        { c: "70201", k: "라역", e: "Ra", l: "부산 2호선", lat: 35.11, lng: 128.99 },
        { c: "70202", k: "서면", e: "Seomyeon", l: "부산 2호선", lat: 35.1101, lng: 129.0001 },
        { c: "70203", k: "해운대", e: "Haeundae", l: "부산 2호선", lat: 35.11, lng: 129.01 },
      ],
      edges: [["70101", "70102"], ["70102", "70103"], ["70201", "70202"], ["70202", "70203"]] as [string, string][],
      transfers: [["70102", "70202"]] as [string, string][],
    };
    const g = graphFromNetwork(net);
    const r = planBetween(g, ["70101"], ["70203"]);
    expect(r?.legs.map((l) => l.line)).toEqual(["부산 1호선", "부산 2호선"]);
    expect(r?.transfers).toBe(1);
    expect(regionalFare("busan", r!.stops)).toBe(1600);
    expect(regionalFare("busan", 15)).toBe(1800);
    expect(lineLabel("부산 2호선")).toBe("Busan Line 2");
    expect(lineName("대구 3호선", "ja")).toBe("大邱3号線");
  });
});

describe("a route to another city", () => {
  it("is not a subway trip: it says so and offers the intercity answer from the city they are in", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    const card = await runRoute(
      { kind: "route", to: "Gyeongbokgung Palace", dest: { lat: 37.5796, lng: 126.977 }, destStation: "경복궁" },
      { lat: 35.1587, lng: 129.1604 }, // Haeundae, Busan
      "en",
    );
    expect(card.markdown).toMatch(/trip between cities/);
    expect(card.chips[0].cmdEn).toBe("How do I get from Busan to Gyeongbokgung Palace?");
  });
});
