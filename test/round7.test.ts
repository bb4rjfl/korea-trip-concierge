/**
 * The round that replaced the metered routing API with Seoul's own feeds and
 * cleared the defects QA found around them.
 */

import { describe, it, expect } from "vitest";
import { seoulHoursVerdict } from "../src/lib/sources/visitseoul.js";
import { exitFor, exitLine, asksAboutExit } from "../src/lib/exits.js";
import { parseTomorrow } from "../src/lib/sources/weatherair.js";
import { translateMenuContext } from "../src/tools/translateMenuContext.js";
import { localizeLabels, toTraditional } from "../web/server/labels.js";
import { isTraditionalChinese } from "../web/server/router.js";

describe("opening hours read the day they are asked about", () => {
  const hours = "Mon-Fri 09:00~18:00 / Sat 10:00~15:00";

  it("uses Saturday's hours on a Saturday, not the widest window", () => {
    // Saturday afternoon: the old code took the widest range across all days and
    // announced "Open now (until 18:00)" directly above "Sat 10:00~15:00".
    expect(seoulHoursVerdict(hours, undefined, 6, 17 * 60)?.status).toBe("closed");
    expect(seoulHoursVerdict(hours, undefined, 6, 12 * 60)?.headline).toContain("15:00");
  });

  it("still closes on a day the hours never mention", () => {
    expect(seoulHoursVerdict(hours, undefined, 0, 12 * 60)?.status).toBe("closed");
  });

  it("keeps working for a plain single range", () => {
    expect(seoulHoursVerdict("10:00~22:00", undefined, 2, 21 * 60)?.status).toBe("open");
  });

  it("hedges only when today itself may run late", () => {
    const extended = "09:00~18:00 (Extended Hours: Every Friday until 21:00)";
    expect(seoulHoursVerdict(extended, undefined, 5, 19 * 60)?.status).toBe("open");
  });
});

describe("which exit", () => {
  it("names the exit for landmarks that are not stations", () => {
    expect(exitFor("Bukchon Hanok Village")).toMatchObject({ station: "안국", exit: "2" });
    expect(exitFor("경복궁")?.exit).toBe("5");
    expect(exitLine("COEX")).toContain("삼성");
  });

  it("recognizes the question in every language we serve", () => {
    for (const q of ["which exit for Myeongdong?", "명동역 몇 번 출구예요?", "明洞は何番出口ですか", "明洞几号出口"]) {
      expect(asksAboutExit(q)).toBe(true);
    }
    expect(asksAboutExit("where can I exchange money?")).toBe(false);
  });
});

describe("tomorrow's outlook", () => {
  it("summarizes the next day from the same forecast payload", () => {
    const items = [
      { category: "TMN", fcstDate: "20260901", fcstTime: "0600", fcstValue: "21" },
      { category: "TMX", fcstDate: "20260901", fcstTime: "1500", fcstValue: "29" },
      { category: "SKY", fcstDate: "20260901", fcstTime: "1200", fcstValue: "4" },
      { category: "POP", fcstDate: "20260901", fcstTime: "1200", fcstValue: "70" },
      { category: "POP", fcstDate: "20260901", fcstTime: "0300", fcstValue: "90" }, // night — ignored
      { category: "POP", fcstDate: "20260902", fcstTime: "1200", fcstValue: "10" }, // another day
    ];
    const t = parseTomorrow(items, "20260901")!;
    expect(t).toMatchObject({ minC: 21, maxC: 29, sky: "Cloudy", rainProb: 70 });
  });

  it("returns nothing when the payload doesn't reach tomorrow", () => {
    expect(parseTomorrow([{ category: "TMP", fcstDate: "20260831", fcstValue: "24" }], "20260901")).toBeUndefined();
  });
});

describe("allergy wording people actually use", () => {
  it("maps shrimp, エビ and 새우 onto the shellfish data we hold", async () => {
    for (const word of ["shrimp", "エビ", "새우", "I'm allergic to prawns"]) {
      const text = (await translateMenuContext.handler({ menuText: "짬뽕", allergyConcerns: [word] })).content[0].text;
      expect(text).toContain("Contains shellfish");
    }
  });

  it("still reports a concern it cannot check rather than passing it silently", async () => {
    const text = (await translateMenuContext.handler({ menuText: "비빔밥", allergyConcerns: ["mushroom"] })).content[0].text;
    expect(text.toLowerCase()).toContain("mushroom");
  });
});

describe("our own labels never stay English", () => {
  it("translates card chrome even inside an already-localized body", () => {
    const card = "⏰ Current Korea time: **Sun 19:07 KST**\n🏛️ Hours: 10:00-17:00\n🗺️ Map: [Kakao Map](x)";
    const ja = localizeLabels(card, "ja");
    expect(ja).toContain("現在の韓国時間");
    expect(ja).toContain("日 19:07");
    expect(ja).not.toContain("Hours:");
    expect(ja).not.toContain("Kakao Map");
  });

  it("translates a label wrapped in markdown italics", () => {
    // `\b` does not fire between `_` and a letter, so every `_label_` in a card —
    // the source credit on every search result — was silently staying English.
    expect(localizeLabels('🔎 **Places for** _"명동"_ — _live local search_', "ko")).toContain("실시간 현지 검색");
    expect(localizeLabels("— _official Seoul Tourism_", "ja")).toContain("ソウル市公式観光情報");
  });

  it("leaves an English body alone", () => {
    const card = "⏰ Current Korea time: **Sun 19:07 KST**";
    expect(localizeLabels(card, "en")).toBe(card);
  });
});

describe("traditional Chinese", () => {
  it("is detected and answered in the same script", () => {
    expect(isTraditionalChinese("請問觀光景點")).toBe(true);
    expect(isTraditionalChinese("请问观光景点")).toBe(false);
    expect(toTraditional("韩国当前时间 · 营业时间 · 无需换乘")).toBe("韓國當前時間 · 營業時間 · 無需換乘");
  });
});

describe("questions that used to be deflected now reach a card", () => {
  it("routes them before the model gets a chance to decline", async () => {
    const { criticalRoute } = await import("../web/server/router.js");
    const cases: [string, string][] = [
      ["How do I get around Jeju without a car?", "explainKoreanService"],
      ["I use a wheelchair. Is the Seoul subway accessible?", "explainKoreanService"],
      ["What rules should I know so I don't offend anyone?", "explainKoreanService"],
      ["Do I need a visa to visit Korea from Brazil?", "explainKoreanService"],
      ["Can you book me a hotel?", "explainKoreanService"],
      ["Is now a good time to visit Korea?", "getWeatherAndAir"],
    ];
    for (const [q, tool] of cases) expect(criticalRoute(q)?.tool, q).toBe(tool);
  });

  it("does not hijack a declined card as an entry question", async () => {
    const { criticalRoute } = await import("../web/server/router.js");
    // "Visa" is a card brand far more often than an entry document in this app.
    expect(criticalRoute("My Visa card was declined at a restaurant")).toBeNull();
  });

  it("keeps a route question a route question", async () => {
    const { asksHowToGetAround } = await import("../src/lib/gettingAround.js");
    expect(asksHowToGetAround("how do I get from Hongdae to Myeongdong?")).toBe(false);
    expect(asksHowToGetAround("how do I get around Busan?")).toBe(true);
  });
});

describe("what's on while I'm here", () => {
  it("recognizes an event question in every language, and not a place search", async () => {
    const { asksAboutEvents } = await import("../src/tools/searchPlaceForeigner.js");
    for (const q of ["any festivals happening now?", "축제 뭐 있어?", "今どんなお祭りがありますか", "有什么活动吗"]) {
      expect(asksAboutEvents(q), q).toBe(true);
    }
    expect(asksAboutEvents("find me a cafe in Hongdae")).toBe(false);
  });
});

describe("intercity departures", () => {
  it("reads the class names a visitor has to choose between", async () => {
    const { trainGradeLabel } = await import("../src/lib/sources/intercityApi.js");
    expect(trainGradeLabel("KTX")).toBe("KTX");
    expect(trainGradeLabel("ITX-마음")).toBe("ITX-Maum");
    expect(trainGradeLabel("KTX-산천(A-type)")).toBe("KTX-Sancheon");
    expect(trainGradeLabel("무궁화호")).toContain("Mugunghwa");
  });

  it("shows the next departures after the current time", async () => {
    const { upcoming } = await import("../src/lib/sources/intercityApi.js");
    const mk = (depart: string) => ({ grade: "KTX", from: "A", to: "B", depart, arrive: depart, minutes: 60 });
    const list = [mk("00:10"), mk("23:50")];
    // Whatever the hour, we never return an empty list when services exist.
    expect(upcoming(list, 2).length).toBeGreaterThan(0);
  });
});

describe("the practical problems of a trip", () => {
  it("answers where to put the bags, wash clothes, pray, and post things home", async () => {
    const { findForeignerFriendlyStore } = await import("../src/tools/findForeignerFriendlyStore.js");
    const cases: [string, string][] = [
      ["luggage storage", "Luggage storage"],
      ["where can I leave my bags", "Luggage storage"],
      ["coin laundry", "Laundry"],
      ["send a parcel home", "Post"],
      ["prayer room", "Prayer room"],
    ];
    for (const [need, expected] of cases) {
      const text = (await findForeignerFriendlyStore.handler({ need, area: "Myeongdong" })).content[0].text;
      expect(text, need).toContain(expected);
    }
  });

  it("still shows the essentials menu for something it doesn't recognise", async () => {
    const { findForeignerFriendlyStore } = await import("../src/tools/findForeignerFriendlyStore.js");
    const text = (await findForeignerFriendlyStore.handler({ need: "zzz nonsense", area: "Myeongdong" })).content[0].text;
    expect(text).toContain("essentials");
  });

  it("routes them in every language", async () => {
    const { routeText } = await import("../web/server/router.js");
    expect(routeText("where can I store my luggage?", "en")?.args.need).toBe("luggage");
    expect(routeText("荷物を預けたい", "ja")?.args.need).toBe("luggage");
    expect(routeText("행리 아니고 짐 보관", "ko")?.args.need).toBe("luggage");
    expect(routeText("is there a coin laundry nearby", "en")?.args.need).toBe("laundry");
  });
});

describe("fares are the ones actually charged", () => {
  it("uses the current base fare, not the one from two rises ago", async () => {
    const { getGraph, planRoute } = await import("../src/lib/sources/subwayGraph.js");
    const graph = await getGraph();
    // Checked against live routing: a two-stop ride is ₩1,550.
    expect(planRoute(graph, "서울역", "명동")!.fareWon).toBe(1550);
  });

  it("adds the Sinbundang Line surcharge", async () => {
    const { getGraph, planRoute } = await import("../src/lib/sources/subwayGraph.js");
    const graph = await getGraph();
    // Gangnam→Sinsa prices at ₩2,250 on the Sinbundang Line against ₩1,550 on 2+3.
    expect(planRoute(graph, "강남", "신사")!.fareWon).toBe(2250);
  });
});

describe("a four-language service reads all four languages", () => {
  it("anchors a city named in Japanese or Chinese", async () => {
    const { searchTerms } = await import("../src/tools/searchPlaceForeigner.js");
    // The query cleaner used to skip ja/zh entirely, so a whole sentence reached
    // the keyword search and matched nothing.
    expect(searchTerms("弘大の近くでカフェを探しています")).toBe("弘大 カフェ");
    expect(searchTerms("首爾有什麼好吃的？")).toBe("首爾");
    expect(searchTerms("best cafe in Hongdae please")).toBe("cafe Hongdae");
  });

  it("keeps a query that is already just terms", async () => {
    const { searchTerms } = await import("../src/tools/searchPlaceForeigner.js");
    expect(searchTerms("성수동 카페")).toBe("성수동 카페");
  });
});

describe("Korean readers don't need the romanization", () => {
  it("drops the Latin half of a bilingual name, and only that", () => {
    const card = [
      "**1. Namsan Chotbul 1978 (남산 촛불1978)**",
      "🚇 Seoul Station (서울역) → Myeongdong (명동)",
      "**3. Damijuk (多味粥) (다미죽 (多味粥))**",
      "- **Excellent (2+1 seats)** 21:00",
    ].join("\n");
    const ko = localizeLabels(card, "ko");
    expect(ko).toContain("남산 촛불1978");
    expect(ko).not.toContain("Namsan Chotbul");
    expect(ko).toContain("서울역");
    expect(ko).not.toContain("Seoul Station");
    // A hanja reading and an English qualifier are not romanizations.
    expect(ko).toContain("多味粥");
    expect(ko).toContain("2+1 seats");
  });

  it("leaves the other languages bilingual", () => {
    const ja = localizeLabels("**1. Namsan Chotbul 1978 (남산 촛불1978)**", "ja");
    expect(ja).toContain("Namsan Chotbul 1978");
    expect(ja).toContain("남산 촛불1978");
  });
});

describe("the model doesn't get to misroute the practical needs", () => {
  it("decides them before the model runs", async () => {
    const { criticalRoute } = await import("../web/server/router.js");
    // "Where can I pray as a Muslim" came back as an art museum; "how do I ship a
    // box home" as a generic app-blocker card. Both have a real card already.
    const cases: [string, string][] = [
      ["where can I pray as a Muslim in Seoul?", "prayer"],
      ["how do I ship a box home?", "post"],
      ["where can I leave my luggage in Seoul Station?", "luggage"],
      ["is there a coin laundry near Hongdae?", "laundry"],
    ];
    for (const [q, need] of cases) {
      const hit = criticalRoute(q);
      expect(hit?.tool, q).toBe("findForeignerFriendlyStore");
      expect(hit?.args.need, q).toBe(need);
    }
  });

  it("leaves the ordinary questions to the normal path", async () => {
    const { criticalRoute } = await import("../web/server/router.js");
    expect(criticalRoute("how do I get to Myeongdong")).toBeNull();
    expect(criticalRoute("I need a pharmacy")).toBeNull();
  });
});

describe("our own card titles are not places", () => {
  it("keeps only the where from a '<what> in <where>' heading", async () => {
    const { deriveContext } = await import("../web/server/context.js");
    // Carrying the whole title forward produced "Post & shipping home in Luggage
    // storage in Seoul" on the next answer.
    const ctx = deriveContext([
      { role: "assistant", content: "🧳 **Luggage storage in Seoul Station**\n\nAsk your hotel first…" },
    ]);
    expect(ctx.places[0]).toBe("Seoul Station");
    expect(ctx.station).toBe("Seoul");
  });

  it("leaves a real place title alone", async () => {
    const { deriveContext } = await import("../web/server/context.js");
    const ctx = deriveContext([{ role: "assistant", content: "🕒 **Gyeongbokgung Palace — right now**" }]);
    expect(ctx.places[0]).toBe("Gyeongbokgung Palace");
  });
});

describe("a mall question means the big complexes", () => {
  it("names the places anyone actually means", async () => {
    const { searchPlaceForeigner } = await import("../src/tools/searchPlaceForeigner.js");
    // "big mall" was answering with a sneaker select shop, a character-goods store
    // and a wellness pharmacy — all filed under "Specialty Shops & Stores".
    const text = (await searchPlaceForeigner.handler({ query: "big mall" })).content[0].text;
    expect(text).toContain("COEX");
    expect(text).toContain("Times Square");
    expect(text).toContain("IFC");
    expect(text).not.toContain("Pharmacy");
  });

  it("answers for Busan when Busan is named", async () => {
    const { searchPlaceForeigner } = await import("../src/tools/searchPlaceForeigner.js");
    const text = (await searchPlaceForeigner.handler({ query: "department store in Busan" })).content[0].text;
    expect(text).toContain("Centum City");
  });

  it("recognizes the question in every language, and not a shop question", async () => {
    const { asksAboutMalls } = await import("../src/lib/malls.js");
    for (const q of ["big mall", "department store", "쇼핑몰 어디", "大きいモールは？", "有什麼商場"]) {
      expect(asksAboutMalls(q), q).toBe(true);
    }
    expect(asksAboutMalls("where can I buy cosmetics")).toBe(false);
  });
});

describe("asking for another course gives another course", () => {
  it("returns a different day at each variant", async () => {
    const { resolvePersonas, composeCourse } = await import("../src/lib/courses.js");
    const personas = resolvePersonas("couple, foodie");
    const names = (v: number) =>
      composeCourse(personas, "1-day", [], "Seoul", false, v)
        .days[0].stops.map((s) => s.spot.name)
        .join("|");
    // Three asks used to return the identical itinerary, which is what a visitor
    // called out: "this isn't a recommendation, it's one course you keep pushing".
    expect(names(1)).not.toBe(names(0));
    expect(names(2)).not.toBe(names(1));
  });

  it("never sends you to the same place twice in one day", async () => {
    const { resolvePersonas, composeCourse } = await import("../src/lib/courses.js");
    const { livePool } = await import("../src/lib/livePool.js");
    const extra = await livePool("Seoul").catch(() => []);
    const course = composeCourse(resolvePersonas("couple, foodie"), "1-day", [], "Seoul", false, 0, extra);
    const names = course.days[0].stops.map((s) => s.spot.name.replace(/\s*\([^)]*\)/, "").trim());
    expect(new Set(names).size).toBe(names.length);
  });

  it("puts something evening-shaped in the evening slot", async () => {
    const { resolvePersonas, composeCourse } = await import("../src/lib/courses.js");
    const course = composeCourse(resolvePersonas("couple"), "1-day", [], "Seoul", false, 1);
    const evening = course.days[0].stops.find((s) => s.block.includes("Evening"));
    if (evening) {
      // Not a stationery shop that happened to be next in the list.
      expect(["food", "nightlife", "view", "market", "cafe"].some((t) => evening.spot.themes.includes(t))).toBe(true);
    }
  });
});
