import { describe, it, expect } from "vitest";
import { fromSnapshot, graphFromNetwork, planBetween, stationCodes, type RegionalNetwork, type SubwayGraph } from "../src/lib/subwayPlan.js";
import REGIONAL from "../src/lib/data/regionalSubway.json" with { type: "json" };

/** How many disconnected pieces each line falls into, transfers ignored. */
function pieces(g: SubwayGraph): Map<string, number> {
  const byLine = new Map<string, string[]>();
  for (const s of g.stations) byLine.set(s.line, [...(byLine.get(s.line) ?? []), s.code]);
  const out = new Map<string, number>();
  for (const [line, codes] of byLine) {
    const own = new Set(codes);
    const seen = new Set<string>();
    let count = 0;
    for (const start of codes) {
      if (seen.has(start)) continue;
      count++;
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const c = stack.pop()!;
        for (const e of g.edges.get(c) ?? []) {
          if (!e.transfer && own.has(e.to) && !seen.has(e.to)) {
            seen.add(e.to);
            stack.push(e.to);
          }
        }
      }
    }
    out.set(line, count);
  }
  return out;
}

describe("every subway line is one piece", () => {
  /**
   * Station codes skip numbers. Treating consecutive codes as consecutive stations
   * cut Line 1 into five pieces, Line 7 and GTX-A apart, and left Everland's own
   * station joined to nothing — so Gangnam to Everland had no route at all, and
   * no test noticed, because every test asked about a station that happened to work.
   */
  it("in the capital region", () => {
    // GTX-A is two sections in the data — Unjeong–Seoul Station and Suseo–Dongtan —
    // with nothing between them, which is how it is listed, not a numbering fault.
    const broken = [...pieces(fromSnapshot())].filter(([line, n]) => n > (line === "GTX-A" ? 2 : 1));
    expect(broken).toEqual([]);
  });

  it("in Busan, Daegu, Gwangju and Daejeon", () => {
    for (const [id, net] of Object.entries(REGIONAL as unknown as Record<string, RegionalNetwork>)) {
      const broken = [...pieces(graphFromNetwork(net))].filter(([, n]) => n > 1);
      expect(broken, id).toEqual([]);
    }
  });
});

describe("the trips the broken lines had taken away", () => {
  const g = fromSnapshot();
  const ride = (a: string, b: string) => planBetween(g, stationCodes(g, a), stationCodes(g, b));

  it("reaches Everland's station on the Everline", () => {
    expect(ride("강남", "전대.에버랜드")?.legs.map((l) => l.line)).toContain("용인경전철");
  });

  it("reaches Asan and Onyang Oncheon on Line 1", () => {
    expect(ride("서울역", "온양온천")).toBeDefined();
  });

  it("does not run Line 1 from Onsu straight to Jungdong", () => {
    const r = ride("온수", "중동")!;
    expect(r.stops).toBeGreaterThanOrEqual(4);
  });

  it("reaches the Bupyeong end of Line 7", () => {
    expect(ride("건대입구", "석남")).toBeDefined();
  });
});
