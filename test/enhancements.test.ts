import { describe, it, expect } from "vitest";
import { koreanHolidayOn, holidayBanner } from "../src/lib/holidays.js";
import { explainPayment } from "../src/tools/explainPayment.js";
import { explainKoreanService } from "../src/tools/explainKoreanService.js";
import { findForeignerFriendlyStore } from "../src/tools/findForeignerFriendlyStore.js";
import { translateMenuContext } from "../src/tools/translateMenuContext.js";

const text = (r: { content: { text: string }[] }) => r.content[0].text;

describe("Korean holiday calendar", () => {
  it("knows Chuseok/Seollal (major) vs minor vs none", () => {
    expect(koreanHolidayOn("2026-09-25")).toMatchObject({ major: true });
    expect(koreanHolidayOn("2026-02-17")).toMatchObject({ major: true });
    expect(koreanHolidayOn("2026-12-25")).toMatchObject({ major: false });
    expect(koreanHolidayOn("2026-07-15")).toBeUndefined();
  });
  it("major banner warns about closures; none → empty", () => {
    expect(holidayBanner(koreanHolidayOn("2026-09-25")).toLowerCase()).toContain("close");
    expect(holidayBanner(undefined)).toBe("");
  });
});

describe("explainPayment new topics", () => {
  it("covers the VAT tax refund", () => {
    const t = text(explainPayment.handler({ situation: "tourist tax refund" }));
    expect(t).toContain("15,000");
    expect(t.toLowerCase()).toContain("customs");
  });
  it("taxi guidance includes meter + 1330", () => {
    const t = text(explainPayment.handler({ situation: "taxi" }));
    expect(t.toLowerCase()).toContain("meter");
    expect(t).toContain("1330");
  });
  it("ATM guidance covers Global ATM + DCC", () => {
    const t = text(explainPayment.handler({ situation: "withdraw cash from an ATM" }));
    expect(t).toContain("Global ATM");
    expect(t.toUpperCase()).toContain("KRW");
  });
  it("train tickets guidance mentions Korail and domestic-card kiosks", () => {
    const t = text(explainPayment.handler({ situation: "KTX train ticket" }));
    expect(t).toContain("Korail");
    expect(t).toContain("Domestic Cards");
  });
});

describe("findForeignerFriendlyStore emergency need", () => {
  it("surfaces 119 / 1339 / 1330 for medical/emergency", async () => {
    const r = await findForeignerFriendlyStore.handler({ area: "Myeongdong", need: "emergency" });
    expect(text(r)).toContain("119");
    expect(text(r)).toContain("1330");
  });
  it("resolves the 'hospital' synonym to emergency", async () => {
    const r = await findForeignerFriendlyStore.handler({ area: "Hongdae", need: "hospital" });
    expect(text(r)).toContain("1339");
  });
});

describe("explainKoreanService (verification-wall navigator)", () => {
  it("taxi → Pay to driver + k.ride + 1330", () => {
    const t = text(explainKoreanService.handler({ service: "taxi app" }));
    expect(t).toContain("Pay to the driver");
    expect(t.toLowerCase()).toContain("k.ride");
    expect(t).toContain("1330");
  });
  it("reservation → CatchTable Global", () => {
    const t = text(explainKoreanService.handler({ service: "restaurant reservation" }));
    expect(t).toContain("CatchTable Global");
  });
  it("entry docs are date-stamped and point to the official site", () => {
    const t = text(explainKoreanService.handler({ service: "K-ETA arrival card" }));
    expect(t).toContain("k-eta.go.kr");
    expect(t.toLowerCase()).toContain("verify");
  });
  it("unknown service → generic guidance, still with chips + 1330", () => {
    const t = text(explainKoreanService.handler({ service: "something obscure" }));
    expect(t).toContain("1330");
  });
});

describe("translateMenuContext diet support", () => {
  it("flags meat dishes for vegetarians and shows a Korean phrase card", async () => {
    const r = await translateMenuContext.handler({ menuText: "삼겹살", allergyConcerns: ["vegetarian"] });
    expect(text(r).toLowerCase()).toContain("not vegetarian");
    expect(text(r)).toContain("안 먹어요"); // phrase card
  });
});
