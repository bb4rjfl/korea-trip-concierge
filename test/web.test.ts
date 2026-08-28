import { describe, expect, it } from "vitest";
import { buildChoiceFooter } from "../src/lib/footer.js";
import { parseToolMarkdown } from "../web/server/chips.js";
import { CATALOG, CATALOG_BY_NAME, executeTool } from "../web/server/catalog.js";
import { detectLang, extractFromTo, findCity, routeText } from "../web/server/router.js";
import { extractPlaceNames } from "../web/server/orchestrator.js";
import { backfillArgs, deriveContext } from "../web/server/context.js";
import { resolvePlaceCoord } from "../src/lib/places.js";
import { matchAreaName } from "../src/tools/getAreaGuide.js";
import { isIndoorIntent, isLikelyOutdoor } from "../src/lib/sources/visitseoul.js";
import { mapLinks, mapLinksAt } from "../src/lib/maplinks.js";
import { SCENARIOS } from "../web/client/src/i18n.js";
import { nearestPlace } from "../web/client/src/geo.js";
import type { Lang } from "../web/server/router.js";

/* ------------------------------- chips parser ------------------------------- */

describe("web chips parser", () => {
  it("extracts chips and strips the footer from tool markdown", () => {
    const footer = buildChoiceFooter([
      { emoji: "🚇", cmdEn: "How do I get there?", cmdKo: "가는 길", descEn: "route" },
      { emoji: "🌧️", cmdEn: "Weather now?", descEn: "weather" },
    ]);
    const md = `# Title\n\nBody line with **bold**.\n\n${footer}`;
    const { body, chips } = parseToolMarkdown(md);

    expect(chips).toHaveLength(2);
    expect(chips[0]).toEqual({ emoji: "🚇", cmdEn: "How do I get there?", cmdKo: "가는 길" });
    expect(chips[1]).toEqual({ emoji: "🌧️", cmdEn: "Weather now?", cmdKo: undefined });
    expect(body).toContain("Body line");
    expect(body).not.toContain("You can ask me next");
    expect(body).not.toContain("Assistant: you MUST");
    // the footer's own hr is stripped too (no dangling rule at the end)
    expect(body.trimEnd().endsWith("---")).toBe(false);
  });

  it("returns full body and no chips when there is no footer", () => {
    const { body, chips } = parseToolMarkdown("plain answer\n\n--- \nnot a footer");
    expect(chips).toHaveLength(0);
    expect(body).toContain("plain answer");
  });
});

/* --------------------------------- catalog ---------------------------------- */

describe("web tool catalog", () => {
  it("wraps all 13 tools with declarations", () => {
    expect(CATALOG).toHaveLength(13);
    for (const t of CATALOG) {
      expect(t.declaration.parameters.type).toBe("object");
      expect(Object.keys(t.declaration.parameters.properties).length).toBeGreaterThan(0);
    }
  });

  it("marks required fields correctly (trackBusArrival needs busNumber+city)", () => {
    const bus = CATALOG_BY_NAME.get("trackBusArrival")!;
    expect(bus.declaration.parameters.required).toEqual(expect.arrayContaining(["busNumber", "city"]));
    const weather = CATALOG_BY_NAME.get("getWeatherAndAir")!;
    expect(weather.declaration.parameters.required ?? []).toHaveLength(0);
  });

  it("returns structured invalidArgs instead of executing on missing required args", async () => {
    const res = await executeTool("trackBusArrival", {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.invalidArgs).toEqual(expect.arrayContaining(["busNumber", "city"]));
  });
});

/* ---------------------------------- router ---------------------------------- */

describe("web rule router", () => {
  it("detects language by script", () => {
    expect(detectLang("경복궁 지금 열었어?")).toBe("ko");
    expect(detectLang("景福宮は今開いてる？")).toBe("ja"); // kana wins over han
    expect(detectLang("景福宫现在开门吗？")).toBe("zh");
    expect(detectLang("Is it open now?")).toBe(null);
  });

  it("extracts cities and from→to pairs", () => {
    expect(findCity("weather in Busan please")).toBe("Busan");
    expect(findCity("釜山の天気")).toBe("Busan");
    expect(extractFromTo("How do I get from Hongdae to Gimpo Airport?")).toEqual({
      from: "Hongdae",
      to: "Gimpo Airport",
    });
    expect(extractFromTo("홍대에서 김포공항까지 어떻게 가?")).toEqual({ from: "홍대", to: "김포공항" });
  });

  const MATRIX: [Lang, string, string][] = [
    ["ko", "143번 버스 신사역 도착 언제야?", "trackBusArrival"],
    ["en", "Where is bus 143 in Seoul right now?", "trackBusArrival"],
    ["ja", "143番バスは今どこ？", "trackBusArrival"],
    ["zh", "143路公交现在在哪里？", "trackBusArrival"],
    ["ko", "홍대입구역 지하철 언제 와?", "trackSubwayArrival"],
    ["en", "It's raining in Seoul — where can I go indoors?", "getWeatherAndAir"],
    ["ja", "景福宮は今開いてる？", "getNowInfo"],
    ["zh", "景福宫现在开门吗？", "getNowInfo"],
    ["en", "Plan a 1-day Seoul course for a foodie couple", "recommendTripCourse"],
    ["ko", "먹방 커플용 서울 당일 코스 짜줘", "recommendTripCourse"],
    ["en", "My card was declined at a restaurant — what should I do?", "explainPayment"],
    ["en", "How do I get from Hongdae to Gimpo Airport?", "getTransitRoute"],
    ["en", "Is 냉면 ok for vegetarians?", "translateMenuContext"],
    ["en", "Where can I exchange money in Myeongdong?", "findForeignerFriendlyStore"],
    ["en", "Tell me about Seongsu", "getAreaGuide"],
    ["en", "Best beaches in Jeju?", "getJejuInfo"],
  ];

  it.each(MATRIX)("routes [%s] %s → %s", (lang, text, tool) => {
    const hit = routeText(text, lang);
    expect(hit?.tool).toBe(tool);
  });

  it("extracts bus slots (ko stop, en positions mode)", () => {
    const ko = routeText("143번 버스 신사역 도착 언제야?", "ko")!;
    expect(ko.args.busNumber).toBe("143");
    expect(ko.args.city).toBe("Seoul");
    expect(ko.args.dropOffStop).toBe("신사역");
    const en = routeText("Where is bus 143 in Seoul right now?", "en")!;
    expect(en.args.busNumber).toBe("143");
    expect(en.args.dropOffStop).toBeUndefined();
  });

  it("passes course persona/duration/location slots", () => {
    const hit = routeText("Plan a 1-day Seoul course for a foodie couple", "en")!;
    expect(hit.args.duration).toBe("1-day");
    expect(String(hit.args.persona)).toContain("couple");
    expect(String(hit.args.persona)).toContain("foodie");
    expect(hit.args.location).toBe("Seoul");
  });

  it("returns null for smalltalk (welcome path)", () => {
    expect(routeText("hello!", "en")).toBeNull();
    expect(routeText("고마워", "ko")).toBeNull();
  });
});

/* --------------------------- image enrichment names -------------------------- */

describe("place-name extraction for photo enrichment", () => {
  it("pulls numbered entries", () => {
    const md = [
      "🔎 **Places** _live_",
      "",
      "**1. Namsan Chotbul 1978 (남산 촛불1978)** · _Western_",
      "   📍 Seoul Junggu",
      "**2. Gwangjang Market** · _Market_",
    ].join("\n");
    expect(extractPlaceNames(md)).toEqual(["Namsan Chotbul 1978 (남산 촛불1978)", "Gwangjang Market"]);
  });

  it("falls back to the hero title and strips the em-dash suffix", () => {
    const md = "🕒 **Gyeongbokgung Palace — right now**\n\n🟢 Open now.";
    expect(extractPlaceNames(md)).toEqual(["Gyeongbokgung Palace"]);
  });

  it("returns empty for markdown without place shapes", () => {
    expect(extractPlaceNames("plain text answer, no bold")).toEqual([]);
  });
});

/* ------------------------------ near-me snapping ----------------------------- */

describe("on-device near-me snap", () => {
  it("snaps a Gwanghwamun coordinate to Gyeongbokgung", () => {
    const hit = nearestPlace(37.579, 126.977);
    expect(hit?.label).toBe("Gyeongbokgung Palace");
    expect(hit!.km).toBeLessThan(0.5);
  });

  it("snaps a Hongdae coordinate to the Hongik area", () => {
    const hit = nearestPlace(37.5568, 126.9236);
    expect(hit?.label.toLowerCase()).toContain("hongik");
  });
});

describe("near-me query templates route without the LLM", () => {
  const CASES: [Lang, string][] = [
    ["en", "What's near Myeongdong?"],
    ["ko", "명동 근처에 뭐 있어?"],
    ["ja", "明洞の近くに何がある？"],
    ["zh", "明洞附近有什么？"],
  ];
  it.each(CASES)("[%s] %s routes to a place tool", (lang, text) => {
    const hit = routeText(text, lang);
    expect(hit).not.toBeNull();
    expect(["searchPlaceForeigner", "getAreaGuide"]).toContain(hit!.tool);
  });
});

/* ------------------------- scenario cards always route ----------------------- */

describe("scenario quick-start cards", () => {
  const langs: Lang[] = ["en", "ko", "ja", "zh"];
  for (const lang of langs) {
    it(`all ${lang} cards route to a tool`, () => {
      for (const card of SCENARIOS[lang]) {
        const hit = routeText(card.send, lang);
        expect(hit, `card "${card.send}" must route`).not.toBeNull();
      }
    });
  }
});

/* --------------------- rain / indoor scenario (task 1 core) ------------------ */

describe("indoor intent (rain scenario)", () => {
  it("detects indoor/rain phrasing in all four languages", () => {
    expect(isIndoorIntent("It's raining in Seoul — where can I go indoors?")).toBe(true);
    expect(isIndoorIntent("서울에 비 오는데 실내로 갈 만한 곳 있어?")).toBe(true);
    expect(isIndoorIntent("ソウルで雨が降ってきた。室内で行ける場所は？")).toBe(true);
    expect(isIndoorIntent("首尔下雨了，有什么室内景点推荐？")).toBe(true);
    expect(isIndoorIntent("best cafes in Hongdae")).toBe(false);
  });

  it("rejects the outdoor places that were wrongly recommended in the rain", () => {
    // Real results from the live bug report (2026-08-28).
    expect(isLikelyOutdoor({ title: "Choansan Hydrangea Hill", categoryPath: "Natural Sites(Parks)" })).toBe(true);
    expect(
      isLikelyOutdoor({ title: "Gwangnaru Hangang Park Everyone's Playground", categoryPath: "Leisure/Sports Centers" }),
    ).toBe(true);
    expect(isLikelyOutdoor({ title: "Seoul Forest", summary: "A walking trail and picnic lawn" })).toBe(true);
  });

  it("keeps genuinely sheltered venues", () => {
    expect(isLikelyOutdoor({ title: "SKETCH 2026 : Aesthetics of Liquidity", categoryPath: "Cultural Facilities" })).toBe(false);
    expect(isLikelyOutdoor({ title: "COEX Mall & Starfield Library", categoryPath: "Shopping" })).toBe(false);
    expect(isLikelyOutdoor({ title: "National Museum of Korea", categoryPath: "Cultural Facilities" })).toBe(false);
    // indoor signal wins even when a generic outdoor word appears in the blurb
    expect(isLikelyOutdoor({ title: "Seoul Museum of Art", summary: "Next to a small park" })).toBe(false);
  });
});

/* ------------------------- map links must be usable -------------------------- */

describe("map links", () => {
  it("uses the Korean name and exact coordinates so Naver/Kakao actually find it", () => {
    const out = mapLinksAt("초안산 수국동산", 37.6489, 127.0521);
    expect(out).toContain("map.kakao.com/link/map/");
    expect(out).toContain(encodeURIComponent("초안산 수국동산"));
    expect(out).toContain("37.6489");
    expect(out).toContain("127.0521");
    expect(out).toContain("map.naver.com/p/?c=127.0521,37.6489");
  });

  it("falls back to a name search when coordinates are missing", () => {
    expect(mapLinksAt("경복궁", Number.NaN, Number.NaN)).toBe(mapLinks("경복궁"));
  });
});

/* ------------------- session language must survive a chip tap ---------------- */

describe("language selection", () => {
  it("still detects a language from script when no preference is sent", () => {
    expect(detectLang("경복궁 지금 열었어?")).toBe("ko");
    expect(detectLang("明洞を案内して")).toBe("ja");
  });

  it("documents why the picked language must win over script detection", () => {
    // The live bug: "What is 부대찌개?" was answered entirely in Korean — to the
    // one user who cannot read Korean. Script detection alone says "ko" here, so
    // the orchestrator must prefer the language the user actually selected and
    // only fall back to detection when the client sent no preference.
    expect(detectLang("What is 부대찌개?")).toBe("ko");
    expect(detectLang("Is 明洞 worth visiting?")).toBe("zh");
  });
});

/* --------------------- conversation slots (chip context) --------------------- */

describe("conversation slots", () => {
  const convo = (a: string, u = "ok"): { role: "user" | "assistant"; content: string }[] => [
    { role: "user", content: "what's around Dongdaemun?" },
    { role: "assistant", content: a },
    { role: "user", content: u },
  ];

  it("recovers the places an answer just listed", () => {
    const ctx = deriveContext(convo("**1. Gwangjang Market**\n**2. DDP Plaza**"));
    expect(ctx.places[0]).toBe("Gwangjang Market");
  });

  it("fills the place for 'is one of these open right now?'", () => {
    const ctx = deriveContext(convo("**1. Gwangjang Market**\n**2. DDP Plaza**"));
    const args = backfillArgs("getNowInfo", {}, ctx);
    expect(args.place).toBe("Gwangjang Market");
  });

  it("keeps the bus and city so a tapped track-bus chip works", () => {
    const ctx = deriveContext(convo("🚌 **Seoul Bus 143** — live positions"));
    const args = backfillArgs("trackBusArrival", {}, ctx);
    expect(args.busNumber).toBe("143");
    expect(args.city).toBe("Seoul");
  });

  it("never overrides something the user actually said", () => {
    const ctx = deriveContext(convo("**1. Gwangjang Market**"));
    expect(backfillArgs("getNowInfo", { place: "Gyeongbokgung" }, ctx).place).toBe("Gyeongbokgung");
  });

  it("treats a bare pronoun as missing", () => {
    const ctx = deriveContext(convo("**1. Gwangjang Market**"));
    expect(backfillArgs("getNowInfo", { place: "there" }, ctx).place).toBe("Gwangjang Market");
  });
});

/* ------------------------ CJK place names must resolve ----------------------- */

describe("Japanese / Chinese place names", () => {
  it.each([
    ["明洞", "Myeongdong"],
    ["弘大", "Hongik Univ. Station"],
    ["江南駅", "Gangnam Station"],
    ["首尔站", "Seoul Station"],
    ["仁川机场", "Incheon Int'l Airport T1"],
    ["カロスキル", "Garosu-gil (Sinsa)"],
    ["東大門", "Dongdaemun (DDP)"],
  ])("geocodes %s", (input, label) => {
    expect(resolvePlaceCoord(input)?.label).toBe(label);
  });

  it("reaches the curated area guide from Japanese and Chinese", () => {
    expect(matchAreaName("明洞を案内して")).toContain("Myeongdong");
    expect(matchAreaName("弘大怎么玩？")).toContain("Hongdae");
  });
});
