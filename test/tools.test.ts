import { describe, it, expect } from "vitest";
import { ALL_TOOLS, TOOL_NAMES } from "../src/tools/index.js";
import { SERVICE_NAME, MAX_RESPONSE_CHARS } from "../src/lib/constants.js";
import { checkToolName } from "../src/lib/naming.js";

describe("tool registry meets Kakao contract rules", () => {
  it("has 3–20 tools (Kakao hard limit; ≤10 is the recommended range)", () => {
    expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(3);
    expect(ALL_TOOLS.length).toBeLessThanOrEqual(20);
    // NOTE: >10 exceeds Kakao's *recommended* range — consolidation under review
    // (see docs/06 D-006). Hard gate is 20 (enforced by scripts/lint-naming.ts).
  });

  it("tool names are unique and rule-compliant", () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
    for (const name of TOOL_NAMES) expect(checkToolName(name)).toEqual([]);
  });

  for (const tool of ALL_TOOLS) {
    describe(tool.name, () => {
      it("description ≤1024 chars and includes the service name", () => {
        expect(tool.description.length).toBeLessThanOrEqual(1024);
        expect(tool.description).toContain(SERVICE_NAME);
      });

      it("has all 5 annotations explicitly set", () => {
        const a = tool.annotations;
        expect(typeof a.title).toBe("string");
        expect(a.title.length).toBeGreaterThan(0);
        for (const k of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
          expect(typeof a[k]).toBe("boolean");
        }
      });

      it("has a non-empty input schema", () => {
        expect(Object.keys(tool.inputSchema).length).toBeGreaterThan(0);
      });
    });
  }
});

describe("handlers return guarded text content", () => {
  // Minimal valid args per tool (required fields only).
  const ARGS: Record<string, Record<string, unknown>> = {
    searchPlaceForeigner: { query: "quiet cafe in Hongdae" },
    findForeignerFriendlyStore: { area: "Seongsu" },
    getTransitRoute: { from: "Seoul Station", to: "Myeongdong" },
    trackBusArrival: { busNumber: "143", dropOffStop: "Seomyeon", city: "Busan" },
    trackSubwayArrival: { station: "Gangnam" },
    explainPayment: { situation: "paying for the subway" },
    explainKoreanService: { service: "taxi app" },
    getAreaGuide: { area: "Myeongdong" },
    translateMenuContext: { menuText: "tteokbokki" },
    getNowInfo: { place: "Gyeongbokgung Palace" },
    getJejuInfo: { category: "attraction" },
    getWeatherAndAir: { city: "Seoul" },
    recommendTripCourse: { persona: "20s woman" },
  };

  for (const tool of ALL_TOOLS) {
    it(`${tool.name} returns text content with a choice footer, ≤24k`, async () => {
      const res = await tool.handler(ARGS[tool.name]);
      expect(res.content[0].type).toBe("text");
      const text = res.content[0].text;
      expect(text.length).toBeLessThanOrEqual(MAX_RESPONSE_CHARS);
      expect(text).toContain("Tap to continue");
    });
  }
});

describe("working knowledge tools produce real content", () => {
  it("explainPayment knows transit", async () => {
    const res = await ALL_TOOLS.find((t) => t.name === "explainPayment")!.handler({
      situation: "subway",
    });
    expect(res.content[0].text).toContain("T-money");
  });

  it("translateMenuContext flags allergens", async () => {
    const res = await ALL_TOOLS.find((t) => t.name === "translateMenuContext")!.handler({
      menuText: "tteokbokki",
      allergyConcerns: ["gluten"],
    });
    expect(res.content[0].text.toLowerCase()).toContain("gluten");
  });

  it("getAreaGuide describes Myeongdong", async () => {
    const res = await ALL_TOOLS.find((t) => t.name === "getAreaGuide")!.handler({
      area: "Myeongdong",
    });
    expect(res.content[0].text).toContain("Myeongdong");
  });

  it("getAreaGuide covers the expanded set (Busan, Jeju, more Seoul)", async () => {
    const guide = ALL_TOOLS.find((t) => t.name === "getAreaGuide")!;
    const haeundae = await guide.handler({ area: "Haeundae" });
    expect(haeundae.content[0].text).toContain("Haeundae");
    expect(haeundae.content[0].text).toContain("Busan");

    const seogwipo = await guide.handler({ area: "Seogwipo" });
    expect(seogwipo.content[0].text).toContain("Seogwipo");

    const ikseon = await guide.handler({ area: "익선동" }); // Korean alias in the keys regex
    expect(ikseon.content[0].text).toContain("Ikseon-dong");
  });

  it("getNowInfo gives a crisp curated landmark verdict without a TourAPI key", async () => {
    const res = await ALL_TOOLS.find((t) => t.name === "getNowInfo")!.handler({
      place: "Gyeongbokgung Palace",
    });
    const text = res.content[0].text;
    expect(text).toContain("Gyeongbokgung Palace");
    expect(text).toContain("Current Korea time");
    expect(text).toContain("Hours:");
    // Curated overlay runs before the key guard, so it never degrades to the
    // "live data temporarily unavailable" path for a known landmark.
    expect(text).not.toContain("temporarily unavailable");
  });
});
