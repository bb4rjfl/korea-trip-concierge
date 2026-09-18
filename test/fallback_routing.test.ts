/**
 * The questions the service answered wrongly in the service-wide sweep, by cause.
 *
 * With the language model out of allowance, the chat runs on these rules, and
 * the sweep found them answering a journey with the welcome message, an
 * itinerary with a weather card, and our own "Refresh" button with a question
 * about a park nobody mentioned. Some of these also run before the model, so
 * they decide the answer even when it is working.
 */

import { describe, it, expect } from "vitest";
import { routeText, criticalRoute } from "../web/server/router.js";
import { askAgain } from "../web/server/orchestrator.js";
import { whatToWear } from "../src/tools/getWeatherAndAir.js";

const tool = (text: string, lang: "en" | "ko" | "ja" | "zh" = "en") => routeText(text, lang)?.tool;

describe("our own Refresh and Try again buttons", () => {
  it("ask the previous question again", () => {
    const msgs = [
      { role: "user", content: "When does bus 143 come to Sinsa station?" },
      { role: "assistant", content: "Bus 143 is 1 stop away." },
      { role: "user", content: "Refresh" },
    ];
    expect(askAgain(msgs).at(-1)?.content).toBe("When does bus 143 come to Sinsa station?");
    expect(askAgain([...msgs.slice(0, 2), { role: "user", content: "Refresh for leaving now" }]).at(-1)?.content).toBe(msgs[0].content);
    expect(askAgain([...msgs.slice(0, 2), { role: "user", content: "다시 확인" }]).at(-1)?.content).toBe(msgs[0].content);
  });

  it("leave a real question alone", () => {
    const msgs = [{ role: "user", content: "Refresh my memory: what is bibimbap?" }];
    expect(askAgain(msgs)).toBe(msgs);
  });
});

describe("a journey named as two places", () => {
  it("is routed, not welcomed", () => {
    expect(tool("Busan Station to Haedong Yonggungsa")).toBe("getTransitRoute");
    expect(tool("Gangnam to Everland")).toBe("getTransitRoute");
    expect(routeText("Jeju Airport to Seongsan Ilchulbong", "en")?.args).toMatchObject({ from: "Jeju Airport", to: "Seongsan Ilchulbong" });
  });

  it("is a journey even when it names the subway", () => {
    expect(tool("Myeongdong to Gyeongbokgung by subway")).toBe("getTransitRoute");
  });

  it("does not turn ordinary sentences into routes", () => {
    expect(tool("Welcome to Korea")).not.toBe("getTransitRoute");
  });
});

describe("station questions read the station, not the sentence", () => {
  it("splits the direction off the station", () => {
    const hit = routeText("Next subway at Gangnam station toward Jamsil", "en");
    expect(hit?.tool).toBe("trackSubwayArrival");
    expect(hit?.args).toMatchObject({ station: "Gangnam", to: "Jamsil" });
  });

  it("does not read the 'at' inside 'What' as a station", () => {
    expect(criticalRoute("What time is the last train from Hongdae to Jamsil tonight?")?.args).toMatchObject({ station: "Hongdae" });
  });
});

describe("itineraries and sights", () => {
  it("are planned as courses", () => {
    for (const q of [
      "Plan a 2-day trip in Busan for a couple",
      "One day in Seoul for a foodie in their 20s",
      "Rainy day itinerary for Seoul",
      "What should I see in Gyeongju in one day?",
    ]) {
      expect(tool(q), q).toBe("recommendTripCourse");
    }
    expect(tool("慶州で1日観光", "ja")).toBe("recommendTripCourse");
    expect(tool("경주 1박 2일 코스 짜줘", "ko")).toBe("recommendTripCourse");
  });

  it("send 'things to do' somewhere to go, not to the welcome message", () => {
    for (const [q, lang] of [["Things to do in Busan", "en"], ["부산 가볼만한 곳", "ko"]] as const) {
      expect(["searchPlaceForeigner", "getAreaGuide", "recommendTripCourse"], q).toContain(tool(q, lang));
    }
  });

  it("answer indoor places for a rainy day with places, not the forecast", () => {
    for (const [q, lang] of [
      ["Indoor places to go in Seoul on a rainy day", "en"],
      ["비 오는 날 서울 실내 데이트", "ko"],
      ["下雨天首尔室内去哪", "zh"],
    ] as const) {
      expect(tool(q, lang), q).not.toBe("getWeatherAndAir");
      expect(tool(q, lang), q).toBeDefined();
    }
  });
});

describe("what to wear", () => {
  it("is a weather question about today, not the season", () => {
    expect(criticalRoute("What should I wear today?")).toBeNull();
    expect(tool("What should I wear today?")).toBe("getWeatherAndAir");
  });

  it("is answered on the card", () => {
    expect(whatToWear(30, 0)).toMatch(/breathable/);
    expect(whatToWear(3, 70)).toMatch(/coat/);
    expect(whatToWear(3, 70)).toMatch(/umbrella/i);
    expect(whatToWear(undefined, 20)).toBeUndefined();
  });
});

describe("questions that looked like something else", () => {
  it("answers a taxi fare with how taxis charge, not the subway", () => {
    expect(tool("How much is a taxi from Gimpo Airport to Gangnam?")).toBe("explainPayment");
  });

  it("answers booking KTX with train tickets, not restaurant tables", () => {
    expect(tool("Can I book KTX tickets online as a foreigner?")).toBe("explainPayment");
  });

  it("explains a dish asked about by name", () => {
    expect(tool("What is budae jjigae?")).toBe("translateMenuContext");
    expect(tool("떡볶이 많이 매워?", "ko")).toBe("translateMenuContext");
  });

  it("does not send a temple stay to the guide for Korean phone verification", () => {
    expect(tool("Can you recommend a temple stay?")).not.toBe("explainKoreanService");
  });
});

describe("a taxi fare is not a taxi route", () => {
  // The model answered "how much is a taxi" with a subway route, so this is
  // decided before the model, in criticalRoute.
  it("answers 'how much is a taxi' with fare/payment guidance", () => {
    expect(criticalRoute("How much is a taxi from Incheon Airport to Hongdae?")?.tool).toBe("explainPayment");
    expect(criticalRoute("인천공항에서 홍대 택시비 얼마야?")?.tool).toBe("explainPayment");
  });
  it("leaves a plain 'how do I get' to the route planner", () => {
    expect(criticalRoute("How do I get from Incheon Airport to Hongdae?")).toBeNull();
  });
});

describe("iconic must-see in every language", () => {
  it("leads with the curated list for fun/recommend phrasings, not only English 'must-see'", async () => {
    const { cityMustSeeLead } = await import("../src/tools/searchPlaceForeigner.js");
    expect(cityMustSeeLead("首尔有什么好玩的", ""), "zh fun").toMatch(/must-see/);
    expect(cityMustSeeLead("ソウルのおすすめ観光", ""), "ja recommend").toMatch(/must-see/);
    expect(cityMustSeeLead("서울 볼만한 곳", ""), "ko").toMatch(/must-see/);
  });
});

describe("the menu card's button", () => {
  it("names the dish it just explained", async () => {
    const { translateMenuContext } = await import("../src/tools/translateMenuContext.js");
    const r = (await translateMenuContext.handler({ menuText: "budae jjigae" })) as { content: { text: string }[] };
    expect(r.content[0].text).toMatch(/Where can I eat army stew nearby\?/i);
    expect(r.content[0].text).not.toMatch(/Find a place that serves this/);
  });
});
