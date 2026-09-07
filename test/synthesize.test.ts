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
import { ungroundedToken, droppedEssential } from "../web/server/synthesize.js";

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
  const threeOptions = ["**Horim Museum Sinsa**", "**Leeum Museum of Art**", "**Songeun Art Space**"].join("
");

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
