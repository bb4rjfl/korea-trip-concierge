import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseList,
  parseDetail,
  stripHtml,
  toVsLang,
  isSeoulText,
  inferSeoulCategory,
  pickConfidentMatch,
  searchSeoulContent,
  VS_CATEGORY,
} from "../src/lib/sources/visitseoul.js";
import { searchPlaceForeigner } from "../src/tools/searchPlaceForeigner.js";
import { getNowInfo } from "../src/tools/getNowInfo.js";

/** Build a mock Response for fetchJson (which checks res.ok then res.json()). */
const res = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response;

const listBody = (items: unknown[]) => ({
  data: items,
  paging: { page_no: 1, page_size: 50, total_count: items.length },
  result_code: 200,
  result_message: "OK",
});

const RAW_DETAIL = {
  cid: "ENtest123",
  post_sj: "Seoul City Wall Museum",
  sumry: "A museum tracing the history of Seoul's fortress wall.",
  main_img: "https://img.visitseoul.net/wall.jpg",
  cate_depth: " Culture > Cultural Facilities",
  tag: ["CityWall", " History"],
  extra: {
    cmmn_telno: "+82-2-724-0243",
    cmmn_hmpg_url: "https://museum.seoul.go.kr",
    cmmn_use_time: "Tuesday~Sunday 09:00~18:00 (Last Admission: 17:30)",
    closed_days: "Closed every Monday",
    trrsrt_use_chrge: "N",
  },
  traffic: {
    adres: "old jibun address",
    new_adres: "283 Yulgok-ro, Jongno-gu, Seoul",
    map_position_x: "126.9990",
    map_position_y: "37.5701",
    subway_info: "Subway Line 1, Dongdaemun Station, Exit 1, 350m",
  },
  post_desc: "<style>.se-contents{overflow:auto}</style><p>Hello &amp; welcome</p>",
};

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.VISITSEOUL_API_KEY;
});

describe("VisitSeoul pure helpers", () => {
  it("toVsLang maps zh → zh-CN, keeps en/ja/ko", () => {
    expect(toVsLang("en")).toBe("en");
    expect(toVsLang("ja")).toBe("ja");
    expect(toVsLang("zh")).toBe("zh-CN");
    expect(toVsLang("ko")).toBe("ko");
  });

  it("inferSeoulCategory targets the right node and skips dining", () => {
    expect(inferSeoulCategory("temple stay near Insadong")).toBe(VS_CATEGORY.templestay);
    expect(inferSeoulCategory("hanbok experience")).toBe(VS_CATEGORY.experience);
    expect(inferSeoulCategory("a good museum")).toBe(VS_CATEGORY.museum);
    expect(inferSeoulCategory("Gyeongbokgung palace")).toBe(VS_CATEGORY.history);
    expect(inferSeoulCategory("Han River park walk")).toBe(VS_CATEGORY.nature);
    expect(inferSeoulCategory("duty free shopping mall")).toBe(VS_CATEGORY.shopping);
    expect(inferSeoulCategory("famous landmark and view")).toBe(VS_CATEGORY.culture);
    // dining → undefined (routed to coordinate POI, not VisitSeoul)
    expect(inferSeoulCategory("vegan ramen restaurant")).toBeUndefined();
    expect(inferSeoulCategory("quiet cafe")).toBeUndefined();
  });

  it("isSeoulText detects Seoul by name or coordinate box, excludes non-Seoul", () => {
    expect(isSeoulText("Seoul")).toBe(true);
    expect(isSeoulText("서울 한복판")).toBe(true);
    expect(isSeoulText("Insadong")).toBe(true); // coord-known, inside box
    expect(isSeoulText("Gangnam")).toBe(true);
    expect(isSeoulText("Busan")).toBe(false);
    expect(isSeoulText("Haeundae")).toBe(false);
    expect(isSeoulText("Jeju")).toBe(false);
    expect(isSeoulText("")).toBe(false);
  });

  it("stripHtml removes markup, css rule bodies, and decodes entities", () => {
    const out = stripHtml(RAW_DETAIL.post_desc);
    expect(out).toContain("Hello & welcome");
    expect(out).not.toContain("<");
    expect(out).not.toContain("&amp;");
    expect(out).not.toContain("overflow");
  });

  it("pickConfidentMatch accepts exact/strong matches, rejects weak substrings", () => {
    const items = [
      { title: "Tailor Coffee Seochon Gyeongbokgung Branch" },
      { title: "Some Other Place" },
    ];
    // "Gyeongbokgung" is only a weak substring of a long café name → rejected
    expect(pickConfidentMatch("Gyeongbokgung", items)).toBeUndefined();
    // exact title → accepted
    const exact = [{ title: "Seoul City Wall Museum" }];
    expect(pickConfidentMatch("Seoul City Wall Museum", exact)?.title).toBe("Seoul City Wall Museum");
  });
});

describe("VisitSeoul parsers tolerate the rate-limit shape", () => {
  it("parseList maps items and returns [] when data is missing", () => {
    expect(parseList({})).toEqual([]);
    expect(parseList({ data: undefined })).toEqual([]);
    const out = parseList(listBody([{ cid: "a1", post_sj: "Gwangjang Market", sumry: "stalls", main_img: "u" }]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ cid: "a1", title: "Gwangjang Market", summary: "stalls", image: "u" });
  });

  it("parseDetail extracts hours, address, subway, coords, free-admission flag", () => {
    const d = parseDetail({ data: RAW_DETAIL, result_code: 200 })!;
    expect(d.title).toBe("Seoul City Wall Museum");
    expect(d.hours).toContain("09:00~18:00");
    expect(d.closedDays).toBe("Closed every Monday");
    expect(d.address).toBe("283 Yulgok-ro, Jongno-gu, Seoul");
    expect(d.subway).toContain("Dongdaemun Station");
    expect(d.lng).toBeCloseTo(126.999, 3);
    expect(d.lat).toBeCloseTo(37.5701, 3);
    expect(d.freeAdmission).toBe(true);
    expect(d.tags).toEqual(["CityWall", "History"]);
    expect(parseDetail({})).toBeUndefined();
  });
});

describe("searchSeoulContent (mocked fetch)", () => {
  it("POSTs to contents/list with the API-key header and parses results", async () => {
    process.env.VISITSEOUL_API_KEY = "test-key";
    const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toContain("/api/v1/contents/list");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>)["VISITSEOUL-API-KEY"]).toBe("test-key");
      return res(listBody([{ cid: "z1", post_sj: "Unique List Place ZZ", sumry: "s" }]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const out = await searchSeoulContent({ keyword: "unique-kw-zz", language: "en", limit: 6 });
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("Unique List Place ZZ");
    expect(fetchMock).toHaveBeenCalled();
  });
});

describe("searchPlaceForeigner — Seoul VisitSeoul layer", () => {
  it("leads with official Seoul Tourism for a non-dining Seoul query", async () => {
    process.env.VISITSEOUL_API_KEY = "test-key";
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toContain("visitseoul.net");
      return res(
        listBody([
          { cid: "c1", post_sj: "Insadong Craft Alley One", sumry: "Hanji and tea." },
          { cid: "c2", post_sj: "Insadong Gallery Two", sumry: "Modern art." },
          { cid: "c3", post_sj: "Insadong Teahouse Three", sumry: "Traditional tea." },
          { cid: "c4", post_sj: "Insadong Antiques Four", sumry: "Old wares." },
        ]),
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await searchPlaceForeigner.handler({ query: "what to see uniq-seoul-1", area: "Insadong" });
    const text = r.content[0].text;
    expect(text).toContain("official Seoul Tourism");
    expect(text).toContain("Insadong Craft Alley One");
  });

  it("does NOT call VisitSeoul for a dining query (routes to coordinate POI)", async () => {
    process.env.VISITSEOUL_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => res(listBody([])));
    vi.stubGlobal("fetch", fetchMock);
    const r = await searchPlaceForeigner.handler({ query: "best ramen uniq-dining-1", area: "Hongdae" });
    const text = r.content[0].text;
    expect(text).not.toContain("official Seoul Tourism");
    // no VisitSeoul (or any external) call — no POI/TourAPI keys in test env
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getNowInfo — VisitSeoul Seoul fallback", () => {
  it("answers open/closed for a non-curated Seoul place using VisitSeoul hours", async () => {
    process.env.VISITSEOUL_API_KEY = "test-key";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/contents/list")) {
        return res(listBody([{ cid: "ENtest123", post_sj: "Seoul City Wall Museum", sumry: "wall museum" }]));
      }
      return res({ data: RAW_DETAIL, result_code: 200 }); // contents/info
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await getNowInfo.handler({ place: "Seoul City Wall Museum" });
    const text = r.content[0].text;
    expect(text).toContain("Opening hours");
    expect(text).toContain("official Seoul Tourism");
    expect(text).toContain("Dongdaemun Station");
  });

  it("falls through (no Seoul answer) when only a weak substring matches", async () => {
    process.env.VISITSEOUL_API_KEY = "test-key";
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/contents/list")) {
        return res(listBody([{ cid: "x9", post_sj: "Totally Unrelated Cafe With Zzqx Inside" }]));
      }
      return res({ data: RAW_DETAIL, result_code: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    // non-curated, weak match → VisitSeoul rejected → falls to TourAPI (no key) → not-found/fail
    const r = await getNowInfo.handler({ place: "Zzqx Center Seoul Uniq" });
    expect(r.content[0].text).not.toContain("official Seoul Tourism");
  });
});
