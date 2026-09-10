/**
 * "From where I am" — the loop a traveller actually hit.
 *
 * Asked "How do I get to 뱅뱅사거리?", we asked where they were starting from
 * and offered a button: "From my area to 뱅뱅사거리". Tapping it sent those
 * words to a server that cannot know anyone's area — coordinates never leave the
 * phone, by design — so it asked the same question again, with the same button
 * under it, plus a note suggesting they try a different cuisine.
 *
 * And once past that, the next thing waiting was a 37-minute bus from an
 * apartment complex in Suseo, because a stop named "…강남아파트" matched the
 * word 강남. Both are pinned here.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { WHERE_I_AM, getTransitRoute } from "../src/tools/getTransitRoute.js";
import { nearThePlace, type BusStop } from "../src/lib/sources/busRoute.js";
import { handleChat } from "../web/server/orchestrator.js";

describe("an origin that means 'wherever I am'", () => {
  const meansHere = [
    "my area",
    "from my area",
    "here",
    "where I am",
    "my location",
    "current location",
    "내 위치",
    "지금 내 위치",
    "여기서",
    "現在地",
    "ここから",
    "我的位置",
    "这里",
  ];
  for (const said of meansHere) {
    it(`reads "${said}" as no origin at all`, () => {
      expect(WHERE_I_AM.test(said)).toBe(true);
    });
  }

  const places = ["Myeongdong", "Hereford", "Gangnam Station", "여의도", "ここ屋"];
  for (const said of places) {
    it(`leaves "${said}" alone — it is somewhere`, () => {
      expect(WHERE_I_AM.test(said)).toBe(false);
    });
  }
});

describe("the route planner asks for an origin with a button that can answer it", () => {
  it("offers 'from where I am' first, marked with the location glyph", async () => {
    const out = await getTransitRoute.handler({ from: "my area", to: "뱅뱅사거리" });
    const text = out.content[0].text;
    expect(text).toMatch(/Where are you starting from/);
    const chips = text.split("\n").filter((l) => l.trim().startsWith("- "));
    expect(chips[0]).toMatch(/📍/);
    expect(chips[0]).toMatch(/뱅뱅사거리/);
    // The old wording is gone — it read as a sentence the server could act on.
    expect(text).not.toMatch(/From my area/);
  });
});

describe("the web client is told to find the traveller, not to resend the words", () => {
  beforeAll(() => {
    // Deterministic: the rule router, no composing layer, no translation.
    delete process.env.GEMINI_API_KEY;
  });

  it("marks the 📍 button as a location action carrying the destination", async () => {
    const res = await handleChat({ messages: [{ role: "user", content: "How do I get to 뱅뱅사거리?" }], uiLang: "en" });
    expect(res.meta.tool).toBe("getTransitRoute");
    const here = res.chips.find((c) => c.emoji === "📍");
    expect(here?.locate).toEqual({ to: "뱅뱅사거리" });
    // Every other button is still an ordinary question.
    for (const c of res.chips.filter((c) => c.emoji !== "📍")) expect(c.locate).toBeUndefined();
  });

  it("does not advise changing the cuisine when the repeated answer is a route question", async () => {
    const ask = "How do I get to 뱅뱅사거리?";
    const first = await handleChat({ messages: [{ role: "user", content: ask }], uiLang: "en" });
    const again = await handleChat({
      messages: [
        { role: "user", content: ask },
        { role: "assistant", content: first.toolMarkdown ?? first.reply ?? "" },
        { role: "user", content: ask },
      ],
      uiLang: "en",
    });
    const body = again.toolMarkdown ?? again.reply ?? "";
    // The repeat is still named — it is honest — just without the list advice.
    expect(body).toMatch(/same answer as above/i);
    expect(body).not.toMatch(/cuisine/i);
  });
});

describe("a stop is only at a place if it is near it", () => {
  // Real coordinates from the Seoul bus API for a search on 강남.
  const stops: BusStop[] = [
    { stId: "1", arsId: "23440", name: "LH수서.디아크리온강남아파트", lat: 37.479078, lng: 127.105708 },
    { stId: "2", arsId: "23813", name: "강남역", lat: 37.4985037086, lng: 127.0300921798 },
    { stId: "3", arsId: "22859", name: "강남역.삼성전자", lat: 37.4970515618, lng: 127.0278698411 },
    { stId: "4", arsId: "99999", name: "강남어딘가", lat: undefined, lng: undefined },
  ];

  it("drops the namesake seven kilometres away", () => {
    const kept = nearThePlace(stops, "강남").map((s) => s.name);
    expect(kept).toContain("강남역");
    expect(kept).toContain("강남역.삼성전자");
    expect(kept).not.toContain("LH수서.디아크리온강남아파트");
  });

  it("leaves a name it cannot place untouched", () => {
    // 뱅뱅사거리 is specific enough that every match really is there.
    const junction: BusStop[] = [{ stId: "5", arsId: "22001", name: "뱅뱅사거리", lat: 37.4885, lng: 127.0343 }];
    expect(nearThePlace(junction, "뱅뱅사거리xyz-unplaceable")).toEqual(junction);
  });
});
