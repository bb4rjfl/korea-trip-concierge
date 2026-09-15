/**
 * When one model's allowance runs out, the service keeps its understanding.
 *
 * The live chat ran on one free-tier model allowing twenty requests a day; once
 * they were gone it fell back to keyword rules for the rest of the day, and
 * "何ができますか" was answered with a bar's opening hours. These pin the
 * fallback: a spent model hands over to the next, is skipped afterwards, and a
 * question about the service itself never reaches a tool at all.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchWithTimeout = vi.hoisted(() => vi.fn());
vi.mock("../src/lib/http.js", () => ({ fetchWithTimeout, trippedHosts: () => [] }));

const { geminiGenerate, geminiSkipped } = await import("../src/lib/sources/gemini.js");

const ok = (text: string) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const quota = { ok: false, status: 429, text: async () => '{"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}]}}' };
const modelOf = (call: unknown[]) => /models\/([^:]+):/.exec(String(call[0]))?.[1];

describe("the language model chain", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    delete process.env.GEMINI_MODEL;
    fetchWithTimeout.mockReset();
  });
  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
  });

  it("answers on the next model when the first one's daily allowance is spent", async () => {
    fetchWithTimeout.mockResolvedValueOnce(quota).mockResolvedValueOnce(ok("hello"));
    const json = await geminiGenerate({}, { timeoutMs: 5000, prefer: "model-a-spent" });
    expect(json?.candidates?.[0]?.content?.parts?.[0]?.text).toBe("hello");
    expect(modelOf(fetchWithTimeout.mock.calls[0])).toBe("model-a-spent");
    expect(modelOf(fetchWithTimeout.mock.calls[1])).not.toBe("model-a-spent");
  });

  it("does not pay for the spent model's round trip again", async () => {
    fetchWithTimeout.mockResolvedValueOnce(quota).mockResolvedValue(ok("again"));
    await geminiGenerate({}, { timeoutMs: 5000, prefer: "model-b-spent" });
    fetchWithTimeout.mockClear();
    await geminiGenerate({}, { timeoutMs: 5000, prefer: "model-b-spent" });
    expect(fetchWithTimeout.mock.calls.map(modelOf)).not.toContain("model-b-spent");
    expect(Object.keys(geminiSkipped())).toContain("model-b-spent");
  });

  it("gives up quietly when no model answers in time", async () => {
    fetchWithTimeout.mockRejectedValue(new Error("upstream timed out"));
    expect(await geminiGenerate({}, { timeoutMs: 5000, prefer: "model-c" })).toBeNull();
  });

  it("returns nothing without a key, so the rules take over", async () => {
    delete process.env.GEMINI_API_KEY;
    expect(await geminiGenerate({}, { timeoutMs: 5000 })).toBeNull();
    expect(fetchWithTimeout).not.toHaveBeenCalled();
  });
});

describe("questions about the service itself", () => {
  it("are recognised in every language we serve, and greetings on their own", async () => {
    const { asksAboutUs } = await import("../web/server/orchestrator.js");
    for (const q of ["What can you do?", "hello", "뭐 할 수 있어?", "안녕하세요", "何ができますか", "こんにちは", "你能做什么", "你好"]) {
      expect(asksAboutUs(q), q).toBe(true);
    }
  });

  it("are not confused with a real question that starts with a greeting", async () => {
    const { asksAboutUs } = await import("../web/server/orchestrator.js");
    for (const q of ["hello, how do I get to Myeongdong?", "안녕하세요 명동 맛집 추천해주세요", "你好，明洞怎么走"]) {
      expect(asksAboutUs(q), q).toBe(false);
    }
  });
});

describe("getting hold of something is not going somewhere", () => {
  it("does not route 'how do I get a taxi' as a journey", async () => {
    const { routeText } = await import("../web/server/router.js");
    const hit = routeText("How do I get a taxi without a Korean number?", "en");
    expect(hit?.tool).not.toBe("getTransitRoute");
  });

  it("still routes 'how do I get to' as a journey", async () => {
    const { routeText } = await import("../web/server/router.js");
    expect(routeText("How do I get to Myeongdong from Seoul Station?", "en")?.tool).toBe("getTransitRoute");
  });
});
