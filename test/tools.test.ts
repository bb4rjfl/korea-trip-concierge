import { describe, it, expect } from "vitest";
import { ALL_TOOLS, TOOL_NAMES } from "../src/tools/index.js";
import { SERVICE_NAME, MAX_RESPONSE_CHARS } from "../src/lib/constants.js";
import { checkToolName } from "../src/lib/naming.js";

describe("tool registry meets Kakao contract rules", () => {
  it("has 3–10 tools (recommended range)", () => {
    expect(ALL_TOOLS.length).toBeGreaterThanOrEqual(3);
    expect(ALL_TOOLS.length).toBeLessThanOrEqual(10);
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
    explainPayment: { situation: "paying for the subway" },
    getAreaGuide: { area: "Myeongdong" },
    translateMenuContext: { menuText: "tteokbokki" },
    getNowInfo: { place: "Gyeongbokgung Palace" },
    getJejuInfo: { category: "attraction" },
    getWeatherAndAir: { city: "Seoul" },
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
});
