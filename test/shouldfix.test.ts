import { describe, it, expect } from "vitest";
import { isStalePastEvent } from "../src/lib/sources/visitseoul.js";
import { recognizesCity } from "../src/lib/sources/weatherair.js";
import { romanizeHangul } from "../src/lib/romanize.js";
import { matchAreaName } from "../src/tools/getAreaGuide.js";
import { LANDMARKS, landmarkVerdict } from "../src/lib/landmarks.js";
import { getTransitRoute } from "../src/tools/getTransitRoute.js";
import { getAreaGuide } from "../src/tools/getAreaGuide.js";
import { translateMenuContext } from "../src/tools/translateMenuContext.js";

const text = (r: { content: { text: string }[] }) => r.content[0].text;

describe("matchAreaName is strict (R1/Y14)", () => {
  it("matches a bare neighbourhood but not a venue containing one", () => {
    expect(matchAreaName("Hongdae")).toContain("Hongdae");
    expect(matchAreaName("성수")).toContain("Seongsu");
    expect(matchAreaName("Bongchu Jjimdak Myeongdong")).toBeUndefined();
    expect(matchAreaName("Starbucks Gangnam Station")).toBeUndefined();
  });
});

describe("isStalePastEvent (Y1)", () => {
  it("flags past-year titles only", () => {
    expect(isStalePastEvent("2020 Insadong Culture Festival", 2026)).toBe(true);
    expect(isStalePastEvent("Bukchon Hanok Village", 2026)).toBe(false);
    expect(isStalePastEvent("2026 Seoul Lantern Festival", 2026)).toBe(false);
  });
});

describe("recognizesCity (Y8)", () => {
  it("knows real cities, rejects unknowns, allows empty", () => {
    expect(recognizesCity("Busan")).toBe(true);
    expect(recognizesCity("부산")).toBe(true);
    expect(recognizesCity("Wakanda")).toBe(false);
    expect(recognizesCity(undefined)).toBe(true);
  });
});

describe("romanize address spacing (Y5)", () => {
  it("spaces+hyphenates number/suffix units but keeps English abbreviations", () => {
    const r = romanizeHangul("와우산로35길");
    expect(r).toMatch(/35-gil/i);
    expect(r).not.toMatch(/35Gil/);
    // a pre-romanized token like T2 must survive when mixed in
    expect(romanizeHangul("Incheon Airport T2")).toBe("Incheon Airport T2");
  });
});

describe("Hallasan afternoon summit cutoff (Y20)", () => {
  it("downgrades to an advisory after early afternoon", () => {
    const hallasan = LANDMARKS.find((l) => l.name.includes("Hallasan"))!;
    const v = landmarkVerdict(hallasan, 3, 15 * 60); // Wed 15:00
    expect(v.status).toBe("info");
    expect(v.headline.toLowerCase()).toContain("summit");
  });
});

describe("getTransitRoute same origin/destination (Y9)", () => {
  it("returns 'already there' instead of a misleading timeout", async () => {
    const r = await getTransitRoute.handler({ from: "Busan", to: "Busan" });
    expect(text(r).toLowerCase()).toContain("already at");
    expect(text(r)).toContain("You can ask me next");
  });
});

describe("getAreaGuide food chip (Y10)", () => {
  it("offers a direct eat-here chip for the food interest", async () => {
    const r = await getAreaGuide.handler({ area: "Myeongdong", interest: "food" });
    expect(text(r).toLowerCase()).toContain("where can i eat in myeongdong");
  });
});

describe("translateMenuContext allergens (Y12/Y13)", () => {
  it("hard-flags pork for halal diners and tags 순대 gluten", async () => {
    const jeyuk = await translateMenuContext.handler({ menuText: "제육볶음", allergyConcerns: ["halal"] });
    expect(text(jeyuk).toLowerCase()).toContain("not halal");
    const sundae = await translateMenuContext.handler({ menuText: "순대" });
    expect(text(sundae)).toContain("gluten");
  });
  it("flags unidentified dish tokens instead of dropping them", async () => {
    const r = await translateMenuContext.handler({ menuText: "회 산낙지" });
    expect(text(r)).toContain("Couldn't identify");
    expect(text(r)).toContain("산낙지");
  });
  it("identifies the new curated dishes (content round)", async () => {
    expect(text(await translateMenuContext.handler({ menuText: "육회" }))).toContain("Beef tartare");
    expect(text(await translateMenuContext.handler({ menuText: "미역국" }))).toContain("Seaweed soup");
    expect(text(await translateMenuContext.handler({ menuText: "오징어볶음" }))).toContain("Spicy stir-fried squid");
  });
  it("떡갈비 resolves to the patty only, not double-matching plain 갈비", async () => {
    const r = text(await translateMenuContext.handler({ menuText: "떡갈비" }));
    expect(r).toContain("Grilled short-rib patty");
    expect(r).not.toContain("Grilled short ribs");
  });
});
