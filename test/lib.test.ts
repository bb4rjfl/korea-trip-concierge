import { describe, it, expect } from "vitest";
import { buildChoiceFooter } from "../src/lib/footer.js";
import { renderMarkdown } from "../src/lib/markdown.js";
import { assertNamingOk, checkToolName } from "../src/lib/naming.js";
import { MAX_RESPONSE_CHARS } from "../src/lib/constants.js";

describe("buildChoiceFooter", () => {
  it("renders 2–4 chips with command + description", () => {
    const f = buildChoiceFooter([
      { emoji: "🔄", cmdEn: "Refresh", descEn: "update" },
      { emoji: "🚏", cmdEn: "Am I close?", cmdKo: "거의 다 왔어?", descEn: "re-check" },
    ]);
    expect(f).toContain("`Refresh`");
    expect(f).toContain("거의 다 왔어?");
    expect(f).toContain("Tap to continue");
  });

  it("rejects <2 or >4 chips", () => {
    expect(() => buildChoiceFooter([{ emoji: "x", cmdEn: "a", descEn: "b" }])).toThrow();
    expect(() =>
      buildChoiceFooter(Array(5).fill({ emoji: "x", cmdEn: "a", descEn: "b" })),
    ).toThrow();
  });
});

describe("renderMarkdown 24k guard", () => {
  it("keeps total under the hard ceiling and preserves the footer", () => {
    const footer = buildChoiceFooter([
      { emoji: "🔄", cmdEn: "Refresh", descEn: "update" },
      { emoji: "🚏", cmdEn: "Close?", descEn: "re-check" },
    ]);
    const huge = "x".repeat(50_000);
    const out = renderMarkdown(huge, footer);
    expect(out.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
    expect(out).toContain("Tap to continue");
    expect(out).toContain("truncated");
  });

  it("leaves short bodies intact", () => {
    const out = renderMarkdown("hello", "world");
    expect(out).toBe("hello\n\nworld");
  });
});

describe("naming rules", () => {
  it("rejects 'kakao' anywhere, case-insensitive", () => {
    expect(checkToolName("getKakaoBus").length).toBeGreaterThan(0);
    expect(checkToolName("KAKAO_tool").length).toBeGreaterThan(0);
  });

  it("rejects invalid charset", () => {
    expect(checkToolName("bad name!").length).toBeGreaterThan(0);
  });

  it("accepts a clean name", () => {
    expect(checkToolName("trackBusArrival")).toEqual([]);
  });

  it("throws on duplicate tool names", () => {
    expect(() => assertNamingOk("server", ["a", "b", "a"])).toThrow();
  });

  it("throws when tool count is out of 3–20", () => {
    expect(() => assertNamingOk("server", ["a", "b"])).toThrow();
  });
});
