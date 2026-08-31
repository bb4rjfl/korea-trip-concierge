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
  it("maps shrimp, エビ and 새우 onto the shellfish data we hold", () => {
    for (const word of ["shrimp", "エビ", "새우", "I'm allergic to prawns"]) {
      const text = translateMenuContext.handler({ menuText: "짬뽕", allergyConcerns: [word] }).content[0].text;
      expect(text).toContain("Contains shellfish");
    }
  });

  it("still reports a concern it cannot check rather than passing it silently", () => {
    const text = translateMenuContext.handler({ menuText: "비빔밥", allergyConcerns: ["mushroom"] }).content[0].text;
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
