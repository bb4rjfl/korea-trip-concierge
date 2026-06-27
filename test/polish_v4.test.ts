import { describe, it, expect } from "vitest";
import { explainPayment } from "../src/tools/explainPayment.js";
import { explainKoreanService } from "../src/tools/explainKoreanService.js";
import { translateMenuContext } from "../src/tools/translateMenuContext.js";
import { getAreaGuide } from "../src/tools/getAreaGuide.js";
import { resolveLandmark, landmarkVerdict, LANDMARKS } from "../src/lib/landmarks.js";
import { resolvePlaceCoord, findPlaceInText } from "../src/lib/places.js";
import { seoulMustSeeLead } from "../src/tools/searchPlaceForeigner.js";

const text = (r: { content: { text: string }[] }) => r.content[0].text;

// ── P2: explainPayment situation-aware chips ──────────────────────────────────
describe("explainPayment situation-aware chips (P2)", () => {
  it("ATM situation bridges to a Global-ATM finder chip", () => {
    const r = explainPayment.handler({ situation: "foreign-card ATM" });
    expect(text(r)).toContain("ATMs & withdrawing cash");
    expect(text(r)).toContain("Find a Global ATM near me");
  });
  it("hospital situation bridges to pharmacy + emergency chips", () => {
    const r = explainPayment.handler({ situation: "paying at a hospital" });
    expect(text(r)).toContain("Find a pharmacy near me");
    expect(text(r)).toContain("Medical emergency");
  });
  it("unmatched situation falls back to the generic 3 chips", () => {
    const r = explainPayment.handler({ situation: "qwertyuiop" });
    expect(text(r)).toContain("How do I pay on the bus or subway?");
    expect(text(r)).toContain("How does the tourist tax refund work?");
  });
});

// ── Hallasan: mountain after-dark is not "residential" ────────────────────────
describe("landmarkVerdict mountain copy (polish G)", () => {
  const hallasan = LANDMARKS.find((l) => l.name.startsWith("Hallasan"))!;
  it("a mountain after dark is closed/daytime-only, never 'residential'", () => {
    const v = landmarkVerdict(hallasan, 3 /* Wed */, 22 * 60);
    expect(v.headline).not.toMatch(/residential/i);
    expect(v.headline).toMatch(/daytime-only|mountain|closed/i);
  });
  it("a residential daylight spot still reads 'residential' after dark", () => {
    const bukchon = LANDMARKS.find((l) => l.name.startsWith("Bukchon"))!;
    expect(landmarkVerdict(bukchon, 3, 22 * 60).headline).toMatch(/residential|open-air/i);
  });
});

// ── P7: vegan egg/dairy nuance + no contradictory allergen line ───────────────
describe("translateMenuContext vegan nuance (P7)", () => {
  it("flags egg as not-vegan for a vegetarian-OK dish", () => {
    const r = translateMenuContext.handler({ menuText: "bibimbap", allergyConcerns: ["vegan"] });
    expect(text(r)).toMatch(/not vegan/i);
  });
  it("does not false-flag a genuinely vegan dish (P-V1: 콩국수 'broth' regression)", () => {
    const r = translateMenuContext.handler({ menuText: "콩국수", allergyConcerns: ["vegan"] });
    // The false flag was the full "not vegetarian/vegan" line — match either form.
    expect(text(r)).not.toMatch(/not veg(etarian|an)/i);
    // 설렁탕 (ox-bone) must STILL be flagged — the fix must stay narrow.
    expect(text(translateMenuContext.handler({ menuText: "설렁탕", allergyConcerns: ["vegetarian"] }))).toMatch(/not veg/i);
  });
  it("empty-allergen meat dish reads 'to flag', not a bare reassurance", () => {
    const r = translateMenuContext.handler({ menuText: "설렁탕", allergyConcerns: ["vegetarian"] });
    expect(text(r)).toContain("No common allergens to flag");
    expect(text(r)).toMatch(/not vegetarian/i);
  });
});

// ── P5/P6: explainKoreanService routing + emergency chips ─────────────────────
describe("explainKoreanService routing + chips (P5/P6)", () => {
  it("does not mis-route 'a book about restaurants' to reservations (P5)", () => {
    const r = explainKoreanService.handler({ service: "I read a book about restaurants" });
    expect(text(r)).not.toContain("Restaurant reservations & waitlists");
  });
  it("still routes 'book a popular restaurant' to reservations (P5)", () => {
    const r = explainKoreanService.handler({ service: "book a popular restaurant" });
    expect(text(r)).toContain("Restaurant reservations");
  });
  it("emergency chips drop the off-topic kiosk chip (P6)", () => {
    const r = explainKoreanService.handler({ service: "medical emergency at 2am" });
    expect(text(r)).not.toMatch(/Korean-only kiosk/i);
    expect(text(r)).toContain("Find a pharmacy near me");
  });
});

// ── Content coverage: new landmarks / areas / dishes resolve ──────────────────
describe("content coverage expansion", () => {
  it("resolves newly added landmarks (EN + CJK aliases)", () => {
    expect(resolveLandmark("National Museum of Korea")?.name).toContain("National Museum");
    expect(resolveLandmark("Blue House")?.name).toContain("Cheong Wa Dae");
    expect(resolveLandmark("청와대")?.name).toContain("Cheong Wa Dae");
    expect(resolveLandmark("Haedong Yonggungsa")?.name).toContain("Yonggungsa");
    expect(resolveLandmark("에버랜드")?.name).toContain("Everland");
  });
  it("resolves newly added neighbourhood guides", () => {
    expect(text(getAreaGuide.handler({ area: "Yeonnam" }))).toContain("Yeonnam");
    expect(text(getAreaGuide.handler({ area: "강릉" }))).toContain("Gangneung");
    expect(text(getAreaGuide.handler({ area: "Apgujeong" }))).toContain("Apgujeong");
    expect(text(getAreaGuide.handler({ area: "망원" }))).toContain("Mangwon");
  });
  it("identifies newly added regional dishes", () => {
    expect(text(translateMenuContext.handler({ menuText: "돼지국밥" }))).toContain("Pork soup rice");
    expect(text(translateMenuContext.handler({ menuText: "간장게장" }))).toContain("Soy-marinated raw crab");
    expect(text(translateMenuContext.handler({ menuText: "흑돼지" }))).toContain("black-pork");
    expect(text(translateMenuContext.handler({ menuText: "전복죽" }))).toContain("Abalone porridge");
  });
});

// ── Round ① additions (ticketing service, more dishes/landmarks/areas) ─────────
describe("round-1 content additions", () => {
  it("explainKoreanService routes concert/ticketing", () => {
    const r = explainKoreanService.handler({ service: "buy K-pop concert tickets" });
    expect(text(r)).toContain("Concert & event tickets");
    expect(text(r)).toMatch(/Interpark Global/i);
  });
  it("flags insect/lamb dishes for vegetarians (MEAT_RE)", () => {
    expect(text(translateMenuContext.handler({ menuText: "번데기", allergyConcerns: ["vegetarian"] }))).toMatch(/not vegetarian/i);
    expect(text(translateMenuContext.handler({ menuText: "양꼬치", allergyConcerns: ["vegetarian"] }))).toMatch(/not vegetarian/i);
    expect(text(translateMenuContext.handler({ menuText: "닭볶음탕" }))).toContain("Spicy braised chicken stew");
  });
  it("resolves more landmarks", () => {
    expect(resolveLandmark("Banpo Bridge")?.name).toMatch(/Banpo|Rainbow/i);
    expect(resolveLandmark("별마당도서관")?.name).toContain("Starfield Library");
    expect(resolveLandmark("Olympic Park")?.name).toContain("Olympic Park");
    expect(resolveLandmark("Seopjikoji")?.name).toContain("Seopjikoji");
  });
  it("resolves more neighbourhood guides", () => {
    expect(text(getAreaGuide.handler({ area: "서촌" }))).toContain("Seochon");
    expect(text(getAreaGuide.handler({ area: "Konkuk" }))).toContain("Konkuk");
    expect(text(getAreaGuide.handler({ area: "신촌" }))).toContain("Sinchon");
  });
});

// ── v4 test findings: national geocoding (P-V3) ───────────────────────────────
describe("national geocoding (P-V3)", () => {
  it("extracts a place embedded in a query phrase", () => {
    expect(findPlaceInText("things to see in Busan")?.label).toMatch(/Busan/);
    expect(findPlaceInText("attractions near Haeundae")?.label).toMatch(/Haeundae/);
    expect(findPlaceInText("just some random words")).toBeUndefined();
  });
  it("geocodes major non-Seoul cities", () => {
    expect(resolvePlaceCoord("Busan")?.label).toMatch(/Busan/);
    expect(resolvePlaceCoord("제주")?.label).toMatch(/Jeju/);
    expect(resolvePlaceCoord("Gangneung")?.label).toMatch(/Gangneung/);
  });
});

// ── P-V2: Seoul must-see seeding for generic city-wide sightseeing ─────────────
describe("Seoul must-see seeding (P-V2)", () => {
  it("seeds icons for a generic city-wide 'things to see' query", () => {
    const lead = seoulMustSeeLead("things to see in Seoul", "");
    expect(lead).toMatch(/Seoul must-see/);
    expect(lead).toMatch(/Gyeongbokgung/);
  });
  it("does NOT seed for a specific neighbourhood or a specific noun", () => {
    expect(seoulMustSeeLead("things to see", "Myeongdong")).toBe("");
    expect(seoulMustSeeLead("museums", "")).toBe("");
  });
});
