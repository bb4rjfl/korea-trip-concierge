/**
 * "Near me" — using the traveller's position without ever receiving it.
 *
 * Four ordinary questions, measured against production before this change, and
 * none of them used the traveller's position:
 *
 *   "where is the nearest pharmacy"          → "Tell me a neighborhood"
 *   "what is around me"                      → "What neighborhood are you in?"
 *   "is there a convenience store near me"   → "🏪 Convenience store in me"
 *   "내 주변 맛집"                              → the welcome message
 *
 * The phone now answers these itself, from its own GPS fix: the server reads
 * what they are after and hands back the search to run (src/lib/deviceTask.ts),
 * and is never told where they are. These tests hold the server's half; the
 * phone's half is in on_device.test.ts.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { asksNearMe, placeSaid, withPlace, withPlaceTemplate, WHERE_I_AM } from "../src/lib/here.js";
import { locate, formatDistance } from "../web/client/src/geo.js";
import { handleChat } from "../web/server/orchestrator.js";

describe("recognising a question about wherever they are standing", () => {
  const nearMe = [
    "where is the nearest pharmacy",
    "what is around me",
    "is there a convenience store near me",
    "any good cafes nearby?",
    "closest ATM",
    "내 주변 맛집",
    "근처 약국 어디예요",
    "여기 근처 편의점",
    "近くのコンビニ",
    "この近くに薬局はありますか",
    "附近的药店",
    "我附近有便利店吗",
  ];
  for (const q of nearMe) {
    it(`"${q}" is about here`, () => expect(asksNearMe(q)).toBe(true));
  }

  // Each of these names the place — the answer is about there, not here.
  const namesAPlace = [
    "nearest subway station to Gyeongbokgung",
    "restaurants near Myeongdong",
    "cafes in Hongdae",
    "명동 근처 맛집",
    "홍대 주변 카페",
    "明洞の近くのカフェ",
    "明洞附近的咖啡店",
  ];
  for (const q of namesAPlace) {
    it(`"${q}" is about somewhere named`, () => expect(asksNearMe(q)).toBe(false));
  }

  it("treats 'me' and 'nearby' as no place at all when a model writes them into a slot", () => {
    for (const v of ["me", "near me", "around me", "nearby", "내 주변", "近く", "附近"]) {
      expect(WHERE_I_AM.test(v), v).toBe(true);
    }
    for (const v of ["Myeongdong", "Mexico", "Hereford", "명동"]) expect(WHERE_I_AM.test(v), v).toBe(false);
  });
});

describe("the place the phone attached, read back", () => {
  it("round-trips in all four languages", () => {
    expect(placeSaid(withPlace("where is the nearest pharmacy", "Mangwon Station", "en"))).toBe("Mangwon Station");
    expect(placeSaid(withPlace("내 주변 맛집", "망원역", "ko"))).toBe("망원역");
    expect(placeSaid(withPlace("近くのコンビニ", "マンウォン駅", "ja"))).toBe("マンウォン駅");
    expect(placeSaid(withPlace("附近的药店", "望远站", "zh"))).toBe("望远站");
  });

  it("is only the shape the phone writes, not any parenthesis", () => {
    expect(placeSaid("cafes (quiet ones please)")).toBeUndefined();
  });

  it("leaves the traveller's own words intact in the template", () => {
    expect(withPlaceTemplate("내 주변 맛집", "ko")).toBe("내 주변 맛집 ({place} 근처예요)");
  });
});

describe("the phone's answer to 'where am I'", () => {
  // Places a visitor actually stands — hotels, guesthouses, side streets — not
  // landmarks. With 82 landmarks the nearest was a median 1.3 km off and 8.4 km
  // at worst (Nowon → "Cheongnyangni"). With every station it is a few hundred
  // metres.
  const SEOUL: [string, number, number, RegExp][] = [
    ["hotel near Euljiro 3-ga", 37.5663, 126.991, /Euljiro 3/],
    ["guesthouse in Mangwon-dong", 37.556, 126.9019, /Mangwon/],
    ["Airbnb in Seongsu 2-ga", 37.5446, 127.0568, /Seongsu/],
    ["hotel in Gongdeok", 37.5443, 126.9516, /Gongdeok/],
    ["residential Nowon", 37.6552, 127.0613, /Nowon/],
    ["Sillim", 37.4843, 126.9297, /Sillim/],
  ];
  for (const [where, lat, lng, expected] of SEOUL) {
    it(`finds the right station for a ${where}`, () => {
      const spot = locate(lat, lng, "en");
      expect(spot?.name).toMatch(expected);
      expect(spot?.precise).toBe(true);
      expect(spot!.metres).toBeLessThan(800);
    });
  }

  it("places a Jeju new-town hotel in Sinjeju, not at the airport", () => {
    const spot = locate(33.4854, 126.481, "en");
    expect(spot?.name).toMatch(/Sinjeju/);
    expect(spot?.precise).toBe(true);
  });

  it("says when the nearest thing it knows is too far away to be 'here'", () => {
    // Somewhere in the countryside between cities.
    const spot = locate(36.5, 128.0, "en");
    expect(spot?.precise).toBe(false);
  });

  it("names the station the way a reader of each language writes it", () => {
    expect(locate(37.5446, 127.0568, "en")?.name).toBe("Seongsu Station");
    expect(locate(37.5446, 127.0568, "ko")?.name).toBe("성수역");
    expect(locate(37.5446, 127.0568, "ja")?.name).toBe("ソンス駅");
    expect(locate(37.5446, 127.0568, "zh")?.name).toBe("圣水站");
  });

  it("does not say 'Station' twice", () => {
    expect(locate(37.55623, 126.97214, "en")?.name).toBe("Seoul Station");
  });

  it("gives distances the way a person says them", () => {
    expect(formatDistance(320)).toBe("320 m");
    expect(formatDistance(1430)).toBe("1.4 km");
  });
});

describe("the server, asked about 'near me'", () => {
  beforeAll(() => {
    delete process.env.GEMINI_API_KEY;
  });

  // What each question is after — the part the server can know without being told where.
  const asked: [string, string, string?][] = [
    ["where is the nearest pharmacy", "nearby", "pharmacy"],
    ["what is around me", "sights"],
    ["is there a convenience store near me", "nearby", "convenience"],
    ["내 주변 맛집", "nearby", "food"],
  ];
  for (const [q, kind, need] of asked) {
    it(`hands "${q}" to the phone as a ${need ?? kind} search, and asks only if the phone cannot`, async () => {
      const res = await handleChat({ messages: [{ role: "user", content: q }], uiLang: /[가-힣]/.test(q) ? "ko" : "en" });
      expect(res.device?.kind).toBe(kind);
      if (need) expect(res.device?.kind === "nearby" && res.device.need).toBe(need);
      const text = res.reply ?? res.toolMarkdown ?? "";
      // Neither of the two old failures.
      expect(text).not.toMatch(/in me\b/i);
      expect(text).not.toMatch(/Korea trip concierge|컨시어지입니다/i);
      // The fallback question's 📍 button runs the same search on the phone.
      const here = res.chips.find((c) => c.locate);
      expect(here?.locate?.task).toEqual(res.device);
    });
  }

  it("does not ask again once the phone has said where", async () => {
    const q = withPlace("where is the nearest pharmacy", "Mangwon Station", "en");
    const res = await handleChat({ messages: [{ role: "user", content: q }], uiLang: "en" });
    expect(res.reply ?? "").not.toMatch(/Where are you right now/);
    expect(res.device).toBeUndefined();
  });

  it("offers a neighbourhood already talked about, without assuming they are in it", async () => {
    const res = await handleChat({
      messages: [
        { role: "user", content: "what is Myeongdong like" },
        { role: "assistant", content: "Myeongdong is a shopping district." },
        { role: "user", content: "where is the nearest pharmacy" },
      ],
      uiLang: "en",
    });
    expect(res.chips.some((c) => /Myeongdong/.test(c.cmdEn) && !c.locate)).toBe(true);
    expect(res.chips[0].locate).toBeDefined();
  });
});

describe("the server can place the names the phone sends", () => {
  it("resolves every station, in all four languages", async () => {
    const { resolvePlaceCoord } = await import("../src/lib/places.js");
    for (const name of ["Mangwon Station", "망원역", "マンウォン駅", "望远站"]) {
      const p = resolvePlaceCoord(name);
      expect(p?.lat, name).toBeCloseTo(37.556, 2);
      expect(p?.lng, name).toBeCloseTo(126.91, 2);
    }
  });

  it("does not read an ordinary word as a station", async () => {
    // 오리 is a duck, 온수 hot water, 대화 a conversation — all station names too.
    const { findPlaceInText } = await import("../src/lib/places.js");
    expect(findPlaceInText("오리고기 맛집 추천")).toBeUndefined();
    expect(findPlaceInText("온수 나와요?")).toBeUndefined();
    expect(findPlaceInText("대화 좀 해요")).toBeUndefined();
    expect(findPlaceInText("오리역 근처 카페")?.label).toMatch(/Ori/);
    expect(findPlaceInText("restaurants near Mangwon Station")?.label).toMatch(/Mangwon/);
  });
});

describe("an essential asked for in any of our languages", () => {
  // "附近的药店" got the generic menu of every essential: the need matcher threw
  // away every character that was not Latin or Hangul before looking it up.
  const pharmacy: [string, string][] = [
    ["药店", "zh"],
    ["薬局", "ja"],
    ["약국", "ko"],
    ["pharmacy", "en"],
  ];
  for (const [need, lang] of pharmacy) {
    it(`reads "${need}" (${lang}) as a pharmacy`, async () => {
      const { findForeignerFriendlyStore } = await import("../src/tools/findForeignerFriendlyStore.js");
      const out = await findForeignerFriendlyStore.handler({ need, area: "Seongsu" });
      const text = out.content[0].text;
      // The pharmacy card itself, not the menu of every essential — which also
      // has a 💊 line in it, so the heading and the menu's own wording are checked.
      expect(text).toMatch(/💊 \*\*Pharmacy/);
      expect(text).not.toMatch(/visitors get stuck on here/);
    });
  }
});
