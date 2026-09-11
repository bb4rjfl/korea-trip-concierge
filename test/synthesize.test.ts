/**
 * The groundedness guard: what the composing layer is allowed to say.
 *
 * This is the control that makes an LLM layer safe to put in front of a
 * traveller. Asking a model to be faithful is not a control; discarding an
 * answer that states something the facts did not is.
 *
 * Every case here is one production actually produced.
 */

import { describe, it, expect } from "vitest";
import { ungroundedToken, droppedEssential, inventedStatus } from "../web/server/synthesize.js";
import { laterToday, type Departure } from "../src/lib/sources/intercityApi.js";

const FACTS = [
  "Gyeongbokgung Palace 09:00-18:00, closed Tuesdays.",
  "Subway Line 3 Anguk Station Exit 3, 389m.",
  "Fare 1,550 won. Walk 12 min.",
  "Horim Museum Sinsa 10:30-18:00, closed Sundays.",
].join(" ");

describe("a faithful rewrite passes", () => {
  it("accepts rearranged facts", () => {
    expect(
      ungroundedToken(
        "Gyeongbokgung is open until 18:00 and closed Tuesdays. From Anguk Station Exit 3 it is 389m, about a 12 min walk, and the fare is 1,550 won.",
        FACTS,
      ),
    ).toBeUndefined();
  });

  it("accepts a clock rewritten into 12-hour form", () => {
    // Production discarded a good answer for saying "7:12" where the facts said
    // "19:12" — the same time, written the way a reader expects it.
    expect(ungroundedToken("It closes at 6:00 this evening.", "Open until 18:00.")).toBeUndefined();
  });

  it("accepts travel vocabulary that starts a line", () => {
    // "Subway" cost us a good answer once. It is how the sentence is phrased,
    // not a claim about anywhere.
    expect(ungroundedToken("Subway Line 3, Anguk Station, Exit 3.", FACTS)).toBeUndefined();
  });

  it("accepts a number the facts contain inside a longer one", () => {
    expect(ungroundedToken("It costs 550 won more than that.", "Fare 1,550 won.")).toBeUndefined();
  });
});

describe("an invented claim is rejected", () => {
  const cases: [string, string][] = [
    ["a place that was never mentioned", "Afterwards, Insadong is a ten-minute walk."],
    ["a fare we never stated", "The fare is 2,400 won."],
    ["an opening hour we never stated", "It stays open until 22:00 on Fridays."],
    ["a station we never stated", "Get off at Euljiro Station."],
  ];

  for (const [name, answer] of cases) {
    it(`rejects ${name}`, () => {
      expect(ungroundedToken(answer, FACTS), answer).toBeDefined();
    });
  }

  it("names what it rejected, so a failure is diagnosable", () => {
    expect(ungroundedToken("The fare is 2,400 won.", FACTS)).toBe("2,400");
  });
});

describe("the situation counts as fact", () => {
  it("lets the answer quote the time and weather it was given", () => {
    const facts = [
      "Gyeongbokgung Palace 09:00-18:00.",
      "Local time in Korea: 2026-09-06 14:30 KST",
      "Weather right now: 24°C, Clear",
    ].join("\n");
    expect(
      ungroundedToken("It is 24°C and clear, and the palace is open until 18:00 — you have time.", facts),
    ).toBeUndefined();
  });
});

describe("grounded but unfaithful — the other half of the failure", () => {
  // Everything in these answers is in the facts. What was lost is what mattered,
  // and looking for added claims cannot see it. Both cases are ones production
  // produced within a single evaluation run.
  const threeOptions = ["**Horim Museum Sinsa**", "**Leeum Museum of Art**", "**Songeun Art Space**"].join("\n");

  it("rejects a list reduced to a single option", () => {
    expect(droppedEssential("Horim Museum Sinsa is closed today.", threeOptions)).toMatch(/1 of 3/);
  });

  it("accepts a rewrite that keeps an alternative when the first is closed", () => {
    expect(
      droppedEssential("Horim Museum Sinsa is closed today — Leeum Museum of Art is open until 18:00.", threeOptions),
    ).toBeUndefined();
  });

  it("rejects an arrival time that lost its direction", () => {
    const card = "Line 2 · 신도림 방면 · 3 min";
    expect(droppedEssential("The next train arrives in 3 min.", card)).toMatch(/direction/);
    expect(droppedEssential("Next train toward 신도림 in 3 min.", card)).toBeUndefined();
  });

  it("leaves a single-option card alone", () => {
    // Nothing was dropped if there was only ever one thing to say.
    expect(droppedEssential("Jogyesa Temple is open.", "**Jogyesa Temple**")).toBeUndefined();
  });
});

describe("a list of places near somewhere, and the rewrite that forgot where", () => {
  // Production: asked for a convenience store near Gongdeok Station, the rewrite
  // said "CU, GS25, 7-Eleven and emart24 are near Gongdeok" — true, and every
  // store the card had actually found, with its street, gone.
  const card = [
    "🏪 **Convenience store in Gongdeok Station**",
    "The big chains are **7-Eleven**, **emart24**, CU and GS25 — all 24h.",
    "**Nearby:**",
    "**1. GS25 Gongdeok Station (GS25 공덕역점)**",
    "   📍 Mapogu Baekbeomro 202, Seoul",
    "**2. CU Mapo Dohwa (CU 마포도화점)**",
    "   📍 Mapogu Baekbeomro 199, Seoul",
    "**3. 7-Eleven Gongdeok Lotte (세븐일레븐 공덕롯데점)**",
    "   📍 Dohwadong",
  ].join("\n");

  it("rejects an answer that kept the chain names and dropped the stores", () => {
    const answer = "공덕역 근처 편의점은 **CU, GS25, 7-Eleven, emart24**가 있습니다. 모두 24시간 운영됩니다.";
    expect(droppedEssential(answer, card)).toMatch(/located places were dropped/);
  });

  it("accepts a rewrite that keeps the stores, in either script", () => {
    expect(droppedEssential("가까운 곳은 GS25 공덕역점과 CU 마포도화점이에요.", card)).toBeUndefined();
    expect(droppedEssential("Try GS25 Gongdeok Station or CU Mapo Dohwa, both on Baekbeom-ro.", card)).toBeUndefined();
  });
});

describe("a live status the facts never gave", () => {
  // Asked "is my KTX from Seoul to Busan delayed today?", production answered
  // "Your KTX from Seoul to Busan is not delayed today" over a timetable.
  const timetable = [
    "🚄 **Today's last train has left — first trains tomorrow:**",
    "- **KTX** 05:13 → 07:50 _(2h37)_ · 💳 ₩59,800",
    "⏱️ _Timetable only, not live status — delays and platform changes show in the **Korail Talk** app and on the station boards._",
  ].join("\n");

  it("is rejected, in all four languages", () => {
    expect(inventedStatus("Your KTX from Seoul to Busan is not delayed today.", timetable)).toBeTruthy();
    expect(inventedStatus("The 05:13 KTX is running on time.", timetable)).toBeTruthy();
    expect(inventedStatus("There are no delays on the Busan line.", timetable)).toBeTruthy();
    expect(inventedStatus("오늘 부산행 KTX는 지연이 없습니다.", timetable)).toBeTruthy();
    expect(inventedStatus("KTXは定刻通り運行しています。", timetable)).toBeTruthy();
    expect(inventedStatus("今天去釜山的KTX没有延误。", timetable)).toBeTruthy();
  });

  it("lets an answer that says where to find the status through", () => {
    expect(inventedStatus("For delays, check the Korail Talk app — this is the timetable.", timetable)).toBeUndefined();
    expect(inventedStatus("지연 여부는 코레일톡 앱에서 확인하세요.", timetable)).toBeUndefined();
    expect(inventedStatus("The first KTX tomorrow leaves at 05:13.", timetable)).toBeUndefined();
  });
});

describe("departures still to come today", () => {
  const dep = (depart: string): Departure => ({ grade: "KTX", depart, arrive: "08:00", minutes: 160 }) as Departure;
  const list = [dep("05:13"), dep("12:00"), dep("22:40")];

  it("are the ones after now, Korea time", () => {
    const at2230 = Date.UTC(2026, 8, 11, 13, 30); // 22:30 KST
    expect(laterToday(list, at2230).map((d) => d.depart)).toEqual(["22:40"]);
  });

  it("are none once the last has gone — so the card can say so", () => {
    const at2308 = Date.UTC(2026, 8, 11, 14, 8); // 23:08 KST
    expect(laterToday(list, at2308)).toEqual([]);
  });
});
