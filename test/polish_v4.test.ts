import { describe, it, expect } from "vitest";
import { explainPayment } from "../src/tools/explainPayment.js";
import { explainKoreanService } from "../src/tools/explainKoreanService.js";
import { translateMenuContext } from "../src/tools/translateMenuContext.js";
import { getAreaGuide } from "../src/tools/getAreaGuide.js";
import { resolveLandmark, landmarkVerdict, LANDMARKS } from "../src/lib/landmarks.js";
import { resolvePlaceCoord, findPlaceInText } from "../src/lib/places.js";
import { cityMustSeeLead } from "../src/tools/searchPlaceForeigner.js";
import { isSeoulText } from "../src/lib/sources/visitseoul.js";
import { resolveLineName } from "../src/lib/sources/seoulSubway.js";
import { getJejuInfo } from "../src/tools/getJejuInfo.js";
import { findForeignerFriendlyStore } from "../src/tools/findForeignerFriendlyStore.js";
import { recommendTripCourse } from "../src/tools/recommendTripCourse.js";
import { resolvePersonas, wantedThemes, composeCourse, SEOUL_SPOTS } from "../src/lib/courses.js";

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

// ── Completeness round (residuals + more content) ─────────────────────────────
describe("completeness round", () => {
  it("Jamsil guide notes the ticketed theme park (policy)", () => {
    expect(text(getAreaGuide.handler({ area: "Jamsil" }))).toMatch(/ticketed theme park/i);
  });
  it("explainKoreanService routes banking (ARC barrier) + Wise/Revolut", () => {
    const r = explainKoreanService.handler({ service: "open a bank account" });
    expect(text(r)).toContain("Banking & money transfers");
    expect(text(r)).toMatch(/Wise|Revolut/);
  });
  it("explainPayment covers jjimjilbang/sauna", () => {
    expect(text(explainPayment.handler({ situation: "jjimjilbang" }))).toMatch(/Jjimjilbang/i);
  });
  it("identifies more dishes", () => {
    expect(text(translateMenuContext.handler({ menuText: "닭강정" }))).toContain("Sweet crispy chicken bites");
    expect(text(translateMenuContext.handler({ menuText: "양념게장" }))).toContain("Spicy marinated raw crab");
    expect(text(translateMenuContext.handler({ menuText: "김치볶음밥" }))).toContain("Kimchi fried rice");
    expect(text(translateMenuContext.handler({ menuText: "새우장" }))).toContain("Soy-marinated raw shrimp");
  });
  it("resolves more landmarks", () => {
    expect(resolveLandmark("Udo")?.name).toMatch(/Udo/);
    expect(resolveLandmark("천지연폭포")?.name).toMatch(/Cheonjiyeon/);
    expect(resolveLandmark("Common Ground")?.name).toMatch(/Common Ground/);
    expect(resolveLandmark("Oryukdo Skywalk")?.name).toMatch(/Oryukdo/);
  });
  it("resolves more neighbourhood guides", () => {
    expect(text(getAreaGuide.handler({ area: "대학로" }))).toContain("Daehangno");
    expect(text(getAreaGuide.handler({ area: "Haebangchon" }))).toContain("Haebangchon");
    expect(text(getAreaGuide.handler({ area: "전주" }))).toContain("Jeonju");
  });
});

// ── D-021 content (historic cities, mountains, more dishes) ───────────────────
describe("D-021 content additions", () => {
  it("resolves historic-city & mountain landmarks", () => {
    expect(resolveLandmark("Bulguksa")?.name).toMatch(/Bulguksa/);
    expect(resolveLandmark("설악산")?.name).toMatch(/Seoraksan/);
    expect(resolveLandmark("Hwaseong Fortress")?.name).toMatch(/Hwaseong/);
    expect(resolveLandmark("첨성대")?.name).toMatch(/Cheomseongdae/);
  });
  it("resolves Gyeongju/Incheon/Sokcho guides", () => {
    expect(text(getAreaGuide.handler({ area: "경주" }))).toContain("Gyeongju");
    expect(text(getAreaGuide.handler({ area: "Incheon" }))).toContain("Incheon");
    expect(text(getAreaGuide.handler({ area: "속초" }))).toContain("Sokcho");
  });
  it("identifies hanjeongsik/baekban/suyuk", () => {
    expect(text(translateMenuContext.handler({ menuText: "수육" }))).toContain("Boiled pork");
    expect(text(translateMenuContext.handler({ menuText: "한정식" }))).toMatch(/hanjeongsik|table d'h/i);
  });
});

// ── v5 test findings (D-022) ──────────────────────────────────────────────────
describe("v5 fixes (D-022)", () => {
  it("V1: routes its own chip text (card fail on websites) to Online, not GENERIC", () => {
    const r = explainKoreanService.handler({ service: "Why does my card fail on Korean websites?" });
    expect(text(r)).toContain("Online shopping & checkout");
  });
  it("V3: CJK/kana city names seed must-see + geocode", () => {
    expect(cityMustSeeLead("釜山 観光", "")).toMatch(/Busan must-see/);
    expect(cityMustSeeLead("観光 ソウル", "")).toMatch(/Seoul must-see/);
    expect(findPlaceInText("釜山 観光")?.label).toMatch(/Busan/);
    expect(isSeoulText("ソウル 観光")).toBe(true);
  });
  it("V4: city-level area overviews (Busan/Seoul) without shadowing hoods", () => {
    expect(text(getAreaGuide.handler({ area: "Busan" }))).toContain("Busan (부산)");
    expect(text(getAreaGuide.handler({ area: "Seoul" }))).toContain("Seoul (서울)");
    expect(text(getAreaGuide.handler({ area: "Haeundae" }))).toContain("Haeundae"); // hood still wins
  });
  it("V5: trackSubwayArrival accepts Hangul line names", () => {
    expect(resolveLineName("신분당선")).toBe("신분당선");
    expect(resolveLineName("경의중앙선")).toBe("경의중앙선");
    expect(resolveLineName("분당선")).toBe("수인분당선");
    expect(resolveLineName("2호선")).toBe("2호선"); // numbered still works
  });
});

// ── recommendTripCourse (13th tool, persona courses, D-025) ───────────────────
describe("recommendTripCourse — combinable persona courses (D-025)", () => {
  const t13 = (persona?: string, duration?: string, themes?: string, location?: string) =>
    text(recommendTripCourse.handler({ persona, duration, themes, location }));
  it("routes personas to labels and COMBINES them", () => {
    expect(t13("20s woman")).toMatch(/K-beauty & photo/);
    expect(t13("K-pop fan")).toMatch(/K-pop fan/);
    expect(t13("family")).toMatch(/Family/);
    const combo = t13("20s woman, foodie");
    expect(combo).toMatch(/K-beauty & photo/);
    expect(combo).toMatch(/Foodie/);
  });
  it("scales by duration", () => {
    const two = t13("foodie", "2-day");
    expect(two).toMatch(/Day 1/);
    expect(two).toMatch(/Day 2/);
    expect(t13("couple", "half-day")).toMatch(/Half-day/);
  });
  it("falls back to first-timer with no persona", () => {
    expect(t13()).toMatch(/first-timer/i);
  });
  it("supports Busan & Jeju courses; steers other cities (Phase 2)", () => {
    expect(t13("foodie", "1-day", "", "Busan")).toMatch(/Busan course/);
    expect(t13("couple", "2-day", "", "Jeju")).toMatch(/Jeju course/);
    expect(t13("foodie", "1-day", "", "Daegu")).toMatch(/coming soon/i);
  });
  it("offers the free guided-tour chip on a Seoul history/culture course (D-034)", () => {
    expect(t13("history lover", "1-day", "", "Seoul")).toMatch(/free official guided tours/i);
    // A Busan course (no Seoul dobo program) should NOT show it.
    expect(t13("history lover", "1-day", "", "Busan")).not.toMatch(/free official guided tours/i);
  });
  it("supports Gyeongju courses and new personas (Phase 3)", () => {
    expect(t13("culture", "1-day", "", "Gyeongju")).toMatch(/Gyeongju course/);
    expect(t13("history lover", "1-day", "", "경주")).toMatch(/Bulguksa|Daereungwon|Cheomseongdae/);
    expect(t13("nightlife")).toMatch(/Nightlife/);
    expect(t13("solo backpacker")).toMatch(/Solo traveler/);
    expect(t13("nature lover")).toMatch(/Nature & healing/);
  });
  it("supports 3-day (and 4+ → 3-day base)", () => {
    const three = t13("history lover", "3-day");
    expect(three).toMatch(/Day 1/);
    expect(three).toMatch(/Day 3/);
    expect(t13("foodie", "5-day")).toMatch(/Day 3/);
  });
  it("never reads as an ad", () => {
    expect(t13("foodie")).toMatch(/not ads/i);
  });
});

describe("courses engine (D-025)", () => {
  it("combines personas → blended themes", () => {
    const ps = resolvePersonas("20s woman, foodie");
    expect(ps.map((p) => p.key)).toEqual(expect.arrayContaining(["beauty", "foodie"]));
    const th = wantedThemes(ps, []);
    expect(th).toEqual(expect.arrayContaining(["beauty", "food"]));
  });
  it("composes a 1-day course with several stops", () => {
    const c = composeCourse(resolvePersonas("20s woman"), "1-day", []);
    expect(c.days.length).toBe(1);
    expect(c.days[0].stops.length).toBeGreaterThanOrEqual(3);
  });
  it("2-day course has two days with no repeated spot", () => {
    const c = composeCourse(resolvePersonas("family"), "2-day", []);
    expect(c.days.length).toBe(2);
    const ids = c.days.flatMap((d) => d.stops.map((s) => s.spot.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("derma/aesthetic spot stays info-only (medical law)", () => {
    const derma = SEOUL_SPOTS.find((s) => s.id === "dermainfo")!;
    expect(derma.note).toMatch(/info only|no booking|medical law/i);
  });
  it("composes Busan & Jeju courses with the right city's spots (Phase 2)", () => {
    const b = composeCourse(resolvePersonas("foodie"), "1-day", [], "Busan");
    expect(b.days[0].stops.length).toBeGreaterThanOrEqual(2);
    expect(b.days[0].stops.every((s) => (s.spot.city ?? "Seoul") === "Busan")).toBe(true);
    const j = composeCourse(resolvePersonas("couple"), "1-day", [], "Jeju");
    expect(j.days[0].stops.every((s) => (s.spot.city ?? "Seoul") === "Jeju")).toBe(true);
  });
  it("3-day course has three days with no repeated spot", () => {
    const c = composeCourse(resolvePersonas("history"), "3-day", []);
    expect(c.days.length).toBe(3);
    const ids = c.days.flatMap((d) => d.stops.map((s) => s.spot.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("composes Gyeongju courses with Gyeongju spots (Phase 3)", () => {
    const g = composeCourse(resolvePersonas("culture"), "1-day", [], "Gyeongju");
    expect(g.days[0].stops.length).toBeGreaterThanOrEqual(3);
    expect(g.days[0].stops.every((s) => (s.spot.city ?? "Seoul") === "Gyeongju")).toBe(true);
  });
  it("resolves the Phase-3 personas (nightlife/nature/solo/budget)", () => {
    expect(resolvePersonas("nightlife").map((p) => p.key)).toContain("nightlife");
    expect(resolvePersonas("nature & healing").map((p) => p.key)).toContain("nature");
    expect(resolvePersonas("solo traveler").map((p) => p.key)).toContain("solo");
    expect(resolvePersonas("budget backpacker").map((p) => p.key)).toEqual(
      expect.arrayContaining(["budget", "solo"]),
    );
  });
});

// ── v6 final-gate findings (D-023) ────────────────────────────────────────────
describe("v6 fixes (D-023)", () => {
  it("V6-1: naengmyeon (beef broth) flagged for vegetarians", () => {
    expect(text(translateMenuContext.handler({ menuText: "냉면", allergyConcerns: ["vegetarian"] }))).toMatch(/not veg/i);
    // kongguksu must STAY clean (the broth→bone fix isn't undone)
    expect(text(translateMenuContext.handler({ menuText: "콩국수", allergyConcerns: ["vegan"] }))).not.toMatch(/not veg/i);
  });
  it("V6-2: simplified 济州 + traditional 觀光 seed the Jeju must-see", () => {
    expect(cityMustSeeLead("济州 观光", "")).toMatch(/Jeju must-see/);
    expect(cityMustSeeLead("濟州 觀光", "")).toMatch(/Jeju must-see/);
  });
  it("V6-3: getJejuInfo out-of-range limit doesn't throw (clamped)", async () => {
    await expect(getJejuInfo.handler({ category: "nature", limit: 99 })).resolves.toBeDefined();
    await expect(getJejuInfo.handler({ category: "nature", limit: "abc" })).resolves.toBeDefined();
  });
  it("N13: findForeignerFriendlyStore with no area → graceful 'Which area?' (no -32602)", async () => {
    const r = await findForeignerFriendlyStore.handler({ need: "atm" });
    expect(text(r)).toMatch(/Which area/i);
    expect(text(r)).not.toMatch(/-32602/);
  });
  it("🟢: more seeding synonyms — 'what to see' + traditional 景點", () => {
    expect(cityMustSeeLead("what to see in Busan", "")).toMatch(/Busan must-see/);
    expect(cityMustSeeLead("釜山 景點", "")).toMatch(/Busan must-see/);
  });
});

// ── P-V2 / D-021: multi-city must-see seeding ─────────────────────────────────
describe("city must-see seeding (P-V2, multi-city)", () => {
  it("seeds icons for a generic city-wide query (Seoul/Busan/Jeju/Gyeongju)", () => {
    expect(cityMustSeeLead("things to see in Seoul", "")).toMatch(/Seoul must-see[\s\S]*Gyeongbokgung/);
    expect(cityMustSeeLead("things to see in Busan", "")).toMatch(/Busan must-see[\s\S]*Haeundae/);
    expect(cityMustSeeLead("attractions in Jeju", "")).toMatch(/Jeju must-see[\s\S]*Seongsan/);
    expect(cityMustSeeLead("things to see", "Gyeongju")).toMatch(/Gyeongju must-see[\s\S]*Bulguksa/);
  });
  it("does NOT seed for a specific neighbourhood, specific noun, or unknown city", () => {
    expect(cityMustSeeLead("things to see in Seoul", "Myeongdong")).toBe("");
    expect(cityMustSeeLead("museums", "")).toBe("");
    expect(cityMustSeeLead("things to see in Daegu", "")).toBe(""); // no curated list yet → falls through
  });
});
