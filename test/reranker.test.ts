/**
 * The reranker is allowed to change the order and nothing else.
 *
 * A reranker sits between retrieval and the answer, so a bad reply from it is
 * indistinguishable from bad retrieval unless the shortlist is protected
 * mechanically. These tests are that protection: whatever the model sends back,
 * every candidate comes out exactly once, and anything it did not send back
 * leaves the fused order untouched.
 *
 * Reranking itself is off in tests — there is no key — so the guarantees are
 * checked against the parsing logic directly, with the network stubbed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchWithTimeout = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/http.js", () => ({ fetchWithTimeout }));

const { rerank } = await import("../src/lib/sources/reranker.js");

/** What the API returns when the model replies with `order`. */
function reply(text: string) {
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
}

const CANDIDATES = ["Gallery", "Library", "Mall", "Teahouse"].map((title, i) => ({
  title,
  snippet: `candidate ${i}`,
  kind: "place to visit",
}));

/** A fresh query each time, or the 30-minute cache answers instead of the stub. */
let n = 0;
const query = () => `where should I go ${n++}`;

describe("the reranker", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.RERANK;
    fetchWithTimeout.mockReset();
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("returns the order the model gave", async () => {
    fetchWithTimeout.mockResolvedValue(reply('{"order":[3,0,2,1]}'));
    expect(await rerank(query(), CANDIDATES)).toEqual([3, 0, 2, 1]);
  });

  it("keeps a candidate the model forgot, in the order retrieval had it", async () => {
    // Dropping a candidate because a model omitted it would turn a reordering
    // step into a filter, which is not what it was given permission to be.
    fetchWithTimeout.mockResolvedValue(reply('{"order":[3,1]}'));
    expect(await rerank(query(), CANDIDATES)).toEqual([3, 1, 0, 2]);
  });

  it("ignores positions that were never offered", async () => {
    fetchWithTimeout.mockResolvedValue(reply('{"order":[9,-1,2,0,1,3]}'));
    expect(await rerank(query(), CANDIDATES)).toEqual([2, 0, 1, 3]);
  });

  it("ignores a position repeated twice", async () => {
    fetchWithTimeout.mockResolvedValue(reply('{"order":[1,1,1,0,2,3]}'));
    expect(await rerank(query(), CANDIDATES)).toEqual([1, 0, 2, 3]);
  });

  it("honours a partial answer", async () => {
    // Asked which of eight documents answers "I need a pharmacy open late at
    // night", the model named the one that does and ignored the three
    // sightseeing spots ranked above it. That is the correct answer, and a rule
    // demanding a full permutation was discarding it.
    fetchWithTimeout.mockResolvedValue(reply('{"order":[2]}'));
    expect(await rerank(query(), CANDIDATES)).toEqual([2, 0, 1, 3]);
  });

  const junk: [string, string][] = [
    ["prose instead of JSON", "I think the teahouse is best."],
    ["an empty reply", ""],
    ["the wrong shape", '{"ranking":[0,1,2,3]}'],
    ["a ranking of nothing", '{"order":[]}'],
    ["positions that do not exist", '{"order":[11,12]}'],
  ];

  for (const [name, text] of junk) {
    it(`falls back to the fused order on ${name}`, async () => {
      fetchWithTimeout.mockResolvedValue(reply(text));
      expect(await rerank(query(), CANDIDATES)).toBeUndefined();
    });
  }

  it("falls back to the fused order when the call fails", async () => {
    // A slow or unreachable reranker must cost the answer nothing but the wait.
    fetchWithTimeout.mockRejectedValue(new Error("upstream timed out after 1500ms"));
    expect(await rerank(query(), CANDIDATES)).toBeUndefined();
  });

  it("does not call out for a shortlist too short to reorder usefully", async () => {
    expect(await rerank(query(), CANDIDATES.slice(0, 2))).toBeUndefined();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });

  it("can be switched off without a deploy", async () => {
    process.env.RERANK = "off";
    expect(await rerank(query(), CANDIDATES)).toBeUndefined();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
    delete process.env.RERANK;
  });

  it("sends the question and the candidates, and asks for one attempt only", async () => {
    fetchWithTimeout.mockResolvedValue(reply('{"order":[0,1,2,3]}'));
    await rerank("somewhere quiet and indoors", CANDIDATES);
    const [url, init, timeout] = fetchWithTimeout.mock.calls[0];
    expect(url).toContain("generateContent");
    expect(String(init.body)).toContain("somewhere quiet and indoors");
    expect(String(init.body)).toContain("Teahouse");
    // What each candidate *is* — three sightseeing spots outranked the medical
    // guide because the model was told only their names.
    expect(String(init.body)).toContain("[place to visit]");
    // Slower than this and the shortlist we already have is the better answer.
    expect(timeout).toBeLessThanOrEqual(1500);
  });

  it("asks the same question once", async () => {
    // Chips re-send the same sentence constantly; paying twice for the same
    // ordering is the easiest latency there is to not spend.
    fetchWithTimeout.mockResolvedValue(reply('{"order":[2,3,0,1]}'));
    const q = query();
    expect(await rerank(q, CANDIDATES)).toEqual([2, 3, 0, 1]);
    expect(await rerank(q, CANDIDATES)).toEqual([2, 3, 0, 1]);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });
});
