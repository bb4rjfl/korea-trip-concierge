import { describe, it, expect, vi, afterEach } from "vitest";
import { seoulHoursVerdict, inferSeoulCategory, pickConfidentMatch, VS_CATEGORY } from "../src/lib/sources/visitseoul.js";
import { resolveLandmark } from "../src/lib/landmarks.js";
import { getNowInfo } from "../src/tools/getNowInfo.js";
import { getTransitRoute } from "../src/tools/getTransitRoute.js";
import { getAreaGuide } from "../src/tools/getAreaGuide.js";
import { getJejuInfo } from "../src/tools/getJejuInfo.js";
import { searchPlaceForeigner } from "../src/tools/searchPlaceForeigner.js";

const res = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response;
const text = (r: { content: { text: string }[] }) => r.content[0].text;

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.VISITSEOUL_API_KEY;
});

// ── R2: free-text hours → verdict ───────────────────────────────────────────
describe("seoulHoursVerdict (R2)", () => {
  const HRS = "Tuesday~Sunday 09:00~18:00 (Last Admission: 17:30)";
  it("open during hours on an operating day", () => {
    expect(seoulHoursVerdict(HRS, "Closed every Monday", 5, 14 * 60)?.status).toBe("open"); // Fri 14:00
  });
  it("closed on a named closed-day", () => {
    expect(seoulHoursVerdict(HRS, "Closed every Monday", 1, 14 * 60)?.status).toBe("closed"); // Mon
  });
  it("closed when today is outside the operating day-range", () => {
    expect(seoulHoursVerdict(HRS, undefined, 1, 14 * 60)?.status).toBe("closed"); // Mon, range Tue–Sun
  });
  it("closed before opening / after closing", () => {
    expect(seoulHoursVerdict(HRS, undefined, 5, 7 * 60)?.status).toBe("closed"); // 07:00
    expect(seoulHoursVerdict(HRS, undefined, 5, 20 * 60)?.status).toBe("closed"); // 20:00
  });
  it("handles midnight-crossing ranges", () => {
    expect(seoulHoursVerdict("18:00~02:00", undefined, 5, 23 * 60)?.status).toBe("open");
  });
  it("returns undefined when nothing is parseable", () => {
    expect(seoulHoursVerdict("Please see the website", undefined, 5, 14 * 60)).toBeUndefined();
  });
});

// ── R3: routing ─────────────────────────────────────────────────────────────
describe("inferSeoulCategory routing (R3)", () => {
  it("routes kid/family to theme parks", () => {
    expect(inferSeoulCategory("kid-friendly places")).toBe(VS_CATEGORY.themepark);
  });
  it("routes ja/zh sightseeing terms to culture", () => {
    expect(inferSeoulCategory("観光スポット")).toBe(VS_CATEGORY.culture);
    expect(inferSeoulCategory("景点")).toBe(VS_CATEGORY.culture);
    expect(inferSeoulCategory("things to see")).toBe(VS_CATEGORY.culture);
  });
  it("tolerates a museum typo", () => {
    expect(inferSeoulCategory("good musuems")).toBe(VS_CATEGORY.museum);
  });
  it("leaves dining unclassified (→ POI)", () => {
    expect(inferSeoulCategory("tteokbokki")).toBeUndefined();
  });
});

// ── R1: bare area token must not match a business ───────────────────────────
describe("pickConfidentMatch rejects area-as-prefix (R1)", () => {
  it("rejects a bare area token prefixing a long business name", () => {
    expect(pickConfidentMatch("Hongdae", [{ title: "Hongdae Soy Sauce Marinated Crab" }])).toBeUndefined();
  });
  it("still accepts a genuine full-name match", () => {
    expect(pickConfidentMatch("Seoul City Wall Museum", [{ title: "Seoul City Wall Museum" }])?.title).toBe(
      "Seoul City Wall Museum",
    );
  });
});

// ── R6: CJK landmark aliases ────────────────────────────────────────────────
describe("CJK landmark aliases (R6)", () => {
  it("resolves traditional/simplified/Japanese names", () => {
    expect(resolveLandmark("景福宮")?.name).toBe("Gyeongbokgung Palace");
    expect(resolveLandmark("景福宫")?.name).toBe("Gyeongbokgung Palace");
    expect(resolveLandmark("南山タワー")?.name).toContain("N Seoul Tower");
    expect(resolveLandmark("明洞")?.name).toContain("Myeongdong");
  });
});

// ── R1: getNowInfo on a neighbourhood ───────────────────────────────────────
describe("getNowInfo area redirect (R1)", () => {
  it("treats a bare neighbourhood as an area, not a venue", async () => {
    const r = await getNowInfo.handler({ place: "Hongdae" });
    expect(text(r).toLowerCase()).toContain("neighbourhood");
    expect(text(r)).not.toContain("Soy Sauce");
  });
});

// ── R2: getNowInfo VisitSeoul path now carries a verdict ────────────────────
describe("getNowInfo VisitSeoul verdict (R2)", () => {
  it("prepends a go/no-go line on the VisitSeoul path", async () => {
    process.env.VISITSEOUL_API_KEY = "test-key";
    const DETAIL = {
      cid: "X1",
      post_sj: "Seoul City Wall Museum",
      sumry: "wall museum",
      extra: { cmmn_use_time: "Tuesday~Sunday 09:00~18:00", closed_days: "Closed every Monday" },
      traffic: { new_adres: "283 Yulgok-ro, Jongno-gu, Seoul", subway_info: "Line 1 Dongdaemun Exit 1" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/contents/list")
          ? res({ data: [{ cid: "X1", post_sj: "Seoul City Wall Museum" }], paging: { total_count: 1 }, result_code: 200 })
          : res({ data: DETAIL, result_code: 200 }),
      ),
    );
    const r = await getNowInfo.handler({ place: "Seoul City Wall Museum" });
    expect(text(r)).toMatch(/🟢|🔴/);
    expect(text(r)).toContain("Opening hours");
  });
});

// ── R5: getTransitRoute missing destination ─────────────────────────────────
describe("getTransitRoute missing `to` (R5)", () => {
  it("asks where to instead of throwing, with chips", async () => {
    const r = await getTransitRoute.handler({ from: "Seoul Station" });
    expect(text(r)).toContain("Where do you want to go");
    expect(text(r)).toContain("Tap to continue");
  });
});

// ── R7: enum synonyms no longer crash ───────────────────────────────────────
describe("enum tolerance (R7)", () => {
  it("getAreaGuide maps 'drinks' to nightlife", async () => {
    const r = await getAreaGuide.handler({ area: "Euljiro", interest: "drinks" });
    expect(text(r).toLowerCase()).toContain("nightlife");
    expect(text(r)).toContain("Tap to continue");
  });
  it("getJejuInfo tolerates an unknown category (→ highlights, no crash)", async () => {
    const r = await getJejuInfo.handler({ category: "spaceship" });
    expect(text(r)).toContain("Tap to continue");
  });
});

// ── R3: dish query stays on POI, never VisitSeoul ───────────────────────────
describe("searchPlaceForeigner dish routing (R3)", () => {
  it("does not send a dish query to VisitSeoul", async () => {
    process.env.VISITSEOUL_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => res({ data: [], paging: { total_count: 0 }, result_code: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await searchPlaceForeigner.handler({ query: "tteokbokki", area: "Myeongdong" });
    expect(text(r)).not.toContain("official Seoul Tourism");
    expect(fetchMock).not.toHaveBeenCalled(); // no POI/TourAPI keys in test → no external call at all
  });
});
