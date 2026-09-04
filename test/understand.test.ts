/**
 * The query-understanding layer: does the sentence's own vocabulary survive?
 *
 * Every case here comes from an answer the evaluation harness marked down, so
 * these are regressions waiting to happen rather than hypotheticals.
 */

import { describe, it, expect } from "vitest";
import { understand, expandQuery, isEmptyReading, readingNote } from "../src/lib/understand.js";
import { SERVICES } from "../src/tools/explainKoreanService.js";
import { GUIDES } from "../src/tools/explainPayment.js";

describe("qualities — the adjectives that decide whether an answer fits", () => {
  it("hears 'quiet' however it is said", () => {
    for (const said of [
      "something indoors and quiet",
      "I'm exhausted from shopping",
      "somewhere to sit down and relax",
      "조용한 곳",
      "静かなところ",
    ]) {
      expect(understand(said).qualities, said).toContain("quiet");
    }
  });

  it("does not find rest inside restaurant", () => {
    // "my card was declined at a restaurant, what now" read as a request for
    // somewhere restful, which bends the answer towards teahouses.
    expect(understand("my card was declined at a restaurant, what now").qualities).not.toContain("quiet");
  });

  it("separates indoors from outdoors", () => {
    expect(understand("somewhere indoors, it's pouring").qualities).toContain("indoor");
    expect(understand("I want to be outside in the fresh air").qualities).toContain("outdoor");
  });
});

describe("diets — all of them, not the first one found", () => {
  it("keeps both requirements when two people are eating", () => {
    const r = understand("I'm vegan and my friend eats only halal, where can we eat together");
    expect(r.diets).toContain("vegan");
    expect(r.diets).toContain("halal");
  });

  it("reads them in the other languages we serve", () => {
    expect(understand("할랄 식당 있어요?").diets).toContain("halal");
    expect(understand("ビーガンのお店").diets).toContain("vegan");
  });
});

describe("shape — what do I do, versus am I allowed, versus where is", () => {
  it("knows a person in trouble from a person browsing", () => {
    expect(understand("my phone died and I have no cash, how do I get to my hotel").urgent).toBe(true);
    expect(understand("my card was declined, what now").urgent).toBe(true);
    expect(understand("art galleries in Gangnam").urgent).toBe(false);
  });

  it("knows a permission question from a search", () => {
    expect(understand("can I bring my dog into a cafe").permission).toBe(true);
    expect(understand("pet friendly cafes in Seongsu").permission).toBe(false);
  });

  it("leaves a plain place request alone, so nothing overrides it", () => {
    // This one regressed once: the arbitration hijacked a request for
    // restaurants and answered with a general card about how cards work.
    const r = understand("명동에서 카드 되는 식당 알려줘");
    expect(r.urgent).toBe(false);
    expect(r.permission).toBe(false);
  });
});

describe("expansion adds vocabulary without losing the topic", () => {
  it("keeps the traveller's own words", () => {
    const q = "something indoors and quiet";
    expect(expandQuery(q)).toContain(q);
  });

  it("adds the words a matching document would use", () => {
    expect(expandQuery("somewhere quiet")).toMatch(/library|garden|teahouse/);
    expect(expandQuery("halal food")).toMatch(/mosque|Itaewon/i);
  });

  it("changes nothing when the sentence carries no qualifier", () => {
    expect(expandQuery("Gyeongbokgung")).toBe("Gyeongbokgung");
    expect(isEmptyReading(understand("Gyeongbokgung"))).toBe(true);
    expect(readingNote(understand("Gyeongbokgung"))).toBe("");
  });
});

describe("every guide can be reached by its own name", () => {
  // The corpus routes by document, and a document's title is the guide's label.
  // When a label does not match the matcher that selected it, routing lands on
  // the tool and then falls through to a generic card — which is exactly what
  // "Travelling with a pet" did.
  it("each Korean-service guide matches its own label", () => {
    for (const s of SERVICES) {
      expect(s.match.test(s.label), `"${s.label}" does not match its own matcher`).toBe(true);
    }
  });

  it("each payment guide matches its own label", () => {
    for (const g of GUIDES) {
      expect(g.match.test(g.label), `"${g.label}" does not match its own matcher`).toBe(true);
    }
  });
});
