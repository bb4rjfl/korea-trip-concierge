import { describe, it, expect } from "vitest";
import { buildChoiceFooter } from "../src/lib/footer.js";
import { renderMarkdown } from "../src/lib/markdown.js";
import { assertNamingOk, checkToolName } from "../src/lib/naming.js";
import { MAX_RESPONSE_CHARS } from "../src/lib/constants.js";
import {
  resolveStationKo,
  romanizeStation,
  romanizeText,
  formatSubwayDirection,
} from "../src/lib/romanize.js";

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

describe("romanize (U1)", () => {
  it("resolves EN/alias/KO input to Korean station, undefined for unknown", () => {
    expect(resolveStationKo("Gangnam")).toBe("강남");
    expect(resolveStationKo("hongdae")).toBe("홍대입구");
    expect(resolveStationKo("강남역")).toBe("강남");
    expect(resolveStationKo("Atlantis")).toBeUndefined();
  });

  it("romanizes a Korean station, falls back to Korean for unknown", () => {
    expect(romanizeStation("성수")).toBe("Seongsu");
    expect(romanizeStation("강남역")).toBe("Gangnam");
    expect(romanizeStation("없는역")).toBe("없는역");
  });

  it("romanizes known stations inside free text (longest match wins)", () => {
    expect(romanizeText("을지로3가 근처")).toContain("Euljiro 3-ga");
    expect(romanizeText("을지로입구")).toBe("Euljiro 1-ga");
  });

  it("formats a subway direction string into English", () => {
    expect(formatSubwayDirection("성수행 - 신설동방면")).toBe("to Seongsu (via Sinseol-dong)");
    expect(formatSubwayDirection("중앙보훈병원행")).toBe("to Junggang Veterans Hospital");
  });

  it("romanizes subway/rail line names and ODsay-style legs", () => {
    expect(romanizeText("수도권 4호선 서울역 → 명동")).toBe("Line 4 Seoul Station → Myeongdong");
    expect(romanizeText("신촌(경의중앙선)")).toBe("Sinchon(Gyeongui–Jungang Line)");
    expect(romanizeStation("광운대")).toBe("Gwangun-dae");
    expect(romanizeStation("문산")).toBe("Munsan");
  });

  it("parses a direction with a trailing express marker", () => {
    expect(formatSubwayDirection("인천공항2터미널행 - 디지털미디어시티방면(급행)")).toBe(
      "to Incheon Airport T2 (via Digital Media City) (express)",
    );
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
