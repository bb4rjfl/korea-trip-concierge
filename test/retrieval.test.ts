/**
 * The retrieval layer: does a sentence someone would actually type reach the
 * thing that answers it, and does an unanswerable one get turned away?
 *
 * These run against the real index, so they are slower than the rest of the
 * suite and they exercise the embedding path when a key is present. Without a
 * key the index is lexical-only and the assertions that need semantics are
 * skipped rather than failed — a missing key is a degraded service, not a bug.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { buildCorpus } from "../src/lib/corpus.js";
import { search, confident, corpusSize, corpusEmbedded, tokenize } from "../src/lib/retrieval.js";

const TIMEOUT = 120_000;

beforeAll(async () => {
  buildCorpus();
  // Lexical is ready at once; give the vectors a chance to land.
  for (let i = 0; i < 60 && !corpusEmbedded(); i++) {
    await new Promise((r) => setTimeout(r, 1000));
  }
}, TIMEOUT);

describe("tokenizing", () => {
  it("splits Korean into character bigrams, because whitespace does not work there", () => {
    expect(tokenize("조용한 카페")).toContain("조용");
    expect(tokenize("조용한 카페")).toContain("카페");
  });

  it("keeps Latin words whole and drops one-letter noise", () => {
    const t = tokenize("a quiet cafe in Hongdae");
    expect(t).toContain("quiet");
    expect(t).toContain("hongdae");
    expect(t).not.toContain("a");
  });

  it("finds the same tokens in two inflections of one Korean phrase", () => {
    const a = new Set(tokenize("조용한 카페"));
    const shared = tokenize("조용하고 넓은 카페").filter((t) => a.has(t));
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe("the corpus holds everything the service knows", () => {
  it("indexes several hundred documents across every kind", () => {
    expect(corpusSize()).toBeGreaterThan(250);
  });
});

describe("a sentence reaches the thing that answers it", () => {
  const cases: [string, RegExp][] = [
    ["I want to see a traditional wedding or ceremony", /hanok|heritage|tea|traditional/i],
    ["something indoors and quiet, I'm exhausted from shopping", /library|indoor|hanok|museum|garden/i],
    ["I'm vegan and my friend eats only halal", /itaewon/i],
    ["is it rude to leave a tip", /tip|manners/i],
    ["how do I get a T-money card", /transit|t-money/i],
    ["24 hour sauna", /jjimjilbang|spa|sauna/i],
  ];

  for (const [query, expected] of cases) {
    it(`answers "${query}"`, async () => {
      const hits = await search(query, { limit: 3 });
      expect(hits.length, "no hits at all").toBeGreaterThan(0);
      if (!corpusEmbedded()) return; // lexical-only: paraphrase is not expected to work
      expect(confident(hits), `not confident: ${hits[0]?.doc.title}`).toBe(true);
      const titles = hits.map((h) => h.doc.title).join(" | ");
      expect(titles, titles).toMatch(expected);
    }, TIMEOUT);
  }
});

describe("a question we cannot answer is turned away", () => {
  // The failure worth guarding is not silence, it is a confident wrong answer:
  // "can I bring my dog into a cafe" came back as an art museum.
  const unanswerable = [
    "what is the capital of France",
    "how do I fix my car engine",
    "what is the bitcoin price today",
    "write me a python script",
    "who won the world cup",
  ];

  for (const query of unanswerable) {
    it(`declines "${query}"`, async () => {
      if (!corpusEmbedded()) return;
      const hits = await search(query, { limit: 1 });
      expect(confident(hits), `leaked: ${hits[0]?.doc.title} (${hits[0]?.cosine})`).toBe(false);
    }, TIMEOUT);
  }
});

describe("confidence comes from cosine, never from the fused rank", () => {
  it("does not call a hit confident just because it ranked first", async () => {
    // Reciprocal Rank Fusion gives the top hit 1/61 whatever it is, which is why
    // the first version of the gate passed every query put to it.
    const hits = await search("what is the bitcoin price today", { limit: 3 });
    if (!hits.length || !corpusEmbedded()) return;
    expect(hits[0].score).toBeGreaterThan(0); // it did rank first
    expect(confident(hits)).toBe(false); // and is still not an answer
  }, TIMEOUT);
});

describe("kind filters", () => {
  it("returns only what was asked for", async () => {
    const hits = await search("peanut allergy", { kinds: ["dish"], limit: 5 });
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) expect(h.doc.kind).toBe("dish");
  }, TIMEOUT);

  it("finds the dishes that actually carry the allergen", async () => {
    if (!corpusEmbedded()) return;
    const hits = await search("peanut allergy", { kinds: ["dish"], limit: 5 });
    const withPeanut = hits.filter((h) => /peanut/.test(h.doc.text));
    expect(withPeanut.length, hits.map((h) => h.doc.title).join(" | ")).toBeGreaterThan(0);
  }, TIMEOUT);
});
