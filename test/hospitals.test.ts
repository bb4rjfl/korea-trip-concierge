import { describe, it, expect } from "vitest";
import { asksEnglishHospital, hospitalCard } from "../src/lib/hospitals.js";

describe("asking for an English-speaking hospital", () => {
  it("is recognised across phrasings and languages", () => {
    for (const q of [
      "recommend a hospital that speaks English in Hongdae",
      "English-speaking clinic near Myeongdong",
      "international hospital in Seoul",
      "foreigner-friendly hospital",
      "영어 되는 병원 어디 있어?",
      "국제 진료 되는 병원",
      "英語が通じる病院",
      "会英语的医院",
    ]) {
      expect(asksEnglishHospital(q), q).toBe(true);
    }
  });

  it("does not fire on a plain emergency or an unrelated need", () => {
    for (const q of ["my friend collapsed, help", "my chest hurts", "find a pharmacy near me", "how do I get to Seoul Station"]) {
      expect(asksEnglishHospital(q), q).toBe(false);
    }
  });
});

describe("the hospital card", () => {
  it("names Seoul's international hospitals by default, with a switch prompt", () => {
    const c = hospitalCard("english-speaking hospital");
    expect(c).toMatch(/Severance/);
    expect(c).toMatch(/Samsung Medical Center/);
    expect(c).toMatch(/tell me your city/i);
  });

  it("switches to the named city", () => {
    expect(hospitalCard("international hospital in Busan")).toMatch(/Pusan National University Hospital/);
    expect(hospitalCard("영어 병원 제주")).toMatch(/Jeju National University Hospital/);
  });

  it("always carries the verified connection lines and no invented phone numbers", () => {
    const c = hospitalCard("english hospital in Seoul");
    expect(c).toMatch(/1339/);
    expect(c).toMatch(/1330/);
    expect(c).toMatch(/119/);
    // Named hospitals but no fabricated hospital phone numbers.
    expect(c).not.toMatch(/\b0\d{1,2}-\d{3,4}-\d{4}\b/);
  });
});
