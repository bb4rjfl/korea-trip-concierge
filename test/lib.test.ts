import { describe, it, expect } from "vitest";
import { buildChoiceFooter } from "../src/lib/footer.js";
import { renderMarkdown } from "../src/lib/markdown.js";
import { assertNamingOk, checkToolName } from "../src/lib/naming.js";
import { MAX_RESPONSE_CHARS } from "../src/lib/constants.js";
import {
  resolveStationKo,
  resolveStationFuzzy,
  romanizeStation,
  romanizeText,
  romanizeHangul,
  formatSubwayDirection,
} from "../src/lib/romanize.js";
import { similarity, resolveName } from "../src/lib/fuzzy.js";
import { resolvePlaceCoord } from "../src/lib/places.js";
import { LANDMARKS, resolveLandmark, landmarkVerdict } from "../src/lib/landmarks.js";

describe("mapLinks", () => {
  it("emits Naver + Kakao map links, URL-encoded", async () => {
    const { mapLinks } = await import("../src/lib/maplinks.js");
    const m = mapLinks("Seongsu (성수동)");
    expect(m).toContain("map.naver.com/p/search/");
    expect(m).toContain("map.kakao.com/?q=");
    expect(m).toContain(encodeURIComponent("Seongsu (성수동)"));
  });
  it("is empty for blank input", async () => {
    const { mapLinks } = await import("../src/lib/maplinks.js");
    expect(mapLinks("  ")).toBe("");
  });
});

describe("buildChoiceFooter", () => {
  it("renders 2–4 chips with command + description", () => {
    const f = buildChoiceFooter([
      { emoji: "🔄", cmdEn: "Refresh", descEn: "update" },
      { emoji: "🚏", cmdEn: "Am I close?", cmdKo: "거의 다 왔어?", descEn: "re-check" },
    ]);
    expect(f).toContain("**Refresh**"); // bolded follow-up question, no `code` styling
    expect(f).toContain("거의 다 왔어?");
    expect(f).toContain("You can ask me next");
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
    expect(out).toContain("You can ask me next");
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

  it("romanizes a Korean station; transliterates unknown ones", () => {
    expect(romanizeStation("성수")).toBe("Seongsu"); // curated official name
    expect(romanizeStation("강남역")).toBe("Gangnam");
    expect(romanizeStation("없는역")).toBe("Eopneun"); // not in map -> Revised Romanization (역 stripped)
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

  it("transliterates arbitrary Hangul (Revised Romanization), capitalizing each run", () => {
    expect(romanizeHangul("강남")).toBe("Gangnam");
    expect(romanizeHangul("단풍나무집")).toBe("Danpungnamujip");
    expect(romanizeHangul("near 충정로")).toBe("near Chungjeongro");
    expect(romanizeHangul("ABC")).toBe("ABC"); // non-Hangul untouched
  });

  it("romanizeText transliterates Korean the maps didn't cover", () => {
    expect(romanizeText("near 충정로")).toBe("near Chungjeongro");
  });

  it("parses a direction with a trailing express marker", () => {
    expect(formatSubwayDirection("인천공항2터미널행 - 디지털미디어시티방면(급행)")).toBe(
      "to Incheon Airport T2 (via Digital Media City) (express)",
    );
  });
});

describe("places coord index (B)", () => {
  it("resolves EN/alias/KO landmarks and stations, strips station suffix", () => {
    expect(resolvePlaceCoord("Gangnam")?.label).toBe("Gangnam Station");
    expect(resolvePlaceCoord("강남역")?.label).toBe("Gangnam Station");
    expect(resolvePlaceCoord("Hongdae")?.label).toBe("Hongik Univ. Station");
    expect(resolvePlaceCoord("Gyeongbokgung")?.lat).toBeCloseTo(37.5796, 2);
    expect(resolvePlaceCoord("Atlantis")).toBeUndefined();
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

describe("fuzzy name resolution", () => {
  it("similarity: exact, containment, typo, unrelated", () => {
    expect(similarity("Gangnam", "gangnam")).toBe(1);
    expect(similarity("Incheon Airport Terminal 1", "Incheon Airport T1")).toBeGreaterThan(0.85);
    expect(similarity("Gangnamm", "Gangnam")).toBeGreaterThan(0.85);
    expect(similarity("Atlantis", "Gangnam")).toBeLessThan(0.5);
  });

  it("resolveName: exact vs suggest vs none", () => {
    const items = [{ n: "Gangnam" }, { n: "Gangdong" }, { n: "Myeongdong" }];
    const keys = (x: { n: string }) => [x.n];
    expect(resolveName("gangnam", items, keys)).toEqual({ kind: "exact", item: { n: "Gangnam" } });
    expect(resolveName("Gangnamm", items, keys).kind).toBe("exact"); // typo absorbed
    expect(resolveName("xyzqq", items, keys)).toEqual({ kind: "none" });
  });

  it("resolveStationFuzzy: typos/case/spacing → exact, ambiguous → suggest", () => {
    expect(resolveStationFuzzy("Gangnamm")).toMatchObject({ kind: "exact", item: { ko: "강남" } });
    expect(resolveStationFuzzy("Itaewan")).toMatchObject({ kind: "exact", item: { ko: "이태원" } });
    expect(resolveStationFuzzy("hongik university")).toMatchObject({ kind: "exact", item: { ko: "홍대입구" } });
    expect(resolveStationFuzzy("Atlantis").kind).toBe("none");
  });

  it("resolvePlaceCoord: variant airport phrasings + typos", () => {
    expect(resolvePlaceCoord("Incheon International Airport")?.label).toBe("Incheon Int'l Airport T1");
    expect(resolvePlaceCoord("Incheon Airport Terminal 1")?.label).toBe("Incheon Int'l Airport T1");
    expect(resolvePlaceCoord("Gangnam Statoin")?.label).toBe("Gangnam Station");
    expect(resolvePlaceCoord("nowhere-xyz")).toBeUndefined();
  });
});

describe("landmark overlay (C7)", () => {
  const byName = (prefix: string) => LANDMARKS.find((l) => l.name.startsWith(prefix))!;

  it("resolves canonical names, aliases, EN+KO, and typos", () => {
    expect(resolveLandmark("Gyeongbokgung Palace")?.name).toBe("Gyeongbokgung Palace");
    expect(resolveLandmark("gyeongbokgung")?.name).toBe("Gyeongbokgung Palace");
    expect(resolveLandmark("경복궁")?.name).toBe("Gyeongbokgung Palace");
    expect(resolveLandmark("Gyeongbokgun")?.name).toBe("Gyeongbokgung Palace"); // typo absorbed
    expect(resolveLandmark("Haeundae Beach")?.name).toContain("Haeundae");
    expect(resolveLandmark("Seongsan Ilchulbong")?.city).toBe("Jeju");
  });

  it("disambiguates Lotte World (theme park) vs the Tower/Seoul Sky", () => {
    expect(resolveLandmark("Lotte World")?.name).toBe("Lotte World Adventure");
    expect(resolveLandmark("Seoul Sky")?.name).toContain("Seoul Sky");
    expect(resolveLandmark("Lotte World Tower")?.name).toContain("Seoul Sky");
  });

  it("returns undefined for the long tail (falls through to TourAPI)", () => {
    expect(resolveLandmark("some random hotel xyz")).toBeUndefined();
    expect(resolveLandmark("")).toBeUndefined();
    expect(resolveLandmark("palace")).toBeUndefined(); // generic noise word
  });

  it("verdict: gated hours give open/closed against a fixed time", () => {
    const gbg = byName("Gyeongbokgung"); // 09:00–18:00, closed Tue
    const monMorning = landmarkVerdict(gbg, 1, 10 * 60); // Mon 10:00
    expect(monMorning.status).toBe("open");
    expect(monMorning.headline).toContain("18:00");

    const monEvening = landmarkVerdict(gbg, 1, 19 * 60); // Mon 19:00
    expect(monEvening.status).toBe("closed");
    expect(monEvening.headline).toContain("09:00");

    const earlyMon = landmarkVerdict(gbg, 1, 8 * 60); // Mon 08:00 (before opening)
    expect(earlyMon.status).toBe("closed");
    expect(earlyMon.headline).toContain("opens");
  });

  it("verdict: closed-day takes precedence over the clock", () => {
    const gbg = byName("Gyeongbokgung");
    const tueNoon = landmarkVerdict(gbg, 2, 12 * 60); // Tuesday → closed all day
    expect(tueNoon.status).toBe("closed");
    expect(tueNoon.headline).toContain("Tuesdays");
  });

  it("verdict: 24h, daylight, and sunrise specs", () => {
    const han = byName("Han River"); // 24h
    expect(landmarkVerdict(han, 3, 2 * 60).status).toBe("open"); // 02:00 still open
    expect(landmarkVerdict(han, 3, 14 * 60).headline).toContain("24 hours");

    const bukchon = byName("Bukchon"); // daylight / residential
    expect(landmarkVerdict(bukchon, 3, 12 * 60).status).toBe("open");
    expect(landmarkVerdict(bukchon, 3, 23 * 60).status).toBe("info"); // after dark → advisory

    const sunrise = byName("Seongsan"); // sunrise spot
    expect(landmarkVerdict(sunrise, 3, 3 * 60).status).toBe("closed"); // pre-dawn
    expect(landmarkVerdict(sunrise, 3, 8 * 60).status).toBe("open"); // morning
  });

  it("verdict: a late-night observatory is open until 23:00", () => {
    const tower = byName("N Seoul Tower"); // ~10:00–23:00
    const at22 = landmarkVerdict(tower, 5, 22 * 60);
    expect(at22.status).toBe("open");
    expect(at22.headline).toContain("23:00");
  });
});
